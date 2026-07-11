import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CHIP_HIDDEN, CHIP_VISIBLE, BASE_HIDDEN, BASE_VISIBLE,
  REVEAL_EASE, STATUS_START_DELAY,
} from './motionVariants';
import StageTracker from './StageTracker';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_KEY = import.meta.env.VITE_API_KEY || '';
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || '';

/* ---- Fetch helper with API key ---- */
function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (API_KEY) headers['X-API-Key'] = API_KEY;
  return fetch(`${API_URL}${path}`, { ...options, headers });
}

/* ----------------------------------------------------------------
   EntryCard — single KB entry with expand/collapse
   ---------------------------------------------------------------- */
function EntryCard({ entry, isNew }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = entry.answer && entry.answer.length > 120;

  const [showReplay, setShowReplay] = useState(false);
  const [replayStages, setReplayStages] = useState([]);
  const [log, setLog] = useState(null);
  const [replaying, setReplaying] = useState(false);
  const timerRef = useRef(null);

  const handleReplayClick = async () => {
    if (replaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      setReplaying(false);
      setReplayStages([]);
      setShowReplay(false);
      return;
    }

    setShowReplay(true);
    setReplayStages([]);

    let stagesToPlay = log;
    if (!stagesToPlay) {
      try {
        const res = await apiFetch(`/api/kb/${entry.id}/replay`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        stagesToPlay = data.synthesis_log;
        setLog(stagesToPlay);
      } catch (err) {
        console.error("Failed to fetch replay:", err);
        setShowReplay(false);
        return;
      }
    }

    if (stagesToPlay && stagesToPlay.length > 0) {
      setReplaying(true);
      let index = 0;

      const playNext = () => {
        if (index >= stagesToPlay.length) {
          setReplayStages(prev => prev.map(s => ({ ...s, status: 'done' })));
          setReplaying(false);
          if (timerRef.current) clearInterval(timerRef.current);
          return;
        }

        const nextStage = stagesToPlay[index].stage;
        setReplayStages(prev => {
          const updated = prev.map(s => ({ ...s, status: 'done' }));
          if (!updated.some(s => s.name === nextStage)) {
            updated.push({ name: nextStage, status: 'active' });
          }
          return updated;
        });

        index++;
      };

      playNext();
      timerRef.current = setInterval(playNext, 600);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const isSynthesized = entry.source === 'synthesized';

  return (
    <div className={`kb-card ${isNew ? 'entry-new' : ''}`}>
      <p className="kb-card-question">{entry.question}</p>
      <p className={`kb-card-answer ${!expanded && isLong ? 'clamped' : ''}`}>
        {entry.answer}
      </p>
      {isLong && (
        <button className="expand-toggle" onClick={() => setExpanded(prev => !prev)}>
          {expanded ? 'Show less ▲' : 'Show more ▼'}
        </button>
      )}

      {showReplay && (
        <div style={{ marginTop: '8px', padding: '6px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)' }}>
          <StageTracker stages={replayStages} />
        </div>
      )}

      <div className="kb-card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className={`source-tag ${entry.source}`}>
          {entry.source === 'synthesized' ? 'SYNTH' : 'SEED'}
        </span>
        {isSynthesized && (
          <button 
            className={`replay-btn-card ${replaying ? 'replaying' : ''}`}
            onClick={handleReplayClick}
            style={{
              padding: '2px 8px',
              fontSize: '0.62rem',
              fontFamily: 'var(--font-mono)',
              background: 'var(--bg-glass)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {replaying ? 'Stop Replay ✗' : 'Replay Self-Heal ↺'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   SkeletonCard — loading placeholder
   ---------------------------------------------------------------- */
function SkeletonCard() {
  return (
    <div className="kb-card skeleton">
      <div className="skel-line skel-q" />
      <div className="skel-line skel-a1" />
      <div className="skel-line skel-a2" />
      <div className="skel-line skel-badge" />
    </div>
  );
}

/* ================================================================
   KBPanel
   ================================================================ */
function KBPanel({ newEntry, refreshTrigger, revealPhase = 0, selfHealStage }) {
  const [entries, setEntries]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('');
  const [highlightId, setHighlightId] = useState(null);
  const highlightTimerRef           = useRef(null);
  const [emergingIssue, setEmergingIssue] = useState(null);
  const [promoting, setPromoting] = useState(false);

  const handlePromote = async () => {
    if (!emergingIssue) return;
    setPromoting(true);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (ADMIN_TOKEN) headers['X-Admin-Token'] = ADMIN_TOKEN;
      const res = await fetch(`${API_URL}/api/emerging-issues/${emergingIssue.id}/promote`, {
        method: 'POST',
        headers
      });
      if (res.ok) {
        setEmergingIssue(null);
      } else {
        console.error("Failed to promote cluster");
      }
    } catch (err) {
      console.error("Error promoting cluster:", err);
    } finally {
      setPromoting(false);
    }
  };

  const r = revealPhase >= 1;

  /* ---- Fetch entries on mount + poll every 5s ---- */
  useEffect(() => {
    let active = true;

    const fetchKB = () => {
      apiFetch('/knowledge-base')
        .then(res => { if (!res.ok) throw new Error(); return res.json(); })
        .then(data => {
          if (!active) return;
          const list = Array.isArray(data) ? data : (data.entries || data.data || []);
          setEntries(list);
          setLoading(false);
        })
        .catch(() => { if (active) setLoading(false); });
    };

    fetchKB();
    const iv = setInterval(fetchKB, 5000);
    return () => { active = false; clearInterval(iv); };
  }, []);

  /* ---- Poll emerging issues every 15s ---- */
  useEffect(() => {
    let active = true;

    const fetchEmerging = () => {
      apiFetch('/api/emerging-issues')
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(data => {
          if (!active) return;
          if (data.has_cluster) {
            setEmergingIssue(data);
          } else {
            setEmergingIssue(null);
          }
        })
        .catch(() => {});
    };

    fetchEmerging();
    const iv = setInterval(fetchEmerging, 15000);
    return () => { active = false; clearInterval(iv); };
  }, []);

  /* ---- When newEntry arrives, prepend + highlight for 4s ---- */
  useEffect(() => {
    if (!newEntry) return;

    setEntries(prev => {
      // avoid duplicates
      if (prev.some(e => e.id === newEntry.id)) return prev;
      return [newEntry, ...prev];
    });

    setHighlightId(newEntry.id);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightId(null), 4000);

    return () => { if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current); };
  }, [newEntry]);

  /* ---- Filter ---- */
  const filtered = entries.filter(e => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (e.question || '').toLowerCase().includes(q) || (e.answer || '').toLowerCase().includes(q);
  });

  /* ---- Self-Heal Injection ---- */
  const mockSynthEntry = {
    id: 'mock-synth-1',
    question: 'How do I contact instructors directly?',
    answer: 'Instructors can be reached through the platform messaging system or during scheduled live Q&A sessions. Direct emails are not provided to protect privacy.',
    source: 'synthesized',
  };

  const showMockEntry = selfHealStage && ['synthesize', 'store', 'done'].includes(selfHealStage);
  
  const displayEntries = showMockEntry 
    ? [mockSynthEntry, ...filtered.filter(e => e.id !== 'mock-synth-1')]
    : filtered;

  /* ---- Export ---- */
  const handleExport = () => {
    apiFetch('/knowledge-base')
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.entries || []);
        const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sentinel_knowledge_base.json';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => {});
  };

  /* ---- Render ---- */
  return (
    <aside className="kb-panel">
      {/* Header */}
      <div className="panel-header">
        <h2>Knowledge Base</h2>
        <div className="kb-header-actions">
          {/* Phase 4: KB count chip */}
          <motion.span
            className="kb-count-badge"
            initial={CHIP_HIDDEN}
            animate={r ? CHIP_VISIBLE : CHIP_HIDDEN}
            transition={{ delay: r ? (STATUS_START_DELAY + 80) / 1000 : 0, duration: 0.32, ease: REVEAL_EASE }}
          >
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </motion.span>
          <button className="kb-download-btn" onClick={handleExport} title="Export KB as JSON" aria-label="Download knowledge base">
            ↓
          </button>
        </div>
      </div>

      {/* Emerging Issue Trend Card */}
      {emergingIssue && (
        <div className="emerging-trend-card">
          <div className="emerging-header">
            <span className="emerging-icon">📊</span>
            <span className="emerging-title">Emerging Trend</span>
            <span className="emerging-count">{emergingIssue.count} queries</span>
          </div>
          <p className="emerging-suggestion">{emergingIssue.suggested_faq}</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '10px' }}>
            <div className="emerging-queries" style={{ flex: 1 }}>
              {emergingIssue.cluster.slice(0, 3).map((q, i) => (
                <span key={i} className="emerging-query-tag">"{q}"</span>
              ))}
            </div>
            <button
              className="approval-btn approve-btn"
              onClick={handlePromote}
              disabled={promoting}
              style={{
                padding: '4px 10px',
                fontSize: '0.65rem',
                width: 'auto',
                margin: 0,
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              {promoting ? 'Promoting...' : 'Promote to review ✓'}
            </button>
          </div>
        </div>
      )}

      {/* Phase 4: Search */}
      <motion.div
        className="kb-search"
        initial={BASE_HIDDEN}
        animate={r ? BASE_VISIBLE : BASE_HIDDEN}
        transition={{ delay: r ? (STATUS_START_DELAY + 160) / 1000 : 0, duration: 0.42, ease: REVEAL_EASE }}
      >
        <input
          id="kb-filter-input"
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Search entries…"
        />
        {filter && (
          <button className="kb-search-clear" onClick={() => setFilter('')} aria-label="Clear search">✕</button>
        )}
      </motion.div>

      {/* Entries */}
      <div className="kb-entries">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : displayEntries.length === 0 ? (
          <div className="kb-empty-state">
            <div className="empty-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2a7 7 0 017 7c0 2.5-1.5 4.5-3 6l-1 4H9l-1-4c-1.5-1.5-3-3.5-3-6a7 7 0 017-7z" />
                <path d="M9 19h6" />
                <path d="M10 22h4" />
              </svg>
            </div>
            <p>{filter ? 'No entries match your search.' : 'Knowledge base is empty. Start asking questions.'}</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {displayEntries.map(entry => (
              <motion.div
                key={entry.id}
                layout
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: REVEAL_EASE }}
              >
                <EntryCard
                  entry={entry}
                  isNew={highlightId === entry.id || (entry.id === 'mock-synth-1' && selfHealStage === 'synthesize')}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </aside>
  );
}

export default KBPanel;
