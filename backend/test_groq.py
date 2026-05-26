import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

api_key = os.environ.get("GROQ_API_KEY")
print(f"API key loaded: {'YES - ' + api_key[:8] + '...' if api_key else 'NO - KEY MISSING'}")

client = Groq(api_key=api_key)

print("Testing llama-3.1-8b-instant (streaming)...")
try:
  stream = client.chat.completions.create(
    model="llama-3.1-8b-instant",
    messages=[{"role": "user", "content": "Say hello in one word."}],
    stream=True,
    max_tokens=10
  )
  print("Stream created. Reading chunks...")
  for chunk in stream:
    content = chunk.choices[0].delta.content
    if content:
      print(f"Chunk: '{content}'")
  print("[SUCCESS] Streaming test PASSED")
except Exception as e:
  print(f"[FAILED] Streaming test FAILED: {e}")

print("\nTesting llama-3.3-70b-versatile (non-streaming)...")
try:
  response = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[{"role": "user", "content": "Say hello in one word."}],
    max_tokens=10
  )
  print(f"Response: '{response.choices[0].message.content}'")
  print("[SUCCESS] Non-streaming test PASSED")
except Exception as e:
  print(f"[FAILED] Non-streaming test FAILED: {e}")

print("\nTesting ChromaDB search...")
try:
  from rag import collection, search_kb
  count = collection.count()
  print(f"ChromaDB count: {count} entries")
  if count > 0:
    results = search_kb("how to download certificate")
    if results:
      top_score = results[0]["score"]
      print(f"Search top_score: {top_score}")
      print(f"Has confident answer: {top_score >= 0.75}")
      print("[SUCCESS] ChromaDB test PASSED")
    else:
      print("[FAILED] ChromaDB search returned 0 results")
  else:
    print("[FAILED] ChromaDB is EMPTY — seed data missing")
except Exception as e:
  print(f"[FAILED] ChromaDB test FAILED: {e}")
