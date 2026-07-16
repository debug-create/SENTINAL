import os
import json
import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
load_dotenv()  # Load .env BEFORE any module that reads env vars

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware

from rag import collection, search_kb, upsert_entry, get_all_entries, CONFIDENCE_THRESHOLD, is_duplicate, get_entry
from seed_data import seed_if_empty
from synthesis import generate_clarifying_question, synthesize_faq, stream_answer
from approval_queue import add_to_queue, get_queue, approve_entry, reject_entry
from emerging import track_unanswered_query, detect_clusters

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Environment configuration ──────────────────────────────────────────
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
API_KEY: Optional[str] = os.getenv("API_KEY") or None
ADMIN_TOKEN: Optional[str] = os.getenv("ADMIN_TOKEN") or None
REQUIRE_APPROVAL: bool = os.getenv("REQUIRE_APPROVAL", "true").lower() in ("true", "1", "yes")

# ── Pending synthesis persistence ──────────────────────────────────────
import threading
from config import PENDING_FILE, ensure_parent_dir

# Reentrant lock to prevent race conditions during read-modify-write cycles
pending_lock = threading.RLock()

def _ensure_data_dir() -> None:
    """Create the storage directory if it doesn't exist."""
    try:
        ensure_parent_dir(PENDING_FILE)
    except Exception as e:
        logger.error(f"Failed to create data directory: {e}")


