import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
import logging

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.75

# Load embedding function ONCE at module level
EMBEDDING_FUNCTION = SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")

from config import CHROMA_PATH
import os
os.makedirs(CHROMA_PATH, exist_ok=True)
client = chromadb.PersistentClient(path=CHROMA_PATH)

# Get or create collection with cosine distance
collection = client.get_or_create_collection(
    name="sentinel_kb",
    embedding_function=EMBEDDING_FUNCTION,
    metadata={"hnsw:space": "cosine"}
)

def search_kb(query: str, n_results: int = 3) -> list[dict]:
    """Search the knowledge base. Returns list of {question, answer, score, id}.
    Documents store questions (for embedding matching); answers are in metadata."""
    try:
        results = collection.query(
            query_texts=[query],
            n_results=n_results,
            include=["documents", "metadatas", "distances"]
        )
        entries = []
        if results and results["ids"] and results["ids"][0]:
            for i, doc_id in enumerate(results["ids"][0]):
                distance = results["distances"][0][i]
                score = 1 - (distance / 2)  # cosine distance in [0,2] -> similarity in [0,1]
                metadata = results["metadatas"][0][i] if results.get("metadatas") else {}
                if metadata is None:
                    metadata = {}
                entries.append({
                    "id": doc_id,
                    "question": metadata.get("question", results["documents"][0][i]),
                    "answer": metadata.get("answer", results["documents"][0][i]),
                    "score": round(score, 4),
                    "source": metadata.get("source", "seeded")
                })
        return entries
    except Exception as e:
        logger.error(f"ChromaDB search error: {e}")
        return []

def is_duplicate(collection, question: str, threshold: float = 0.88) -> bool:
    try:
        if collection.count() == 0:
            return False
        results = collection.query(
            query_texts=[question],
            n_results=1,
            include=["distances"]
        )
        if results and results["distances"] and results["distances"][0]:
            distance = results["distances"][0][0]
            similarity = 1 - (distance / 2)
            if similarity >= threshold:
                return True
        return False
    except Exception as e:
        logger.error(f"Duplicate check error: {e}")
        return False

def upsert_entry(question: str, answer: str, entry_id: str | None = None, synthesis_log: str | None = None) -> str:
    """Add or update a KB entry. Returns the entry ID."""
    try:
        if entry_id is None:
            import uuid
            entry_id = f"synth_{uuid.uuid4().hex[:12]}"
        metadata = {"question": question, "source": "synthesized"}
        if synthesis_log is not None:
            metadata["synthesis_log"] = synthesis_log
        collection.upsert(
            ids=[entry_id],
            documents=[question],
            metadatas=[metadata]
        )
        logger.info(f"Upserted KB entry: {entry_id}")
        return entry_id
    except Exception as e:
        logger.error(f"ChromaDB upsert error: {e}")
        raise

def get_all_entries() -> list[dict]:
    """Retrieve all KB entries."""
    try:
        results = collection.get(include=["documents", "metadatas"])
        entries = []
        if results and results["ids"]:
            for i, doc_id in enumerate(results["ids"]):
                metadata = results["metadatas"][i] if results.get("metadatas") and i < len(results["metadatas"]) else {}
                document = results["documents"][i] if results.get("documents") and i < len(results["documents"]) else ""
                if metadata is None:
                    metadata = {}
                entries.append({
                    "id": doc_id,
                    "question": metadata.get("question", document) if isinstance(metadata, dict) else document,
                    "answer": metadata.get("answer", "") if isinstance(metadata, dict) else "",
                    "source": metadata.get("source", "seeded") if isinstance(metadata, dict) else "seeded",
                    "synthesis_log": metadata.get("synthesis_log") if isinstance(metadata, dict) else None
                })
        return entries
    except Exception as e:
        logger.error(f"ChromaDB get_all error: {e}")
        return []

def get_collection_count() -> int:
    """Get the number of entries in the collection."""
    try:
        return collection.count()
    except Exception as e:
        logger.error(f"ChromaDB count error: {e}")
        return -1

def get_entry(entry_id: str) -> dict | None:
    """Retrieve a single KB entry by ID."""
    try:
        results = collection.get(ids=[entry_id], include=["documents", "metadatas"])
        if results and results["ids"]:
            metadata = results["metadatas"][0] if results.get("metadatas") else {}
            document = results["documents"][0] if results.get("documents") else ""
            if metadata is None:
                metadata = {}
            return {
                "id": entry_id,
                "question": metadata.get("question", document) if isinstance(metadata, dict) else document,
                "answer": metadata.get("answer", "") if isinstance(metadata, dict) else "",
                "source": metadata.get("source", "seeded") if isinstance(metadata, dict) else "seeded",
                "synthesis_log": metadata.get("synthesis_log") if isinstance(metadata, dict) else None
            }
        return None
    except Exception as e:
        logger.error(f"ChromaDB get_entry error: {e}")
        return None

def delete_entry(entry_id: str) -> None:
    """Delete a single KB entry by ID from ChromaDB."""
    try:
        collection.delete(ids=[entry_id])
        logger.info(f"Deleted KB entry: {entry_id}")
    except Exception as e:
        logger.error(f"ChromaDB delete error: {e}")
        raise
