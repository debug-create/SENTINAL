import asyncio
import json
import websockets

async def test():
    print("Connecting...")
    ws = await websockets.connect("ws://localhost:8000/ws/cli-test-999")
    print("CONNECTED!")
    
    msg = json.dumps({"type": "user_msg", "message": "How do I reset my password?"})
    await ws.send(msg)
    print("SENT message")
    
    # Collect responses for up to 15 seconds
    try:
        while True:
            r = await asyncio.wait_for(ws.recv(), timeout=15)
            data = json.loads(r)
            print(f"  GOT: type={data.get('type')}  content={str(data.get('content',''))[:80]}")
            if data.get("type") == "done":
                break
    except asyncio.TimeoutError:
        print("TIMEOUT - no more messages")
    
    await ws.close()
    print("DONE")

asyncio.run(test())
