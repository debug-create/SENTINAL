import asyncio
import json
import websockets

async def test():
    # Test 1: Happy path - known question
    print("=== Test 1: Happy Path ===")
    uri = 'ws://localhost:8000/ws/test_happy_' + str(int(asyncio.get_event_loop().time()))
    try:
        async with websockets.connect(uri) as ws:
            await ws.send(json.dumps({'type': 'user_msg', 'message': 'How do I reset my password?'}))
            for i in range(20):
                try:
                    response = await asyncio.wait_for(ws.recv(), timeout=30)
                    data = json.loads(response)
                    if data['type'] == 'confidence':
                        print(f"  Confidence: score={data['score']}, mode={data['mode']}")
                    elif data['type'] == 'token':
                        content = data.get('content', '')
                        if i == 1 or 'error' in content.lower():
                            print(f"  Token: {content[:100]}")
                    elif data['type'] == 'done':
                        print(f"  Done. ✓")
                        break
                    elif data['type'] == 'clarifying_question':
                        print(f"  UNEXPECTED: Clarifying question received: {data.get('content', '')[:80]}")
                        break
                    else:
                        print(f"  {data['type']}: {json.dumps(data)[:100]}")
                except asyncio.TimeoutError:
                    print("  TIMEOUT")
                    break
    except Exception as e:
        print(f"  ERROR: {e}")

    print()
    
    # Test 2: Synthesis trigger - unknown question
    print("=== Test 2: Synthesis Trigger ===")
    uri2 = 'ws://localhost:8000/ws/test_synth_' + str(int(asyncio.get_event_loop().time()))
    try:
        async with websockets.connect(uri2) as ws:
            await ws.send(json.dumps({'type': 'user_msg', 'message': 'What happens to my progress if the app crashes mid-lesson?'}))
            for i in range(20):
                try:
                    response = await asyncio.wait_for(ws.recv(), timeout=30)
                    data = json.loads(response)
                    if data['type'] == 'confidence':
                        print(f"  Confidence: score={data['score']}, mode={data['mode']}")
                    elif data['type'] == 'clarifying_question':
                        print(f"  Clarifying question: {data.get('content', '')[:80]}")
                        print(f"  ✓ Synthesis loop triggered correctly")
                        break
                    elif data['type'] == 'done':
                        print(f"  UNEXPECTED: Done (should have triggered clarifying question)")
                        break
                    else:
                        print(f"  {data['type']}: {json.dumps(data)[:100]}")
                except asyncio.TimeoutError:
                    print("  TIMEOUT")
                    break
    except Exception as e:
        print(f"  ERROR: {e}")
    
    print()
    
    # Test 3: Check KB API for correct format
    print("=== Test 3: KB API Format ===")
    import urllib.request
    try:
        with urllib.request.urlopen('http://localhost:8000/api/kb') as resp:
            data = json.loads(resp.read())
            entries = data.get('entries', [])
            print(f"  Total entries: {data.get('count', len(entries))}")
            # Check first entry has answer
            if entries:
                e = entries[0]
                has_answer = bool(e.get('answer', ''))
                has_question = bool(e.get('question', ''))
                print(f"  First entry - Q: {e.get('question', '')[:50]}, A: {e.get('answer', '')[:50]}")
                print(f"  Has question: {has_question}, Has answer: {has_answer}")
    except Exception as e:
        print(f"  ERROR: {e}")

asyncio.run(test())
