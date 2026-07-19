import React, { useState, useEffect } from 'react';
import './AdminConsoleSection.css';
import { apiFetch } from '../services/api';

export default function AdminConsoleSection() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [authError, setAuthError] = useState('');
  
  const [queue, setQueue] = useState([]);

  const [expandedId, setExpandedId] = useState(null);
  const [fadingOut, setFadingOut] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (isAuthenticated && pinInput) {
      const fetchQueue = async () => {
        try {
          const data = await apiFetch('/api/approval-queue', { headers: { 'X-Admin-Token': pinInput } });
          setQueue(data.entries || []);
        } catch (err) {
          console.error('Queue fetch error:', err);
        }
      };
      fetchQueue();
      const iv = setInterval(fetchQueue, 5000);
      return () => clearInterval(iv);
    }
  }, [isAuthenticated, pinInput]);

  const handleUnlock = async (e) => {
    e.preventDefault();
    if (pinInput.trim()) {
      try {
        // Test authentication by fetching the queue
        const data = await apiFetch('/api/approval-queue', { headers: { 'X-Admin-Token': pinInput.trim() } });
        setQueue(data.entries || []);
        setIsAuthenticated(true);
        setAuthError('');
      } catch (err) {
        console.warn('Auth check failed:', err);
        setAuthError('Invalid administrator PIN.');
      }
    }
  };

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const handleAction = async (id, action) => {
    setFadingOut(id);
    try {
      await apiFetch(`/api/approval-queue/${id}/${action}`, {
        method: 'POST',
        headers: { 'X-Admin-Token': pinInput.trim() }
      });
      setTimeout(() => {
        setQueue(prev => prev.filter(item => item.id !== id));
        setFadingOut(null);
        if (action === 'approve') {
          showToast("Knowledge successfully promoted.", "success");
        } else {
          showToast("Synthesized knowledge rejected.", "rejected");
        }
      }, 400); // Wait for CSS fade out
    } catch (err) {
      console.warn('Action failed:', err);
      setFadingOut(null);
      showToast("Failed to process action.", "rejected");
    }
  };

  const toggleExpand = (id) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  if (!isAuthenticated) {
    return (
      <section className="section admin-console-section lock-screen" id="admin-console">
        <form className="security-card" onClick={(e) => e.stopPropagation()} onSubmit={handleUnlock}>
          <div className="security-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          </div>
          <h3>Supervisor Authentication</h3>
          <p>Enter Administrator PIN</p>
          <input
            type="password"
            className="pin-input"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="••••••••"
          />
          {authError && <div className="auth-error text-danger font-mono" style={{marginBottom: '1rem', fontSize: '0.75rem', color: 'var(--danger)'}}>{authError}</div>}
          <button type="submit" className="unlock-btn" disabled={!pinInput.trim()}>
            Unlock Queue
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="section admin-console-section" id="admin-console">
      <div className="admin-header">
        <div className="admin-header-titles">
          <h2>Supervisor Approval</h2>
          <p className="admin-subtitle">
            Review low-confidence synthesized knowledge before it becomes part of the permanent Knowledge Base.
          </p>
        </div>
        <div className="admin-badge-container">
          <span className="badge amber-badge">Pending Approvals ({queue.length})</span>
        </div>
      </div>

      <div className="admin-layout">
        <div className="supervisor-queue custom-scrollbar">
          <div className="queue-list">
            {queue.length === 0 ? (
              <div className="empty-state text-muted font-mono">Queue is empty</div>
            ) : (
              queue.map(item => {
                const isExpanded = expandedId === item.id;
                const isFading = fadingOut === item.id;

                return (
                  <div key={item.id} className={`queue-row ${isFading ? 'fading-out' : ''}`}>
                    <div className="queue-row-main" onClick={() => toggleExpand(item.id)}>
                      <div className="qr-left">
                        <h4 className="qr-question">{item.question}</h4>
                        <span className="qr-reason font-mono text-muted">{item.reason}</span>
                      </div>
                      <div className="qr-right">
                        <span className="qr-confidence font-mono text-muted">
                          Conf: <span style={{ color: 'var(--warning)' }}>{item.confidence}</span>
                        </span>
                        <span className="qr-time font-mono text-muted">{item.timestamp}</span>
                        <div className="qr-actions" onClick={e => e.stopPropagation()}>
                          <button className="qr-btn approve" onClick={() => handleAction(item.id, 'approve')}>Approve</button>
                          <button className="qr-btn reject" onClick={() => handleAction(item.id, 'reject')}>Reject</button>
                        </div>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="qr-expanded">
                         <div className="drawer-section">
                           <span className="drawer-label font-mono">Synthesized Response</span>
                           <span className="drawer-value">{item.answer}</span>
                         </div>
                         <div className="drawer-section">
                           <span className="drawer-label font-mono">Knowledge Changes</span>
                           <span className="drawer-value font-mono" style={{ color: 'var(--success)' }}>
                             + 1 New Document (Source: {item.source} | Vector ID: {item.id})
                           </span>
                         </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className={`admin-toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </section>
  );
}
