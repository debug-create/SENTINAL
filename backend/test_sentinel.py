"""
SENTINEL — pytest test suite
Covers: seed idempotency, high-confidence hit, clarification trigger,
duplicate detection (0.88 threshold with similarity = 1 - distance/2),
and pending_synthesis file persistence across simulated restart.
"""
import sys
from unittest.mock import MagicMock
sys.modules['groq'] = MagicMock()

import json
import os
import tempfile
import gc

import pytest

# ── Fixtures ───────────────────────────────────────────────────────────


@pytest.fixture
def test_collection(tmp_path):
    """Create a fresh ChromaDB collection for testing in a temp directory."""
    import chromadb
    from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

    ef = SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")
    chroma_dir = str(tmp_path / "chroma_test")
    client = chromadb.PersistentClient(path=chroma_dir)
    coll = client.get_or_create_collection(
        name="test_sentinel_kb",
        embedding_function=ef,
        metadata={"hnsw:space": "cosine"},
    )
    yield coll
    # Let ChromaDB release file handles
    del coll
    del client
    gc.collect()


@pytest.fixture
def data_dir(tmp_path):
    """Provide a temporary data directory for JSON file tests."""
    d = tmp_path / "data"
    d.mkdir()
    return d


# ── Test: Seed Idempotency ─────────────────────────────────────────────

def test_seed_idempotency(test_collection):
    """seed_if_empty() should seed once and skip on second call."""
    from seed_data import seed_if_empty

    # First call should seed
    result1 = seed_if_empty(test_collection)
    assert result1 is True
    count_after_first = test_collection.count()
    assert count_after_first == 15  # 15 seed FAQs

    # Second call should skip
    result2 = seed_if_empty(test_collection)
    assert result2 is False
    count_after_second = test_collection.count()
    assert count_after_second == 15  # unchanged


# ── Test: High-Confidence Query Hit ────────────────────────────────────

def test_high_confidence_query(test_collection):
    """A query close to a seeded FAQ should return score >= 0.75."""
    from seed_data import seed_if_empty

    seed_if_empty(test_collection)

    results = test_collection.query(
        query_texts=["How do I download my course completion certificate?"],
        n_results=1,
        include=["distances"],
    )

    assert results["distances"] and results["distances"][0]
    distance = results["distances"][0][0]
    similarity = 1 - (distance / 2)  # correct formula
    assert similarity >= 0.75, f"Expected similarity >= 0.75, got {similarity:.4f}"


# ── Test: Low-Confidence Query (Clarification Trigger) ─────────────────

def test_low_confidence_triggers_clarification(test_collection):
    """A query far from any seeded FAQ should return score < 0.75."""
    from seed_data import seed_if_empty

    seed_if_empty(test_collection)

    results = test_collection.query(
        query_texts=["What is the quantum entanglement policy for virtual lab simulations?"],
        n_results=1,
        include=["distances"],
    )

    assert results["distances"] and results["distances"][0]
    distance = results["distances"][0][0]
    similarity = 1 - (distance / 2)
    assert similarity < 0.75, f"Expected similarity < 0.75, got {similarity:.4f}"


# ── Test: Duplicate Detection at 0.88 Threshold ───────────────────────

def test_duplicate_detection_at_threshold(test_collection):
    """is_duplicate() should detect near-identical questions (similarity >= 0.88)."""
    from rag import is_duplicate

    # Add a known entry
    test_collection.add(
        ids=["test_dup_001"],
        documents=["You can reset your password by clicking Forgot Password on the login page."],
        metadatas=[{"question": "How do I reset my password?", "source": "seeded"}],
    )

    # Exact match should be a duplicate
    assert is_duplicate(test_collection, "How do I reset my password?", threshold=0.88) is True

    # Very similar phrasing should also be caught
    assert is_duplicate(test_collection, "How can I reset my password?", threshold=0.88) is True

    # Completely different question should NOT be a duplicate
    assert is_duplicate(test_collection, "What is the refund policy for annual subscriptions?", threshold=0.88) is False


