"""
Migration script: delete old collection and re-seed with new format.
Run this AFTER stopping the backend server.

New format: questions are stored as documents (for embedding matching),
and answers are stored in metadata.
"""
import sys
sys.path.insert(0, '.')

import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
from seed_data import SEED_FAQS

EMBEDDING_FUNCTION = SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")

client = chromadb.PersistentClient(path="./chroma_db")

# Delete existing collection
try:
    client.delete_collection("sentinel_kb")
    print("[OK] Deleted old collection")
except Exception as e:
    print(f"[SKIP] No existing collection to delete: {e}")

# Create new collection
collection = client.get_or_create_collection(
    name="sentinel_kb",
    embedding_function=EMBEDDING_FUNCTION,
    metadata={"hnsw:space": "cosine"}
)

# Seed with new format: questions as documents, answers in metadata
ids = [faq["id"] for faq in SEED_FAQS]
documents = [faq["question"] for faq in SEED_FAQS]
metadatas = [{"question": faq["question"], "answer": faq["answer"], "source": "seeded"} for faq in SEED_FAQS]

collection.add(ids=ids, documents=documents, metadatas=metadatas)
print(f"[OK] Seeded {len(SEED_FAQS)} entries with new format")

# Verify
count = collection.count()
print(f"[OK] Collection count: {count}")

# Test a query
results = collection.query(
    query_texts=["How do I reset my password?"],
    n_results=3,
    include=["documents", "metadatas", "distances"]
)
print("\nTest query: 'How do I reset my password?'")
for i in range(len(results["ids"][0])):
    dist = results["distances"][0][i]
    sim = 1 - (dist / 2)
    q = results["metadatas"][0][i].get("question", "")
    print(f"  Score: {sim:.4f} | Q: {q}")
