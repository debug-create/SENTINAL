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
