# SENTINEL — Codebase Context File
> **Last updated:** 2026-07-04 — Post-implementation
> **Purpose:** Read this FIRST before any work. Update after every significant change.

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

## 2. Architecture Overview

```
User → React Chat UI (Vite, port 5173)
         → WebSocket ws://{VITE_WS_URL}/ws/{sessionId}
             → FastAPI (Python, port 8000)
                 ├── ChromaDB (PersistentClient, ./chroma_db, cosine distance)
                 │     Collection: sentinel_kb
                 │     Embeddings: all-MiniLM-L6-v2 (local, ~90MB)
                 ├── Groq Cloud API
                 │     ├── llama-3.3-70b-versatile (synthesis, clarifying Qs)
                 │     └── llama-3.1-8b-instant (streaming answers)
                 ├── Approval Queue (JSON file, supervisor mode)
                 └── Emerging Issues Tracker (JSON file, rolling window)
```

### Core Loop (with self-heal timeline)
1. `searching_kb` → User asks question → vector search ChromaDB
2. `confident_match` → **score ≥ 0.75** → `streaming` → stream answer
3. `low_confidence` → **score < 0.75** → track for emerging issues
4. `clarifying` → ask ONE clarifying question via LLM
5. User answers → `synthesizing` → LLM synthesizes FAQ
6. `duplicate_check` → check similarity ≥ 0.88
7. `kb_write` / `pending_approval` / `kb_duplicate` → write/queue/skip
8. `streaming` → Stream answer using new knowledge

## 3. File Map

### Backend (`backend/`)

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app, lifespan, CORS (env), API key auth, WS handler, stage messages, pending_synthesis persistence, supervisor mode endpoints, emerging issues endpoint, audit endpoints |
| `rag.py` | ChromaDB setup, `CONFIDENCE_THRESHOLD=0.75`, search/upsert/duplicate/get_all/delete_entry |
| `synthesis.py` | Groq client, clarifying Q, FAQ synthesis, stream answer |
| `audit.py` | Finding overlaps, calling Groq to evaluate contradictions, loading/saving audit findings |
| `seed_data.py` | 15 seed FAQs, `seed_if_empty()` — idempotent |
| `approval_queue.py` | JSON-file backed approval queue for supervisor mode |
| `emerging.py` | Unanswered query tracking + clustering for emerging issues |
| `test_sentinel.py` | pytest suite: seed, confidence, duplicates, persistence, approval queue, self-heal replay, emerging promotion, self-audit |
| `requirements.txt` | Pinned: fastapi==0.125.0, uvicorn==0.38.0, groq==0.9.0, chromadb==1.5.9, sentence-transformers==5.5.0, pytest==8.3.5, httpx==0.28.1 |
| `.env.example` | GROQ_API_KEY, CORS_ORIGINS, API_KEY, REQUIRE_APPROVAL, ADMIN_TOKEN |
| `data/` | Auto-created: pending_synthesis.json, approval_queue.json, emerging_queries.json, audit_findings.json |

### Frontend (`frontend/`)

| File | Purpose |
|------|---------|
| `src/App.jsx` | Root: theme, boot, health, analytics, KB/Admin toggle, toast system |
| `src/ChatPanel.jsx` | WebSocket chat, stage tracker, API key auth, all message types |
| `src/KBPanel.jsx` | KB viewer, search, export, emerging trends card |
| `src/AdminPanel.jsx` | Supervisor mode: approve/reject queue, admin token input |
| `src/index.css` | Full design system + stage tracker + admin panel + emerging trend CSS |
| `src/main.jsx` | React root render |
| `index.html` | HTML shell, Google Fonts, meta tags |
| `package.json` | React 18, Vite 6, ESLint + plugins, lint script |
| `eslint.config.js` | Flat config: react + react-hooks, react-in-jsx-scope: off |
| `vite.config.js` | Vite + React plugin, port 5173 |
| `.env.example` | VITE_API_KEY, VITE_WS_URL, VITE_API_URL |

### Root files

