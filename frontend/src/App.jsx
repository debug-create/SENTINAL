import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  pulseLive,
  BASE_HIDDEN, BASE_VISIBLE, CARD_HIDDEN, CARD_VISIBLE,
  CHIP_HIDDEN, CHIP_VISIBLE, REVEAL_EASE,
  BOOT_EXIT_OVERLAP, LIVE_DELAY, SETTINGS_DELAY,
  KPI_START_DELAY, KPI_STAGGER,
  PANELS_START_DELAY, PANEL_OFFSET,
} from './motionVariants';
import ChatPanel from './ChatPanel';
import KBPanel from './KBPanel';

import BootScreen from './BootScreen';
import AdminPanel from './AdminPanel';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_KEY = import.meta.env.VITE_API_KEY || '';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'white', background: 'red', zIndex: 999999, position: 'absolute', inset: 0 }}>
          <h2>Something went wrong.</h2>
          <pre>{this.state.error.toString()}</pre>
          <pre>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---- Ambient particles (Layer 3) ---- */
function useParticles(count = 15) {
  return useMemo(() => 
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 1.5,
      duration: 25 + Math.random() * 35, // extremely slow
      delay: Math.random() * 10,
      dx: (Math.random() - 0.5) * 20,
      dy: (Math.random() - 0.5) * 15,
    })),
    [count]
  );
}

/* ----------------------------------------------------------------
   useCountUp — animates a number from previous to target
   ---------------------------------------------------------------- */
