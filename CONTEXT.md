# SENTINEL — Codebase Context File
> **Last updated:** July 2026 (ChromaDB Question-Embedding Schema, JSON Clarifying Reasoning, UI Stage Polish)
> **Purpose:** Read this FIRST before any work. This file serves as the definitive reference for LLMs and developers to understand the exact structure, current state, recent progress, and operational mechanics of the SENTINEL repository.

---

## 1. Recent Progress & Current Project State (July 2026)

The codebase has undergone several critical architectural upgrades and refinements to enhance precision, diagnostic visibility, and environment stability:

### A. ChromaDB Question-Embedding Schema Migration
*   **The Issue:** Previously, the RAG search stored the FAQ *answers* as the main searchable documents (`documents=[answer]`), and questions in metadata. This caused low semantic precision because user queries (structured as questions) were compared against answer paragraphs.
*   **The Resolution:** Migrated the collection schema so that **questions are embedded as documents** (`documents=[question]`) and both questions and answers are stored in the metadata (`metadata = {"question": question, "answer": answer, "source": "synthesized"}`).
*   **Migration Script:** Created a new tool [migrate_db.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/migrate_db.py) to tear down the old collection and seed the database with this new layout.
*   **Code Updates:** Modified `upsert_entry`, `get_all_entries`, and `get_entry` in [rag.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/rag.py) to conform to the new schema format.

### B. Structured Clarifying Questions with Confidence Reasoning
*   **The Issue:** When a low-confidence search occurred, the LLM generated a clarifying question but without providing details on *why* it was asking or what existing FAQs it was trying to differentiate between.
*   **The Resolution:** Updated the Groq prompts and functions in [synthesis.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/synthesis.py) to return a JSON object (`response_format={"type": "json_object"}`) containing:
    1.  `reason`: A brief explanation (~15 words) of why the query fell short of the closest match.
    2.  `clarifying_question`: A single targeted clarifying question.
*   **Protocol Extension:** Updated the WebSocket server in [main.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/main.py) to forward `confidence_reason` in the `clarifying_question` event payload.
*   **UI Integration:** Modified [ChatPanel.jsx](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/frontend/src/ChatPanel.jsx) and [index.css](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/frontend/src/index.css) to parse and render this reasoning under a styled element `💭 [confidenceReason]`, clarifying the bot's internal thought process to the student.

### C. UI layout & Stage Tracker polish
*   **The Issue:** Layout sizing issues clipped the visual connector lines between self-heal stages, and certain overflow boundaries broke the admin panels.
*   **The Resolution:** Expanded the line-connector widths in [index.css](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/frontend/src/index.css) to `90px` to keep stages aligned and clean. Cleaned up admin entry grid layout rendering by setting overflow rules to `visible`.

### D. Test Isolation and Stability
*   **The Issue:** The test suite would write/read test data to/from the production db paths if not carefully mocked, creating dirty file states.
*   **The Resolution:** Patched `test_replay_log_roundtrip` in [test_sentinel.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/test_sentinel.py) to isolate the database context using a patched mock collection (`with patch("rag.collection", test_collection)`).
*   **Upgraded groq and httpx:** Resolved package warnings and `httpx` proxy errors by upgrading to `groq==1.5.0` and `httpx==0.28.1` in [requirements.txt](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/requirements.txt).

---

## 2. Project Identity

