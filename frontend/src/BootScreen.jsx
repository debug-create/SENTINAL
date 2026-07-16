import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AICore from './AICore';

/* ----------------------------------------------------------------
   BootScreen v6 — Knowledge Activation
   ---------------------------------------------------------------- */

const PHRASES = [
  { header: 'INITIALIZING AI CORE', sub: 'Loading Knowledge Repository...' },
  { header: 'CONNECTING VECTOR INDEX', sub: 'Building Semantic Embeddings...' },
  { header: 'CALIBRATING CONFIDENCE MODEL', sub: 'Optimizing Retrieval Accuracy...' },
  { header: 'ACTIVATING SYNTHESIS ENGINE', sub: 'Preparing Generative Context...' },
  { header: 'ACTIVATING SELF-HEAL PIPELINE', sub: 'Establishing Continuous Learning...' },
  { header: 'MISSION READY', sub: 'Operational Intelligence Online' },
];

const PHRASE_ENTER   = 250;
const PHRASE_HOLD    = 650; // extended slightly for reading two lines
const PHRASE_EXIT    = 200;
const PHRASE_CYCLE   = PHRASE_ENTER + PHRASE_HOLD + PHRASE_EXIT; 
const HOLD_COMPLETE  = 500;
const TRANSITION_DUR = 1200;

const REVEAL_EASE = [0.16, 1, 0.3, 1];

function BootScreen({ onComplete, isAppReady = true }) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [phase, setPhase] = useState('running');
  const timerRef = useRef(null);

  useEffect(() => {
    if (phase !== 'running') return;

    const advance = () => {
      setPhraseIndex(prev => {
        const next = prev + 1;
        if (next >= PHRASES.length) {
          setTimeout(() => setPhase('holding'), PHRASE_HOLD);
          return prev;
        }
        return next;
      });
    };

    timerRef.current = setInterval(advance, PHRASE_CYCLE);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'holding') return;
    if (!isAppReady) return; // Wait for app initialization
    const t = setTimeout(() => setPhase('transitioning'), HOLD_COMPLETE);
    return () => clearTimeout(t);
  }, [phase, isAppReady]);

  useEffect(() => {
    if (phase !== 'transitioning') return;
    onComplete?.();
    const t = setTimeout(() => setPhase('done'), TRANSITION_DUR);
    return () => clearTimeout(t);
  }, [phase, onComplete]);

  if (phase === 'done') return null;

  const isTransitioning = phase === 'transitioning';
  const isFinal = phraseIndex === PHRASES.length - 1;

  const currentText = (phase === 'holding' && !isAppReady) 
    ? { header: 'MISSION READY', sub: 'Finalizing services...' } 
    : PHRASES[phraseIndex];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      overflow: 'hidden',
      pointerEvents: isTransitioning ? 'none' : 'auto',
    }}>
      
      {/* 1. Subtle Animated Engineering Grid */}
      <motion.div
        style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
        animate={{ backgroundPosition: ['0px 0px', '0px 40px'] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
      />

      {/* 2. Soft Light Sweep */}
      <motion.div
        style={{
          position: 'absolute', inset: -1000, zIndex: 0,
          background: 'linear-gradient(45deg, transparent 40%, rgba(99,87,255,0.015) 50%, transparent 60%)',
          backgroundSize: '200% 200%',
        }}
        animate={{ backgroundPosition: ['-50% -50%', '150% 150%'] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Main Content Container */}
      <motion.div
        style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: '4px', zIndex: 1
        }}
        animate={isTransitioning ? { opacity: 0, scale: 0.98 } : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        
        {/* Top: Wordmark */}
        <motion.div
          layoutId="sentinel-logo-container"
          style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <motion.span
            layoutId="sentinel-logo"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 'clamp(2rem, 5.5vw, 3.8rem)',
              fontWeight: 700,
              letterSpacing: '0.25em',
              color: '#F0F2F8',
              textTransform: 'uppercase',
              userSelect: 'none',
              whiteSpace: 'nowrap',
            }}
            initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.6, ease: REVEAL_EASE, delay: 0.1 }}
          >
            SENTINEL
          </motion.span>
        </motion.div>

        {/* Status Text (Two lines) */}
        <div style={{ height: '36px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={`text-${phraseIndex}-${phase === 'holding' && !isAppReady ? 'wait' : 'run'}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              initial={{ opacity: 0, y: 4, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={isFinal ? undefined : { opacity: 0, y: -4, filter: 'blur(3px)' }}
              transition={{
                duration: PHRASE_ENTER / 1000, ease: REVEAL_EASE,
                exit: { duration: PHRASE_EXIT / 1000 },
              }}
            >
              <span style={{
                fontFamily: "'Inter', sans-serif", fontSize: '10px', fontWeight: 600,
                letterSpacing: '0.2em', textTransform: 'uppercase', color: '#8B7FFF'
              }}>
                {currentText.header}
              </span>
              <span style={{
                fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 400,
                color: '#7B8BAD', marginTop: '2px'
              }}>
                {currentText.sub}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* The Operational Intelligence Core */}
        <div style={{ marginTop: '0px' }}>
          <AICore phraseIndex={phraseIndex} />
        </div>

      </motion.div>
    </div>
  );
}

export default BootScreen;
