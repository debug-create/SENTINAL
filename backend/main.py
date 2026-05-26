import os
import json
import asyncio
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()  # Load .env BEFORE any module that reads env vars

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from rag import collection, search_kb, upsert_entry, get_all_entries, CONFIDENCE_THRESHOLD, is_duplicate
from seed_data import seed_if_empty
from synthesis import generate_clarifying_question, synthesize_faq, stream_answer

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Pending synthesis sessions: session_id -> {"query": str, "context": str}
pending_synthesis: dict[str, dict] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: seed KB on startup."""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, lambda: seed_if_empty(collection))
    count = await loop.run_in_executor(None, lambda: collection.count())
    logger.info(f"SENTINEL started. KB entries: {count}")
    
    # Warmup: force embedding model to load now
    try:
        from rag import search_kb, EMBEDDING_FUNCTION
        _ = EMBEDDING_FUNCTION(["warmup"])
        print("[SUCCESS] Embedding model loaded and ready")
    except Exception as e:
        print(f"[WARNING] Warmup failed: {e}")
        
    yield


app = FastAPI(title="SENTINEL", lifespan=lifespan)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/kb")
async def get_kb():
    """REST endpoint: return all KB entries."""
    loop = asyncio.get_event_loop()
    entries = await loop.run_in_executor(None, get_all_entries)
    return {"entries": entries, "count": len(entries)}


@app.get("/knowledge-base")
async def get_knowledge_base():
    """REST endpoint: return a JSON array of all KB entries."""
    loop = asyncio.get_event_loop()
    entries = await loop.run_in_executor(None, get_all_entries)
    return entries


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    print(f"[SUCCESS] WebSocket connected: {session_id}")
 
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            user_msg = message.get("message", "").strip()
            print(f"[WS] Message received: '{user_msg}'")
 
            if not user_msg:
                continue
 
            loop = asyncio.get_event_loop()
 
            # --- CASE 1: User is answering a clarifying question ---
            if session_id in pending_synthesis:
                pending = pending_synthesis.pop(session_id)
                original_query = pending["query"]
                context = pending["context"]
                print(f"[WS] Clarifying answer received for: '{original_query}'")
 
                try:
                    # Synthesize a new FAQ entry
                    print("[Groq] Calling Groq for synthesis...")
                    faq = await loop.run_in_executor(
                        None,
                        lambda: synthesize_faq(original_query, user_msg, context)
                    )
                    faq_question = faq.get("question", original_query)
                    faq_answer = faq.get("answer", "")
                    print(f"[SUCCESS] FAQ Synthesized: Q='{faq_question}'")
 
                    is_dup = await loop.run_in_executor(
                        None, lambda: is_duplicate(collection, faq_question)
                    )
 
                    if is_dup:
                        print("[WARNING] Similar entry already exists in KB. Skipping write.")
                        await websocket.send_text(json.dumps({
                            "type": "kb_duplicate",
                            "content": "Similar entry already exists in knowledge base."
                        }))
                    else:
                        print("[DB] Writing new FAQ entry to ChromaDB...")
                        # Upsert to ChromaDB
                        entry_id = await loop.run_in_executor(
                            None,
                            lambda: upsert_entry(faq_question, faq_answer)
                        )
 
                        # Notify frontend of KB update
                        await websocket.send_text(json.dumps({
                            "type": "kb_updated",
                            "entry": {
                                "id": entry_id,
                                "question": faq_question,
                                "answer": faq_answer,
                                "source": "synthesized"
                            }
                        }))
                        print(f"[SUCCESS] KB updated with new entry: {entry_id}")
 
                    # Now stream an answer using the synthesized knowledge
                    full_context = f"Q: {faq_question}\nA: {faq_answer}"
                    await websocket.send_text(json.dumps({
                        "type": "confidence",
                        "score": 1.0,
                        "mode": "synthesized"
                    }))
                    
                    print("[WS] Starting stream for synthesized answer...")
                    chunk_count = 0
                    for chunk in stream_answer(original_query, full_context):
                        chunk_count += 1
                        if chunk_count == 1:
                            print("[WS] First token received from Groq")
                        await websocket.send_text(json.dumps({
                            "type": "token",
                            "content": chunk
                        }))
                    print(f"[SUCCESS] Stream complete: {chunk_count} chunks sent")
                    await websocket.send_text(json.dumps({"type": "done"}))
 
                except Exception as e:
                    logger.error(f"Synthesis pipeline error: {e}")
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "content": "Sorry, I encountered an error while learning that. Please try again."
                    }))
 
            # --- CASE 2: New question ---
            else:
                try:
                    print(f"[DB] Searching KB for: '{user_msg}'")
                    # Search KB
                    results = await loop.run_in_executor(
                        None,
                        lambda: search_kb(user_msg)
                    )
 
                    top_score = results[0]["score"] if results else 0.0
                    print(f"[DB] Search result: top_score={top_score}, confident={top_score >= CONFIDENCE_THRESHOLD}")
                    
                    context = "\n".join(
                        [f"Q: {r['question']}\nA: {r['answer']}" for r in results]
                    ) if results else ""
 
                    if top_score >= CONFIDENCE_THRESHOLD:
                        # High confidence — stream answer
                        print(f"[SUCCESS] Confident answer found, starting stream...")
                        await websocket.send_text(json.dumps({
                            "type": "confidence",
                            "score": round(top_score, 2),
                            "mode": "known"
                        }))
                        
                        chunk_count = 0
                        for chunk in stream_answer(user_msg, context):
                            chunk_count += 1
                            if chunk_count == 1:
                                print("[WS] First token received from Groq")
                            await websocket.send_text(json.dumps({
                                "type": "token",
                                "content": chunk
                            }))
                        print(f"[SUCCESS] Stream complete: {chunk_count} chunks sent")
                        await websocket.send_text(json.dumps({"type": "done"}))
                    else:
                        # Low confidence — ask clarifying question
                        print("[KB] Knowledge gap detected, generating clarifying question...")
                        print("[Groq] Calling Groq for clarifying question...")
                        clarifying_q = await loop.run_in_executor(
                            None,
                            lambda: generate_clarifying_question(user_msg, context)
                        )
                        print(f"[SUCCESS] Clarifying question generated: '{clarifying_q}'")
                        pending_synthesis[session_id] = {
                            "query": user_msg,
                            "context": context
                        }
                        await websocket.send_text(json.dumps({
                            "type": "clarifying_question",
                            "content": clarifying_q
                        }))
 
                except Exception as e:
                    logger.error(f"Query handling error: {e}")
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "content": "Sorry, something went wrong. Please try again."
                    }))
 
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {session_id}")
        pending_synthesis.pop(session_id, None)
    except Exception as e:
        logger.error(f"WebSocket error for {session_id}: {e}")
        pending_synthesis.pop(session_id, None)