| Key | Value |
|-----|-------|
| **Name** | SENTINEL — Self-Healing AI Support Chatbot |
| **Author** | Chirag |
| **Hackathon** | FlowZint AI Hackathon 2026 (Category: Support Chat Bot) |
| **Deadline** | 4th July 2026 (Main submission completed) |
| **Repository** | [GitHub Repo](https://github.com/debug-create/SENTINAL.git) |
| **Workspace Root** | `c:\Users\chira\OneDrive\Desktop\SENTINEL` |

---

## 3. Architecture Overview

```
User ⇄ React Chat UI (Vite, port 5173)
         ⇄ WebSocket (ws://{VITE_WS_URL}/ws/{sessionId})
             ⇄ FastAPI Server (Python, port 8000)
                 ├── ChromaDB Vector Store (PersistentClient, ./storage/chroma_db, cosine distance)
                 │     Collection: sentinel_kb
                 │     Schema: document=question (for embedding), metadata={question, answer, source, synthesis_log?}
                 │     Embeddings: all-MiniLM-L6-v2 (local sentence-transformers, ~90MB model)
                 ├── Groq Cloud LLM API
                 │     ├── llama-3.3-70b-versatile (FAQ synthesis, clarifying Qs, audits, reasoning)
                 │     └── llama-3.1-8b-instant (Fast token streaming response)
                 ├── Approval Queue (JSON file: storage/approval_queue.json, supervisor backlog)
                 ├── Emerging Issues Tracker (JSON file: storage/emerging_queries.json, 1-hour window logs)
                 ├── Audit Findings (JSON file: storage/audit_findings.json, contradiction reports)
                 └── Pending Synthesis (JSON file: storage/pending_synthesis.json, active session queries)
```

### Self-Heal Pipeline (Visible in UI Step-Tracker & Replay)
1.  `searching_kb`: Vector similarity search in ChromaDB using query embeddings.
2.  `confident_match`: Top-match similarity score $\ge 0.75$. Stream answer using Groq with the matched FAQ as context.
3.  `low_confidence`: Similarity score $< 0.75$. Register query in the rolling window for emerging issues.
4.  `clarifying`: Groq returns a JSON structure containing confidence reasoning (`reason`) and a single targeted clarifying question (`clarifying_question`). The server sends this to the frontend.
5.  Student provides clarification input.
6.  `synthesizing`: LLM merges original question, context, and clarification response into a clean QA entry.
7.  `duplicate_check`: Compares synthesized question similarity against existing entries.
8.  `kb_duplicate`: If similarity score $\ge 0.88$, database write is skipped, and the duplicate status is notified.
9.  If similarity $< 0.88$:
    *   **Supervisor Mode Enabled (`REQUIRE_APPROVAL=true`)**: `pending_approval` → queue FAQ in `approval_queue.json`.
    *   **Supervisor Mode Disabled (`REQUIRE_APPROVAL=false`)**: `kb_write` → write FAQ directly to ChromaDB collection.
10. `streaming`: Simultaneously stream the synthesized answer to the student to prevent blocking their session.

---

## 4. File Map

### Backend (`backend/`)

| File / Folder | Purpose |
|---------------|---------|
| [main.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/main.py) | FastAPI app config, CORS, lifespan startup (seeding, etc.), endpoint routing, security middlewares, and the async WebSocket connection pool (`/ws/{session_id}`) representing the interactive chatbot server. |
| [rag.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/rag.py) | ChromaDB database client wrapper. Configures embeddings, collection definitions, search queries, entry updates/deletions, and checks duplicates. |
| [synthesis.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/synthesis.py) | Groq Cloud integration logic. Generates clarifying questions (as JSON), synthesizes final FAQs, and manages streaming answers. |
| [config.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/config.py) | System-wide directory variables. Configures storage path (`./storage`) and subpath JSON files. |
| [audit.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/audit.py) | Self-Audit engine. Identifies overlapping FAQ entries in the `[0.75, 0.88)` similarity band, sends them to Groq for contradiction evaluation, and records logs. |
| [seed_data.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/seed_data.py) | Set of 15 seed FAQ structures for initial database setup. |
| [approval_queue.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/approval_queue.py) | Handles I/O operations for supervisor backlog files (`approval_queue.json`). |
| [emerging.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/emerging.py) | Aggregates low-confidence queries in a rolling 1-hour window. Employs NumPy-based cosine distance clustering to detect trend cards. |
| [migrate_db.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/migrate_db.py) | Migration script that resets/recreates the local ChromaDB database with the new question-embedding layout. |
| [check_key.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/check_key.py) | Diagnostics script to verify if the configured `GROQ_API_KEY` is active and valid. |
| [test_dist.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/test_dist.py) | Internal script to calculate/compare ChromaDB cosine distance mappings. |
| [test_ws.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/test_ws.py) | WebSocket client simulation script verifying the happy path and synthesis loop. |
| [test_ws_quick.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/test_ws_quick.py) | Streamlined WebSocket diagnostic script. |
| [test_sentinel.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/test_sentinel.py) | Pytest suite covering all storage layers, pipeline states, auditing, and clustering. |
| [requirements.txt](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/requirements.txt) | Pinned Python packages. |
| [.env.example](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/.env.example) | Template backend environment settings. |
| `storage/` *(Auto-created)* | Persistent filesystem mount directory storing files: `chroma_db/`, `pending_synthesis.json`, `approval_queue.json`, `emerging_queries.json`, `audit_findings.json`. |

### Frontend (`frontend/`)

| File / Folder | Purpose |
|---------------|---------|
| [src/App.jsx](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/frontend/src/App.jsx) | Root container. Coordinates sidebar layout navigation, theme toggles, server health checks, dashboard state analytics (e.g. CountUp), and toast displays. |
| [src/ChatPanel.jsx](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/frontend/src/ChatPanel.jsx) | Native WebSocket client rendering chat conversations, interactive query chips, streaming text, confidence scores, confidence reasons, and visual stage steps. |
| [src/KBPanel.jsx](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/frontend/src/KBPanel.jsx) | Knowledge base management interface allowing searching, sorting, JSON data export, emerging cluster alerts, and animated Self-Heal replays. |
| [src/AdminPanel.jsx](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/frontend/src/AdminPanel.jsx) | Supervisor interface. Displays pending entries side-by-side with student origins, and shows audited contradictions for resolution. |
| [src/StageTracker.jsx](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/frontend/src/StageTracker.jsx) | Shared UI indicator mapping pipeline steps with active/completed color states. |
| [src/BootScreen.jsx](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/frontend/src/BootScreen.jsx) | Framer-motion driven full-screen boot initialisation screen displaying progress checkpoints. |
| [src/LearningRail.jsx](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/frontend/src/LearningRail.jsx) | Horizontal self-healing pipeline stepper animation showing real-time backend stages. |
| [src/motionVariants.js](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/frontend/src/motionVariants.js) | Defines timing constants, ease values, and Framer Motion animation variants. |
| [src/index.css](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/frontend/src/index.css) | Complete design stylesheet containing HSL color variables, light/dark themes, animations, and typography rules. |
| [src/main.jsx](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/frontend/src/main.jsx) | React 18 bootstrap initialisation file. |
| [index.html](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/frontend/index.html) | Root HTML template importing Google Fonts. |
| [package.json](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/frontend/package.json) | Node package dependencies and script settings. |
| [eslint.config.js](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/frontend/eslint.config.js) | Javascript linter rules. |
| [vite.config.js](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/frontend/vite.config.js) | Vite dev server configuration (running on port 5173). |
| [.env.example](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/frontend/.env.example) | Frontend environment variables configuration setup. |

---

## 5. WebSocket Protocol Specification

All communication between the user's React Chat UI and the FastAPI server occurs asynchronously over WebSocket.

### Backend ➔ Frontend Messages (JSON)

*   **Type: `stage`**
    *   *Payload:* `{"type": "stage", "stage": str}`
    *   *Use:* Directs the frontend to update the active step in the self-healing pipeline tracker (e.g. `"searching_kb"`, `"clarifying"`, `"synthesizing"`, `"kb_write"`).
*   **Type: `confidence`**
    *   *Payload:* `{"type": "confidence", "score": float, "mode": "known" | "synthesized"}`
    *   *Use:* Sends the similarity score and answer origin.
*   **Type: `token`**
    *   *Payload:* `{"type": "token", "content": str}`
    *   *Use:* Streamed answer chunks from Groq.
*   **Type: `done`**
    *   *Payload:* `{"type": "done"}`
    *   *Use:* Closes the active text stream.
*   **Type: `clarifying_question`**
    *   *Payload:* `{"type": "clarifying_question", "content": str, "confidence_reason": str}`
    *   *Use:* Triggers the UI to ask for clarification, rendering the reasoning in a tooltip/chat bubble `💭 [confidence_reason]`.
*   **Type: `kb_updated`**
    *   *Payload:* `{"type": "kb_updated", "entry": {id, question, answer, source}}`
    *   *Use:* Real-time websocket notification of a committed FAQ entry.
*   **Type: `kb_pending_approval`**
    *   *Payload:* `{"type": "kb_pending_approval", "entry": {id, question, answer, source}}`
    *   *Use:* Notification that a synthesized FAQ was created but held in queue.
*   **Type: `kb_duplicate`**
    *   *Payload:* `{"type": "kb_duplicate", "content": str}`
    *   *Use:* Notifies the client that synthesis was cancelled because a duplicate FAQ already exists.
*   **Type: `error`**
    *   *Payload:* `{"type": "error", "content": str}`
    *   *Use:* Notifies about backend errors.

### Frontend ➔ Backend Messages (JSON)

*   **Type: `user_msg`**
    *   *Payload:* `{"type": "user_msg", "message": str}`
    *   *Use:* Submits the student's initial query.
*   **Type: `clarification`**
    *   *Payload:* `{"type": "clarification", "message": str}`
    *   *Use:* Submits the student's response to the clarifying question.

---

## 6. REST Endpoints Directory

All HTTP operations are defined in `main.py`.

| Method | Path | Authentication | Response format | Description / Purpose |
|--------|------|----------------|-----------------|-----------------------|
| **GET** | `/health` | None | `{"status": "ok", "timestamp": float}` | Health check endpoint. |
| **GET** | `/api/kb` | `X-API-Key` | `{"entries": list[dict], "count": int}` | Fetches full FAQ collection. |
| **GET** | `/knowledge-base`| `X-API-Key` | `list[dict]` | Returns raw array of knowledge-base records (for simpler list queries). |
| **GET** | `/api/approval-queue`| `X-Admin-Token` | `{"entries": list[dict], "count": int}` | Retrieves supervisor queue. |
| **POST**| `/api/approval-queue/{id}/approve` | `X-Admin-Token` | `{"status": "approved", "kb_id": str, "question": str}` | Approves entry and writes to ChromaDB. |
| **POST**| `/api/approval-queue/{id}/reject` | `X-Admin-Token` | `{"status": "rejected", "question": str}` | Rejects entry and deletes from queue. |
| **GET** | `/api/kb/{id}/replay` | `X-API-Key` | `{"entry_id": str, "synthesis_log": list[dict]}` | Fetches stages execution log array. |
| **GET** | `/api/emerging-issues`| `X-API-Key` | `{"has_cluster": bool, "id": str, "cluster": list[str], "count": int, "suggested_faq": str}` | Fetches active emerging cluster, if any. |
| **POST**| `/api/emerging-issues/{id}/promote` | `X-Admin-Token` | `{"status": "promoted", "queue_id": str, "question": str, "answer": str}` | Promotes emerging cluster to supervisor backlog. |
| **POST**| `/api/kb/audit/run` | `X-Admin-Token` | `{"findings": list[dict], "count": int}` | Manually triggers the self-audit contradiction engine. |
| **GET** | `/api/kb/audit/findings` | `X-Admin-Token` | `{"findings": list[dict], "count": int}` | Returns recorded contradiction findings. |
| **POST**| `/api/kb/audit/findings/{id}/resolve`| `X-Admin-Token` | Request body: `{"action": "keep_a" \| "keep_b" \| "dismiss"}`. Returns resolve summary status. | Resolves contradiction audits. |

---

## 7. Thresholds & Algorithmic Parameters

| Parameter | Value | Reference Location | Purpose & Calculation Formula |
|-----------|-------|--------------------|------------------------------|
| `CONFIDENCE_THRESHOLD` | `0.75` | [rag.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/rag.py) | Scores below this trigger the clarification loop. |
| `DUPLICATE_THRESHOLD` | `0.88` | [rag.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/rag.py) | Synthesized questions with similarity $\ge 0.88$ are blocked to avoid duplicates. |
| **Cosine Similarity Formula** | $1 - (distance / 2)$ | [rag.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/rag.py) / [audit.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/audit.py) | Translates ChromaDB's default cosine distance (`[0,2]`) to similarity (`[0,1]`). |
| `CLUSTER_THRESHOLD` | `0.80` | [emerging.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/emerging.py) | Minimum similarity score required to group unanswered questions into a cluster. |
| `CLUSTER_MIN_SIZE` | `3` | [emerging.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/emerging.py) | Minimum size of unanswered queries to trigger an Emerging Trend alert card. |
| `ROLLING_WINDOW_SECONDS`| `3600` | [emerging.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/emerging.py) | Rolling window (1 hour) for tracking unresolved student searches. |
| **Audit Similarity Band** | `[0.75, 0.88)` | [audit.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/audit.py) | Search range for contradiction candidate evaluation (overlapping but not exact duplicates). |

---

## 8. Pytest Test Suite Coverage details (`test_sentinel.py`)

The pytest suite in [test_sentinel.py](file:///c:/Users/chira/OneDrive/Desktop/SENTINEL/backend/test_sentinel.py) covers critical aspects of the self-healing and persistence layers:

1.  **`test_seed_idempotency`:** Confirms seeding populates database with 15 FAQs on clean run, but skips additions on restart.
2.  **`test_high_confidence_query`:** Asserts exact matching yields confidence score $\ge 0.75$.
3.  **`test_low_confidence_triggers_clarification`:** Verifies unfamiliar query scores $< 0.75$ and fires clarification questions.
4.  **`test_duplicate_detection_at_threshold`:** Asserts synthesized FAQ matching existing questions at $\ge 0.88$ triggers duplicate errors.
5.  **`test_similarity_formula_correctness`:** Asserts similarity conversion logic matches standard $1 - distance/2$ bounds.
6.  **`test_pending_synthesis_persists_across_restart`:** Asserts that query sessions written to `pending_synthesis.json` survive system interruptions.
7.  **`test_pending_synthesis_helpers`:** Verifies loading and saving utility functions.
8.  **`test_approval_queue_lifecycle`:** Exercises addition, listing, approval, and rejection lifecycles of supervisor queues.
9.  **`test_replay_log_roundtrip`:** Verifies that stringified pipeline execution metadata is saved and loaded from ChromaDB. Includes unit test isolation mock.
10. **`test_cluster_promotion`:** Adds queries to the unresolved log, clusters them, and checks promotion to supervisor queue.
11. **`test_find_candidate_pairs_respects_band`:** Checks that the contradiction engine only audits files matching the `[0.75, 0.88)` similarity limits.
12. **`test_audit_findings_persist`:** Checks JSON storage lifecycle for self-audit reports.
13. **`test_resolve_deletes_correct_entry`:** Verifies that resolving contradiction findings with `keep_a` deletes entry B from ChromaDB.

---

## 9. Known Issues & Operational Considerations

1.  **Database Seeding Version Mismatches:** If upgrading from an older format where answers were embedded as documents instead of questions, the backend server will search incorrectly. You must run:
    ```bash
    python migrate_db.py
    ```
    This script wipes the `sentinel_kb` collection in ChromaDB and seeds it using the new format.
2.  **Canonical Runtime Environment:** Python 3.11 (venv) is the single supported and tested runtime environment for this project. The system has been validated to run warning-free and execute all backend operations and WebSocket pipelines successfully under this configuration.
3.  **Demo Video asset:** Fill the placeholder `[ADD YOUR VIDEO URL]` inside `SUBMISSION.md` before final release.
