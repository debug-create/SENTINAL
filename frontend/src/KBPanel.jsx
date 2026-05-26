import React, { useState, useEffect, useRef } from 'react';

const API_URL = 'http://localhost:8000/api/kb';

function KBPanel({ newEntry, refreshTrigger }) {
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState('');
  const [highlightId, setHighlightId] = useState(null);
  const [loading, setLoading] = useState(true);
  const highlightTimeoutRef = useRef(null);

  useEffect(() => {
    fetchEntries();
  }, [refreshTrigger]);

  useEffect(() => {
    if (newEntry) {
      setHighlightId(newEntry.id);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => setHighlightId(null), 3000);
    }
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, [newEntry]);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const res = await fetch(API_URL);
      const data = await res.json();
      setEntries(data.entries || []);
    } catch (err) {
      console.error('Failed to fetch KB entries:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = entries.filter(e => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return e.question.toLowerCase().includes(q) || e.answer.toLowerCase().includes(q);
  });

  const seededCount = entries.filter(e => e.source === 'seeded').length;
  const synthCount = entries.filter(e => e.source === 'synthesized').length;

  const handleExport = () => {
    const data = JSON.stringify(entries, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sentinel_knowledge_base.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className="kb-panel">
      <div className="panel-header">
        <h2>Knowledge Base</h2>
        <span className="kb-count-badge">{entries.length}</span>
        <button className="export-btn" onClick={handleExport}>↓ Export</button>
      </div>
      <div className="kb-stats-bar">
        <span className="stat-chip">Total: {entries.length}</span>
        <span className="stat-chip">Seeded: {seededCount}</span>
        <span className={`stat-chip ${synthCount > 0 ? 'active' : 'muted'}`}>✦ Synthesized: {synthCount}</span>
      </div>
      <div className="kb-filter">
        <input
          id="kb-filter-input"
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter entries..."
        />
        {filter && (
          <button className="filter-clear" onClick={() => setFilter('')}>✕</button>
        )}
      </div>
      <div className="kb-entries">
        {loading ? (
          <div className="kb-loading">
            <div className="spinner"></div>
            <p>Loading knowledge base...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="kb-empty">
            <p>{filter ? 'No entries match your filter.' : 'Knowledge base is empty.'}</p>
          </div>
        ) : (
          filtered.map(entry => (
            <div
              key={entry.id}
              className={`kb-card ${entry.source} ${highlightId === entry.id ? 'highlight-new' : ''}`}
            >
              <div className="kb-card-header">
                <span className={`source-badge ${entry.source}`}>
                  {entry.source === 'seeded' ? '📚 Seeded' : '✨ Synthesized'}
                </span>
              </div>
              <h3 className="kb-card-question">{entry.question}</h3>
              <p className="kb-card-answer">{entry.answer}</p>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

export default KBPanel;
