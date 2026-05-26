import React, { useState, useEffect, useRef } from 'react';

const EntryCard = ({ entry, isNew }) => {
  const [expanded, setExpanded] = React.useState(false);
  const isLong = entry.answer && entry.answer.length > 80;
  
  return (
    <div className={`entry-card ${isNew ? "entry-new" : ""}`}>
      <p className="entry-question">{entry.question}</p>
      <p className={`entry-answer ${!expanded && isLong ? "truncated" : ""}`}>
        {entry.answer}
      </p>
      {isLong && (
        <button 
          className="expand-btn"
          onClick={() => setExpanded(prev => !prev)}
        >
          {expanded ? "Show less ▲" : "Show more ▼"}
        </button>
      )}
      <div className="entry-footer">
        <span className="category-chip">{entry.category}</span>
        <span className={`source-badge ${entry.source}`}>
          {entry.source === "synthesized" ? "✦ Auto-Synthesized" : "Seeded"}
        </span>
      </div>
    </div>
  );
};

function KBPanel({ newEntry, refreshTrigger }) {
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState('');
  const [highlightId, setHighlightId] = useState(null);
  const [loading, setLoading] = useState(true);
  const highlightTimeoutRef = useRef(null);

  useEffect(() => {
    const fetchKB = () => {
      fetch("http://localhost:8000/knowledge-base")
        .then(res => {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(data => {
          console.log("KB data received:", data);
          // Handle both {entries: [...]} and direct array [...] 
          const entries = Array.isArray(data) ? data : 
                          (data.entries || data.data || []);
          setEntries(entries);
          setLoading(false);
        })
        .catch(err => {
          console.error("KB fetch error:", err);
          setLoading(false);
        });
    };
    
    fetchKB(); // fetch immediately on mount
    const interval = setInterval(fetchKB, 5000); // poll every 5s
    return () => clearInterval(interval);
  }, []);

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
