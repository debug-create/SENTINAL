# SENTINEL — Codebase Context File
> **Last updated:** 2026-07-11 — Alignment Update
> **Purpose:** Read this FIRST before any work. Update after every significant change. This file serves as the definitive reference for LLMs and developers to understand the current state of the codebase.

---

## 1. Project Identity

| Key | Value |
|-----|-------|
| Name | SENTINEL — Self-Healing AI Support Chatbot |
| Author | Chirag |
| Hackathon | FlowZint AI Hackathon 2026 (Category: Support Chat Bot) |
| Deadline | 4th July 2026 |
| Portal | https://flowzint.in/2026/ai/hackothon/ |
| Repo | https://github.com/debug-create/SENTINAL.git |

---

## 2. Architecture Overview

```
User → React Chat UI (Vite, port 5173)
         → WebSocket ws://{VITE_WS_URL}/ws/{sessionId}
             → FastAPI (Python, port 8000)
                 ├── ChromaDB (PersistentClient, ./storage/chroma_db, cosine distance)
                 │     Collection: sentinel_kb
                 │     Embeddings: all-MiniLM-L6-v2 (local, ~90MB)
                 ├── Groq Cloud API
                 │     ├── llama-3.3-70b-versatile (synthesis, clarifying Qs, audits)
                 │     └── llama-3.1-8b-instant (streaming answers)
                 ├── Approval Queue (JSON file: storage/approval_queue.json, supervisor mode)
                 ├── Emerging Issues Tracker (JSON file: storage/emerging_queries.json, rolling window)
                 ├── Audit Findings (JSON file: storage/audit_findings.json, contradiction logs)
                 └── Pending Synthesis (JSON file: storage/pending_synthesis.json, active session queries)
```

### Self-Heal Pipeline (Visible in UI Step-Tracker & Replay)
The pipeline is a live workflow monitor with 6 fixed visual stages:
1. **Searching Knowledge Base** → Vector search in ChromaDB.
2. **Retrieving Documents** → Simulates doc retrieval (UX step).
3. **Validating Confidence** → Simulates confidence validation (UX step).
4. **Decision** → Branches based on score. High score skips to Response. Low score triggers clarification & synthesis.
5. **Response / Supervisor Approval** → If supervisor mode is enabled, it pauses in an amber `pending_approval` state. Otherwise, it streams the response.
6. **Knowledge Repository Update** → Writes synthesized FAQ to ChromaDB.

---

## 3. File Map

### Backend (`backend/`)

| File / Folder | Purpose |
|---------------|---------|
| `main.py` | FastAPI application. Sets up CORS, lifespan (seeding), verification dependencies (API keys/tokens), REST endpoints, and WebSocket message router (`/ws/{session_id}`). Manages active query session logs. |
| `rag.py` | ChromaDB vector store wrapper. Manages collection initialization, embedding loading, similarity searches, duplicate prevention checks, record upserts, entries retrieval, and deletes. |
| `synthesis.py` | Groq Cloud API integrations. Requests clarifying questions, synthesizes FAQs from queries/clarifications or clusters, and streams answers. |
| `config.py` | Core path configurations. Sets defaults for database directory (`./storage`) and persistence JSON paths. |
| `audit.py` | Contradiction self-audit logic. Finds overlapping entries (similarity `[0.75, 0.88)`), judges contradictions using LLM evaluation, and manages findings resolution. |
| `seed_data.py` | Standard collection of 15 seed FAQs. Idempotently initializes the knowledge base on start. |
| `approval_queue.py` | Manages file-backed queue storage for supervisor approval logs. |
| `emerging.py` | Tracks low-confidence student queries in a rolling 1-hour window. Performs greedy NumPy-based cosine clustering and manages cluster promotions. |
| `test_groq.py` | Diagnostic script. Exercises Groq streaming/non-streaming responses and verifies ChromaDB queries. |
| `test_sentinel.py` | Comprehensive Pytest suite covering all pipeline functionality, persistence layers, and audit features. |
| `requirements.txt` | Core backend dependencies pinned (`fastapi`, `uvicorn`, `groq`, `chromadb`, `sentence-transformers`, `pytest`, `httpx`). |
| `.env.example` | Template setting for backend environment configuration. |
| `storage/` *(Auto-created)* | Folder containing persistent local files (vector store and JSON files). |

### Frontend (`frontend-test/`)

| File / Folder | Purpose |
|---------------|---------|
| `src/App.jsx` | App shell, handles layout grid, theme switching, server health status. |
| `src/components/WorkspaceSection.jsx` | Split-pane workspace: Chat interface on the left, Live Activity feed on the right, and the Intelligence Pipeline monitor permanently anchored at the bottom. Handles WebSockets and active stage simulation. |
| `src/components/KnowledgeRepoSection.jsx` | Knowledge base dashboard, Supervisor Approval queue, Replay functionality, and export options. |
| `src/components/AdminConsoleSection.jsx` | Supervisor control interface, contradiction resolver, and system audits. |
| `src/components/HeroSection.jsx` | Landing page hero and header. |
| `src/components/FeaturesSection.jsx` | Landing page features showcase. |
| `src/index.css` | Complete design system styling sheet. Contains HSL color maps, pipeline animations, Node states, and glassmorphism templates. |
| `src/main.jsx` | Renders React root element. |
| `index.html` | HTML boilerplate including Google fonts (`DM Sans` and `Space Mono`). |
| `package.json` | Vite, React 18, and workspace build commands. |
| `vite.config.js` | Vite builder configurations (maps local server on port 5174). |

