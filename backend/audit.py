"""
KB Self-Audit module for SENTINEL.
Identifies similar questions, calls Groq to detect contradictions,
and stores/manages the resulting audit findings.
"""
import os
import json
import uuid
import time
import logging
from typing import Optional, Any

logger = logging.getLogger(__name__)

from config import FINDINGS_FILE, ensure_parent_dir

def _ensure_data_dir() -> None:
    """Create the storage directory if it doesn't exist."""
    try:
        ensure_parent_dir(FINDINGS_FILE)
    except Exception as e:
        logger.error(f"Failed to create data directory: {e}")

def _load_findings() -> list[dict]:
    """Read audit findings from disk."""
    try:
        if os.path.exists(FINDINGS_FILE):
            with open(FINDINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
        return []
    except (json.JSONDecodeError, OSError) as e:
        logger.error(f"Failed to load audit findings: {e}")
        return []

def _save_findings(findings: list[dict]) -> None:
    """Write audit findings to disk."""
    _ensure_data_dir()
    try:
        with open(FINDINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(findings, f, indent=2)
    except OSError as e:
        logger.error(f"Failed to save audit findings: {e}")

def find_candidate_pairs(similarity_floor: float = 0.75, similarity_ceiling: float = 0.95) -> list[tuple]:
    """Query every KB entry's question against the collection (excluding itself),
    keeping deduplicated pairs whose similarity falls in the [similarity_floor, 0.88] band.
    Returns list of (entry_a, entry_b, similarity).
    """
    from rag import get_all_entries, collection
    entries = get_all_entries()
    candidate_pairs = {}

    for entry in entries:
        try:
            results = collection.query(
                query_texts=[entry["question"]],
                n_results=5,
                include=["documents", "metadatas", "distances"]
            )
            if not results or not results["ids"] or not results["ids"][0]:
                continue

            for i, doc_id in enumerate(results["ids"][0]):
                if doc_id == entry["id"]:
                    continue

                distance = results["distances"][0][i]
                similarity = 1 - (distance / 2)

                # similar enough to plausibly overlap, but below the existing 0.88 duplicate threshold
                # so true duplicates aren't reprocessed as contradictions.
                if similarity_floor <= similarity < 0.88:
                    metadata = results["metadatas"][0][i] or {}
                    other_question = metadata.get("question", "")
                    other_answer = results["documents"][0][i]
                    other_source = metadata.get("source", "seeded")

                    pair_key = tuple(sorted([entry["id"], doc_id]))
                    if pair_key not in candidate_pairs:
                        if entry["id"] < doc_id:
                            entry_a = {
                                "id": entry["id"],
                                "question": entry["question"],
                                "answer": entry["answer"],
                                "source": entry.get("source", "seeded")
                            }
                            entry_b = {
                                "id": doc_id,
                                "question": other_question,
                                "answer": other_answer,
                                "source": other_source
                            }
                        else:
                            entry_a = {
                                "id": doc_id,
                                "question": other_question,
                                "answer": other_answer,
                                "source": other_source
                            }
                            entry_b = {
                                "id": entry["id"],
                                "question": entry["question"],
                                "answer": entry["answer"],
                                "source": entry.get("source", "seeded")
                            }
                        candidate_pairs[pair_key] = (entry_a, entry_b, similarity)
        except Exception as e:
            logger.warning(f"Error querying entry {entry['id']} for candidates: {e}")

    return list(candidate_pairs.values())

def judge_contradiction(entry_a: dict, entry_b: dict) -> dict:
    """Send pair of entries to Groq model to judge if they contradict or conflict.
    Returns dict: {"contradictory": bool, "explanation": str}
    """
    from synthesis import client, SYNTHESIS_MODEL
    try:
        prompt = (
            f"Compare the following two FAQ entries:\n\n"
            f"Entry A:\nQuestion: {entry_a['question']}\nAnswer: {entry_a['answer']}\n\n"
            f"Entry B:\nQuestion: {entry_b['question']}\nAnswer: {entry_b['answer']}\n\n"
            "Do their answers contradict or conflict? A contradiction exists if their instructions, "
            "rules, or facts are incompatible (e.g. different grading weights, opposite steps, incompatible requirements). "
            "Do NOT mark them as contradictory if they are just about different topics or complementary.\n"
            "Respond ONLY with valid JSON inside a JSON block with exactly two keys:\n"
            "\"contradictory\": true or false\n"
            "\"explanation\": a short one-sentence explanation of why they contradict or why they don't."
        )
        response = client.chat.completions.create(
            model=SYNTHESIS_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are a precise KB audit assistant. Analyze conflicts between FAQs and output ONLY valid JSON."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.0,
            max_tokens=150
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        return json.loads(raw)
    except Exception as e:
        logger.error(f"Error judging contradiction between {entry_a['id']} and {entry_b['id']}: {e}")
        return {"contradictory": False, "explanation": f"Error during Groq evaluation: {e}"}

def run_audit() -> list[dict]:
    """Runs candidate pair generation and queries Groq to find contradictory pairs.
    Capped at 30 candidate pairs per run. Persists unresolved findings to disk.
    """
    pairs = find_candidate_pairs()
    pairs = pairs[:30]

    new_findings = []
    current_findings = _load_findings()

    existing_pairs = {tuple(sorted([f["entry_a"]["id"], f["entry_b"]["id"]])) for f in current_findings}

    for entry_a, entry_b, similarity in pairs:
        pair_ids = tuple(sorted([entry_a["id"], entry_b["id"]]))
        if pair_ids in existing_pairs:
            continue

        judgment = judge_contradiction(entry_a, entry_b)
        if judgment.get("contradictory") is True:
            finding = {
                "id": f"finding_{uuid.uuid4().hex[:12]}",
                "entry_a": entry_a,
                "entry_b": entry_b,
                "similarity": round(similarity, 4),
                "explanation": judgment.get("explanation", ""),
                "timestamp": time.time(),
                "status": "unresolved"
            }
            new_findings.append(finding)
            current_findings.append(finding)

    if new_findings:
        _save_findings(current_findings)

    return new_findings

def get_unresolved_findings() -> list[dict]:
    """Retrieve all unresolved findings."""
    findings = _load_findings()
    return [f for f in findings if f.get("status", "unresolved") == "unresolved"]

def resolve_finding(finding_id: str, action: str) -> Optional[dict]:
    """Resolve a finding by updating its status."""
    findings = _load_findings()
    for f in findings:
        if f["id"] == finding_id and f.get("status", "unresolved") == "unresolved":
            f["status"] = "resolved"
            f["action_taken"] = action
            f["resolved_at"] = time.time()
            _save_findings(findings)
            return f
    return None
