import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ----------------------------------------------------------------
   BootScreen — full-viewport animated boot overlay
   Continuous progress bar with milestone-triggered status text.
   Designed to feel like a real system initialising.
   ---------------------------------------------------------------- */

/*
  Each milestone defines a progress % at which the status text changes,
  plus a "dwell" that makes the bar slow down around that point —
  simulating actual subsystem work.
*/
const MILESTONES = [
  { at: 0,   label: 'DETECTING KNOWLEDGE GAPS' },
  { at: 14,  label: 'INITIALIZING VECTOR SEARCH' },
  { at: 30,  label: 'PREPARING CLARIFICATION LOOP' },
  { at: 52,  label: 'SYNTHESIS ENGINE READY' },
  { at: 74,  label: 'KNOWLEDGE BASE ONLINE' },
  { at: 88,  label: 'LIVE SUPPORT READY' },
];

const TOTAL_DURATION = 7500;  // ms — approximate total bar fill time
const HOLD_COMPLETE  = 1200;  // ms — hold at 100% before fading out
const EXIT_DURATION  = 1.2;   // seconds — slow, premium overlay fade

/* ---- Speed curve ----
   Returns a speed multiplier (0–1 range) for a given progress %.
   Creates natural "bursts" and "stalls" — the bar speeds up between
   milestones and decelerates around them, like real system init.       */
function speedAt(p) {
  // Base speed — gentle sine wave gives organic cadence
  let speed = 0.55 + 0.45 * Math.sin(p * Math.PI * 0.018);

  // Slow down near each milestone to let the user read the text
  for (const m of MILESTONES) {
    const dist = Math.abs(p - m.at);
    if (dist < 6) {
      speed *= 0.3 + 0.7 * (dist / 6); // dip to 30% speed at milestone
    }
  }

  // Slow crawl for the last 5% — feels like final checks
  if (p > 95) {
    speed *= 0.4;
  }

  return Math.max(speed, 0.15);
}

/* ---- Inline styles using existing CSS variables ---- */

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#0a0a0f',
};

const wordmarkStyle = {
  fontFamily: "'Space Mono', monospace",
  fontSize: '2.4rem',
  fontWeight: 700,
  letterSpacing: '0.2em',
  color: '#f1f5f9',
  textTransform: 'uppercase',
  userSelect: 'none',
  position: 'relative',
  zIndex: 1,
};

const radialGlowStyle = {
  position: 'absolute',
  width: '400px',
  height: '400px',
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
  pointerEvents: 'none',
  zIndex: 0,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
};

const statusTextStyle = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '14px',
  fontWeight: 500,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
  marginTop: '32px',
  height: '20px',
};

const progressContainerStyle = {
  width: '280px',
  height: '1.5px',
  background: 'rgba(255, 255, 255, 0.06)',
  borderRadius: '999px',
  marginTop: '20px',
  overflow: 'hidden',
};

const progressFillStyle = {
  height: '100%',
  background: '#6366f1',
  boxShadow: '0 0 6px #6366f1',
  borderRadius: '999px',
};

/* ---- Component ---- */

function BootScreen({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState(MILESTONES[0].label);
  const [isFinal, setIsFinal] = useState(false);   // true once "LIVE SUPPORT READY" is shown
  const [exiting, setExiting] = useState(false);
  const [done, setDone] = useState(false);

  const progressRef = useRef(0);
  const lastMilestone = useRef(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);

  /* Continuous progress via requestAnimationFrame */
  useEffect(() => {
    if (done) return;

    const tick = (now) => {
      if (!startRef.current) startRef.current = now;

      const elapsed = now - startRef.current;
      const dt = 16; // normalise to ~60fps step

      // How much progress per frame at baseline speed
      const baseStep = (100 / TOTAL_DURATION) * dt;
      const speed = speedAt(progressRef.current);
      const step = baseStep * speed;

      progressRef.current = Math.min(progressRef.current + step, 100);
      setProgress(progressRef.current);

      // Check milestone crossings — advance label
      for (let i = MILESTONES.length - 1; i >= 0; i--) {
        if (progressRef.current >= MILESTONES[i].at && lastMilestone.current < i) {
          lastMilestone.current = i;
          setLabel(MILESTONES[i].label);

          // Pin final label
          if (i === MILESTONES.length - 1) {
            setIsFinal(true);
          }
          break;
        }
      }

      if (progressRef.current < 100) {
        rafRef.current = requestAnimationFrame(tick);
      }
      // When we hit 100 the raf stops; the hold timer below handles the rest
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [done]);

  /* Once progress reaches 100, hold then begin exit */
  useEffect(() => {
    if (progress < 100 || exiting || done) return;

    const holdTimer = setTimeout(() => setExiting(true), HOLD_COMPLETE);
    return () => clearTimeout(holdTimer);
  }, [progress, exiting, done]);

  /* After exit animation finishes, unmount & notify parent */
  useEffect(() => {
    if (!exiting) return;

    const exitTimer = setTimeout(() => {
      setDone(true);
      onComplete?.();
    }, EXIT_DURATION * 1000);

    return () => clearTimeout(exitTimer);
  }, [exiting, onComplete]);

  if (done) return null;

  return (
    <motion.div
      style={overlayStyle}
      animate={exiting ? { opacity: 0 } : { opacity: 1 }}
      transition={
        exiting
          ? { duration: EXIT_DURATION, ease: [0.4, 0, 0.2, 1] }
          : { duration: 0 }
      }
    >
      {/* Radial glow behind wordmark */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={radialGlowStyle} />
        <span style={wordmarkStyle}>SENTINEL</span>
      </div>

      {/* Status text — rotates until final, then pins */}
      <div style={statusTextStyle}>
        <AnimatePresence mode="wait">
          <motion.span
            key={label}
            initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={isFinal ? undefined : { opacity: 0, y: -6, filter: 'blur(3px)' }}
            transition={{
              duration: 0.3,
              ease: [0.16, 1, 0.3, 1],
              exit: { duration: 0.25 },
            }}
            style={{ display: 'inline-block' }}
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Progress bar — directly driven by state, no spring */}
      <div style={progressContainerStyle}>
        <motion.div
          style={{
            ...progressFillStyle,
            width: `${progress}%`,
          }}
          /* Use layout-independent transition for buttery smoothness */
          transition={{ duration: 0.08, ease: 'linear' }}
        />
      </div>
    </motion.div>
  );
}

export default BootScreen;
