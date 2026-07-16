"""
Approval queue — JSON-file backed queue for supervisor mode.
When REQUIRE_APPROVAL=true, synthesized FAQ entries go here
instead of straight to ChromaDB. Admin approves → upsert to KB.
"""
import json
import os
import uuid
import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)

from config import QUEUE_FILE, ensure_parent_dir

# Reentrant lock to prevent race conditions during read-modify-write cycles
queue_lock = threading.RLock()


def _ensure_data_dir() -> None:
    """Create the storage directory if it doesn't exist."""
    try:
        ensure_parent_dir(QUEUE_FILE)
    except Exception as e:
        logger.error(f"Failed to create data directory: {e}")


def _load_queue() -> list[dict]:
    """Read the approval queue from disk. Must be called under queue_lock."""
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
    """Write the approval queue to disk atomically. Must be called under queue_lock."""
    _ensure_data_dir()
    tmp_file = QUEUE_FILE + ".tmp"
    try:
        # Write to temporary file first
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(queue, f, indent=2)
        # Atomically replace the main queue file
        os.replace(tmp_file, QUEUE_FILE)
    except OSError as e:
        logger.error(f"Failed to save approval queue: {e}")
        if os.path.exists(tmp_file):
            try:
                os.remove(tmp_file)
            except OSError:
                pass


def add_to_queue(question: str, answer: str, original_query: str | None = None, synthesis_log: str | None = None) -> str:
    """Add a synthesized FAQ entry to the approval queue. Returns the queue entry ID."""
    with queue_lock:
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
    with queue_lock:
        queue = _load_queue()
        return [e for e in queue if e.get("status") == "pending"]


def approve_entry(entry_id: str) -> Optional[dict]:
    """Mark an entry as approved and return it (caller does the upsert)."""
    with queue_lock:
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
    with queue_lock:
        queue = _load_queue()
        for entry in queue:
            if entry["id"] == entry_id and entry.get("status") == "pending":
                entry["status"] = "rejected"
                _save_queue(queue)
                logger.info(f"Rejected queue entry: {entry_id}")
                return entry
        return None
