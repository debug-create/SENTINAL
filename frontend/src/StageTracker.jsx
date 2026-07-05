import React from 'react';

/* ---- Stage display labels ---- */
export const STAGE_LABELS = {
  searching_kb:     'Searching KB',
  confident_match:  'Confident Match',
  low_confidence:   'Low Confidence',
  clarifying:       'Asking Clarification',
  synthesizing:     'Synthesizing FAQ',
  duplicate_check:  'Checking Duplicates',
  kb_write:         'Writing to KB',
  kb_duplicate:     'Duplicate Found',
  pending_approval: 'Pending Approval',
  streaming:        'Streaming Answer',
};

export const STAGE_ORDER = [
  'searching_kb',
  'confident_match', 'low_confidence',
  'clarifying',
  'synthesizing',
  'duplicate_check',
  'kb_write', 'kb_duplicate', 'pending_approval',
  'streaming',
];

export function StageTracker({ stages }) {
  if (!stages || stages.length === 0) return null;

  return (
    <div className="stage-tracker">
      <div className="stage-tracker-label">Pipeline</div>
      <div className="stage-steps">
        {stages.map((stage, i) => (
          <div key={`${stage.name}-${i}`} className={`stage-step stage-${stage.status}`}>
            <div className="stage-dot" />
            {i < stages.length - 1 && <div className="stage-line" />}
            <span className="stage-name">{STAGE_LABELS[stage.name] || stage.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default StageTracker;
