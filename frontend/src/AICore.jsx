import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ----------------------------------------------------------------
   AICore v2 — Knowledge Activation Subsystems
   ---------------------------------------------------------------- */

const polarToCartesian = (cx, cy, r, angleInDegrees) => {
  const angleInRadians = (angleInDegrees) * Math.PI / 180.0;
  return {
    x: cx + (r * Math.cos(angleInRadians)),
    y: cy + (r * Math.sin(angleInRadians))
  };
};

const describeArc = (x, y, radius, startAngle, endAngle) => {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [
    "M", start.x, start.y, 
    "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(" ");
};

const LABELS = [
  "KNOWLEDGE BASE", "VECTOR INDEX", "CONFIDENCE MODEL", 
  "SYNTHESIS ENGINE", "SELF-HEAL PIPELINE", "APPROVAL QUEUE"
];

export default function AICore({ phraseIndex }) {
  // Phrase mapping:
  // 0: KNOWLEDGE BASE (Base rings, Seg 0)
  // 1: VECTOR INDEX (Verification ring expands, Seg 1)
  // 2: CONFIDENCE MODEL (Rotating arc, Seg 2)
  // 3: SYNTHESIS ENGINE (Central core pulse, Seg 3)
  // 4: SELF-HEAL PIPELINE (Expanding diagnostic ring, Seg 4)
  // 5: APPROVAL QUEUE (Ready, Seg 5)

  const isReady = phraseIndex >= 5;
  const isVectorIndex = phraseIndex >= 1;
  const isConfidence = phraseIndex >= 2;
  const isSynthesis = phraseIndex >= 3;
  const isSelfHeal = phraseIndex === 4;

  const CX = 210;
  const CY = 210;
  const ARC_RADIUS = 150;
  const TEXT_RADIUS = 175;

  const segments = [];
  for (let i = 0; i < 6; i++) {
    const startAngle = -90 + i * 60 + 2; 
    const endAngle = -90 + (i + 1) * 60 - 2;
    const midAngle = -90 + i * 60 + 30;

    const textPos = polarToCartesian(CX, CY, TEXT_RADIUS, midAngle);
    let anchor = "middle";
    if (Math.abs(textPos.x - CX) < 5) anchor = "middle";
    else if (textPos.x > CX) anchor = "start";
    else anchor = "end";

    // Nudge text Y slightly for better alignment
    const textYAdjust = textPos.y > CY ? 4 : (textPos.y < CY ? -1 : 0);

    segments.push({ 
      id: i, 
      label: LABELS[i],
      d: describeArc(CX, CY, ARC_RADIUS, startAngle, endAngle),
      textX: textPos.x,
      textY: textPos.y + textYAdjust,
      anchor
    });
  }



  return (
    <div style={{ position: 'relative', width: '420px', height: '420px' }}>
      
      {/* 1. Ambient Background Glow */}
      <motion.div
        style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,87,255,0.12) 0%, transparent 60%)',
          pointerEvents: 'none'
        }}
        animate={{
          scale: isReady ? 1.3 : [1, 1.05, 1],
          opacity: isReady ? 0.7 : [0.4, 0.6, 0.4]
        }}
        transition={{
          duration: isReady ? 0.6 : 3,
          repeat: isReady ? 0 : Infinity,
          ease: "easeInOut"
        }}
      />

      <svg width="420" height="420" viewBox="0 0 420 420" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        
        {/* Rotating container for the rings */}
        <motion.g
          animate={{ rotate: isReady ? 0 : 360 }}
          transition={{ duration: 60, repeat: isReady ? 0 : Infinity, ease: 'linear' }}
          style={{ transformOrigin: 'center' }}
        >
          {/* Base Concentric Rings */}
          <circle cx={CX} cy={CY} r="170" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
          <circle cx={CX} cy={CY} r={ARC_RADIUS} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          <circle cx={CX} cy={CY} r="110" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="4 6" />
          <circle cx={CX} cy={CY} r="70" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        </motion.g>

        {/* Phase 1: Vector Index (Verification Ring Expands) */}
        <AnimatePresence>
          {isVectorIndex && (
            <motion.circle
              cx={CX} cy={CY} r="90"
              fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              style={{ transformOrigin: 'center' }}
            />
          )}
        </AnimatePresence>



        {/* Phase 3: Synthesis Engine (Central Core Pulse) */}
        <AnimatePresence>
          {isSynthesis && (
            <motion.circle
              cx={CX} cy={CY} r="40"
              fill="rgba(99,87,255,0.05)" stroke="rgba(99,87,255,0.3)" strokeWidth="1"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={isReady ? { scale: 1, opacity: 1 } : { scale: [1, 1.05, 1], opacity: [0.6, 1, 0.6] }}
              transition={isReady ? { duration: 0.5 } : { duration: 2, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformOrigin: 'center' }}
            />
          )}
        </AnimatePresence>

        {/* Phase 4: Self-Heal Pipeline (Diagnostic Pulse Ring) */}
        <AnimatePresence>
          {isSelfHeal && (
            <motion.circle
              cx={CX} cy={CY} r="70"
              fill="none" stroke="rgba(99,87,255,0.8)" strokeWidth="1.5"
              initial={{ scale: 1, opacity: 1 }}
              animate={{ scale: 2.5, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              style={{ transformOrigin: 'center' }}
            />
          )}
        </AnimatePresence>

        {/* Segmented Progress Ring */}
        {segments.map((seg, i) => {
          const isActive = phraseIndex >= i;
          return (
            <g key={`seg-${i}`}>
              {/* Empty track */}
              <path d={seg.d} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3" />
              {/* Filled track */}
              <motion.path
                d={seg.d} fill="none" stroke="#6357FF" strokeWidth="3"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: isActive ? 1 : 0,
                  opacity: isActive ? (isReady ? 1 : 0.8) : 0,
                  stroke: isReady ? "#8B7FFF" : "#6357FF"
                }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                style={{ filter: isActive ? 'drop-shadow(0 0 6px rgba(99,87,255,0.4))' : 'none' }}
              />
              {/* Subsystem Label */}
              <motion.text
                x={seg.textX}
                y={seg.textY}
                textAnchor={seg.anchor}
                fill={isActive ? (isReady ? "#F0F2F8" : "#8B7FFF") : "#525B6E"}
                fontFamily="var(--font-mono)"
                fontSize="9px"
                fontWeight={isActive ? "600" : "400"}
                letterSpacing="0.1em"
                initial={{ opacity: 0 }}
                animate={{ opacity: isActive ? 1 : 0.4 }}
                transition={{ duration: 0.5 }}
                style={{ filter: isActive ? 'drop-shadow(0 0 4px rgba(99,87,255,0.3))' : 'none' }}
              >
                {seg.label}
              </motion.text>
            </g>
          );
        })}

      </svg>
    </div>
  );
}
