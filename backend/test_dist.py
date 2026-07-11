import sys
sys.path.insert(0, '.')
from rag import collection, search_kb, EMBEDDING_FUNCTION

# Test exact match
query = "How do I reset my password?"
results = collection.query(
    query_texts=[query],
    n_results=3,
    include=["documents", "metadatas", "distances"]
)

print("Query:", query)
print("\nRaw results:")
for i in range(len(results["ids"][0])):
    dist = results["distances"][0][i]
    sim_div2 = 1 - (dist / 2)
    sim_direct = 1 - dist
    print(f"  ID: {results['ids'][0][i]}")
    print(f"  Question: {results['metadatas'][0][i].get('question', '')}")
    print(f"  Distance: {dist}")
    print(f"  Similarity (1 - d/2): {sim_div2:.4f}")
    print(f"  Similarity (1 - d): {sim_direct:.4f}")
    print()

print("\n--- Using search_kb function ---")
results = search_kb(query)
for r in results:
    print(f"  Q: {r['question']}, Score: {r['score']}")
