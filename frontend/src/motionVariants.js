/* ================================================================
   SENTINEL — Motion Variants & Timing Constants v3 (Premium Polish)
   Single easing curve · Semantic motion · Duration scale
   ================================================================ */

/* ---- Reveal easing (single curve for everything) ---- */
export const REVEAL_EASE = [0.16, 1, 0.3, 1];

/* ---- Duration scale (ms) — slowed slightly for premium feel ---- */
export const DURATION_INSTANT  = 0;
export const DURATION_FAST     = 200;
export const DURATION_BASE     = 350;
export const DURATION_REVEAL   = 500;
export const DURATION_ENTRANCE = 700;

/* ---- Stagger between siblings (ms) ---- */
export const STAGGER_SIBLINGS = 120;

/* ---- Dashboard reveal timing (ms) ---- */
export const BOOT_EXIT_OVERLAP  = 0;     // continuous transition, no gap
export const LIVE_DELAY         = 120;
export const SETTINGS_DELAY     = 180;
export const KPI_START_DELAY    = 220;
export const KPI_STAGGER        = 120;
export const PANELS_START_DELAY = 720;
export const PANEL_OFFSET       = 120;
export const STATUS_START_DELAY = 1150;
export const CONTENT_START_DELAY = 1380;
export const INPUT_START_DELAY  = 1920;

/* ---- Reveal state objects (no transition — caller provides it) ---- */
export const BASE_HIDDEN  = { opacity: 0, y: 12, filter: "blur(8px)" };
export const BASE_VISIBLE = { opacity: 1, y: 0,  filter: "blur(0px)" };

export const CARD_HIDDEN  = { opacity: 0, y: 14, scale: 0.985, filter: "blur(10px)" };
export const CARD_VISIBLE = { opacity: 1, y: 0,  scale: 1,     filter: "blur(0px)" };

export const CHIP_HIDDEN  = { opacity: 0, y: 8, scale: 0.96 };
export const CHIP_VISIBLE = { opacity: 1, y: 0, scale: 1 };

/* ---- Semantic motion variants ---- */

/* Search = directional movement (sweep right) */
export const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: DURATION_BASE / 1000, ease: REVEAL_EASE }
  }
};

/* Reveal = blur-in with stagger */
export const blurIn = {
  hidden: { opacity: 0, y: 18, filter: "blur(10px)" },
  visible: i => ({
    opacity: 1, y: 0, filter: "blur(0px)",
    transition: { duration: DURATION_REVEAL / 1000, delay: (i || 0) * (STAGGER_SIBLINGS / 1000), ease: REVEAL_EASE }
  })
};

/* Sequential reveal for lists */
export const cardStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER_SIBLINGS / 1000, delayChildren: 0.05 } }
};

/* Validation = pulse */
export const pulseLive = {
  animate: {
    scale: [1, 1.04, 1], opacity: [0.8, 1, 0.8],
    transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
  }
};

/* Stored = settle into place (adds a slight downward motion + scale) */
export const settle = {
  hidden: { opacity: 0, y: -10, scale: 1.02, filter: "blur(4px)" },
  visible: {
    opacity: 1, y: 0, scale: 1, filter: "blur(0px)",
    transition: { duration: DURATION_REVEAL / 1000, ease: REVEAL_EASE }
  }
};

/* Backward compatibility for kbReveal to use settle */
export const kbReveal = settle;

/* Search = directional slide */
export const slideInRight = {
  hidden: { opacity: 0, x: 16 },
  visible: {
    opacity: 1, x: 0,
    transition: { duration: DURATION_BASE / 1000, ease: REVEAL_EASE }
  }
};

/* Pipeline step flow — sequential reveal */
export const stepFlow = {
  hidden: { opacity: 0, scaleX: 0.96 },
  visible: i => ({
    opacity: 1, scaleX: 1,
    transition: { duration: 0.28, delay: (i || 0) * 0.18 }
  })
};

/* ---- Variant forms (backward compat) ---- */
export const baseReveal = {
  hidden: { opacity: 0, y: 12, filter: "blur(8px)" },
  visible: {
    opacity: 1, y: 0, filter: "blur(0px)",
    transition: { duration: DURATION_REVEAL / 1000, ease: REVEAL_EASE }
  }
};

export const cardReveal = {
  hidden: { opacity: 0, y: 14, scale: 0.985, filter: "blur(10px)" },
  visible: {
    opacity: 1, y: 0, scale: 1, filter: "blur(0px)",
    transition: { duration: DURATION_REVEAL / 1000, ease: REVEAL_EASE }
  }
};

export const chipReveal = {
  hidden: { opacity: 0, y: 8, scale: 0.96 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: DURATION_BASE / 1000, ease: REVEAL_EASE }
  }
};
