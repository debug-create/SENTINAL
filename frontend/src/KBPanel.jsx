import React, { useState, useEffect, useRef } from 'react';

/* ----------------------------------------------------------------
   EntryCard — single KB entry with expand/collapse
   ---------------------------------------------------------------- */
function EntryCard({ entry, isNew }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = entry.answer && entry.answer.length > 120;

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
      <div className="kb-card-footer">
        <span className={`source-tag ${entry.source}`}>
          {entry.source === 'synthesized' ? 'SYNTH' : 'SEED'}
        </span>
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
function KBPanel({ newEntry, refreshTrigger }) {
  const [entries, setEntries]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('');
  const [highlightId, setHighlightId] = useState(null);
  const highlightTimerRef           = useRef(null);

  /* ---- Fetch entries on mount + poll every 5s ---- */
  useEffect(() => {
    let active = true;

    const fetchKB = () => {
      fetch('http://localhost:8000/knowledge-base')
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
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

  /* ---- Export ---- */
  const handleExport = () => {
    fetch('http://localhost:8000/knowledge-base')
      .then(r => r.json())
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
          <span className="kb-count-badge">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
          <button className="kb-download-btn" onClick={handleExport} title="Export KB as JSON" aria-label="Download knowledge base">
            ↓
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="kb-search">
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
      </div>

      {/* Entries */}
      <div className="kb-entries">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : filtered.length === 0 ? (
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
          filtered.map(entry => (
            <EntryCard
              key={entry.id}
              entry={entry}
              isNew={highlightId === entry.id}
            />
          ))
        )}
      </div>
    </aside>
  );
}

export default KBPanel;
