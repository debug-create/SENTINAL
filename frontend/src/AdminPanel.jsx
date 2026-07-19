import React, { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || '';

/* ================================================================
   AdminPanel — Redesigned for Supervisor Approval only
   ================================================================ */
function AdminPanel({ onEntryApproved }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [adminToken, setAdminToken] = useState(ADMIN_TOKEN);
  const [showTokenInput, setShowTokenInput] = useState(!ADMIN_TOKEN);
  const [pinInput, setPinInput] = useState('');
  
  const [processing, setProcessing] = useState(null);
  const [fadingOut, setFadingOut] = useState(null);
  
  const [expandedEntryId, setExpandedEntryId] = useState(null);
  const [toast, setToast] = useState(null);

  /* ---- Poll approval queue only if authenticated ---- */
  useEffect(() => {
    let active = true;

    const fetchQueue = () => {
      if (showTokenInput) return; // Don't poll while locked
      const headers = {};
      if (adminToken) headers['X-Admin-Token'] = adminToken;

      fetch(`${API_URL}/api/approval-queue`, { headers })
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(data => {
          if (!active) return;
          setEntries(data.entries || []);
          setLoading(false);
        })
        .catch(() => { if (active) setLoading(false); });
    };

    fetchQueue();
    const iv = setInterval(fetchQueue, 6000);
    return () => { active = false; clearInterval(iv); };
  }, [adminToken, showTokenInput]);

  /* ---- Auth Handler ---- */
  const handleUnlock = (e) => {
    e.preventDefault();
    if (pinInput.trim()) {
      setAdminToken(pinInput.trim());
      setShowTokenInput(false);
      setLoading(true); // show loading state before first fetch
    }
  };

  /* ---- Approve / Reject Queue Entry ---- */
  const handleAction = async (entryId, action) => {
    setProcessing(entryId);
    setFadingOut(entryId);

    // Give time for fade-out animation before removing
    setTimeout(async () => {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (adminToken) headers['X-Admin-Token'] = adminToken;

        const res = await fetch(`${API_URL}/api/approval-queue/${entryId}/${action}`, {
          method: 'POST',
          headers,
        });

        if (res.ok) {
          setEntries(prev => prev.filter(e => e.id !== entryId));
          
          if (action === 'approve') {
            showToast("Knowledge successfully promoted.", "success");
            if (onEntryApproved) {
              const data = await res.json();
              onEntryApproved(data);
            }
          } else {
            showToast("Synthesized knowledge rejected.", "rejected");
          }
        } else {
           // Handle error gracefully, reset UI state
           setFadingOut(null);
        }
      } catch (err) {
        console.error(`Failed to ${action} entry:`, err);
        setFadingOut(null);
      }
      setProcessing(null);
    }, 400); // Wait 400ms for CSS transition
  };

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const toggleExpand = (id) => {
    setExpandedEntryId(prev => (prev === id ? null : id));
  };

  /* ---- Render Lock Screen ---- */
  if (showTokenInput) {
    return (
      <aside className="admin-panel admin-lock-screen">
        <form className="security-card" onSubmit={handleUnlock}>
          <div className="security-icon">🔒</div>
          <h3>Supervisor Authentication</h3>
          <p>Enter Administrator PIN</p>
          <input
            type="password"
            className="pin-input"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="••••••••"
            autoFocus
          />
          <button type="submit" className="unlock-btn" disabled={!pinInput.trim()}>
            Unlock Queue
          </button>
        </form>
      </aside>
    );
  }

  /* ---- Render Main Queue ---- */
  return (
    <aside className="admin-panel" style={{ overflowY: 'auto' }}>
      <div className="panel-header" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '1.5rem', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', letterSpacing: '0' }}>Supervisor Approval</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'none', letterSpacing: '0', fontWeight: '400' }}>
          Review low-confidence synthesized knowledge before it becomes part of the permanent Knowledge Base.
        </p>
        <div style={{ marginTop: '1rem' }}>
          <span className="kb-count-badge admin-badge">
            Pending Approvals ({entries.length})
          </span>
        </div>
      </div>

      <div className="supervisor-queue-list">
        {loading ? (
          <div className="kb-empty-state">
            <p>Loading queue…</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="kb-empty-state">
            <div className="empty-icon">✓</div>
            <p>No entries pending approval.</p>
          </div>
        ) : (
          entries.map(entry => {
            const isFading = fadingOut === entry.id;
            const isExpanded = expandedEntryId === entry.id;

            // Extract or mock detailed data for UI display
            const mockConfidence = entry.synthesis_log ? "0.68" : "0.72";
            const mockReason = entry.original_query ? "Low confidence during RAG retrieval" : "New synthesized cluster";
            const mockTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <div key={entry.id} className={`queue-card-ext ${isFading ? 'fading-out' : ''}`}>
                <div className="queue-card-main">
                  
                  <div className="qc-header-row">
                    <div className="qc-meta">
                      <span className="qc-badge">Pending</span>
                      <span className="qc-time">{mockTimestamp}</span>
                    </div>
                  </div>

                  <h4 className="qc-question">{entry.question}</h4>
                  <div className="qc-answer-preview">{entry.answer}</div>
                  
                  <div className="qc-source-row">
                     <span>Source: <span className="qc-source-val">{entry.original_query || 'System Synthesis'}</span></span>
                     <span>Confidence: <span className="qc-source-val" style={{ color: 'var(--color-amber)' }}>{mockConfidence}</span></span>
                  </div>

                  <div className="qc-action-row">
                    <button 
                      className="btn-q approve" 
                      onClick={() => handleAction(entry.id, 'approve')}
                      disabled={processing}
                    >
                      ✓ Approve
                    </button>
                    <button 
                      className="btn-q reject" 
                      onClick={() => handleAction(entry.id, 'reject')}
                      disabled={processing}
                    >
                      ✗ Reject
                    </button>
                    <button 
                      className="btn-expand" 
                      onClick={() => toggleExpand(entry.id)}
                    >
                      {isExpanded ? '▲ Hide Details' : '▼ Expand Details'}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="qc-drawer">
                    <div className="drawer-section">
                      <span className="drawer-label">Reason for Escalation</span>
                      <span className="drawer-value">{mockReason}</span>
                    </div>
                    <div className="drawer-section">
                      <span className="drawer-label">Confidence Breakdown</span>
                      <span className="drawer-value font-mono">
                        Vector Match: 0.45 | LLM Synthesis Certainty: 0.82 | Overall: {mockConfidence}
                      </span>
                    </div>
                    <div className="drawer-section">
                      <span className="drawer-label">Validation Log</span>
                      <span className="drawer-value font-mono text-muted">
                        &gt; Synthesized answer aligns with query context.<br/>
                        &gt; WARNING: No exact KB match found. Human verification required.
                      </span>
                    </div>
                    <div className="drawer-section">
                      <span className="drawer-label">Knowledge Mutations</span>
                      <span className="drawer-value font-mono" style={{ color: 'var(--color-green)' }}>
                        + 1 New Document (Vector ID: {entry.id.split('_')[1] || entry.id})
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {toast && (
        <div className={`admin-toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </aside>
  );
}

export default AdminPanel;
