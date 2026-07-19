import React, { useState, useEffect } from 'react';
import './HeroSection.css';

const STATUS_MESSAGES = [
  "Initializing...",
  "Connecting Knowledge Sources...",
  "Building Context...",
  "Validating Intelligence...",
  "System Ready."
];

export default function HeroSection() {
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStatusIndex((prev) => {
        if (prev < STATUS_MESSAGES.length - 1) {
          return prev + 1;
        }
        return prev; // Stop at "System Ready."
      });
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="section hero-section" id="hero">
      {/* Animated Background */}
      <div className={`hero-bg ${statusIndex === STATUS_MESSAGES.length - 1 ? 'system-ready' : ''}`}>
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          {/* Topology Lines */}
          <path className="topology-line line-1" d="M -100 200 Q 300 400, 700 100 T 1500 300" fill="none" stroke="var(--brand-violet-muted)" strokeWidth="1.5"/>
          <path className="topology-line line-2" d="M -100 400 Q 200 200, 800 600 T 1500 500" fill="none" stroke="var(--brand-violet-muted)" strokeWidth="1"/>
          
          {/* Flowing Packets */}
          <circle className="packet packet-1" cx="0" cy="0" r="3" fill="var(--brand-violet)" />
          <circle className="packet packet-2" cx="0" cy="0" r="2" fill="var(--brand-violet)" />
          <circle className="packet packet-3" cx="0" cy="0" r="2.5" fill="#fff" opacity="0.8"/>
        </svg>
      </div>

      <div className="hero-content">
        <h1 className="hero-wordmark">SENTINEL</h1>
        <p className="hero-subtitle font-mono">Knowledge Assistant for EdTech</p>
        <p className="hero-mission">Where every conversation strengthens the knowledge base.</p>
        

      </div>

      <div className="scroll-indicator">
        <span className="font-mono">Scroll to Begin</span>
        <div className="scroll-arrow">↓</div>
      </div>
    </section>
  );
}
