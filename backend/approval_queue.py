"""
Approval queue — JSON-file backed queue for supervisor mode.
When REQUIRE_APPROVAL=true, synthesized FAQ entries go here
instead of straight to ChromaDB. Admin approves → upsert to KB.
"""
import json
import os
import uuid
import logging
from typing import Optional

logger = logging.getLogger(__name__)

from config import QUEUE_FILE, ensure_parent_dir


def _ensure_data_dir() -> None:
    """Create the storage directory if it doesn't exist."""
    try:
        ensure_parent_dir(QUEUE_FILE)
    except Exception as e:
        logger.error(f"Failed to create data directory: {e}")


def _load_queue() -> list[dict]:
    """Read the approval queue from disk."""
    try:
        if os.path.exists(QUEUE_FILE):
            with open(QUEUE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
        return []
    except (json.JSONDecodeError, OSError) as e:
        logger.error(f"Failed to load approval queue: {e}")
        return []


def _save_queue(queue: list[dict]) -> None:
    """Write the approval queue to disk."""
    _ensure_data_dir()
    try:
        with open(QUEUE_FILE, "w", encoding="utf-8") as f:
            json.dump(queue, f, indent=2)
    except OSError as e:
        logger.error(f"Failed to save approval queue: {e}")


def add_to_queue(question: str, answer: str, original_query: str | None = None, synthesis_log: str | None = None) -> str:
    """Add a synthesized FAQ entry to the approval queue. Returns the queue entry ID."""
    entry_id = f"pending_{uuid.uuid4().hex[:12]}"
    queue = _load_queue()
    queue.append({
        "id": entry_id,
        "question": question,
        "answer": answer,
        "status": "pending",
        "original_query": original_query,
        "synthesis_log": synthesis_log
    })
    _save_queue(queue)
    logger.info(f"Added to approval queue: {entry_id}")
    return entry_id


def get_queue() -> list[dict]:
    """Return all pending entries in the approval queue."""
    queue = _load_queue()
    return [e for e in queue if e.get("status") == "pending"]


def approve_entry(entry_id: str) -> Optional[dict]:
    """Mark an entry as approved and return it (caller does the upsert)."""
    queue = _load_queue()
    for entry in queue:
        if entry["id"] == entry_id and entry.get("status") == "pending":
            entry["status"] = "approved"
            _save_queue(queue)
            logger.info(f"Approved queue entry: {entry_id}")
            return entry
    return None


def reject_entry(entry_id: str) -> Optional[dict]:
    """Mark an entry as rejected."""
    queue = _load_queue()
    for entry in queue:
        if entry["id"] == entry_id and entry.get("status") == "pending":
            entry["status"] = "rejected"
            _save_queue(queue)
            logger.info(f"Rejected queue entry: {entry_id}")
            return entry
    return None
