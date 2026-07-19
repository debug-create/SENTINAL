import React, { useEffect, useRef, useState } from 'react';
import './FeaturesSection.css';

export function useIntersectionObserver(ref, options = { threshold: 0.2 }) {
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    if (ref.current) {
      const observer = new IntersectionObserver(([entry]) => {
        setIsIntersecting(entry.isIntersecting);
      }, options);
      observer.observe(ref.current);
      return () => {
        if (ref.current) observer.unobserve(ref.current);
      };
    }
  }, [ref, options]);

  return isIntersecting;
}

const STAGES = [
  { name: 'Retrieve', desc: 'Vector search across fragmented corpuses' },
  { name: 'Validate', desc: 'Multi-agent credibility checks' },
  { name: 'Confidence', desc: 'Scoring against operational baseline' },
  { name: 'Supervisor', desc: 'Human-in-the-loop review for low scores' },
  { name: 'Repository', desc: 'Indexing into permanent vector storage' },
  { name: 'Response', desc: 'Streaming synthesized intelligence' }
];

export default function FeaturesSection() {
  const sectionRef = useRef(null);
  
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStage(prev => {
        if (prev > STAGES.length + 1) return 0;
        return prev + 1;
      });
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  const clampedActive = Math.max(0, Math.min(6, activeStage));

  return (
    <section className="section pipeline-section" id="features" ref={sectionRef}>
      <div className="pipeline-header">
        <h2 className="animate-enter visible">Self-Heal Pipeline</h2>
        <p className="animate-enter delay-100 visible font-mono text-muted">OPERATIONAL WORKFLOW VISUALIZATION</p>
      </div>

      <div className="pipeline-container">
        {STAGES.map((stage, idx) => {
          const isCompleted = idx < clampedActive;
          const isActive = idx === clampedActive;
          
          let statusClass = 'future';
          if (isCompleted) statusClass = 'completed';
          if (isActive) statusClass = 'active';

          return (
            <React.Fragment key={stage.name}>
              <div className={`pl-node ${statusClass}`}>
                <div className="pl-icon-container">
                  <div className="pl-icon"></div>
                </div>
                <div className="pl-info">
                  <h3 className="font-mono">{stage.name}</h3>
                  <p className="text-muted">{stage.desc}</p>
                </div>
              </div>

              {idx < STAGES.length - 1 && (
                <div className={`pl-edge ${idx < clampedActive ? 'completed' : ''}`}>
                  <div className="pl-line"></div>
                  {idx === clampedActive && (
                    <div className="pl-packet"></div>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}
