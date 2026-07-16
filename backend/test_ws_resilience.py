"""
test_ws_resilience.py
In-process WebSocket integration tests for synthesis pipeline resilience:
1. Simulates a Groq API failure mid-stream and verifies the client receives an 'error' event.
2. Simulates a client disconnect during the clarifying stage and verifies that pending_synthesis.json is kept clean.
"""
import os
import sys
import json
import time
from unittest.mock import patch, MagicMock

# Ensure backend is in python path
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient
from main import app, _load_pending
from config import PENDING_FILE

def test_mid_stream_error():
    print("\n--- Test Scenario 1: Groq API Error Mid-Stream ---")
    
    # Mock stream_answer to throw an exception after yielding one token
    def mock_stream_failing(query, context):
        yield "Here is some partial answer... "
        raise RuntimeError("Groq API Timeout mid-stream")
        
    client = TestClient(app)
    
    # We patch main.stream_answer to inject our failing stream
    with patch("main.stream_answer", side_effect=mock_stream_failing):
        with client.websocket_connect("/ws/test_session_midstream") as ws:
            # Query a high-confidence seeded FAQ to trigger immediate streaming
            ws.send_json({"type": "user_msg", "message": "How do I reset my password?"})
            
            # Collect WebSocket messages
            received_messages = []
            try:
                # Read 10 messages max to prevent infinite block
                for _ in range(10):
                    msg = ws.receive_json()
                    received_messages.append(msg)
                    print(f"  Received: type={msg.get('type')} content={str(msg.get('content'))[:50]}")
                    if msg.get("type") == "error":
                        break
            except Exception as e:
                print(f"  Socket exception during read: {e}")
                
            # Assertions
            types = [m.get("type") for m in received_messages]
            assert "searching_kb" in [m.get("stage") for m in received_messages if m.get("type") == "stage"]
            assert "confident_match" in [m.get("stage") for m in received_messages if m.get("type") == "stage"]
            assert "token" in types
            assert "error" in types
            print("[SUCCESS] Test Scenario 1 passed! Client received the proper 'error' packet mid-stream.")


def test_client_disconnect_cleanup():
    print("\n--- Test Scenario 2: Client Disconnect during clarifying stage ---")
    
    client = TestClient(app)
    session_id = "test_session_disconnect"
    
    # Clean up PENDING_FILE
    if os.path.exists(PENDING_FILE):
        try:
            os.remove(PENDING_FILE)
        except OSError:
            pass
            
    # Mock generate_clarifying_question to return a standard clarifying question
    mock_clarifying = {
        "reason": "Knowledge gap found",
        "clarifying_question": "Are you on web or mobile?"
    }
    
    with patch("main.generate_clarifying_question", return_value=mock_clarifying):
        # 1. Connect and ask a question that triggers a clarification flow (low confidence)
        with client.websocket_connect(f"/ws/{session_id}") as ws:
            ws.send_json({"type": "user_msg", "message": "What is the quantum computing policy?"})
            
            # Wait for clarifying question message to verify flow is complete
            for _ in range(5):
                msg = ws.receive_json()
                print(f"  Received: type={msg.get('type')}")
                if msg.get("type") == "clarifying_question":
                    break
                    
            # Verify that the session is written to pending_synthesis.json
            pending = _load_pending()
            print(f"  Loaded pending synthesis from disk: {list(pending.keys())}")
            assert session_id in pending
            print(f"  [OK] Session '{session_id}' registered in pending_synthesis.json")
            
            # 2. Simulate client disconnect by exiting the with-context (closes connection)
            print("  Disconnecting WebSocket connection...")
            
        # Verify that the session is cleaned up and no longer exists in pending_synthesis.json
        pending_after = _load_pending()
        print(f"  Loaded pending synthesis after disconnect: {list(pending_after.keys())}")
        assert session_id not in pending_after
        print(f"[SUCCESS] Test Scenario 2 passed! Stale session '{session_id}' was cleanly pruned after disconnect.")


if __name__ == "__main__":
    try:
        test_mid_stream_error()
        test_client_disconnect_cleanup()
        print("\nAll resilience tests passed successfully!")
    except AssertionError as e:
        print(f"\nAssertion Error: {e}")
        sys.exit(1)
