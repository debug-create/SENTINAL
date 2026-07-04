import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cardStagger, blurIn, pulseLive } from './motionVariants';
import ChatPanel from './ChatPanel';
import KBPanel from './KBPanel';
import LearningRail from './LearningRail';
import BootScreen from './BootScreen';

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
  const [bootDone, setBootDone] = useState(false);

  /* ---- Backend health (poll every 5s) ---- */
  const [backendOnline, setBackendOnline] = useState(null);   // null = checking
  useEffect(() => {
    const checkHealth = () => {
      fetch('http://localhost:8000/api/kb', { signal: AbortSignal.timeout(3000) })
        .then(r => { if (r.ok) setBackendOnline(true); else throw new Error(); })
        .catch(() => setBackendOnline(false));
    };
    checkHealth();
    const iv = setInterval(checkHealth, 5000);
    return () => clearInterval(iv);
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
  const [learningStage, setLearningStage] = useState(null);

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
      {!bootDone && (
        <BootScreen onComplete={() => setBootDone(true)} />
      )}

      <div className="app-shell">
        {/* ========== HEADER ========== */}
        <header className="app-header">
          <div className="header-left">
            <span className="header-wordmark">SENTINEL</span>
            <motion.span
              className={`header-live ${backendOnline === false ? 'offline' : 'online'}`}
              title={backendOnline === false ? 'Backend offline' : 'System operational'}
              {...pulseLive}
            >
              <span className="live-dot" />
              {backendOnline === false ? 'Offline' : 'Live'}
            </motion.span>
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
        <motion.div className="analytics-bar" variants={cardStagger} initial="hidden" animate="visible">
          <motion.div className="stat-card accent-indigo-card" variants={blurIn} custom={0}>
            <span className="stat-value">{dQuestions}</span>
            <span className="stat-label">Questions Asked</span>
          </motion.div>
          <motion.div className="stat-card accent-green-card" variants={blurIn} custom={1}>
            <span className={`stat-value ${dFromKB > 0 ? 'accent-green' : ''}`}>{dFromKB}</span>
            <span className="stat-label">Answered from KB</span>
          </motion.div>
          <motion.div className="stat-card accent-amber-card" variants={blurIn} custom={2}>
            <span className={`stat-value ${dSynthesized > 0 ? 'accent-amber' : ''}`}>{dSynthesized}</span>
            <span className="stat-label">Auto-Synthesized</span>
          </motion.div>
          <motion.div className="stat-card accent-blue-card" variants={blurIn} custom={3}>
            <span className={`stat-value ${dConfPct > 0 ? 'accent-blue' : ''}`}>
              {analytics._scoreCount > 0 ? `${dConfPct}%` : '—'}
            </span>
            <span className="stat-label">Avg Confidence</span>
          </motion.div>
        </motion.div>

        {/* ========== LEARNING RAIL ========== */}
        <LearningRail stage={learningStage} />

        {/* ========== MAIN PANELS ========== */}
        <main className="app-main">
          <ChatPanel
            onKBUpdate={handleKBUpdate}
            onAnalyticsUpdate={handleAnalytics}
            showToast={showToast}
            onLearningStage={setLearningStage}
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
