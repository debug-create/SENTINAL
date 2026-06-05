import React, { useState, useCallback, useEffect, useRef } from 'react';
import ChatPanel from './ChatPanel';
import KBPanel from './KBPanel';

/* ----------------------------------------------------------------
   useCountUp — animates a number from previous to target
   ---------------------------------------------------------------- */
function useCountUp(target, duration = 500) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const start = prevRef.current;
    const diff = target - start;
    if (diff === 0) return;

    const t0 = performance.now();
    let raf;

    const step = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);            // ease-out cubic
      setDisplay(Math.round(start + diff * eased));
      if (p < 1) { raf = requestAnimationFrame(step); }
      else       { prevRef.current = target; }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
}

/* ================================================================
   App
   ================================================================ */
function App() {
  /* ---- Theme ---- */
  const [theme, setTheme] = useState('dark');
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      return next;
    });
  }, []);

  /* ---- Boot screen ---- */
  const [showBoot, setShowBoot] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowBoot(false), 2500);
    return () => clearTimeout(t);
  }, []);

  /* ---- Backend health ---- */
  const [backendOnline, setBackendOnline] = useState(null);   // null = checking
  useEffect(() => {
    fetch('http://localhost:8000/api/kb')
      .then(r => { if (r.ok) setBackendOnline(true); else throw new Error(); })
      .catch(() => setBackendOnline(false));
  }, []);

  /* ---- Analytics ---- */
  const [analytics, setAnalytics] = useState({
    questionsAsked: 0,
    answeredFromKB: 0,
    synthesized: 0,
    avgConfidence: 0,
    _totalScore: 0,
    _scoreCount: 0,
  });

  const handleAnalytics = useCallback((action) => {
    setAnalytics(prev => {
      switch (action.type) {
        case 'question_asked':
          return { ...prev, questionsAsked: prev.questionsAsked + 1 };
        case 'answered_from_kb': {
          const ts = prev._totalScore + (action.score ?? 0);
          const sc = prev._scoreCount + 1;
          return { ...prev, answeredFromKB: prev.answeredFromKB + 1, avgConfidence: ts / sc, _totalScore: ts, _scoreCount: sc };
        }
        case 'synthesized': {
          const ts = prev._totalScore + 1.0;
          const sc = prev._scoreCount + 1;
          return { ...prev, synthesized: prev.synthesized + 1, avgConfidence: ts / sc, _totalScore: ts, _scoreCount: sc };
        }
        default: return prev;
      }
    });
  }, []);

  /* animated counters */
  const dQuestions   = useCountUp(analytics.questionsAsked);
  const dFromKB      = useCountUp(analytics.answeredFromKB);
  const dSynthesized = useCountUp(analytics.synthesized);
  const dConfPct     = useCountUp(analytics._scoreCount > 0 ? Math.round(analytics.avgConfidence * 100) : 0);

  /* ---- KB sync ---- */
  const [kbRefreshTrigger, setKbRefreshTrigger] = useState(0);
  const [newEntry, setNewEntry] = useState(null);

  const handleKBUpdate = useCallback((entry) => {
    setNewEntry(entry);
    setKbRefreshTrigger(prev => prev + 1);
  }, []);

  /* ---- Toast system ---- */
  const [toasts, setToasts] = useState([]);
  const showToast = useCallback((message, type = 'info') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const toastIcons = { success: '✓', warning: '⚠', error: '✗', info: 'ℹ' };

  /* ---- Render ---- */
  return (
    <>
      {/* Gradient mesh */}
      <div className="mesh-bg" />

      {/* Boot screen */}
      {showBoot && (
        <div className="boot-overlay">
          <span className="boot-wordmark">SENTINEL</span>
          <div className="boot-bar"><div className="boot-bar-fill" /></div>
        </div>
      )}

      <div className="app-shell">
        {/* ========== HEADER ========== */}
        <header className="app-header">
          <div className="header-left">
            <span className="header-wordmark">SENTINEL</span>
            <span
              className={`header-live ${backendOnline === false ? 'offline' : 'online'}`}
              title={backendOnline === false ? 'Backend offline' : 'System operational'}
            >
              <span className="live-dot" />
              {backendOnline === false ? 'Offline' : 'Live'}
            </span>
          </div>
          <div className="header-right">
            <button
              id="theme-toggle"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </div>
        </header>

        {/* ========== ANALYTICS BAR ========== */}
        <div className="analytics-bar">
          <div className="stat-card accent-indigo-card">
            <span className="stat-value">{dQuestions}</span>
            <span className="stat-label">Questions Asked</span>
          </div>
          <div className="stat-card accent-green-card">
            <span className={`stat-value ${dFromKB > 0 ? 'accent-green' : ''}`}>{dFromKB}</span>
            <span className="stat-label">Answered from KB</span>
          </div>
          <div className="stat-card accent-amber-card">
            <span className={`stat-value ${dSynthesized > 0 ? 'accent-amber' : ''}`}>{dSynthesized}</span>
            <span className="stat-label">Auto-Synthesized</span>
          </div>
          <div className="stat-card accent-blue-card">
            <span className={`stat-value ${dConfPct > 0 ? 'accent-blue' : ''}`}>
              {analytics._scoreCount > 0 ? `${dConfPct}%` : '—'}
            </span>
            <span className="stat-label">Avg Confidence</span>
          </div>
        </div>

        {/* ========== MAIN PANELS ========== */}
        <main className="app-main">
          <ChatPanel
            onKBUpdate={handleKBUpdate}
            onAnalyticsUpdate={handleAnalytics}
            showToast={showToast}
          />
          <div className="panel-divider" />
          <KBPanel
            newEntry={newEntry}
            refreshTrigger={kbRefreshTrigger}
          />
        </main>
      </div>

      {/* ========== GLOBAL TOAST CONTAINER ========== */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`toast-item toast-${t.type}`}>
              <span className="toast-icon">{toastIcons[t.type] || 'ℹ'}</span>
              {t.message}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default App;
