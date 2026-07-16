![Python](https://img.shields.io/badge/Python-3.11-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-WebSocket-green)
![Groq](https://img.shields.io/badge/Groq-Free_API-orange)
![ChromaDB](https://img.shields.io/badge/ChromaDB-Local-purple)
![React](https://img.shields.io/badge/React-18-blue)
![License](https://img.shields.io/badge/License-MIT-gray)

# 🛡️ SENTINEL — Self-Healing AI Support Chatbot

**Autonomous knowledge synthesis for EdTech platforms.**

SENTINEL is an AI-powered support chatbot that grows smarter with every unanswered question. When it cannot confidently answer a student query (cosine similarity < 0.75), it asks one clarifying question, synthesizes a new FAQ entry using a Large Language Model (LLM), and permanently writes it to the local vector knowledge base. The knowledge base evolves autonomously to close documentation gaps over time.

---

## 🏗️ Architecture

```
User ⇄ React Chat UI (Vite) ⇄ WebSocket ⇄ FastAPI Server
                                              │
                            ┌─────────────────┴─────────────────┐
                            │                                   │
                      Search ChromaDB                     Groq LLM API
                     (Question Embedded)                 (llama-3.3-70b)
                            │                                   │
                      score ≥ 0.75?                       Synthesize FAQ
                      ├── YES → Stream answer                   │
                      └── NO  → Ask clarifying Q & reason ◄─────┤
                                   │                      Duplicate check
                                   ▼                            │
                              User Answers              ┌───────┴───────┐
                                   │                    │               │
                                   └───────────────► REQUIRE_APPROVAL?  │
                                                     ├── YES → Queue ───┼──► Admin approves
                                                     └── NO  → Write    │       │
                                                           │            │    Commit to DB
                                                           ▼            │       │
                                                     Write to ChromaDB ◄┼───────┘
                                                           │
                                                     Stream answer ✓
```

### Self-Heal Pipeline (Visible in UI)

```
searching_kb ➔ confident_match / low_confidence ➔ clarifying (with reason)
    ➔ synthesizing ➔ duplicate_check ➔ kb_write / pending_approval ➔ streaming
```

Each step lights up in the real-time **step-tracker** in the chat panel as SENTINEL processes a query — judges and developers can watch the self-healing loop execute live.

---

## ⚡ Quick Start

### Prerequisites

*   Python 3.10+
*   Node.js 18+
*   Free [Groq API key](https://console.groq.com)

### 1. Clone & Enter

```bash
git clone https://github.com/debug-create/SENTINAL.git && cd SENTINAL
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Edit .env and paste your GROQ_API_KEY
```

#### Database Initialization & Migration (CRITICAL)
SENTINEL embeds **questions** as ChromaDB documents to optimize question-to-question similarity matching. If you are starting for the first time or upgrading from an older schema layout, run the migration script:

```bash
python migrate_db.py
```
*(This deletes the old collection if present, creates a new cosine-distance-spaced collection, and idempotently seeds 15 standard EdTech FAQ entries).*

Then, start the server:
```bash
uvicorn main:app --reload --port 8000
```

> **Note:** On first startup, `sentence-transformers` will automatically download the local `all-MiniLM-L6-v2` model (~90MB).

### 3. Frontend Setup (New Terminal)

```bash
cd frontend
npm install
npm run dev
```

### 4. Open Application
Navigate to **[http://localhost:5173](http://localhost:5173)** in your browser.

---

## 🔧 Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **LLM (Synthesis)** | Groq — `llama-3.3-70b-versatile` | Clarification formatting, FAQ synthesis, and contradiction evaluation. |
| **LLM (Streaming)** | Groq — `llama-3.1-8b-instant` | Super fast streamed response answering. |
| **Vector DB** | ChromaDB (PersistentClient) | Local embedded vector database store. |
| **Embeddings** | `sentence-transformers` (`all-MiniLM-L6-v2`) | Local CPU/GPU-friendly sentence embeddings (runs completely offline). |
| **Backend** | FastAPI + WebSocket | Asynchronous WebSocket and REST service layer. |
| **Frontend** | React 18 + Vite | Split-screen dashboard (Chat Panel, KB Manager, Supervisor Admin). |

---

## 📁 Project Structure

```
sentinel/
├── backend/
│   ├── main.py              # FastAPI application setup, WebSocket endpoint, CORS, and REST routing.
│   ├── rag.py               # ChromaDB client connector, search query matching, entries management.
│   ├── synthesis.py         # Groq LLM completions handler (JSON clarification, FAQ synthesis).
│   ├── config.py            # Local storage environment configurations.
│   ├── audit.py             # KB Self-Audit engine evaluating contradiction findings.
│   ├── seed_data.py         # 15 seeded EdTech FAQs template file.
│   ├── approval_queue.py    # Backlog queue file manager for supervisor approvals.
│   ├── emerging.py          # Rolling 1-hour unanswered query aggregator and clustering.
│   ├── migrate_db.py        # Database migration script (resets and seeds the vector store).
│   ├── check_key.py         # Diagnostics script to test Groq API key connectivity.
│   ├── test_dist.py         # Cosine distance testing script.
│   ├── test_ws.py           # WebSocket integration testing client.
│   ├── test_ws_quick.py     # Simple WebSocket connectivity diagnostic tool.
│   ├── test_sentinel.py     # Comprehensive Pytest suite covering all pipeline endpoints.
│   ├── requirements.txt     # Pinned Python requirements.
│   ├── .env.example         # Backend environment variables configuration template.
│   └── storage/             # Auto-created persistence directory
│       ├── chroma_db/       # ChromaDB local index databases.
│       ├── pending_synthesis.json
│       ├── approval_queue.json
│       ├── emerging_queries.json
│       └── audit_findings.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Dashboard root grid, server diagnostics, and navigation layout.
│   │   ├── ChatPanel.jsx    # Chat interface with step trackers, chips, and live streaming.
│   │   ├── KBPanel.jsx      # KB dashboard, search filters, exports, trends, and Replay animation.
│   │   ├── AdminPanel.jsx   # Backlog approvals and contradiction resolution panel.
│   │   ├── StageTracker.jsx # Pipeline progress indicator element.
│   │   ├── BootScreen.jsx   # Animated system-boot initialization overlay.
│   │   ├── LearningRail.jsx # Real-time pipeline visual progression stepper.
│   │   ├── motionVariants.js# Framer-motion layout variables and timing offsets.
│   │   └── index.css        # Color variables, layout system, and responsive designs.
│   ├── index.html           # HTML container template.
│   ├── package.json         # Vite scripts and dependencies.
│   ├── eslint.config.js     # Code linter options.
│   ├── vite.config.js       # Vite server builder setup.
│   └── .env.example         # Frontend environment configurations template.
├── pyproject.toml           # Ruff lint config rules.
├── CONTEXT.md               # Definitive developer context file.
├── SUBMISSION.md            # Pitch notes, benchmarks, and submission criteria details.
└── README.md                # System documentation.
```

---

## 🎯 How It Works

### Confident Answer (Score $\ge$ 0.75)
1. User sends a query in the chat panel.
2. SENTINEL runs a similarity search in ChromaDB.
3. If similarity score $\ge 0.75$, it uses the matched FAQ context to stream the answer using Groq.
4. **Step-tracker** status updates: `Searching KB ➔ Confident Match ➔ Streaming Answer`.

### Knowledge Synthesis (Score $<$ 0.75)
1. User asks an unfamiliar query.
2. ChromaDB search returns similarity scores $< 0.75$.
3. SENTINEL registers the query in the emerging trends list and calls Groq `llama-3.3-70b-versatile`.
4. Groq generates:
    *   **Confidence Reasoning:** Explains why the closest database match fell short.
    *   **Clarifying Question:** Asks exactly ONE question to narrow down the query.
5. In the UI, the **Confidence Reasoning** appears above the question (marked with `💭`) to explain the bot's thought process.
6. The user submits their response to the clarifying question.
7. SENTINEL synthesizes a new FAQ question and answer.
8. It checks duplicates. If the new question matches an existing FAQ at $\ge 0.88$ similarity, it stops to avoid database pollution (`Duplicate Found`).
9. Otherwise, depending on `REQUIRE_APPROVAL` in `.env`:
    *   **Enabled:** Sends the FAQ to the supervisor queue (`Pending Approval`).
    *   **Disabled:** Writes it directly to ChromaDB (`Writing to KB`).
10. Regardless of the approval gate, the synthesized answer streams to the user immediately (`Streaming Answer`) using the fresh context, keeping their workflow unblocked.

### Supervisor Mode (Admin Approval)
*   Admin toggles to the **Admin** panel via the header.
*   Displays pending entries side-by-side with original query context.
*   Clicking **Approve** commits the FAQ to ChromaDB. Clicking **Reject** discards the suggestion.

### Emerging Issues Detection
*   Unanswered queries are logged in `emerging_queries.json` within a rolling 1-hour window.
*   If $3+$ similar unanswered queries cluster above $\ge 0.80$ similarity, an **Emerging Trend Card** alerts the admin in the KB panel.
*   The admin can promote the cluster, auto-synthesizing a single FAQ entry to resolve all clustered queries at once.

### Knowledge Base Self-Audit (Contradiction Engine)
*   Admins can click **Run Audit** in the Admin panel.
*   The engine finds FAQ pairs in the `[0.75, 0.88)` similarity band (overlapping but not exact duplicates) and queries Groq to check if they contain contradictory advice.
*   Contradictions are displayed side-by-side for manual resolution: Keep Left (A), Keep Right (B), or Dismiss the warning.

### Self-Heal Replay
*   Committed FAQs store a JSON string of their creation history (stages + timestamps) in ChromaDB.
*   Clicking **Replay Self-Heal** in the KB panel replays the step-by-step pipeline animation showing how the knowledge gap was identified and patched.

---

## ⚙️ Configuration

### Backend Config (`backend/.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `GROQ_API_KEY` | *(required)* | Groq API access token. |
| `API_KEY` | *(unset)* | Secures student-facing endpoints in production. |
| `ADMIN_TOKEN` | *(unset)* | Secures supervisor backlog, trend promotion, and audit APIs. |
| `REQUIRE_APPROVAL` | `true` | When true, routes new FAQs through the supervisor queue. |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed CORS request origins. |
| `PORT` | `8000` | Local FastAPI port. |
| `STORAGE_DIR` | `./storage` | Directory where database files and JSON backlog queues are saved. |

### Frontend Config (`frontend/.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_KEY` | *(unset)* | Client-side user API key. |
| `VITE_ADMIN_TOKEN` | *(unset)* | Client-side supervisor admin token. |
| `VITE_WS_URL` | `ws://localhost:8000` | Target WebSocket URL path. |
| `VITE_API_URL` | `http://localhost:8000` | Target HTTP API path. |

---

## 🧪 Testing

To run the Pytest suite (requires backend dependencies installed):

```bash
cd backend
python -m pytest test_sentinel.py -v
```

The test suite validates:
*   Idempotent collection seeding.
*   Confident matches ($\ge 0.75$) and low-confidence triggers ($< 0.75$).
*   Clarifying question triggers and duplicate protection ($\ge 0.88$).
*   Active query session persistence and supervisor approval flow cycles.
*   NumPy-based unanswered query clustering and trend promotion.
*   Overlap self-auditing inside `[0.75, 0.88)` similarity ranges and contradiction resolution.

---

## License
Licensed under the [MIT License](LICENSE).
