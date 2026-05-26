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

## Tech stack
- Groq API (llama-3.3-70b-versatile + llama-3.1-8b-instant) — free
- ChromaDB — local persistent vector database
- sentence-transformers (all-MiniLM-L6-v2) — local embeddings
- FastAPI + WebSocket — async streaming backend
- React + Vite — dual-panel frontend

## Evaluation criteria alignment
- Innovation (30%): Autonomous KB synthesis loop is novel. 
  No existing bot writes back to its own knowledge base.
- Real-World (25%): Any EdTech/SaaS company can deploy this. 
  Reduces support ticket volume as KB grows organically.
- Technical (25%): LangChain-free clean architecture. 
  Async/sync boundary handled correctly with run_in_executor.
- Documentation (20%): Architecture diagram, benchmark table, 
  demo script, setup in under 5 minutes.

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
