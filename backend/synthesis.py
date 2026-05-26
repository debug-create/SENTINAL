import os
import json
import logging
from groq import Groq
from typing import Generator

logger = logging.getLogger(__name__)

# Initialize Groq client
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

SYNTHESIS_MODEL = "llama-3.3-70b-versatile"
STREAMING_MODEL = "llama-3.1-8b-instant"


def generate_clarifying_question(query: str, context: str = "") -> str:
    """Generate a single clarifying question when KB confidence is low."""
    try:
        response = client.chat.completions.create(
            model=SYNTHESIS_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a helpful EdTech support assistant. The user asked a question "
                        "that our knowledge base cannot confidently answer. Ask exactly ONE "
                        "clarifying question to better understand what they need. Be concise "
                        "and friendly. Do not answer the question — only ask for clarification."
                    )
                },
                {
                    "role": "user",
                    "content": f"User's question: {query}\n\nRelated context from KB (low confidence):\n{context}"
                }
            ],
            temperature=0.7,
            max_tokens=200
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Groq clarifying question error: {e}")
        return "Could you provide more details about your question so I can help you better?"


def synthesize_faq(original_query: str, clarifying_answer: str, context: str = "") -> dict:
    """Synthesize a new FAQ entry from the user's query and clarifying answer.
    Returns {"question": ..., "answer": ...}."""
    try:
        response = client.chat.completions.create(
            model=SYNTHESIS_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an EdTech knowledge base curator. Based on a user's question "
                        "and their clarifying response, synthesize a clean, reusable FAQ entry. "
                        "Return ONLY valid JSON with exactly two keys: \"question\" and \"answer\". "
                        "The question should be general enough to help future users. "
                        "The answer should be comprehensive, professional, and between 2-4 sentences."
                    )
                },
                {
                    "role": "user",
                    "content": (
                        f"Original question: {original_query}\n"
                        f"Clarifying answer from user: {clarifying_answer}\n"
                        f"Existing KB context: {context}"
                    )
                }
            ],
            temperature=0.3,
            max_tokens=300
        )
        raw = response.choices[0].message.content.strip()
        # Try to extract JSON from the response
        # Sometimes LLMs wrap JSON in markdown code blocks
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        return json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse synthesized FAQ JSON: {e}. Raw: {raw}")
        return {
            "question": original_query,
            "answer": f"Based on your clarification: {clarifying_answer}"
        }
    except Exception as e:
        logger.error(f"Groq synthesis error: {e}")
        return {
            "question": original_query,
            "answer": f"Based on your clarification: {clarifying_answer}"
        }


def stream_answer(query: str, context: str) -> Generator[str, None, None]:
    """Stream an answer token-by-token using the fast model."""
    try:
        stream = client.chat.completions.create(
            model=STREAMING_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are SENTINEL, a friendly and knowledgeable EdTech support assistant. "
                        "Answer the user's question based on the provided context. Be helpful, "
                        "concise, and professional. If the context contains relevant information, "
                        "use it to form your answer. Keep responses under 3-4 sentences unless "
                        "more detail is clearly needed."
                    )
                },
                {
                    "role": "user",
                    "content": f"Context:\n{context}\n\nQuestion: {query}"
                }
            ],
            temperature=0.5,
            max_tokens=500,
            stream=True
        )
        for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    except Exception as e:
        logger.error(f"Groq streaming error: {e}")
        yield f"I apologize, but I encountered an error processing your request. Please try again."
