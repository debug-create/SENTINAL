import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import LearningRail from './LearningRail';
import BootScreen from './BootScreen';

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

  /* ---- Self-Heal Sequence Orchestration ---- */
  const [selfHeal, setSelfHeal] = useState({
    stage: 'idle',
    isActive: false,
    hasRun: false
  });

  useEffect(() => {
    // Only run once after reveal completes
    if (!r || selfHeal.hasRun) return;

    // Start sequence slightly after initial reveal settles (e.g. 400ms)
    const timers = [];
    const schedule = (delay, update) => timers.push(setTimeout(() => setSelfHeal(prev => ({ ...prev, ...update })), delay + 400));

    // t=0ms (relative to settle): show rail
    schedule(0, { isActive: true, hasRun: true });
    // t=150ms: activate Search
    schedule(150, { stage: 'search' });
    // t=450ms: activate Confidence
    schedule(450, { stage: 'confidence' });
    // t=850ms: activate Clarify
    schedule(850, { stage: 'clarify' });
    // t=1200ms: start transfer (glow trail)
    schedule(1200, { stage: 'transfer' });
    // t=1600ms: synthesize active
    schedule(1600, { stage: 'synthesize' });
    // t=2050ms: store active
    schedule(2050, { stage: 'store' });
    // t=2400ms: cleanup
    schedule(2400, { isActive: false });
    // t=2800ms: done
    schedule(2800, { stage: 'done' });

    return () => timers.forEach(clearTimeout);
  }, [r, selfHeal.hasRun]);

  /* ---- Backend health (poll every 5s) ---- */
  const [backendOnline, setBackendOnline] = useState(null);   // null = checking
  useEffect(() => {
    const checkHealth = () => {
      fetch('http://localhost:8000/api/kb', { signal: AbortSignal.timeout(3000) })
        .then(res => { if (res.ok) setBackendOnline(true); else throw new Error(); })
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

  // Pulse Auto-Synthesized KPI when synthesize happens
  const [pulseSynth, setPulseSynth] = useState(false);
  useEffect(() => {
    if (selfHeal.stage === 'synthesize') {
      handleAnalytics({ type: 'synthesized' });
      setPulseSynth(true);
      const t = setTimeout(() => setPulseSynth(false), 800);
      return () => clearTimeout(t);
    }
  }, [selfHeal.stage, handleAnalytics]);

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
        <BootScreen onComplete={handleBootComplete} />
      )}

      <div className="app-shell">
        {/* ========== HEADER ========== */}
        <header className="app-header">
          <div className="header-left">
            {/* Phase 1: Logo — no delay */}
            <motion.span
              className="header-wordmark"
              initial={BASE_HIDDEN}
              animate={r ? BASE_VISIBLE : BASE_HIDDEN}
              transition={{ duration: 0.42, ease: REVEAL_EASE }}
            >
              SENTINEL
            </motion.span>

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

        {/* ========== LEARNING RAIL ========== */}
        <LearningRail 
          stage={selfHeal.isActive ? selfHeal.stage : (learningStage || 'idle')}
          isVisible={selfHeal.isActive || !!learningStage}
        />

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
              selfHealStage={selfHeal.stage}
              selfHealActive={selfHeal.isActive}
            />
          </motion.div>

          <div className="panel-divider" />

          {/* Glow Trail */}
          <AnimatePresence>
            {((selfHeal.stage === 'transfer' && selfHeal.isActive) || showRealTransfer) && (
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
            <KBPanel
              newEntry={newEntry}
              refreshTrigger={kbRefreshTrigger}
              revealPhase={revealPhase}
              selfHealStage={selfHeal.stage}
            />
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
    </>
  );
}

export default function AppWithErrorBoundary(props) {
  return (
    <ErrorBoundary>
      <App {...props} />
    </ErrorBoundary>
  );
}
