# SENTINEL — Submission Details

## One-line pitch
An AI support bot that autonomously fills its own knowledge gaps — 
no human intervention required.

## Problem solved
Traditional support bots answer from a fixed knowledge base. 
When they don't know something, they fail and escalate to humans. 
SENTINEL detects its own confidence level and fills gaps autonomously.

## The innovation
When cosine similarity score drops below 0.75 (knowledge gap detected):
1. Bot asks ONE targeted clarifying question
2. LLM synthesizes a clean FAQ entry from the answer
3. Entry is written permanently to ChromaDB vector database
4. Bot answers the user using the new entry
5. All future users asking the same thing get instant answers

Duplicate detection (threshold 0.88) prevents KB pollution.
The system gets smarter with every unanswered question — forever.

## Differentiators

### Self-Heal Timeline (Live Pipeline Visibility)
Every query flows through a visible pipeline: `searching_kb → confident_match / low_confidence → clarifying → synthesizing → duplicate_check → kb_write → streaming`. Each step lights up in a real-time **step-tracker** in the chat UI as it happens. Judges watch the self-healing loop execute live — this isn't invisible backend behavior, it's a first-class UI feature. Includes an interactive **Self-Heal Replay** playback feature for existing KB entries.

### Supervisor Mode (Admin Approval Before Permanent Write)
In production, you don't want unsupervised KB writes. SENTINEL includes a **supervisor approval queue** — synthesized FAQs go to a separate admin panel with approve/reject buttons. The student still gets their answer immediately; approval only gates the permanent KB write. Toggle with `REQUIRE_APPROVAL=true`.

### Emerging Issues Promotion
Low-confidence queries are tracked in a rolling window. When 3+ similar unanswered queries cluster together, SENTINEL surfaces an **emerging trend card**. The admin can click a button to auto-synthesize an FAQ entry from the cluster and queue it in the supervisor backlog for approval, clearing the queries from the tracker.

### Knowledge Base Self-Audit (Contradiction Resolution)
As an autonomous knowledge base grows, entries may accumulate contradictory advice. SENTINEL includes a **KB Self-Audit** engine. Admins can trigger a contradiction audit to identify overlapping entries (similarity range `[0.75, 0.95]` but below the duplicate threshold) and evaluate them via Groq. Conflict entries are presented side-by-side in the Admin Panel to keep one or dismiss the warning.

## Tech stack
- Groq API (llama-3.3-70b-versatile + llama-3.1-8b-instant) — free
- ChromaDB — local persistent vector database
- sentence-transformers (all-MiniLM-L6-v2) — local embeddings
- FastAPI + WebSocket — async streaming backend
- React + Vite — dual-panel frontend

## Evaluation criteria alignment
- Innovation (30%): Autonomous KB synthesis loop is novel. Self-heal timeline 
  makes the innovation *visible* to judges in real-time. No existing bot writes 
  back to its own knowledge base with live pipeline visualization.
- Real-World (25%): Supervisor mode makes this deployable, not just a demo toy.
  Any EdTech/SaaS company can deploy this. Reduces support ticket volume as KB 
  grows organically.
- Technical (25%): LangChain-free clean architecture. Pinned dependencies, 
  pytest test suite, ruff + eslint linting, API auth, CORS from env. 
  Async/sync boundary handled correctly with run_in_executor.
- Documentation (20%): Architecture diagram, benchmark table, configuration 
  reference, demo script, setup in under 5 minutes.

## Benchmark results
| Metric | Result |
|--------|--------|
| KB hit rate (seeded) | 60% |
| Synthesis success rate | 100% |
| Post-synthesis accuracy | 100% |
| Duplicate prevention rate | 37% |
| Avg confidence (KB hits) | 0.81 |

## Links
- GitHub: https://github.com/debug-create/SENTINAL.git
- Demo video: [ADD YOUR VIDEO URL]
