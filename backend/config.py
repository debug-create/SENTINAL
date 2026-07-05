import os

# Base storage directory
STORAGE_DIR = os.getenv("STORAGE_DIR", "./storage")

# Individual overrides or default paths derived from STORAGE_DIR
CHROMA_PATH = os.getenv("CHROMA_PATH") or os.path.join(STORAGE_DIR, "chroma_db")
PENDING_FILE = os.getenv("PENDING_FILE") or os.path.join(STORAGE_DIR, "pending_synthesis.json")
QUEUE_FILE = os.getenv("QUEUE_FILE") or os.path.join(STORAGE_DIR, "approval_queue.json")
TRACKER_FILE = os.getenv("TRACKER_FILE") or os.path.join(STORAGE_DIR, "emerging_queries.json")
FINDINGS_FILE = os.getenv("FINDINGS_FILE") or os.path.join(STORAGE_DIR, "audit_findings.json")

def ensure_parent_dir(file_path: str) -> None:
    """Helper to ensure the parent directory of a file exists."""
    dir_name = os.path.dirname(file_path)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)