| File | Purpose |
|------|---------|
| `cursorrules` | Source of truth: schemas, thresholds, CSS vars, conventions (DO NOT TOUCH personal note) |
| `README.md` | Architecture, setup, stack, structure, config, testing, benchmarks |
| `SUBMISSION.md` | Judge-facing pitch with differentiators |
| `DEMO_SCRIPT.md` | 90-second demo flow |
| `CONTEXT.md` | This file |
| `pyproject.toml` | Ruff config: line-length 110, select E/F/W/I |
| `.gitignore` | Python/Node/IDE ignores, .env, chroma_db, backend/data/ |

## 4. WebSocket Message Schema

### Backend → Frontend
| Type | Fields | New? |
|------|--------|------|
| `stage` | `stage: str` | ✅ Self-heal timeline |
| `confidence` | `score: float`, `mode: "known"\|"synthesized"` | |
| `token` | `content: str` | |
| `done` | — | |
| `clarifying_question` | `content: str` | |
| `kb_updated` | `entry: {id, question, answer, source}` | |
| `kb_pending_approval` | `entry: {id, question, answer, source}` | ✅ Supervisor mode |
| `kb_duplicate` | `content: str` | |
| `emerging_issue` | `cluster: [...], count: int, suggested_faq: str` | ✅ Emerging issues |
| `error` | `content: str` | |

### Frontend → Backend
| Type | Fields |
|------|--------|
| `user_msg` | `message: str` |
| `clarification` | `message: str` |

## 5. Environment Variables

| Var | File | Default | Purpose |
|-----|------|---------|---------|
| `GROQ_API_KEY` | `backend/.env` | *(required)* | Groq API key |
| `CORS_ORIGINS` | `backend/.env` | `http://localhost:5173` | Comma-separated allowed origins |
| `API_KEY` | `backend/.env` | *(unset = no auth)* | Shared-secret API authentication |
| `REQUIRE_APPROVAL` | `backend/.env` | `true` | Enable supervisor mode |
| `ADMIN_TOKEN` | `backend/.env` | *(unset = no auth)* | Admin panel authentication |
| `VITE_API_KEY` | `frontend/.env` | *(unset)* | API key sent on fetch/WS |
| `VITE_WS_URL` | `frontend/.env` | `ws://localhost:8000` | WebSocket server URL |
| `VITE_API_URL` | `frontend/.env` | `http://localhost:8000` | REST API server URL |

## 6. Thresholds (source: rag.py)

| Constant | Value | Purpose |
|----------|-------|---------|
| `CONFIDENCE_THRESHOLD` | 0.75 | Below → clarification loop |
| `DUPLICATE_THRESHOLD` | 0.88 | Above → block KB write |
| Similarity formula | `1 - (distance / 2)` | ChromaDB cosine distance is [0,2] |

## 7. REST Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/kb` | API_KEY | Full KB as `{entries, count}` |
| GET | `/knowledge-base` | API_KEY | KB as JSON array |
| GET | `/api/approval-queue` | ADMIN_TOKEN | Pending approval entries |
| POST | `/api/approval-queue/{id}/approve` | ADMIN_TOKEN | Approve → upsert to KB |
| POST | `/api/approval-queue/{id}/reject` | ADMIN_TOKEN | Reject → discard |
| GET | `/api/emerging-issues` | API_KEY | Check for emerging clusters |
| POST | `/api/emerging-issues/{cluster_id}/promote` | ADMIN_TOKEN | Promote cluster → Synthesize FAQ & queue for approval |
| GET | `/api/kb/{entry_id}/replay` | API_KEY | Fetch decoded stage log for self-heal replay |
| POST | `/api/kb/audit/run` | ADMIN_TOKEN | Trigger manual contradiction self-audit |
| GET | `/api/kb/audit/findings` | ADMIN_TOKEN | Get list of unresolved contradiction findings |
| POST | `/api/kb/audit/findings/{finding_id}/resolve` | ADMIN_TOKEN | Resolve finding (`keep_a`, `keep_b`, `dismiss`) |
| WS | `/ws/{session_id}` | API_KEY (query param) | Real-time chat |

## 8. Known Issues (Post-implementation)

1. **Demo video placeholder** — SUBMISSION.md: `[ADD YOUR VIDEO URL]` — user must fill in
2. **Groq SDK incompatibility** — Python 3.14 + groq 0.9.0 has `proxies` kwarg issue — works at runtime but prevents `import main` in tests

---

> **Update this file after every significant change batch.**
