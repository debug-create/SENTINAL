import React from 'react';
import { motion } from 'framer-motion';
import { stepFlow } from './motionVariants';

const STEPS = [
  'Search KB',
  'Low Confidence',
  'Clarify',
  'Synthesize',
  'Write to KB',
];

function LearningRail({ stage }) {
  if (!stage) return null;

  const activeIndex = STEPS.findIndex(
    s => s.toLowerCase() === stage.toLowerCase()
  );

  return (
    <div className="learning-rail">
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
    </div>
  );
}

export default LearningRail;
