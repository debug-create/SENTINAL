# SENTINEL Demo Script (90 seconds)

## Setup (before recording)
- Backend running: uvicorn main:app --reload --port 8000
- Frontend running: npm run dev
- Open http://localhost:5173
- KB panel shows: Total 15, Seeded 15, Synthesized 0
- Analytics bar shows: 0/0/0/0%

## Recording Flow

**[0:00–0:15] High-confidence answer**
Click chip: "How do I download my certificate?"
Wait for thinking dots → stream → show pill "KB Match · 91%"
Point to: KB panel unchanged, Analytics: 1 asked / 1 from KB
Say: "Direct answer from knowledge base, 91% confidence."

**[0:15–0:45] Knowledge gap — synthesis triggered**
Click chip: "Can I get a certificate if I only finished 60%?"
Wait for thinking dots → clarifying question appears
Say: "SENTINEL doesn't know this — watch what happens."
Type answer: "Self-paced plan"
Watch: amber toast OR blue synthesized pill appears
KB panel: Total 16, Synthesized 1 — new card animates in
Analytics: Synthesized counter hits 1
Say: "It just wrote a new FAQ entry. Permanently."

**[0:45–1:05] Instant re-answer — proof of learning**
Type manually: "Can I get a certificate if I only finished 60%?"
Watch: answers immediately, "KB Match · 96%" pill
Say: "Same question. Now it knows. Zero human intervention."

**[1:05–1:20] Export proof**
Click Export button in KB panel
Open downloaded sentinel_knowledge_base.json
Scroll to last entry — show the synthesized entry
Say: "The knowledge base is persistent. It survives restarts."

**[1:20] Close**
Point to analytics bar: "X questions, X synthesized, avg confidence X%"
Say: "This is SENTINEL. It doesn't just answer. It learns."
