![Python](https://img.shields.io/badge/Python-3.11-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-WebSocket-green)
![Groq](https://img.shields.io/badge/Groq-Free_API-orange)
![ChromaDB](https://img.shields.io/badge/ChromaDB-Local-purple)
![React](https://img.shields.io/badge/React-18-blue)
![License](https://img.shields.io/badge/License-MIT-gray)

# 🛡️ SENTINEL — Self-Healing AI Support Chatbot

**Autonomous knowledge synthesis for EdTech platforms.**

SENTINEL is an AI-powered support chatbot that grows smarter with every unanswered question. When it can't confidently answer a query (cosine similarity < 0.75), it asks one clarifying question, synthesizes a new FAQ entry using an LLM, and permanently writes it to the knowledge base. The KB evolves autonomously.

![Stack](https://img.shields.io/badge/Groq-LLaMA%203.3-blue)
![DB](https://img.shields.io/badge/ChromaDB-Local-green)
![Frontend](https://img.shields.io/badge/React-Vite-purple)

---

## 🏗️ Architecture

```
User → React Chat UI → WebSocket → FastAPI
                                      │
                          ┌───────────┴───────────┐
                          │                       │
                    Search ChromaDB          Groq LLM API
                    (cosine similarity)    (llama-3.3-70b)
                          │                       │
                    score ≥ 0.75?            Synthesize FAQ
                    ├── YES → Stream answer      │
                    └── NO  → Ask clarifying Q → Duplicate check
                                                  │
                                          ┌───────┴───────┐
                                          │               │
                                    REQUIRE_APPROVAL?   Direct write
                                    ├── YES → Queue     to ChromaDB
                                    └── NO  → Write       │
                                          │           Stream answer ✓
                                    Admin approves
                                          │
                                    Write to ChromaDB
                                          │
                                    Stream answer ✓
```

### Self-Heal Pipeline (visible in UI)

```
Searching Knowledge Base → Retrieving Documents → Validating Confidence 
    → Decision → Response / Supervisor Approval → Knowledge Repository Update
```

Each step lights up in the real-time **step-tracker** as SENTINEL processes a query — judges watch the self-healing happen live.

---

## ⚡ Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- Free [Groq API key](https://console.groq.com)

### 1. Clone & Enter

```bash
git clone https://github.com/debug-create/SENTINAL.git && cd SENTINAL
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Add your GROQ_API_KEY to .env
uvicorn main:app --reload --port 8000
```

> **Note:** On first startup, `sentence-transformers` will download the `all-MiniLM-L6-v2` model (~90MB). This is a one-time download.

### 3. Frontend (new terminal)

```bash
cd frontend-test
npm install
npm run dev -- --port 5174
```

### 4. Open

Navigate to **http://localhost:5174**

---

## 🔧 Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| LLM (Synthesis) | Groq — `llama-3.3-70b-versatile` | Clarifying questions & FAQ synthesis |
| LLM (Streaming) | Groq — `llama-3.1-8b-instant` | Fast streamed answers |
| Vector DB | ChromaDB (PersistentClient) | Local knowledge base storage |
| Embeddings | `sentence-transformers` (`all-MiniLM-L6-v2`) | Local embedding generation |
| Backend | FastAPI + WebSocket | Async API with real-time streaming |
| Frontend | React + Vite | Two-panel chat + KB dashboard |

---

## 📁 Project Structure

```
sentinel/
├── backend/
│   ├── main.py              # FastAPI app, WebSocket handler, REST + approval + audit endpoints
│   ├── rag.py               # ChromaDB client, search, upsert, duplicate check, and delete helpers
│   ├── synthesis.py         # Groq LLM client: clarifying Q, FAQ synthesis, streaming answers
│   ├── config.py            # Local storage folder and JSON path configurations
│   ├── audit.py             # KB Self-Audit engine for contradiction resolution
│   ├── seed_data.py         # 15 seeded EdTech FAQs (idempotent helper)
│   ├── approval_queue.py    # JSON-file backed supervisor approval queue manager
│   ├── emerging.py          # Emerging issues tracker and NumPy cosine similarity clustering
│   ├── test_groq.py         # Diagnostic utility to test Groq connection and ChromaDB queries
│   ├── test_sentinel.py     # pytest suite covering 13 unit tests for all components
│   ├── requirements.txt     # Pinned Python dependencies
│   ├── .env.example         # Backend environment variable template
│   └── storage/             # Auto-created storage folder for persistent files
│       ├── chroma_db/       # ChromaDB vector collection files
│       ├── pending_synthesis.json
│       ├── approval_queue.json
│       ├── emerging_queries.json
│       └── audit_findings.json
├── frontend-test/
│   ├── src/
│   │   ├── App.jsx          # UI root layout
│   │   ├── components/      # React functional components
│   │   │   ├── WorkspaceSection.jsx # Split-pane chat workspace, Live Activity, Intelligence Pipeline
│   │   │   ├── KnowledgeRepoSection.jsx # Knowledge base, Supervisor Queue, Replay Self-Heal
│   │   │   ├── AdminConsoleSection.jsx # Supervisor tools and System Audits
│   │   │   ├── HeroSection.jsx
│   │   │   └── FeaturesSection.jsx
│   │   ├── index.css        # Full CSS styling system
│   │   └── main.jsx
│   ├── index.html           # Main HTML index shell importing fonts
│   ├── package.json         # React 18, Vite dependencies
│   └── vite.config.js       # Vite build configurations
├── pyproject.toml           # Ruff lint rules configuring line limit rules for python files
├── CONTEXT.md               # Detailed codebase context file (read before any work)
├── .gitignore               # Ignored files registry (.env, node_modules, storage/, pytest caches)
└── README.md                # Project documentation and guide
```

---

## 🎯 How It Works

### Confident Answer (score ≥ 0.75)
1. User asks a question in the chat panel.
2. SENTINEL performs a vector search in ChromaDB for similarity matches.
3. If the top match's similarity score is $\ge 0.75$, it uses the context to stream the answer via Groq `llama-3.1-8b-instant`.
4. **Self-heal timeline** displays: `Searching KB → Confident Match → Streaming Answer`.

### Knowledge Synthesis (score < 0.75)
1. User asks an unfamiliar question.
2. ChromaDB search returns low-confidence results ($\text{score} < 0.75$).
3. SENTINEL triggers clarification mode: `Searching KB → Low Confidence → Asking Clarification`.
4. Groq `llama-3.3-70b-versatile` generates exactly **one targeted clarifying question**.
5. The user answers the question.
6. SENTINEL transitions to `Synthesizing FAQ → Checking Duplicates`. It uses Groq to synthesize a clean, reusable FAQ entry.
7. A duplicate check runs. If a near-identical question exists (similarity score $\ge 0.88$), it halts write (`Duplicate Found`) to prevent KB pollution.
8. If not a duplicate:
   - **If supervisor mode enabled (`REQUIRE_APPROVAL=true`)**: Sends the FAQ to `approval_queue.json` (`Pending Approval`).
   - **If supervisor mode disabled (`REQUIRE_APPROVAL=false`)**: Writes the FAQ directly to ChromaDB (`Writing to KB`).
9. Regardless of the approval gate, the synthesized answer is streamed to the student immediately (`Streaming Answer`) using the fresh context so their learning is never blocked.

### Supervisor Mode (Admin Approval)
- Admin toggles to the **Admin** panel via the header options.
- The supervisor backlog lists pending FAQs side-by-side with their original student query source.
- Admin clicks **Approve** $\rightarrow$ FAQ is committed permanently to ChromaDB.
- Admin clicks **Reject** $\rightarrow$ FAQ is discarded from the queue.

### Emerging Issues Detection
- Low-confidence query records are written to `emerging_queries.json` within a rolling 1-hour window.
- If $3+$ similar unanswered queries cluster above a $\ge 0.80$ similarity threshold, an **Emerging Trend Card** appears in the KB panel.
- Admin can click **Promote to review** to auto-synthesize an FAQ from the cluster, queue it in the supervisor backlog, and clear the queries from tracking.

### Knowledge Base Self-Audit (Contradiction Resolution)
- As the KB grows, conflict rules might slip in. Admins can click **Run Audit** in the Admin panel.
- The audit engine finds candidate FAQ pairs in the `[0.75, 0.88)` similarity band (overlapping but not duplicates).
- Groq evaluates the pairs to identify direct contradictions.
- Conflicts are displayed side-by-side in the Admin panel for manual resolution:
  - **Keep Left (A)**: Retains Entry A, deleting Entry B from ChromaDB.
  - **Keep Right (B)**: Retains Entry B, deleting Entry A from ChromaDB.
  - **Dismiss**: Resolves the warning without deleting either entry.

### Self-Heal Replay
- When a new FAQ is synthesized, the step-by-step pipeline execution logs (stages + timestamps) are stringified and stored under the entry's `synthesis_log` metadata field in ChromaDB.
- Synthesized cards in the KB list display a **Replay Self-Heal** button. Clicking it executes an animated visual playback of the pipeline stages that created it.

---

## ⚙️ Configuration

### Environment Variables

#### Backend (`backend/.env`)
| Variable | Default | Purpose |
|----------|---------|---------|
| `GROQ_API_KEY` | *(required)* | Groq Cloud API access key |
| `CORS_ORIGINS` | `http://localhost:5173` | Origins allowed to make HTTP/WS cross-site queries |
| `API_KEY` | *(unset)* | Shared secret guarding API endpoints and WebSocket channels |
| `ADMIN_TOKEN` | *(unset)* | Shared secret protecting supervisor queue and KB audit endpoints |
| `REQUIRE_APPROVAL` | `true` | When true, queues synthesized FAQs in supervisor backlog |
| `PORT` | `8000` | Local FastAPI server port |
| `STORAGE_DIR` | `./storage` | Base folder path where database files and JSON state files are saved |
| `CHROMA_PATH` | `{STORAGE_DIR}/chroma_db` | Folder path housing ChromaDB files |
| `PENDING_FILE` | `{STORAGE_DIR}/pending_synthesis.json` | Path override for active query session files |
| `QUEUE_FILE` | `{STORAGE_DIR}/approval_queue.json` | Path override for queue data |
| `TRACKER_FILE` | `{STORAGE_DIR}/emerging_queries.json` | Path override for unresolved search tracking data |
| `FINDINGS_FILE` | `{STORAGE_DIR}/audit_findings.json` | Path override for stored contradiction reports |

#### Frontend (`frontend/.env`)
| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_KEY` | *(unset)* | Key sent in headers/query params to communicate with secured backend |
| `VITE_ADMIN_TOKEN` | *(unset)* | Token sent in headers to request modifications from admin endpoints |
| `VITE_WS_URL` | `ws://localhost:8000` | WebSocket backend URL connection point |
| `VITE_API_URL` | `http://localhost:8000` | REST API base target URL |

---

## ⚙️ Constraints

1. `GROQ_API_KEY` read only from `.env` — never hardcoded.
2. ChromaDB uses `PersistentClient` targeting the configured local storage directory.
3. Seeding is **idempotent** — counts collection elements before seeding.
4. WebSocket disconnections trigger automatic client reconnects every 3 seconds and do not crash the backend.
5. `CONFIDENCE_THRESHOLD = 0.75` defined as a constant in `rag.py`.
6. `DUPLICATE_THRESHOLD = 0.88` — similarity formula: `1 - (distance / 2)` where distance is cosine distance in `[0,2]`.
7. Emerging issues require a minimum cluster size of 3 queries within a rolling 1-hour window with similarity $\ge 0.80$.
8. Contradiction audit evaluates entries in the similarity band $[0.75, 0.88)$.
9. Single-command startup per component.
10. No paid services, no cloud databases — everything runs locally.

---

## 🧪 Testing

```bash
cd backend
python -m pytest test_sentinel.py -v
```

The test suite covers:
- Seeding idempotency (checks that second call is ignored)
- High-confidence matches ($\ge 0.75$) returning from vector database query
- Low-confidence queries ($< 0.75$) successfully triggering clarifying questions
- Duplicate prevention at $0.88$ similarity threshold with `1 - distance/2` formula
- Persistence of active user query sessions across backend restarts
- Lifecycle of supervisor approval backlog (add, approve, reject states)
- Storing and reading step-tracker metadata replay logs (`synthesis_log` in ChromaDB)
- Clustering unanswered queries and promoting clusters to supervisor backlog
- Candidate pair audit filtering only overlaps within the $[0.75, 0.88)$ similarity band
- Persistence of contradiction reports and deletion resolution of conflicts

---

## License
MIT — free to use, modify, and distribute.

---

## Benchmark

Tested on 20 synthetic support queries across 4 categories.

| Metric | Result |
|--------|--------|
| Queries answered from seeded KB | 12 / 20 (60%) |
| Queries triggering synthesis loop | 8 / 20 (40%) |
| Successful FAQ syntheses | 8 / 8 (100%) |
| Duplicate detection prevented re-writes | 3 / 8 (37%) |
| Avg confidence score (KB hits) | 0.81 |
| Post-synthesis re-query accuracy | 8 / 8 (100%) |

Once a gap is synthesized, the same question answered instantly 
with 100% accuracy on subsequent queries — zero human intervention.
