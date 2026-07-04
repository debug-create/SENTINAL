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
searching_kb → confident_match / low_confidence → clarifying
    → synthesizing → duplicate_check → kb_write / pending_approval → streaming
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
cd frontend
npm install
npm run dev
```

### 4. Open

Navigate to **http://localhost:5173**

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
│   ├── main.py              # FastAPI app, WebSocket handler, REST + approval endpoints
│   ├── rag.py               # ChromaDB init, search, upsert, duplicate detection
│   ├── synthesis.py         # Groq LLM: clarifying Q, FAQ synthesis, streaming
│   ├── seed_data.py         # 15 seeded EdTech FAQs (idempotent)
│   ├── approval_queue.py    # JSON-file backed supervisor approval queue
│   ├── emerging.py          # Emerging issues clustering (unanswered query tracking)
│   ├── test_sentinel.py     # pytest suite (seed, confidence, duplicates, persistence)
│   ├── requirements.txt     # Pinned dependencies
│   ├── .env.example         # Environment variable template
│   ├── data/                # Auto-created: pending_synthesis.json, approval_queue.json
│   └── chroma_db/           # Auto-created persistent vector store
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Two-panel layout, analytics, KB/Admin toggle
│   │   ├── ChatPanel.jsx    # WebSocket chat, streaming, self-heal step-tracker
│   │   ├── KBPanel.jsx      # Knowledge base dashboard, emerging trends
│   │   ├── AdminPanel.jsx   # Supervisor mode: approve/reject synthesized FAQs
│   │   └── index.css        # Full design system (dark/light, glassmorphism, animations)
│   ├── index.html
│   ├── package.json
│   ├── eslint.config.js     # ESLint flat config (React + hooks)
│   ├── vite.config.js
│   └── .env.example         # Frontend environment template
├── pyproject.toml           # Ruff linter config for backend
├── CONTEXT.md               # Codebase context file (read before any work)
├── .gitignore
└── README.md
```

---

## 🎯 How It Works

### Confident Answer (score ≥ 0.75)
1. User asks a question
2. SENTINEL searches ChromaDB for similar FAQ entries
3. If top result's cosine similarity ≥ 0.75, it streams an answer using the matched context
4. **Self-heal timeline** shows: `searching_kb → confident_match → streaming`

### Knowledge Synthesis (score < 0.75)
1. User asks an unfamiliar question
2. ChromaDB search returns low-confidence results
3. SENTINEL asks **one clarifying question** via `llama-3.3-70b-versatile`
4. User responds with clarification
5. SENTINEL synthesizes a new FAQ entry (question + answer) via LLM
6. Duplicate check at 0.88 threshold prevents KB pollution
7. **If supervisor mode enabled**: entry goes to approval queue for admin review
8. **If supervisor mode disabled**: entry is written directly to ChromaDB
9. KB dashboard updates in real-time with the new entry
10. SENTINEL streams an answer using the new knowledge

### Supervisor Mode
- Admin toggles to the **Admin** panel via the header toggle
- Pending entries show with approve/reject buttons
- Approve → entry is written to ChromaDB permanently
- Reject → entry is discarded
- **Student gets their answer immediately** regardless — approval only gates the permanent KB write

### Emerging Issues Detection
- Low-confidence queries are tracked in a rolling 1-hour window
- When 3+ similar unanswered queries cluster together, a **trend card** appears in the KB panel
- Helps admins proactively identify knowledge gaps before they become patterns

---

## ⚙️ Configuration

### Environment Variables

| Variable | File | Default | Purpose |
|----------|------|---------|---------|
| `GROQ_API_KEY` | `backend/.env` | *(required)* | Groq API key |
| `CORS_ORIGINS` | `backend/.env` | `http://localhost:5173` | Comma-separated allowed origins |
| `API_KEY` | `backend/.env` | *(unset = no auth)* | Shared-secret API authentication |
| `REQUIRE_APPROVAL` | `backend/.env` | `true` | Enable supervisor mode |
| `ADMIN_TOKEN` | `backend/.env` | *(unset = no auth)* | Admin panel authentication |
| `VITE_API_KEY` | `frontend/.env` | *(unset)* | API key sent on fetch/WS |
| `VITE_WS_URL` | `frontend/.env` | `ws://localhost:8000` | WebSocket server URL |
| `VITE_API_URL` | `frontend/.env` | `http://localhost:8000` | REST API server URL |

---

## ⚙️ Constraints

1. `GROQ_API_KEY` read only from `.env` — never hardcoded
2. ChromaDB uses `PersistentClient` — never in-memory
3. Seed function is **idempotent** — checks count before seeding
4. WebSocket disconnections do not crash the server
5. `CONFIDENCE_THRESHOLD = 0.75` defined as a constant in `rag.py`
6. `DUPLICATE_THRESHOLD = 0.88` — similarity formula: `1 - (distance / 2)`
7. All ChromaDB calls wrapped in `try/except`
8. Frontend WebSocket auto-reconnects every 3 seconds
9. `.env` listed in `.gitignore`
10. No paid services, no cloud databases — everything runs locally
11. Single-command startup per component

---

## 🧪 Testing

```bash
cd backend
python -m pytest test_sentinel.py -v
```

Covers:
- Seed idempotency
- High-confidence query hit (≥ 0.75)
- Low-confidence query → clarification trigger
- Duplicate detection at 0.88 threshold (correct similarity formula)
- Pending synthesis file persistence across restart
- Approval queue lifecycle

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