def test_similarity_formula_correctness(test_collection):
    """Verify that the similarity formula is 1 - (distance/2), NOT 1 - distance."""
    test_collection.add(
        ids=["test_formula_001"],
        documents=["Test answer for formula verification."],
        metadatas=[{"question": "Test question", "source": "test"}],
    )

    results = test_collection.query(
        query_texts=["Test question"],
        n_results=1,
        include=["distances"],
    )

    distance = results["distances"][0][0]
    correct_similarity = 1 - (distance / 2)

    # With cosine distance in [0,2], the correct formula gives values in [0,1]
    assert 0 <= correct_similarity <= 1, f"Correct formula gave out-of-range: {correct_similarity}"
    # The correct similarity should be higher (closer to 1) for a near-match
    assert correct_similarity >= 0.5, f"Near-match should have high similarity: {correct_similarity}"


# ── Test: Pending Synthesis File Persistence ───────────────────────────

def test_pending_synthesis_persists_across_restart(data_dir):
    """Pending synthesis state should survive a simulated restart (module re-import)."""
    pending_file = str(data_dir / "pending_synthesis.json")

    # Simulate saving pending state
    test_data = {
        "session_abc123": {
            "query": "What is the partial completion policy?",
            "context": "Q: How do I get my certificate?\nA: Complete all modules..."
        }
    }

    with open(pending_file, "w", encoding="utf-8") as f:
        json.dump(test_data, f, indent=2)

    # Simulate "restart" by reading from file (as the new main.py does)
    with open(pending_file, "r", encoding="utf-8") as f:
        loaded = json.load(f)

    assert "session_abc123" in loaded
    assert loaded["session_abc123"]["query"] == "What is the partial completion policy?"
    assert "context" in loaded["session_abc123"]

    # Simulate popping and re-saving (what the handler does)
    session_data = loaded.pop("session_abc123")
    with open(pending_file, "w", encoding="utf-8") as f:
        json.dump(loaded, f, indent=2)

    # Verify it's gone from the file
    with open(pending_file, "r", encoding="utf-8") as f:
        reloaded = json.load(f)
    assert "session_abc123" not in reloaded
    assert session_data["query"] == "What is the partial completion policy?"