---

## 4. WebSocket Message Schema

### Backend → Frontend (JSON Format)

| Message Type | Fields | Description / Context |
|--------------|--------|-----------------------|
| `stage` | `stage: str` | Signals active self-heal step (e.g. `searching_kb`, `synthesizing`, etc.) |
| `confidence` | `score: float`, `mode: "known"\|"synthesized"` | Similarity score metric and answer origin |
| `token` | `content: str` | Streamed token segment of response answer |
| `done` | *(None)* | Signals complete stream closure |
| `clarifying_question` | `content: str` | Targeted clarifying question output from Groq |
| `kb_updated` | `entry: {id, question, answer, source}` | Live update of written entry (for instant UI prepending) |
| `kb_pending_approval` | `entry: {id, question, answer, source}` | Queued entry notification in supervisor mode |
| `kb_duplicate` | `content: str` | Error description payload indicating duplicate exists |
| `emerging_issue` | `id: str`, `cluster: list[str]`, `count: int`, `suggested_faq: str` | Surfaced cluster of similar unanswered queries |
| `error` | `content: str` | Pipeline execution error string message |

### Frontend → Backend (JSON Format)

| Message Type | Fields | Description / Context |
|--------------|--------|-----------------------|
| `user_msg` | `message: str` | Initial user query |
| `clarification` | `message: str` | Student response to clarifying question |

---

## 5. Environment Variables

### Backend Configuration (`backend/.env`)

| Variable | Default Value | Purpose |
|----------|---------------|---------|
| `GROQ_API_KEY` | *(Required)* | Key token used to request completions from Groq API models |
| `CORS_ORIGINS` | `http://localhost:5173` | Origins allowed to make HTTP/WS cross-site queries |
| `API_KEY` | *(Unset = No Auth)* | Shared secret guarding API endpoints and WebSocket channels |
| `ADMIN_TOKEN` | *(Unset = No Auth)* | Shared secret protecting supervisor queue and KB audit endpoints |
| `REQUIRE_APPROVAL` | `true` | When true, stops direct KB writes, sending new FAQs to supervisor queue |
| `PORT` | `8000` | Local port number FastAPI binds onto |
| `STORAGE_DIR` | `./storage` | Base folder path where database files and JSON state files are saved |
| `CHROMA_PATH` | `{STORAGE_DIR}/chroma_db` | Folder path housing ChromaDB files |
| `PENDING_FILE` | `{STORAGE_DIR}/pending_synthesis.json` | Path override for active query session files |
| `QUEUE_FILE` | `{STORAGE_DIR}/approval_queue.json` | Path override for queue data |
| `TRACKER_FILE` | `{STORAGE_DIR}/emerging_queries.json` | Path override for unresolved search tracking data |
| `FINDINGS_FILE` | `{STORAGE_DIR}/audit_findings.json` | Path override for stored contradiction reports |

### Frontend Configuration (`frontend/.env`)

| Variable | Default Value | Purpose |
|----------|---------------|---------|
| `VITE_API_KEY` | *(Unset)* | Key sent in headers/query params to communicate with secured backend |
| `VITE_ADMIN_TOKEN` | *(Unset)* | Token sent in headers to request modifications from admin endpoints |
| `VITE_WS_URL` | `ws://localhost:8000` | WebSocket backend URL connection point |
| `VITE_API_URL` | `http://localhost:8000` | REST API base target URL |

---

## 6. Thresholds & Algorithmic Parameters

| Setting | Value | Origin | Purpose / Formula |
|---------|-------|--------|-------------------|
| `CONFIDENCE_THRESHOLD` | `0.75` | `rag.py` | Below this score triggers the clarification flow |
| `DUPLICATE_THRESHOLD` | `0.88` | `rag.py` | Score above this blocks writing to avoid redundant entries |
| Cosine Similarity Formula | `1 - (distance / 2)` | `rag.py` / `audit.py` | ChromaDB return distance is `[0,2]` (cosine distance) |
| `CLUSTER_THRESHOLD` | `0.80` | `emerging.py` | Core threshold to group unanswered questions as a single issue |
| `CLUSTER_MIN_SIZE` | `3` | `emerging.py` | Minimum number of questions required to trigger trend card alert |
| `ROLLING_WINDOW_SECONDS`| `3600` | `emerging.py` | Window length (1 hour) for tracking emerging trends |
| Audit Similarity Band | `[0.75, 0.88)` | `audit.py` | Range of overlapping candidates evaluated for contradictions |

---

## 7. REST Endpoints Directory