function useCountUp(target, duration = 500, enabled = true) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
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
  }, [target, duration, enabled]);

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

  /* ---- Boot screen + reveal orchestration ---- */
  const [bootDone, setBootDone] = useState(false);
  const [revealPhase, setRevealPhase] = useState(0);

  const handleBootComplete = useCallback(() => {
    setBootDone(true);
  }, []);

  /* Start reveal slightly before boot finishes fading out */
  useEffect(() => {
    if (!bootDone) return;
    const t = setTimeout(() => setRevealPhase(1), BOOT_EXIT_OVERLAP);
    return () => clearTimeout(t);
  }, [bootDone]);

  const r = revealPhase >= 1; // shorthand: is reveal active?
  const particles = useParticles(18);


  /* ---- Backend health (poll every 5s) ---- */
  const [backendOnline, setBackendOnline] = useState(null);   // null = checking
  useEffect(() => {
    const checkHealth = () => {
      const headers = {};
      if (API_KEY) headers['X-API-Key'] = API_KEY;
      fetch(`${API_URL}/api/kb`, { headers, signal: AbortSignal.timeout(3000) })
        .then(res => { if (res.ok) setBackendOnline(true); else throw new Error(); })
        .catch(() => setBackendOnline(false));
    };
    checkHealth();
    const iv = setInterval(checkHealth, 5000);
    return () => clearInterval(iv);
  }, []);

  /* ---- Active right panel ---- */
  const [rightPanel, setRightPanel] = useState('kb'); // 'kb' | 'admin'

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

  // Pulse Auto-Synthesized KPI when synthesize happens
  const [pulseSynth, setPulseSynth] = useState(false);

  /* animated counters — delay start until KPI cards are visible */
  const [countersEnabled, setCountersEnabled] = useState(false);
  useEffect(() => {
    if (!r) return;
    const t = setTimeout(() => setCountersEnabled(true), KPI_START_DELAY + 4 * KPI_STAGGER + 300);
    return () => clearTimeout(t);
  }, [r]);

  const dQuestions   = useCountUp(analytics.questionsAsked, 800, countersEnabled);
  const dFromKB      = useCountUp(analytics.answeredFromKB, 800, countersEnabled);
  const dSynthesized = useCountUp(analytics.synthesized, 800, countersEnabled);
  const dConfPct     = useCountUp(analytics._scoreCount > 0 ? Math.round(analytics.avgConfidence * 100) : 0, 800, countersEnabled);

  /* ---- KB sync ---- */
  const [kbRefreshTrigger, setKbRefreshTrigger] = useState(0);
  const [newEntry, setNewEntry] = useState(null);
  const [learningStage, setLearningStage] = useState(null);
  const [showRealTransfer, setShowRealTransfer] = useState(false);

  const handleKBUpdate = useCallback((entry) => {
    setNewEntry(entry);
    setKbRefreshTrigger(prev => prev + 1);
    
    // Trigger real transfer animation and KPI
    setShowRealTransfer(true);
    setTimeout(() => setShowRealTransfer(false), 800);
    handleAnalytics({ type: 'synthesized' });
    setPulseSynth(true);
    setTimeout(() => setPulseSynth(false), 800);
  }, [handleAnalytics]);

  /* ---- Admin approval callback ---- */
  const handleEntryApproved = useCallback((data) => {
    // When admin approves, refresh KB
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
    <LayoutGroup>
      {/* Ambient particles (Layer 3) */}
      <div style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        opacity: theme === 'dark' ? 0.04 : 0, // only visible in dark theme
        zIndex: 0
      }}>
        {particles.map(p => (
          <motion.div
            key={p.id}
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.7)',
            }}
            animate={{
              x: [0, p.dx, 0],
              y: [0, p.dy, 0],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        ))}
      </div>

      {/* Ambient glow (Layer 4) */}
      <div className="ambient-glow" />

      {/* Boot screen */}
      <AnimatePresence>
        {!bootDone && (
          <BootScreen key="boot" onComplete={handleBootComplete} isAppReady={backendOnline !== null} />
        )}
      </AnimatePresence>

      <div className="app-shell" style={{ opacity: r ? 1 : 0, pointerEvents: r ? 'auto' : 'none', transition: 'opacity 0.6s ease' }}>
        {/* ========== HEADER ========== */}
        <header className="app-header">
          <div className="header-left">
            {/* Phase 1: Logo with continuous transition */}
            <motion.div layoutId="sentinel-logo-container" className="header-wordmark-container">
              <motion.span
                layoutId="sentinel-logo"
                className="header-wordmark"
              >
                SENTINEL
              </motion.span>
            </motion.div>

            {/* Phase 1: LIVE badge */}
            <motion.span
              className={`header-live ${backendOnline === false ? 'offline' : 'online'}`}
              title={backendOnline === false ? 'Backend offline' : 'System operational'}
              initial={CHIP_HIDDEN}
              animate={r ? { ...CHIP_VISIBLE, ...(r ? pulseLive.animate : {}) } : CHIP_HIDDEN}
              transition={r
                ? { delay: LIVE_DELAY / 1000, duration: 0.32, ease: REVEAL_EASE }
                : { duration: 0 }
              }
            >
              <span className="live-dot" />
              {backendOnline === false ? 'Offline' : 'Live'}
            </motion.span>
          </div>
          <div className="header-right">
            {/* Panel toggle */}
            <div className="panel-toggle-group">
              <button
                className={`panel-toggle-btn ${rightPanel === 'kb' ? 'active' : ''}`}
                onClick={() => setRightPanel('kb')}
                title="Knowledge Base"
              >
                KB
              </button>
              <button
                className={`panel-toggle-btn ${rightPanel === 'admin' ? 'active' : ''}`}
                onClick={() => setRightPanel('admin')}
                title="Supervisor Queue"
              >
                Admin
              </button>
            </div>
            {/* Phase 1: Settings icon */}
            <motion.button
              id="theme-toggle"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              initial={BASE_HIDDEN}
              animate={r ? BASE_VISIBLE : BASE_HIDDEN}
              transition={{ delay: r ? SETTINGS_DELAY / 1000 : 0, duration: 0.42, ease: REVEAL_EASE }}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </motion.button>
          </div>
        </header>

        {/* ========== ANALYTICS BAR (Phase 2) ========== */}
        <div className="analytics-bar">
          {[
            { cls: 'accent-indigo-card', val: dQuestions, label: 'Questions Asked', accentCls: '' },
            { cls: 'accent-green-card', val: dFromKB, label: 'Answered from KB', accentCls: dFromKB > 0 ? 'accent-green' : '' },
            { cls: 'accent-amber-card', val: dSynthesized, label: 'Auto-Synthesized', accentCls: dSynthesized > 0 ? 'accent-amber' : '' },
            { cls: 'accent-blue-card', val: null, label: 'Avg Confidence', accentCls: dConfPct > 0 ? 'accent-blue' : '' },
          ].map((card, i) => (
            <motion.div
              key={card.label}
              className={`stat-card ${card.cls} ${card.label === 'Auto-Synthesized' && pulseSynth ? 'pulse-kpi' : ''}`}
              initial={CARD_HIDDEN}
              animate={r ? CARD_VISIBLE : CARD_HIDDEN}
              transition={{
                delay: r ? KPI_START_DELAY / 1000 + (i * KPI_STAGGER) / 1000 : 0,
                duration: 0.45,
                ease: REVEAL_EASE,
              }}
              style={card.label === 'Auto-Synthesized' && pulseSynth ? { transform: 'scale(1.015)' } : {}}
            >
              <span className={`stat-value ${card.accentCls}`}>
                {card.val !== null
                  ? card.val
                  : analytics._scoreCount > 0 ? `${dConfPct}%` : '—'}
              </span>
              <span className="stat-label">{card.label}</span>
            </motion.div>
          ))}
        </div>



        {/* ========== MAIN PANELS (Phase 3) ========== */}
        <main className="app-main">
          {/* Left panel shell */}
          <motion.div
            style={{ flex: '1.2', display: 'flex', flexDirection: 'column', minWidth: 0 }}
            initial={BASE_HIDDEN}
            animate={r ? BASE_VISIBLE : BASE_HIDDEN}
            transition={{
              delay: r ? PANELS_START_DELAY / 1000 : 0,
              duration: 0.42,
              ease: REVEAL_EASE,
            }}
          >
            <ChatPanel
              onKBUpdate={handleKBUpdate}
              onAnalyticsUpdate={handleAnalytics}
              showToast={showToast}
              onLearningStage={setLearningStage}
              revealPhase={revealPhase}

            />
          </motion.div>

          <div className="panel-divider" />
          {/* Glow Trail */}
          <AnimatePresence>
            {showRealTransfer && (
              <motion.div
                key="glow"
                className="glow-trail"
                initial={{ opacity: 0, left: '30%', top: '45%' }}
                animate={{ 
                  opacity: [0, 1, 1, 0], 
                  left: ['30%', '50%', '75%'] 
                }}
                transition={{ duration: 0.5, ease: 'easeInOut' }}
              />
            )}
          </AnimatePresence>

          {/* Right panel shell */}
          <motion.div
            style={{ flex: '0.8', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}
            initial={BASE_HIDDEN}
            animate={r ? BASE_VISIBLE : BASE_HIDDEN}
            transition={{
              delay: r ? (PANELS_START_DELAY + PANEL_OFFSET) / 1000 : 0,
              duration: 0.42,
              ease: REVEAL_EASE,
            }}
          >
            {rightPanel === 'kb' ? (
              <KBPanel
                newEntry={newEntry}
                refreshTrigger={kbRefreshTrigger}
                revealPhase={revealPhase}

              />
            ) : (
              <AdminPanel
                onEntryApproved={handleEntryApproved}
              />
            )}
          </motion.div>
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
    </LayoutGroup>
  );
}

export default function AppWithErrorBoundary(props) {
  return (
    <ErrorBoundary>
      <App {...props} />
    </ErrorBoundary>
  );
}
