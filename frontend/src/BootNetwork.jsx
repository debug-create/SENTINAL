import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ----------------------------------------------------------------
   BootNetwork — Animated SVG Neural Knowledge Graph
   ---------------------------------------------------------------- */

function generateNetwork(numNodes = 35) {
  const nodes = [];
  const lines = [];

  const clusters = [
    { cx: 30, cy: 30, count: 9 },
    { cx: 70, cy: 35, count: 10 },
    { cx: 35, cy: 75, count: 9 },
    { cx: 75, cy: 65, count: 7 },
  ];

  let id = 0;
  clusters.forEach(cluster => {
    for (let i = 0; i < cluster.count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 18;
      let x = cluster.cx + Math.cos(angle) * radius;
      let y = cluster.cy + Math.sin(angle) * radius * 1.5;

      x = Math.max(5, Math.min(95, x));
      y = Math.max(5, Math.min(95, y));

      const isHub = Math.random() > 0.85;
      const driftDx = (Math.random() - 0.5) * 4;
      const driftDy = (Math.random() - 0.5) * 4;
      const driftDur = 15 + Math.random() * 10;

      const distFromCenter = Math.hypot(x - 50, y - 50);
      const pulseDelay = distFromCenter * 0.02;

      nodes.push({ id: id++, x, y, isHub, driftDx, driftDy, driftDur, pulseDelay });
    }
  });

  nodes.forEach((n1, i) => {
    const distances = nodes
      .map((n2, j) => ({ j, dist: Math.hypot(n1.x - n2.x, n1.y - n2.y) }))
      .filter(d => d.j !== i);
    distances.sort((a, b) => a.dist - b.dist);

    const numConnections = Math.random() > 0.5 ? 2 : 1;
    for (let k = 0; k < numConnections; k++) {
      const n2 = nodes[distances[k].j];
      const exists = lines.find(l => (l.source === i && l.target === n2.id) || (l.source === n2.id && l.target === i));
      if (!exists && distances[k].dist < 28) {
        const midX = (n1.x + n2.x) / 2;
        const midY = (n1.y + n2.y) / 2;
        const distFromCenter = Math.hypot(midX - 50, midY - 50);
        const pulseDelay = distFromCenter * 0.02;

        lines.push({ id: `l-${i}-${n2.id}`, source: i, target: n2.id, pulseDelay });
      }
    }
  });

  return { nodes, lines };
}

export default function BootNetwork({ phraseIndex, isDone }) {
  const { nodes, lines } = useMemo(() => generateNetwork(), []);

  // 0: INITIALIZING AI CORE (hidden)
  // 1: LOADING KNOWLEDGE REPOSITORY (nodes appear)
  // 2: CONNECTING VECTOR ENGINE (lines appear)
  // 3: CALIBRATING CONFIDENCE MODEL (hubs grow)
  // 4: ACTIVATING SELF-HEAL PIPELINE (pulse)
  // 5: MISSION READY (stabilize)

  const showNodes = phraseIndex >= 1;
  const showLines = phraseIndex >= 2;
  const hubsActive = phraseIndex >= 3;
  const pulseActive = phraseIndex === 4;
  const isStabilized = phraseIndex >= 5;

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 0,
      pointerEvents: 'none',
      opacity: isDone ? 0 : 1,
      transition: 'opacity 1.5s ease'
    }}>
      <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
        {/* Draw lines first so they are under nodes */}
        {lines.map(line => {
          const n1 = nodes[line.source];
          const n2 = nodes[line.target];

          return (
            <motion.line
              key={line.id}
              x1={`${n1.x}%`} y1={`${n1.y}%`}
              x2={`${n2.x}%`} y2={`${n2.y}%`}
              stroke="rgba(123, 139, 173, 0.15)"
              strokeWidth="1"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: showLines ? 1 : 0,
                opacity: showLines ? 1 : 0,
                stroke: pulseActive
                  ? ['rgba(123, 139, 173, 0.15)', 'rgba(99, 87, 255, 0.8)', 'rgba(123, 139, 173, 0.25)']
                  : isStabilized ? 'rgba(123, 139, 173, 0.1)' : 'rgba(123, 139, 173, 0.15)'
              }}
              transition={{
                pathLength: { duration: 1.5, ease: "easeOut" },
                opacity: { duration: 1 },
                stroke: pulseActive
                  ? { duration: 0.8, delay: line.pulseDelay }
                  : { duration: 1 }
              }}
            />
          );
        })}

        {/* Draw nodes */}
        {nodes.map(node => {
          const isHub = node.isHub;
          const targetScale = hubsActive && isHub ? 2.5 : 1;

          return (
            <motion.circle
              key={node.id}
              cx={`${node.x}%`}
              cy={`${node.y}%`}
              r={1.5}
              fill="#F0F2F8"
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: showNodes ? (pulseActive ? 1 : (isStabilized ? 0.3 : 0.6)) : 0,
                scale: showNodes ? targetScale : 0,
                x: isStabilized ? 0 : [0, node.driftDx, 0],
                y: isStabilized ? 0 : [0, node.driftDy, 0],
                fill: pulseActive
                  ? ['#F0F2F8', '#8B7FFF', '#F0F2F8']
                  : (hubsActive && isHub ? '#8B7FFF' : '#F0F2F8')
              }}
              transition={{
                opacity: { duration: 1 },
                scale: { duration: 0.8, ease: "backOut" },
                x: { duration: node.driftDur, repeat: Infinity, ease: "easeInOut" },
                y: { duration: node.driftDur, repeat: Infinity, ease: "easeInOut" },
                fill: pulseActive
                  ? { duration: 0.6, delay: node.pulseDelay }
                  : { duration: 1 }
              }}
              style={{
                filter: (hubsActive && isHub) ? 'drop-shadow(0 0 4px rgba(99,87,255,0.6))' : 'none'
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}