| Method | Path | Authentication | Request / Response details | Purpose |
|--------|------|----------------|----------------------------|---------|
| **GET** | `/health` | None | Returns `{"status": "ok", "timestamp": float}` | Health check for render hosts |
| **GET** | `/api/kb` | `X-API-Key` | Returns `{"entries": list[dict], "count": int}` | Fetches detailed FAQ collection |
| **GET** | `/knowledge-base`| `X-API-Key` | Returns `list[dict]` (raw JSON array) | Simpler endpoint for client dashboard |
| **GET** | `/api/approval-queue`| `X-Admin-Token` | Returns `{"entries": list[dict], "count": int}` | Retrieves all pending supervisor entries |
| **POST**| `/api/approval-queue/{id}/approve` | `X-Admin-Token` | Returns `{"status": "approved", "kb_id": str, "question": str}` | Approves entry, writing it to ChromaDB |
| **POST**| `/api/approval-queue/{id}/reject` | `X-Admin-Token` | Returns `{"status": "rejected", "question": str}` | Discards entry from queue |
| **GET** | `/api/kb/{id}/replay` | `X-API-Key` | Returns `{"entry_id": str, "synthesis_log": list[dict]}` | Retrieves synthesis stage logs for replay |
| **GET** | `/api/emerging-issues`| `X-API-Key` | Returns `{"has_cluster": bool, "id": str, "cluster": list[str], "count": int, "suggested_faq": str}` | Pulls details on current emerging clusters |
| **POST**| `/api/emerging-issues/{id}/promote` | `X-Admin-Token` | Returns `{"status": "promoted", "queue_id": str, "question": str, "answer": str}` | Synthesizes cluster and adds it to approval queue |
| **POST**| `/api/kb/audit/run` | `X-Admin-Token` | Returns `{"findings": list[dict], "count": int}` | Manually triggers the KB overlap audit |
| **GET** | `/api/kb/audit/findings` | `X-Admin-Token` | Returns `{"findings": list[dict], "count": int}` | Fetches unresolved contradiction findings |
| **POST**| `/api/kb/audit/findings/{id}/resolve`| `X-Admin-Token` | Request: `{"action": "keep_a"\|"keep_b"\|"dismiss"}`. Returns status. | Resolves conflict, deleting from DB if chosen |
| **WS** | `/ws/{session_id}` | query `api_key` or header `x-api-key` | Handled asynchronously via WebSocket connection | Real-time chat pipeline interface |

---

## 8. Complete Pytest Suite Details (`test_sentinel.py`)

The pytest suite tests the entire backend core logic, storage lifecycle, and self-auditing parameters. It utilizes a fresh local ChromaDB collection in a temporary directory for each execution block.

* **`test_seed_idempotency`**: Verifies that the seeding algorithm populates the vector store with 15 standard FAQs on the first run, but gracefully skips addition on subsequent runs.
* **`test_high_confidence_query`**: Asserts that sending an exact question from the seeded dataset results in a confidence similarity score ≥ 0.75.
* **`test_low_confidence_triggers_clarification`**: Asserts that an unfamiliar query returns a score below 0.75, which correctly signals a knowledge gap.
* **`test_duplicate_detection_at_threshold`**: Confirms that duplicate queries with similar wording trigger duplication status warnings at a threshold level of 0.88.
* **`test_similarity_formula_correctness`**: Confirms that similarity score math relies on `1 - (distance / 2)` and that scores stay between `[0,1]`.
* **`test_pending_synthesis_persists_across_restart`**: Simulates a system crash/restart to ensure the contents of `pending_synthesis.json` survive reload.
* **`test_pending_synthesis_helpers`**: Exercises local helper load/save functions for pending synthesis states.
* **`test_approval_queue_lifecycle`**: Tests queue addition, queue queries, and approval or rejection status updates in `approval_queue.json`.
* **`test_replay_log_roundtrip`**: Verifies that the raw pipeline stage execution array (`synthesis_log`) stores correctly as stringified JSON metadata in ChromaDB.
* **`test_cluster_promotion`**: Seeds 3 similar unanswered queries in `emerging_queries.json`, clusters them, and tests promotion to the approval queue.
* **`test_find_candidate_pairs_respects_band`**: Verifies that contradiction search targets overlaps exclusively in the `[0.75, 0.88)` similarity band.
* **`test_audit_findings_persist`**: Exercises saving and reading unresolved contradiction findings to/from `audit_findings.json`.
* **`test_resolve_deletes_correct_entry`**: Confirms that resolving a conflict with `keep_a` effectively deletes entry B from ChromaDB, preserving academic consistency.

---

## 9. Known Issues & Operational Considerations

1. **Groq Client/Python 3.14 Compatibility Warning**: The Groq package (0.9.0) contains arguments that cause issues when generating class properties under Python 3.14. Under standard runtimes, it runs correctly but testing triggers import blocks unless the groq library is mocked (which `test_sentinel.py` successfully accomplishes via unittest mocks).
2. **Demo Video Link**: The pitch submission text contains the placeholder string `[ADD YOUR VIDEO URL]` under `SUBMISSION.md` which must be filled in with a demo video asset.