def _load_pending() -> dict[str, dict]:
    """Load pending synthesis sessions from disk and prune stale ones."""
    with pending_lock:
        try:
            if os.path.exists(PENDING_FILE):
                with open(PENDING_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if not isinstance(data, dict):
                        return {}
                    
                    # Prune stale entries (older than 15 minutes / 900 seconds)
                    now = time.time()
                    cleaned = {}
                    dirty = False
                    for session_id, entry in data.items():
                        history = entry.get("stage_history", [])
                        last_ts = history[-1].get("timestamp", now) if history else now
                        if now - last_ts < 900:
                            cleaned[session_id] = entry
                        else:
                            logger.info(f"Pruned stale pending synthesis session: {session_id}")
                            dirty = True
                    
                    if dirty:
                        _save_pending(cleaned)
                    return cleaned
            return {}
        except (json.JSONDecodeError, OSError) as e:
            logger.error(f"Failed to load pending synthesis: {e}")
            return {}


def _save_pending(pending: dict[str, dict]) -> None:
    """Save pending synthesis sessions to disk atomically."""
    with pending_lock:
        _ensure_data_dir()
        tmp_file = PENDING_FILE + ".tmp"
        try:
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(pending, f, indent=2)
            os.replace(tmp_file, PENDING_FILE)
        except OSError as e:
            logger.error(f"Failed to save pending synthesis: {e}")
            if os.path.exists(tmp_file):
                try:
                    os.remove(tmp_file)
                except OSError:
                    pass


# ── API key dependency ─────────────────────────────────────────────────
async def verify_api_key(x_api_key: Optional[str] = Header(None)) -> None:
    """Check X-API-Key header. If API_KEY env var is unset, skip the check."""
    if API_KEY is None:
        return
    if x_api_key != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing API key")


async def verify_admin_token(x_admin_token: Optional[str] = Header(None)) -> None:
    """Check X-Admin-Token header for admin endpoints."""
    if ADMIN_TOKEN is None:
        return
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid or missing admin token")


# ── Lifespan ───────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: seed KB on startup."""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, lambda: seed_if_empty(collection))
    count = await loop.run_in_executor(None, lambda: collection.count())
    logger.info(f"SENTINEL started. KB entries: {count}")

    # Warmup: force embedding model to load now
    try:
        from rag import EMBEDDING_FUNCTION
        _ = EMBEDDING_FUNCTION(["warmup"])
        print("[SUCCESS] Embedding model loaded and ready")
    except Exception as e:
        print(f"[WARNING] Warmup failed: {e}")

    yield


app = FastAPI(title="SENTINEL", lifespan=lifespan)

# CORS for frontend — driven by CORS_ORIGINS env var
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check endpoint ──────────────────────────────────────────────
@app.get("/health")
async def health_check():
    """Health check endpoint for Render / Uptime monitors. Returns 200 without auth."""
    return {"status": "ok", "timestamp": time.time()}


# ── REST endpoints ─────────────────────────────────────────────────────
@app.get("/api/kb", dependencies=[Depends(verify_api_key)])
async def get_kb():
    """REST endpoint: return all KB entries."""
    loop = asyncio.get_event_loop()
    entries = await loop.run_in_executor(None, get_all_entries)
    return {"entries": entries, "count": len(entries)}


@app.get("/knowledge-base", dependencies=[Depends(verify_api_key)])
async def get_knowledge_base():
    """REST endpoint: return a JSON array of all KB entries."""
    loop = asyncio.get_event_loop()
    entries = await loop.run_in_executor(None, get_all_entries)
    return entries


# ── Approval queue endpoints (supervisor mode) ─────────────────────────
@app.get("/api/approval-queue", dependencies=[Depends(verify_admin_token)])
async def get_approval_queue():
    """Return all pending approval entries."""
    queue = get_queue()
    return {"entries": queue, "count": len(queue)}


@app.post("/api/approval-queue/{entry_id}/approve", dependencies=[Depends(verify_admin_token)])
async def approve_queue_entry(entry_id: str):
    """Approve a pending entry — upserts it to ChromaDB."""
    entry = approve_entry(entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found or already processed")

    loop = asyncio.get_event_loop()
    try:
        kb_id = await loop.run_in_executor(
            None,
            lambda: upsert_entry(entry["question"], entry["answer"], synthesis_log=entry.get("synthesis_log"))
        )
        logger.info(f"Approved entry written to KB: {kb_id}")
        return {"status": "approved", "kb_id": kb_id, "question": entry["question"]}
    except Exception as e:
        logger.error(f"Failed to upsert approved entry: {e}")
        raise HTTPException(status_code=500, detail="Failed to write to knowledge base")


@app.post("/api/approval-queue/{entry_id}/reject", dependencies=[Depends(verify_admin_token)])
async def reject_queue_entry(entry_id: str):
    """Reject a pending entry — removes it from the queue."""
    entry = reject_entry(entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found or already processed")
    return {"status": "rejected", "question": entry["question"]}


@app.get("/api/kb/{entry_id}/replay", dependencies=[Depends(verify_api_key)])
async def get_entry_replay(entry_id: str):
    """Retrieve the synthesis log for replaying the self-heal process."""
    loop = asyncio.get_event_loop()
    entry = await loop.run_in_executor(None, get_entry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    synthesis_log_str = entry.get("synthesis_log")
    if not synthesis_log_str:
        raise HTTPException(
            status_code=404, 
            detail="No synthesis log found for this entry (it may be a seed entry)"
        )
    
    try:
        synthesis_log = json.loads(synthesis_log_str)
        return {"entry_id": entry_id, "synthesis_log": synthesis_log}
    except Exception as e:
        logger.error(f"Error decoding synthesis log: {e}")
        raise HTTPException(status_code=500, detail="Failed to decode synthesis log")


# ── Emerging issues endpoint ───────────────────────────────────────────
@app.get("/api/emerging-issues", dependencies=[Depends(verify_api_key)])
async def get_emerging_issues():
    """Check for emerging issue clusters from unanswered queries."""
    loop = asyncio.get_event_loop()
    try:
        from rag import EMBEDDING_FUNCTION
        result = await loop.run_in_executor(None, lambda: detect_clusters(EMBEDDING_FUNCTION))
        if result:
            return {"has_cluster": True, **result}
        return {"has_cluster": False, "cluster": [], "count": 0}
    except Exception as e:
        logger.error(f"Emerging issues detection error: {e}")
        return {"has_cluster": False, "cluster": [], "count": 0}


@app.post("/api/emerging-issues/{cluster_id}/promote", dependencies=[Depends(verify_admin_token)])
async def promote_emerging_cluster(cluster_id: str):
    """Promote a cluster of emerging unanswered queries to the approval queue."""
    from rag import EMBEDDING_FUNCTION
    from emerging import promote_cluster
    
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: promote_cluster(cluster_id, EMBEDDING_FUNCTION)
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Cluster not found or cannot be promoted")
    return {"status": "promoted", **result}


# ── KB Self-Audit Endpoints ─────────────────────────────────────────────
from pydantic import BaseModel

class ResolveAuditRequest(BaseModel):
    action: str  # "keep_a" | "keep_b" | "dismiss"

@app.post("/api/kb/audit/run", dependencies=[Depends(verify_admin_token)])
async def run_kb_audit():
    """Trigger KB Self-Audit loop manually."""
    from audit import run_audit
    loop = asyncio.get_event_loop()
    findings = await loop.run_in_executor(None, run_audit)
    return {"findings": findings, "count": len(findings)}

@app.get("/api/kb/audit/findings", dependencies=[Depends(verify_admin_token)])
async def get_audit_findings():
    """Retrieve all unresolved audit findings."""
    from audit import get_unresolved_findings
    findings = get_unresolved_findings()
    return {"findings": findings, "count": len(findings)}

@app.post("/api/kb/audit/findings/{finding_id}/resolve", dependencies=[Depends(verify_admin_token)])
async def resolve_audit_finding(finding_id: str, request: ResolveAuditRequest):
    """Resolve an audit finding by keeping one of the entries or dismissing the contradiction."""
    action = request.action
    if action not in ("keep_a", "keep_b", "dismiss"):
        raise HTTPException(status_code=400, detail="Invalid action. Must be keep_a, keep_b, or dismiss")

    from audit import resolve_finding
    finding = resolve_finding(finding_id, action)
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found or already resolved")

    loop = asyncio.get_event_loop()
    if action == "keep_a":
        entry_b_id = finding["entry_b"]["id"]
        from rag import delete_entry
        await loop.run_in_executor(None, lambda: delete_entry(entry_b_id))
    elif action == "keep_b":
        entry_a_id = finding["entry_a"]["id"]
        from rag import delete_entry
        await loop.run_in_executor(None, lambda: delete_entry(entry_a_id))

    return {"status": "resolved", "action": action, "finding_id": finding_id}


# ── Helper: send stage message ─────────────────────────────────────────
async def send_stage(websocket: WebSocket, stage: str) -> None:
    """Emit a pipeline stage event to the frontend step-tracker."""
    try:
        await websocket.send_text(json.dumps({"type": "stage", "stage": stage}))
    except Exception as e:
        logger.error(f"Failed to send stage '{stage}': {e}")


# ── WebSocket endpoint ─────────────────────────────────────────────────
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    session_id: str,
    api_key: Optional[str] = Query(None),
):
    # API key check at connect time (header or query param)
    if API_KEY is not None:
        ws_key = websocket.headers.get("x-api-key") or api_key
        if ws_key != API_KEY:
            await websocket.close(code=4003, reason="Invalid API key")
            return

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

            # Load pending synthesis from disk and check if this session is answering clarification
            with pending_lock:
                pending_synthesis = _load_pending()
                is_answering_clarification = session_id in pending_synthesis
                if is_answering_clarification:
                    pending = pending_synthesis.pop(session_id)
                    _save_pending(pending_synthesis)

            # --- CASE 1: User is answering a clarifying question ---
            if is_answering_clarification:

                original_query = pending["query"]
                context = pending["context"]
                stage_history = pending.get("stage_history", [])

                def log_stage(stage: str):
                    stage_history.append({"stage": stage, "timestamp": time.time()})

                print(f"[WS] Clarifying answer received for: '{original_query}'")

                try:
                    # Synthesize a new FAQ entry
                    await send_stage(websocket, "synthesizing")
                    log_stage("synthesizing")
                    print("[Groq] Calling Groq for synthesis...")
                    faq = await loop.run_in_executor(
                        None,
                        lambda: synthesize_faq(original_query, user_msg, context)
                    )
                    faq_question = faq.get("question", original_query)
                    faq_answer = faq.get("answer", "")
                    print(f"[SUCCESS] FAQ Synthesized: Q='{faq_question}'")

                    await send_stage(websocket, "duplicate_check")
                    log_stage("duplicate_check")
                    is_dup = await loop.run_in_executor(
                        None, lambda: is_duplicate(collection, faq_question)
                    )

                    if is_dup:
                        await send_stage(websocket, "kb_duplicate")
                        log_stage("kb_duplicate")
                        print("[WARNING] Similar entry already exists in KB. Skipping write.")
                        await websocket.send_text(json.dumps({
                            "type": "kb_duplicate",
                            "content": "Similar entry already exists in knowledge base."
                        }))
                    else:
                        if REQUIRE_APPROVAL:
                            # Supervisor mode: queue for approval
                            await send_stage(websocket, "pending_approval")
                            log_stage("pending_approval")
                            queue_id = add_to_queue(
                                faq_question, 
                                faq_answer, 
                                original_query=original_query, 
                                synthesis_log=json.dumps(stage_history)
                            )
                            print(f"[QUEUE] Entry queued for approval: {queue_id}")
                            await websocket.send_text(json.dumps({
                                "type": "kb_pending_approval",
                                "entry": {
                                    "id": queue_id,
                                    "question": faq_question,
                                    "answer": faq_answer,
                                    "source": "synthesized"
                                }
                            }))
                        else:
                            await send_stage(websocket, "kb_write")
                            log_stage("kb_write")
                            print("[DB] Writing new FAQ entry to ChromaDB...")
                            # Upsert to ChromaDB
                            entry_id = await loop.run_in_executor(
                                None,
                                lambda: upsert_entry(faq_question, faq_answer, synthesis_log=json.dumps(stage_history))
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

                    await send_stage(websocket, "streaming")
                    log_stage("streaming")
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
                    await send_stage(websocket, "searching_kb")
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
                        await send_stage(websocket, "confident_match")
                        print(f"[SUCCESS] Confident answer found, starting stream...")
                        await websocket.send_text(json.dumps({
                            "type": "confidence",
                            "score": round(top_score, 2),
                            "mode": "known"
                        }))

                        await send_stage(websocket, "streaming")
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
                        await send_stage(websocket, "low_confidence")
                        print("[KB] Knowledge gap detected, generating clarifying question...")

                        # Track for emerging issues clustering
                        try:
                            await loop.run_in_executor(
                                None,
                                lambda: track_unanswered_query(user_msg)
                            )
                        except Exception as e:
                            logger.error(f"Failed to track unanswered query: {e}")

                        # Check for emerging clusters
                        try:
                            from rag import EMBEDDING_FUNCTION
                            cluster_result = await loop.run_in_executor(
                                None,
                                lambda: detect_clusters(EMBEDDING_FUNCTION)
                            )
                            if cluster_result:
                                await websocket.send_text(json.dumps({
                                    "type": "emerging_issue",
                                    "id": cluster_result["id"],
                                    "cluster": cluster_result["cluster"],
                                    "count": cluster_result["count"],
                                    "suggested_faq": cluster_result["suggested_faq"],
                                }))
                        except Exception as e:
                            logger.error(f"Emerging issues check failed: {e}")

                        await send_stage(websocket, "clarifying")
                        print("[Groq] Calling Groq for clarifying question...")
                        clarifying_result = await loop.run_in_executor(
                            None,
                            lambda: generate_clarifying_question(user_msg, context)
                        )
                        clarifying_q = clarifying_result.get("clarifying_question", "Could you provide more details?")
                        confidence_reason = clarifying_result.get("reason", "")
                        print(f"[SUCCESS] Clarifying question generated: '{clarifying_q}'")

                        # Persist pending synthesis to disk
                        with pending_lock:
                            current_pending = _load_pending()
                            current_pending[session_id] = {
                                "query": user_msg,
                                "context": context,
                                "stage_history": [
                                    {"stage": "searching_kb", "timestamp": time.time()},
                                    {"stage": "low_confidence", "timestamp": time.time()},
                                    {"stage": "clarifying", "timestamp": time.time()}
                                ]
                            }
                            _save_pending(current_pending)

                        await websocket.send_text(json.dumps({
                            "type": "clarifying_question",
                            "content": clarifying_q,
                            "confidence_reason": confidence_reason
                        }))

                except Exception as e:
                    logger.error(f"Query handling error: {e}")
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "content": "Sorry, something went wrong. Please try again."
                    }))

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {session_id}")
        # Clean up pending synthesis for this session
        with pending_lock:
            pending = _load_pending()
            pending.pop(session_id, None)
            _save_pending(pending)
    except Exception as e:
        logger.error(f"WebSocket error for {session_id}: {e}")
        with pending_lock:
            pending = _load_pending()
            pending.pop(session_id, None)
            _save_pending(pending)
