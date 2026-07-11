/* ================================================================
   SENTINEL — Motion Variants & Timing Constants
   ================================================================ */

/* ---- Dashboard reveal timing (ms) ---- */
export const BOOT_EXIT_OVERLAP  = 180;
export const LIVE_DELAY         = 120;
export const SETTINGS_DELAY     = 180;
export const KPI_START_DELAY    = 220;
export const KPI_STAGGER        = 90;
export const PANELS_START_DELAY = 720;
export const PANEL_OFFSET       = 90;
export const STATUS_START_DELAY = 1150;
export const CONTENT_START_DELAY = 1380;
export const INPUT_START_DELAY  = 1920;

/* ---- Reveal easing ---- */
export const REVEAL_EASE = [0.16, 1, 0.3, 1];

/* ---- Reveal state objects (no transition — caller provides it) ---- */
export const BASE_HIDDEN  = { opacity: 0, y: 12, filter: "blur(8px)" };
export const BASE_VISIBLE = { opacity: 1, y: 0,  filter: "blur(0px)" };

export const CARD_HIDDEN  = { opacity: 0, y: 14, scale: 0.985, filter: "blur(10px)" };
export const CARD_VISIBLE = { opacity: 1, y: 0,  scale: 1,     filter: "blur(0px)" };

export const CHIP_HIDDEN  = { opacity: 0, y: 8, scale: 0.96 };
export const CHIP_VISIBLE = { opacity: 1, y: 0, scale: 1 };

/* ---- Existing variants (unchanged — used elsewhere in app) ---- */

export const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] }
  }
};

export const blurIn = {
  hidden: { opacity: 0, y: 18, filter: "blur(10px)" },
  visible: i => ({
    opacity: 1, y: 0, filter: "blur(0px)",
    transition: { duration: 0.45, delay: (i || 0) * 0.06, ease: [0.16, 1, 0.3, 1] }
  })
};

export const cardStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } }
};

export const pulseLive = {
  animate: {
    scale: [1, 1.04, 1], opacity: [0.8, 1, 0.8],
    transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
  }
};

export const kbReveal = {
  hidden: { opacity: 0, scale: 0.96, y: 10 },
  visible: {
    opacity: 1, scale: 1, y: 0,
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] }
  }
};

export const slideInRight = {
  hidden: { opacity: 0, x: 16 },
  visible: {
    opacity: 1, x: 0,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] }
  }
};

export const stepFlow = {
  hidden: { opacity: 0, scaleX: 0.96 },
  visible: i => ({
    opacity: 1, scaleX: 1,
    transition: { duration: 0.28, delay: (i || 0) * 0.18 }
  })
};

/* ---- Variant forms (kept for backward compat, NOT used for delayed reveals) ---- */
export const baseReveal = {
  hidden: { opacity: 0, y: 12, filter: "blur(8px)" },
  visible: {
    opacity: 1, y: 0, filter: "blur(0px)",
    transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] }
  }
};

export const cardReveal = {
  hidden: { opacity: 0, y: 14, scale: 0.985, filter: "blur(10px)" },
  visible: {
    opacity: 1, y: 0, scale: 1, filter: "blur(0px)",
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] }
  }
};

export const chipReveal = {
  hidden: { opacity: 0, y: 8, scale: 0.96 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] }
  }
};
