import React, { useState, useEffect, useRef } from 'react';
import './KnowledgeRepoSection.css';
import { apiFetch } from '../services/api';

const TABS = ['Knowledge Base', 'FAQs', 'Knowledge Graph', 'Recent Learning', 'Replay'];

const CATEGORIES = [
  'Admissions', 'Enrollment', 'Payments', 'Certificates', 'Learning', 
  'Courses', 'Accounts', 'Technical Support', 'Policies', 'Student Services'
];

// Helper to deterministically generate mock metadata based on ID string
function generateMockMetadata(id, source) {
  const safeId = id || crypto.randomUUID();
  let hash = 0;
  for (let i = 0; i < safeId.length; i++) hash = safeId.charCodeAt(i) + ((hash << 5) - hash);
  
  const category = CATEGORIES[Math.abs(hash) % CATEGORIES.length];
  
  // Base confidence on source
  let confidence = source === 'seed' ? 1.0 : 0.75 + (Math.abs(hash) % 25) / 100;
  
  const statuses = ['Active', 'Active', 'Active', 'Review'];
  const status = statuses[Math.abs(hash) % statuses.length];
  
  return { category, confidence, status, created: '3 hrs ago', updated: '2 hrs ago' };
}

export default function KnowledgeRepoSection() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState('Knowledge Base');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  
  const [selectedEntry, setSelectedEntry] = useState(null);
  
  // New entry highlighting
  const [newEntryIds, setNewEntryIds] = useState(new Set());
  const previousEntriesRef = useRef([]);

  // Replay state
  const [replaying, setReplaying] = useState(false);
  const [replayLog, setReplayLog] = useState(null);
  const [replayStageIdx, setReplayStageIdx] = useState(-1);
  const replayTimerRef = useRef(null);

  // Polling backend
  useEffect(() => {
    let active = true;
    const fetchKB = async () => {
      try {
        const data = await apiFetch('/knowledge-base');
        if (!active) return;
        
        const list = Array.isArray(data) ? data : (data.entries || data.data || []);
        
        // Enrich with mock metadata
        const enriched = list.map(e => ({
          ...e,
          ...generateMockMetadata(e.id, e.source)
        }));
        
        // Detect new entries for amber glow animation
        if (previousEntriesRef.current.length > 0) {
          const oldIds = new Set(previousEntriesRef.current.map(e => e.id));
          const newlyAdded = enriched.filter(e => !oldIds.has(e.id)).map(e => e.id);
          if (newlyAdded.length > 0) {
            setNewEntryIds(prev => new Set([...prev, ...newlyAdded]));
            // Clear glow after 3 seconds
            setTimeout(() => {
              setNewEntryIds(prev => {
                const updated = new Set(prev);
                newlyAdded.forEach(id => updated.delete(id));
                return updated;
              });
            }, 3000);
          }
        }
        
        previousEntriesRef.current = enriched;
        setEntries(enriched);
        setLoading(false);
      } catch (err) {
        console.error('KB fetch error:', err);
        if (active) setLoading(false);
      }
    };

    fetchKB();
    const iv = setInterval(fetchKB, 5000);
    return () => { active = false; clearInterval(iv); };
  }, []);

  const handleReplay = async (id) => {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    
    // Dispatch event to WorkspaceSection
    window.dispatchEvent(new CustomEvent('sentinel:replay', { detail: entry }));
    
    // Close drawer
    setSelectedEntry(null);
  };

  // Close drawer
  const closeDrawer = () => {
    setSelectedEntry(null);
    if (replaying) {
      clearInterval(replayTimerRef.current);
      setReplaying(false);
      setReplayLog(null);
      setReplayStageIdx(-1);
    }
  };

  const filteredEntries = entries.filter(e => {
    // Basic tab filtering (Frontend-only toggle)
    const isFAQ = e.category === 'General' || e.confidence > 0.95;
    if (activeTab === 'FAQs' && !isFAQ) return false;
    if (activeTab === 'Knowledge Base' && isFAQ) return false; // Or show all in KB? Let's just separate them.
    
    const qStr = e.question || '';
    const aStr = e.answer || '';
    
    const matchesSearch = qStr.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          aStr.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'All' || e.category === filterCategory;
    
    return matchesSearch && matchesCategory;
  });

  return (
    <section className="section kb-explorer-section" id="knowledge">
      
      {/* Header & Tabs */}
      <div className="explorer-header">
        <h2 className="explorer-title">Data Explorer</h2>
        <div className="explorer-tabs">
          {TABS.map(tab => (
            <button 
              key={tab} 
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => { setActiveTab(tab); closeDrawer(); }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="explorer-layout">
        
        {/* Coming Soon placeholders */}
        {['Knowledge Graph', 'Recent Learning', 'Replay'].includes(activeTab) ? (
          <div className="coming-soon-state">
            <h3 className="font-mono text-muted" style={{ marginBottom: '0.5rem' }}>{activeTab}</h3>
            <p className="text-muted">
              {activeTab === 'Knowledge Graph' && 'Visualize how knowledge is connected across topics, concepts, and related answers.'}
              {activeTab === 'Replay' && 'Replay previous knowledge generation and approval workflows step by step.'}
              {activeTab === 'Recent Learning' && 'Explore the latest verified knowledge added to the repository and its learning history.'}
            </p>
            <div className="font-mono text-muted" style={{marginTop: '1rem'}}>[ Coming Soon ]</div>
          </div>
        ) : (
          <div className="explorer-main">
            
            {/* Sticky Controls */}
            <div className="sticky-controls">
              <div className="search-row">
                <div className="search-input-wrapper">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="search-icon">
                    <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <input 
                    type="text" 
                    placeholder="Search repository..." 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="search-input"
                  />
                </div>
                
                <div className="filter-dropdowns">
                  <select className="filter-select" defaultValue="All">
                    <option value="All">All Sources</option>
                    <option value="synthesized">Synthesized</option>
                    <option value="seed">Seed</option>
                  </select>
                </div>
              </div>

              <div className="tag-filter-row custom-scrollbar">
                <button 
                  className={`filter-tag ${filterCategory === 'All' ? 'active' : ''}`}
                  onClick={() => setFilterCategory('All')}
                >
                  All
                </button>
                {CATEGORIES.map(cat => (
                  <button 
                    key={cat}
                    className={`filter-tag ${filterCategory === cat ? 'active' : ''}`}
                    onClick={() => setFilterCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Cards Grid */}
            <div className="cards-container custom-scrollbar">
              {loading ? (
                <div className="loading-state font-mono text-muted">Fetching intelligence...</div>
              ) : filteredEntries.length === 0 ? (
                <div className="empty-state font-mono text-muted">No records found.</div>
              ) : (
                filteredEntries.map(entry => (
                  <div 
                    key={entry.id} 
                    className={`kb-compact-card ${selectedEntry?.id === entry.id ? 'selected' : ''} ${newEntryIds.has(entry.id) ? 'new-glow' : ''}`}
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <div className="card-top">
                      <h4 className="card-title">{entry.question}</h4>
                      <span className={`status-badge ${entry.status.toLowerCase()}`}>{entry.status}</span>
                    </div>
                    
                    <p className="card-preview text-muted">{entry.answer}</p>
                    
                    <div className="card-meta font-mono">
                      <span 
                        className="meta-tag" 
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); setFilterCategory(entry.category); }}
                      >
                        {entry.category}
                      </span>
                      <span className="meta-tag">{entry.source === 'synthesized' ? 'SYNTH' : 'SEED'}</span>
                      <span className="meta-tag" style={{ color: entry.confidence > 0.8 ? 'var(--success)' : 'var(--warning)'}}>
                        {(entry.confidence * 100).toFixed(0)}%
                      </span>
                      <span className="meta-time">Created: {entry.created}</span>
                      <span className="meta-time" style={{marginLeft: '0.5rem'}}>Updated: {entry.updated}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Right Drawer */}
        <div className={`details-drawer ${selectedEntry ? 'open' : ''}`}>
          {selectedEntry && (
            <div className="drawer-content custom-scrollbar">
              <div className="drawer-header">
                <h3>Record Details</h3>
                <button className="close-btn" onClick={closeDrawer}>✕</button>
              </div>
              
              <div className="drawer-body">
                <div className="drawer-section">
                  <div className="drawer-label font-mono">Query</div>
                  <h4 className="drawer-question">{selectedEntry.question}</h4>
                </div>

                <div className="drawer-section">
                  <div className="drawer-label font-mono">Synthesized Response</div>
                  <div className="drawer-answer">{selectedEntry.answer}</div>
                </div>

                <div className="drawer-grid">
                  <div className="dg-item">
                    <span className="dg-label font-mono">Confidence</span>
                    <span className="dg-val" style={{ color: selectedEntry.confidence > 0.8 ? 'var(--success)' : 'var(--warning)'}}>
                      {(selectedEntry.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="dg-item">
                    <span className="dg-label font-mono">Source</span>
                    <span className="dg-val">{selectedEntry.source}</span>
                  </div>
                  <div className="dg-item">
                    <span className="dg-label font-mono">Category</span>
                    <span className="dg-val">{selectedEntry.category}</span>
                  </div>
                  <div className="dg-item">
                    <span className="dg-label font-mono">Record ID</span>
                    <span className="dg-val text-muted" style={{fontSize: '0.65rem'}}>{selectedEntry.id}</span>
                  </div>
                </div>

                {selectedEntry.source === 'synthesized' && (
                  <div className="drawer-section">
                    <div className="drawer-label font-mono">Self-Heal Replay</div>
                    <button className="replay-trigger" onClick={() => handleReplay(selectedEntry.id)}>
                      {replaying ? 'Stop Replay ⏹' : 'Replay Intelligence Pipeline ▶'}
                    </button>
                    
                    {replayLog && (
                      <div className="replay-timeline">
                        {replayLog.map((logItem, idx) => (
                          <div key={idx} className={`rt-node ${idx <= replayStageIdx ? 'active' : ''} ${idx < replayStageIdx ? 'completed' : ''}`}>
                            <div className="rt-icon"></div>
                            <div className="rt-content font-mono">
                              <span className="rt-stage">{logItem.stage}</span>
                              {idx <= replayStageIdx && logItem.details && (
                                <span className="rt-details">{logItem.details}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
