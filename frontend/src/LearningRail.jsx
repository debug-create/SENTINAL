import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { stepFlow } from './motionVariants';

const STEPS = [
  'Search KB',
  'Low Confidence',
  'Clarify',
  'Synthesize',
  'Write to KB',
];

function LearningRail({ stage, isVisible = true }) {
  const normalizedStage = stage ? stage.toLowerCase() : 'idle';
  
  // Map internal selfHeal stages to the display steps
  let activeIndex = -1;
  if (normalizedStage === 'search') activeIndex = 0;
  if (normalizedStage === 'confidence') activeIndex = 1;
  if (normalizedStage === 'clarify' || normalizedStage === 'transfer') activeIndex = 2;
  if (normalizedStage === 'synthesize') activeIndex = 3;
  if (normalizedStage === 'store' || normalizedStage === 'done') activeIndex = 4;

  // Fallback for regular `learningStage`
  if (activeIndex === -1 && stage) {
    activeIndex = STEPS.findIndex(s => s.toLowerCase() === normalizedStage);
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="rail"
          className="learning-rail"
          initial={{ opacity: 0, height: 0, y: -10, padding: 0, border: 'none' }}
          animate={{ opacity: 1, height: 'auto', y: 0, padding: '8px 24px', borderBottom: '1px solid var(--border-subtle)' }}
          exit={{ opacity: 0, height: 0, y: -10, padding: 0, border: 'none' }}
          transition={{ duration: 0.3 }}
        >
          {STEPS.map((step, i) => {
            const isActive = i === activeIndex;
            const isCompleted = i < activeIndex;
            let stepClass = 'rail-step';
            if (isActive) stepClass += ' rail-step--active';
            else if (isCompleted) stepClass += ' rail-step--completed';
            else stepClass += ' rail-step--inactive';

            return (
              <React.Fragment key={step}>
                {i > 0 && (
                  <span
                    className={`rail-connector ${
                      isCompleted || isActive ? 'rail-connector--done' : ''
                    }`}
                  />
                )}
                <motion.span
                  className={stepClass}
                  variants={stepFlow}
                  initial="hidden"
                  animate="visible"
                  custom={i}
                >
                  <span className="rail-dot" />
                  {step}
                </motion.span>
              </React.Fragment>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default LearningRail;