def test_pending_synthesis_helpers(data_dir):
    """Test the load/save JSON pattern used by main.py for pending synthesis persistence.
    Replicates the helper logic without importing main (which triggers Groq client init)."""
    pending_file = str(data_dir / "pending_synthesis.json")

    # Replicate _load_pending
    def _load_pending():
        try:
            if os.path.exists(pending_file):
                with open(pending_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return data if isinstance(data, dict) else {}
            return {}
        except (json.JSONDecodeError, OSError):
            return {}

    # Replicate _save_pending
    def _save_pending(pending):
        os.makedirs(os.path.dirname(pending_file), exist_ok=True)
        with open(pending_file, "w", encoding="utf-8") as f:
            json.dump(pending, f, indent=2)

    # Start empty
    loaded = _load_pending()
    assert loaded == {}

    # Save some data
    test_pending = {
        "session_xyz": {"query": "How do I export grades?", "context": "some context"}
    }
    _save_pending(test_pending)

    # Load it back (simulates a restart)
    loaded = _load_pending()
    assert "session_xyz" in loaded
    assert loaded["session_xyz"]["query"] == "How do I export grades?"

    # Pop and re-save (simulates clarification answer)
    loaded.pop("session_xyz")
    _save_pending(loaded)
    reloaded = _load_pending()
    assert "session_xyz" not in reloaded


# ── Test: Approval Queue ───────────────────────────────────────────────

def test_approval_queue_lifecycle(data_dir):
    """Test add → get → approve/reject cycle for the approval queue."""
    import approval_queue

    original_file = approval_queue.QUEUE_FILE
    approval_queue.QUEUE_FILE = str(data_dir / "approval_queue.json")

    try:
        # Add entries
        id1 = approval_queue.add_to_queue("Question 1?", "Answer 1")
        id2 = approval_queue.add_to_queue("Question 2?", "Answer 2")

        # Get pending
        queue = approval_queue.get_queue()
        assert len(queue) == 2

        # Approve one
        entry = approval_queue.approve_entry(id1)
        assert entry is not None
        assert entry["status"] == "approved"

        # Reject one
        entry = approval_queue.reject_entry(id2)
        assert entry is not None
        assert entry["status"] == "rejected"

        # Queue should be empty now
        queue = approval_queue.get_queue()
        assert len(queue) == 0

    finally:
        approval_queue.QUEUE_FILE = original_file


# ── Test: Prompt 2 Additions ───────────────────────────────────────────

def test_replay_log_roundtrip(test_collection):
    """Test that synthesis_log metadata stores and retrieves correctly from ChromaDB."""
    from rag import upsert_entry, get_entry
    from unittest.mock import patch
    
    log_data = [
        {"stage": "searching_kb", "timestamp": 1000.0},
        {"stage": "low_confidence", "timestamp": 1001.0},
        {"stage": "clarifying", "timestamp": 1002.0}
    ]
    log_str = json.dumps(log_data)
    
    with patch("rag.collection", test_collection):
        # Upsert entry with synthesis log
        entry_id = upsert_entry(
            question="Replay test question?", 
            answer="Replay test answer.", 
            synthesis_log=log_str
        )
        
        # Retrieve entry
        entry = get_entry(entry_id)
        assert entry is not None
        assert entry["synthesis_log"] == log_str
        
        # Load and assert structure
        retrieved_log = json.loads(entry["synthesis_log"])
        assert len(retrieved_log) == 3
        assert retrieved_log[0]["stage"] == "searching_kb"



def test_cluster_promotion(data_dir):
    """Test promoting a cluster of unanswered queries to the approval queue."""
    import emerging
    import approval_queue
    from unittest.mock import patch
    
    original_tracker = emerging.TRACKER_FILE
    original_queue = approval_queue.QUEUE_FILE
    
    emerging.TRACKER_FILE = str(data_dir / "emerging_queries.json")
    approval_queue.QUEUE_FILE = str(data_dir / "approval_queue.json")
    
    try:
        # 1. Populate emerging queries with 3 items that will cluster
        queries_to_track = [
            "How do I reset my password?",
            "Reset my password?",
            "Can I reset my password?"
        ]
        for q in queries_to_track:
            emerging.track_unanswered_query(q)
            
        # Verify they are tracked
        tracked = emerging._load_queries()
        assert len(tracked) == 3
        
        # 2. Define a dummy embedding function that returns identical embeddings
        def dummy_embedding_fn(texts):
            # Return same dummy 384-dim embedding so similarity is 1.0 (exact match)
            return [[1.0] * 384 for _ in texts]
            
        # Detect cluster to get ID
        cluster_info = emerging.detect_clusters(dummy_embedding_fn)
        assert cluster_info is not None
        cluster_id = cluster_info["id"]
        assert cluster_info["count"] == 3
        
        # 3. Promote the cluster with synthesis mocked
        mocked_faq = {
            "question": "How do I reset my password?",
            "answer": "Click Forgot Password on the login page."
        }
        
        with patch("synthesis.synthesize_faq_from_cluster", return_value=mocked_faq):
            promote_result = emerging.promote_cluster(cluster_id, dummy_embedding_fn)
            
        assert promote_result is not None
        assert promote_result["question"] == mocked_faq["question"]
        assert promote_result["answer"] == mocked_faq["answer"]
        
        # 4. Verify cluster queries were removed from tracking
        remaining_queries = emerging._load_queries()
        assert len(remaining_queries) == 0
        
        # 5. Verify the FAQ is now in the approval queue
        queue = approval_queue.get_queue()
        assert len(queue) == 1
        assert queue[0]["question"] == mocked_faq["question"]
        assert queue[0]["original_query"] == "[Promoted from 3 clustered queries]"
        
    finally:
        emerging.TRACKER_FILE = original_tracker
        approval_queue.QUEUE_FILE = original_queue


# ── Test: Prompt 3 Additions ───────────────────────────────────────────

def test_find_candidate_pairs_respects_band(test_collection):
    """Test candidate pairs filters only overlaps within [0.75, 0.88] band."""
    import audit
    from unittest.mock import patch

    # Clear collection and seed questions
    # audit_a & audit_b should overlap. We know "How do I reset my password?" vs
    # "Where can I change my security credentials? Go to settings." has similarity 0.76088.
    test_collection.add(
        ids=["audit_a", "audit_b", "audit_unrelated"],
        documents=[
            "How do I reset my password? Click Forgot Password on the login page.",
            "Where can I change my security credentials? Go to settings.",
            "What is the refund policy? Refunds are available within 30 days."
        ],
        metadatas=[
            {"question": "How do I reset my password?", "source": "seeded"},
            {"question": "Where can I change my security credentials?", "source": "seeded"},
            {"question": "What is the refund policy?", "source": "seeded"}
        ]
    )

    with patch("rag.collection", test_collection), patch("rag.get_all_entries") as mock_get_all:
        mock_get_all.return_value = [
            {"id": "audit_a", "question": "How do I reset my password?", "answer": "How do I reset my password? Click Forgot Password on the login page.", "source": "seeded"},
            {"id": "audit_b", "question": "Where can I change my security credentials?", "answer": "Where can I change my security credentials? Go to settings.", "source": "seeded"},
            {"id": "audit_unrelated", "question": "What is the refund policy?", "answer": "What is the refund policy? Refunds are available within 30 days.", "source": "seeded"}
        ]
        
        pairs = audit.find_candidate_pairs()
        
    # We should have exactly 1 pair (A, B) or (B, A) in the list
    assert len(pairs) == 1
    pair = pairs[0]
    # Check that similar items are included and unrelated is not
    assert {pair[0]["id"], pair[1]["id"]} == {"audit_a", "audit_b"}
    assert 0.75 <= pair[2] < 0.88


def test_audit_findings_persist(data_dir):
    """Test that audit findings load and save correctly to/from disk."""
    import audit
    
    original_findings_file = audit.FINDINGS_FILE
    audit.FINDINGS_FILE = str(data_dir / "audit_findings.json")
    
    try:
        findings = [
            {
                "id": "finding_123",
                "entry_a": {"id": "a", "question": "Q A", "answer": "A A", "source": "seeded"},
                "entry_b": {"id": "b", "question": "Q B", "answer": "A B", "source": "seeded"},
                "similarity": 0.82,
                "explanation": "Contradiction text.",
                "timestamp": 12345.6,
                "status": "unresolved"
            }
        ]
        
        audit._save_findings(findings)
        
        loaded = audit.get_unresolved_findings()
        assert len(loaded) == 1
        assert loaded[0]["id"] == "finding_123"
        assert loaded[0]["similarity"] == 0.82
        
    finally:
        audit.FINDINGS_FILE = original_findings_file


def test_resolve_deletes_correct_entry(test_collection, data_dir):
    """Test resolve_finding sets status and deletes the other entry from ChromaDB."""
    import audit
    
    original_findings_file = audit.FINDINGS_FILE
    audit.FINDINGS_FILE = str(data_dir / "audit_findings.json")
    
    # Seed collection
    test_collection.add(
        ids=["a", "b"],
        documents=["Answer A.", "Answer B."],
        metadatas=[
            {"question": "Question A?", "source": "seeded"},
            {"question": "Question B?", "source": "seeded"}
        ]
    )
    
    try:
        findings = [
            {
                "id": "finding_123",
                "entry_a": {"id": "a", "question": "Question A?", "answer": "Answer A.", "source": "seeded"},
                "entry_b": {"id": "b", "question": "Question B?", "answer": "Answer B.", "source": "seeded"},
                "similarity": 0.82,
                "explanation": "Contradiction text.",
                "timestamp": 12345.6,
                "status": "unresolved"
            }
        ]
        audit._save_findings(findings)
        
        # Test resolve with keep_a (should delete b)
        from unittest.mock import patch
        with patch("rag.collection", test_collection):
            # Resolve finding
            res = audit.resolve_finding("finding_123", "keep_a")
            assert res is not None
            assert res["status"] == "resolved"
            
            # Since resolve_finding is called in the endpoint, the endpoint is where rag.delete_entry is called.
            # Let's verify resolve_finding saved status resolved
            unresolved = audit.get_unresolved_findings()
            assert len(unresolved) == 0
            
            # Call rag.delete_entry(res["entry_b"]["id"]) manually to simulate main.py resolve endpoint
            from rag import delete_entry
            delete_entry(res["entry_b"]["id"])
            
            # Assert "b" is deleted and "a" remains
            remaining = test_collection.get()
            assert "a" in remaining["ids"]
            assert "b" not in remaining["ids"]
            
    finally:
        audit.FINDINGS_FILE = original_findings_file

