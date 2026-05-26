import React, { useState, useCallback } from 'react';
import ChatPanel from './ChatPanel';
import KBPanel from './KBPanel';

function App() {
  const [newEntry, setNewEntry] = useState(null);
  const [kbRefreshTrigger, setKbRefreshTrigger] = useState(0);
  const [analytics, setAnalytics] = useState({
    totalQuestions: 0,
    fromKB: 0,
    synthesized: 0,
    avgConfidence: 0
  });

  const handleKBUpdate = useCallback((entry) => {
    setNewEntry(entry);
    setKbRefreshTrigger(prev => prev + 1);
  }, []);

  const handleConfidence = useCallback((score, mode) => {
    setAnalytics(prev => {
      const newTotal = prev.totalQuestions + 1;
      const newAvg = ((prev.avgConfidence * prev.totalQuestions) + score) / newTotal;
      return {
        totalQuestions: newTotal,
        fromKB: prev.fromKB + (mode === 'known' ? 1 : 0),
        synthesized: prev.synthesized + (mode === 'synthesized' ? 1 : 0),
        avgConfidence: newAvg
      };
    });
  }, []);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-brand">
          <div className="logo-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 2L2 8v12l12 6 12-6V8L14 2z" stroke="url(#logo-grad)" strokeWidth="2" fill="none"/>
              <circle cx="14" cy="14" r="4" fill="url(#logo-grad)"/>
              <defs>
                <linearGradient id="logo-grad" x1="2" y1="2" x2="26" y2="26">
                  <stop stopColor="#6366f1"/>
                  <stop offset="1" stopColor="#8b5cf6"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1>SENTINEL</h1>
          <span className="header-badge">AI Support</span>
        </div>
        <div className="header-status">
          <span className="status-dot"></span>
          <span className="status-text">Live</span>
        </div>
      </header>
      <div className="analytics-bar">
        <span className="stat">
          <label>Questions Asked</label>
          <value>{analytics.totalQuestions}</value>
        </span>
        <span className="stat-divider" />
        <span className="stat">
          <label>Answered from KB</label>
          <value style={{ color: analytics.fromKB > 0 ? 'var(--success)' : 'inherit' }}>{analytics.fromKB}</value>
        </span>
        <span className="stat-divider" />
        <span className="stat">
          <label>✦ Auto-Synthesized</label>
          <value style={{ color: analytics.synthesized > 0 ? 'var(--accent-primary)' : 'inherit' }}>{analytics.synthesized}</value>
        </span>
        <span className="stat-divider" />
        <span className="stat">
          <label>Avg Confidence</label>
          <value>{(analytics.avgConfidence * 100).toFixed(0)}%</value>
        </span>
      </div>
      <main className="app-main">
        <ChatPanel onKBUpdate={handleKBUpdate} onConfidence={handleConfidence} />
        <KBPanel newEntry={newEntry} refreshTrigger={kbRefreshTrigger} />
      </main>
    </div>
  );
}

export default App;
