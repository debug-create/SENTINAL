import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
import logging

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.75

# Embedding function using all-MiniLM-L6-v2
embedding_fn = SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")

# ChromaDB PersistentClient
client = chromadb.PersistentClient(path="./chroma_db")

# Get or create collection with cosine distance
collection = client.get_or_create_collection(
    name="sentinel_kb",
    embedding_function=embedding_fn,
    metadata={"hnsw:space": "cosine"}
)

def search_kb(query: str, n_results: int = 3) -> list[dict]:
    """Search the knowledge base. Returns list of {question, answer, score, id}."""
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
                entries.append({
                    "id": doc_id,
                    "question": results["metadatas"][0][i].get("question", ""),
                    "answer": results["documents"][0][i],
                    "score": round(score, 4),
                    "source": results["metadatas"][0][i].get("source", "seeded")
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

def upsert_entry(question: str, answer: str, entry_id: str | None = None) -> str:
    """Add or update a KB entry. Returns the entry ID."""
    try:
        if entry_id is None:
            import uuid
            entry_id = f"synth_{uuid.uuid4().hex[:12]}"
        collection.upsert(
            ids=[entry_id],
            documents=[answer],
            metadatas=[{"question": question, "source": "synthesized"}]
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
                entries.append({
                    "id": doc_id,
                    "question": results["metadatas"][i].get("question", ""),
                    "answer": results["documents"][i],
                    "source": results["metadatas"][i].get("source", "seeded")
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
