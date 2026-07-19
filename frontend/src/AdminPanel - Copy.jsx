import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || '';

/* ================================================================
   AdminPanel — Supervisor mode: approve / reject synthesized FAQs
   ================================================================ */
function AdminPanel({ onEntryApproved }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adminToken, setAdminToken] = useState(ADMIN_TOKEN);
  const [showTokenInput, setShowTokenInput] = useState(!ADMIN_TOKEN);
  const [processing, setProcessing] = useState(null);

  const [findings, setFindings] = useState([]);
  const [findingsLoading, setFindingsLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [resolvingFinding, setResolvingFinding] = useState(null);

  /* ---- Poll approval queue every 6s ---- */
  useEffect(() => {
    let active = true;

    const fetchQueue = () => {
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
  }, [adminToken]);

  /* ---- Poll unresolved audit findings every 6s ---- */
  useEffect(() => {
    let active = true;

    const fetchFindings = () => {
      const headers = {};
      if (adminToken) headers['X-Admin-Token'] = adminToken;

      fetch(`${API_URL}/api/kb/audit/findings`, { headers })
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(data => {
          if (!active) return;
          setFindings(data.findings || []);
          setFindingsLoading(false);
        })
        .catch(() => { if (active) setFindingsLoading(false); });
    };

    fetchFindings();
    const iv = setInterval(fetchFindings, 6000);
    return () => { active = false; clearInterval(iv); };
  }, [adminToken]);

  /* ---- Approve / Reject Queue Entry ---- */
  const handleAction = async (entryId, action) => {
    setProcessing(entryId);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (adminToken) headers['X-Admin-Token'] = adminToken;

      const res = await fetch(`${API_URL}/api/approval-queue/${entryId}/${action}`, {
        method: 'POST',
        headers,
      });

      if (res.ok) {
        setEntries(prev => prev.filter(e => e.id !== entryId));
        if (action === 'approve' && onEntryApproved) {
          const data = await res.json();
          onEntryApproved(data);
        }
      }
    } catch (err) {
      console.error(`Failed to ${action} entry:`, err);
    }
    setProcessing(null);
  };

  /* ---- Trigger Audit ---- */
  const handleRunAudit = async () => {
    setAuditing(true);
    try {
      const headers = {};
      if (adminToken) headers['X-Admin-Token'] = adminToken;
      const res = await fetch(`${API_URL}/api/kb/audit/run`, {
        method: 'POST',
        headers
      });
      if (res.ok) {
        const data = await res.json();
        setFindings(prev => {
          const newF = data.findings || [];
          const existingIds = new Set(prev.map(f => f.id));
          return [...prev, ...newF.filter(f => !existingIds.has(f.id))];
        });
      }
    } catch (err) {
      console.error("Audit run failed:", err);
    } finally {
      setAuditing(false);
    }
  };

  /* ---- Resolve Finding ---- */
  const handleResolveFinding = async (findingId, action) => {
    setResolvingFinding(findingId);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (adminToken) headers['X-Admin-Token'] = adminToken;

      const res = await fetch(`${API_URL}/api/kb/audit/findings/${findingId}/resolve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action })
      });

      if (res.ok) {
        setFindings(prev => prev.filter(f => f.id !== findingId));
        if (onEntryApproved) {
          onEntryApproved();
        }
      }
    } catch (err) {
      console.error("Failed to resolve finding:", err);
    } finally {
      setResolvingFinding(null);
    }
  };

  return (
    <aside className="admin-panel" style={{ overflowY: 'auto' }}>
      <div className="panel-header">
        <h2>Supervisor Queue</h2>
        <div className="kb-header-actions">
          <span className="kb-count-badge admin-badge">
            {entries.length} pending
          </span>
        </div>
      </div>

      {showTokenInput && (
        <div className="admin-token-bar">
          <input
            type="password"
            value={adminToken}
            onChange={e => setAdminToken(e.target.value)}
            placeholder="Admin token…"
            className="admin-token-input"
          />
          <button
            className="admin-token-btn"
            onClick={() => setShowTokenInput(false)}
            disabled={!adminToken}
          >
            Set
          </button>
        </div>
      )}

      <div className="kb-entries">
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
          entries.map(entry => (
            <div key={entry.id} className="kb-card approval-card">
              <p className="kb-card-question">{entry.question}</p>
              <p className="kb-card-answer">{entry.answer}</p>
              {entry.original_query && (
                <p className="original-query-badge" style={{
                  fontSize: '0.65rem',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  marginTop: '6px',
                  marginBottom: '2px',
                  background: 'var(--bg-glass)',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'inline-block',
                  border: '1px solid var(--border-subtle)'
                }}>
                  Source: {entry.original_query}
                </p>
              )}
              <div className="approval-actions">
                <button
                  className="approval-btn approve-btn"
                  onClick={() => handleAction(entry.id, 'approve')}
                  disabled={processing === entry.id}
                >
                  ✓ Approve
                </button>
                <button
                  className="approval-btn reject-btn"
                  onClick={() => handleAction(entry.id, 'reject')}
                  disabled={processing === entry.id}
                >
                  ✗ Reject
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="panel-divider" style={{ margin: '24px 0', borderTop: '1px dashed var(--border-subtle)' }} />

      <div className="panel-header" style={{ marginTop: '16px' }}>
        <h2>Knowledge Base Audit</h2>
        <div className="kb-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="kb-count-badge admin-badge">
            {findings.length} conflicts
          </span>
          <button
            className={`panel-toggle-btn ${auditing ? 'active' : ''}`}
            onClick={handleRunAudit}
            disabled={auditing}
            style={{
              padding: '4px 12px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              background: 'var(--bg-glass)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)'
            }}
          >
            {auditing ? 'Auditing...' : 'Run Audit 🔎'}
          </button>
        </div>
      </div>

      <div className="kb-entries">
        {findingsLoading ? (
          <div className="kb-empty-state">
            <p>Loading audit findings…</p>
          </div>
        ) : findings.length === 0 ? (
          <div className="kb-empty-state">
            <div className="empty-icon">✓</div>
            <p>No contradictions detected.</p>
          </div>
        ) : (
          findings.map(finding => (
            <div key={finding.id} className="kb-card audit-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                <span>ID: {finding.id}</span>
                <span>Overlap Similarity: {(finding.similarity * 100).toFixed(1)}%</span>
              </div>

              <div className="audit-pair" style={{ display: 'flex', gap: '16px', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, padding: '10px', background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <p style={{ fontWeight: 'bold', fontSize: '0.75rem', color: 'var(--accent-indigo)', marginBottom: '4px' }}>Left Entry (A)</p>
                  <p style={{ fontWeight: 'bold', fontSize: '0.75rem', marginBottom: '4px' }}>{finding.entry_a.question}</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{finding.entry_a.answer}</p>
                  <span className={`source-tag ${finding.entry_a.source}`} style={{ fontSize: '0.55rem', marginTop: '6px', display: 'inline-block' }}>
                    {finding.entry_a.source.toUpperCase()}
                  </span>
                </div>
                <div style={{ flex: 1, padding: '10px', background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <p style={{ fontWeight: 'bold', fontSize: '0.75rem', color: 'var(--accent-indigo)', marginBottom: '4px' }}>Right Entry (B)</p>
                  <p style={{ fontWeight: 'bold', fontSize: '0.75rem', marginBottom: '4px' }}>{finding.entry_b.question}</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{finding.entry_b.answer}</p>
                  <span className={`source-tag ${finding.entry_b.source}`} style={{ fontSize: '0.55rem', marginTop: '6px', display: 'inline-block' }}>
                    {finding.entry_b.source.toUpperCase()}
                  </span>
                </div>
              </div>

              <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.08)', borderLeft: '3px solid #ef4444', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', fontSize: '0.72rem' }}>
                <strong>Conflict:</strong> {finding.explanation}
              </div>

              <div className="approval-actions" style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  className="approval-btn approve-btn"
                  onClick={() => handleResolveFinding(finding.id, 'keep_a')}
                  disabled={resolvingFinding === finding.id}
                  style={{ flex: 1, padding: '6px', fontSize: '0.7rem' }}
                >
                  Keep Left (A)
                </button>
                <button
                  className="approval-btn approve-btn"
                  onClick={() => handleResolveFinding(finding.id, 'keep_b')}
                  disabled={resolvingFinding === finding.id}
                  style={{ flex: 1, padding: '6px', fontSize: '0.7rem' }}
                >
                  Keep Right (B)
                </button>
                <button
                  className="approval-btn reject-btn"
                  onClick={() => handleResolveFinding(finding.id, 'dismiss')}
                  disabled={resolvingFinding === finding.id}
                  style={{ flex: 1, padding: '6px', fontSize: '0.7rem' }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

export default AdminPanel;
