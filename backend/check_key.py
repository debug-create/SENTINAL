from dotenv import load_dotenv
import os
load_dotenv()
key = os.getenv("GROQ_API_KEY", "")
print(f"Key length: {len(key)}")
print(f"Key prefix: {key[:12]}..." if len(key) > 12 else f"Key: {key}")
print(f"Starts with gsk_: {key.startswith('gsk_')}")

# Quick API test with timeout
from groq import Groq
client = Groq(api_key=key)
try:
    resp = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": "Say hi"}],
        max_tokens=5,
    )
    print(f"API response: {resp.choices[0].message.content}")
    print("STATUS: API KEY IS VALID")
except Exception as e:
    print(f"API error: {e}")
    print("STATUS: API KEY IS INVALID OR EXPIRED")
