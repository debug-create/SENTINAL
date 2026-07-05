"""
Emerging issues — tracks low-confidence (unanswered) queries in a rolling window.
When 3+ queries cluster above a similarity threshold to each other,
surfaces an emerging_issue event with a suggested FAQ.
"""
import json
import os
import time
import logging
from typing import Optional

logger = logging.getLogger(__name__)

from config import TRACKER_FILE, ensure_parent_dir
CLUSTER_THRESHOLD = 0.80  # similarity between unanswered queries to count as cluster
CLUSTER_MIN_SIZE = 3
ROLLING_WINDOW_SECONDS = 3600  # 1 hour window


def _ensure_data_dir() -> None:
    try:
        ensure_parent_dir(TRACKER_FILE)
    except Exception as e:
        logger.error(f"Failed to create data directory: {e}")


def _load_queries() -> list[dict]:
    try:
        if os.path.exists(TRACKER_FILE):
            with open(TRACKER_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
        return []
    except (json.JSONDecodeError, OSError) as e:
        logger.error(f"Failed to load emerging queries: {e}")
        return []


def _save_queries(queries: list[dict]) -> None:
    _ensure_data_dir()
    try:
        with open(TRACKER_FILE, "w", encoding="utf-8") as f:
            json.dump(queries, f, indent=2)
    except OSError as e:
        logger.error(f"Failed to save emerging queries: {e}")


def track_unanswered_query(query: str) -> None:
    """Record a low-confidence query for clustering analysis."""
    queries = _load_queries()
    now = time.time()

    # Prune entries outside the rolling window
    queries = [q for q in queries if now - q.get("timestamp", 0) < ROLLING_WINDOW_SECONDS]

    queries.append({
        "query": query,
        "timestamp": now,
    })
    _save_queries(queries)
    logger.info(f"Tracked unanswered query: '{query}' ({len(queries)} in window)")


def detect_clusters(embedding_fn) -> Optional[dict]:
    """Check if any cluster of 3+ similar unanswered queries exists.

    Args:
        embedding_fn: callable that takes list[str] and returns list of embeddings

    Returns:
        dict with cluster info if found, None otherwise
    """
    import hashlib
    queries = _load_queries()
    now = time.time()

    # Prune stale entries
    queries = [q for q in queries if now - q.get("timestamp", 0) < ROLLING_WINDOW_SECONDS]

    if len(queries) < CLUSTER_MIN_SIZE:
        return None

    try:
        texts = [q["query"] for q in queries]
        embeddings = embedding_fn(texts)

        # Simple greedy clustering: for each query, find how many others are similar
        import numpy as np

        emb_array = np.array(embeddings)
        # Normalize for cosine similarity
        norms = np.linalg.norm(emb_array, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)
        normalized = emb_array / norms

        # Cosine similarity matrix
        sim_matrix = normalized @ normalized.T

        # Find the largest cluster
        best_cluster = []
        for i in range(len(texts)):
            cluster = [i]
            for j in range(len(texts)):
                if i != j and sim_matrix[i][j] >= CLUSTER_THRESHOLD:
                    cluster.append(j)
            if len(cluster) >= CLUSTER_MIN_SIZE and len(cluster) > len(best_cluster):
                best_cluster = cluster

        if len(best_cluster) >= CLUSTER_MIN_SIZE:
            cluster_queries = [texts[i] for i in best_cluster]
            # Use the most common/central query as suggested FAQ basis
            suggested_q = cluster_queries[0]
            
            c_queries = sorted(cluster_queries)
            queries_sig = "".join(c_queries)
            cluster_id = f"cluster_{hashlib.md5(queries_sig.encode('utf-8')).hexdigest()[:12]}"

            return {
                "id": cluster_id,
                "cluster": cluster_queries,
                "count": len(cluster_queries),
                "suggested_faq": f"FAQ suggestion based on {len(cluster_queries)} similar unanswered queries: '{suggested_q}'",
            }

    except Exception as e:
        logger.error(f"Emerging issues clustering error: {e}")

    return None

def promote_cluster(cluster_id: str, embedding_fn) -> Optional[dict]:
    """Promote an emerging issue cluster by ID.
    Synthesizes FAQ, pushes to approval queue, removes queries from tracker file.
    """
    import hashlib
    from synthesis import synthesize_faq_from_cluster
    from approval_queue import add_to_queue

    # Re-run clustering to find the matching cluster ID
    queries = _load_queries()
    now = time.time()
    queries = [q for q in queries if now - q.get("timestamp", 0) < ROLLING_WINDOW_SECONDS]

    if len(queries) < CLUSTER_MIN_SIZE:
        logger.warning(f"No queries in window to promote cluster {cluster_id}")
        return None

    try:
        texts = [q["query"] for q in queries]
        embeddings = embedding_fn(texts)

        import numpy as np
        emb_array = np.array(embeddings)
        norms = np.linalg.norm(emb_array, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)
        normalized = emb_array / norms

        sim_matrix = normalized @ normalized.T

        # Find all possible clusters of size >= CLUSTER_MIN_SIZE
        found_cluster_queries = None
        for i in range(len(texts)):
            cluster_indices = [i]
            for j in range(len(texts)):
                if i != j and sim_matrix[i][j] >= CLUSTER_THRESHOLD:
                    cluster_indices.append(j)
            if len(cluster_indices) >= CLUSTER_MIN_SIZE:
                c_queries = sorted([texts[idx] for idx in cluster_indices])
                queries_sig = "".join(c_queries)
                c_id = f"cluster_{hashlib.md5(queries_sig.encode('utf-8')).hexdigest()[:12]}"
                if c_id == cluster_id:
                    found_cluster_queries = c_queries
                    break

        if found_cluster_queries:
            # 1. Synthesize FAQ using Groq
            logger.info(f"Synthesizing FAQ for promoted cluster: {found_cluster_queries}")
            faq = synthesize_faq_from_cluster(found_cluster_queries)
            faq_question = faq.get("question", found_cluster_queries[0])
            faq_answer = faq.get("answer", "")

            # 2. Add to approval queue
            orig_query = f"[Promoted from {len(found_cluster_queries)} clustered queries]"
            # Create a simple synthesis log for this promoted entry
            log = [
                {"stage": "searching_kb", "timestamp": time.time()},
                {"stage": "low_confidence", "timestamp": time.time()},
                {"stage": "synthesizing", "timestamp": time.time()},
                {"stage": "pending_approval", "timestamp": time.time()}
            ]
            import json
            queue_id = add_to_queue(faq_question, faq_answer, original_query=orig_query, synthesis_log=json.dumps(log))

            # 3. Remove these queries from tracker
            promoted_texts_set = set(found_cluster_queries)
            updated_queries = [q for q in queries if q["query"] not in promoted_texts_set]
            _save_queries(updated_queries)

            logger.info(f"Successfully promoted cluster {cluster_id}. Added queue entry {queue_id}")
            return {
                "queue_id": queue_id,
                "question": faq_question,
                "answer": faq_answer,
                "queries_removed": len(found_cluster_queries)
            }
        else:
            logger.warning(f"Cluster with ID {cluster_id} not found in current queries.")
            return None

    except Exception as e:
        logger.error(f"Error promoting cluster: {e}")
        return None
