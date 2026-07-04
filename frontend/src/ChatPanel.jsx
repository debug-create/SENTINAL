import React, { useState, useRef, useEffect, useCallback } from 'react';

/* ----------------------------------------------------------------
   ChatPanel — SENTINEL real-time chat with WebSocket streaming
   ---------------------------------------------------------------- */

const WS_BASE = 'ws://localhost:8000/ws/';

const DEMO_CHIPS = [
  { label: '📘 Try a known question',  text: 'How do I reset my password?' },
  { label: '🌀 Trigger synthesis',      text: 'What happens to my progress if the app crashes mid-lesson?' },
  { label: '💡 Test confidence gap',    text: 'Can I export my certificate as a vector file?' },
];

function ChatPanel({ onKBUpdate, onAnalyticsUpdate, showToast }) {
  /* ---- refs ---- */
  const sessionIdRef    = useRef(crypto.randomUUID());
  const wsRef           = useRef(null);
  const reconnectRef    = useRef(null);
  const messagesEndRef  = useRef(null);
  const pendingConfRef  = useRef(null);
  const didConnectRef   = useRef(false);
  // Store callbacks in refs so WebSocket handler never triggers reconnect
  const onKBUpdateRef       = useRef(onKBUpdate);
  const onAnalyticsRef      = useRef(onAnalyticsUpdate);
  const showToastRef        = useRef(showToast);
  useEffect(() => { onKBUpdateRef.current = onKBUpdate; }, [onKBUpdate]);
  useEffect(() => { onAnalyticsRef.current = onAnalyticsUpdate; }, [onAnalyticsUpdate]);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  /* ---- state ---- */
  const [messages, setMessages]                           = useState([]);
  const [input, setInput]                                 = useState('');
  const [isConnected, setIsConnected]                     = useState(false);
  const [isStreaming, setIsStreaming]                      = useState(false);
  const [awaitingClarification, setAwaitingClarification] = useState(false);

  /* ---- auto-scroll ---- */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  useEffect(scrollToBottom, [messages, scrollToBottom]);

  /* ================================================================
     WebSocket lifecycle
     ================================================================ */
  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;

    const ws = new WebSocket(WS_BASE + sessionIdRef.current);

    ws.onopen = () => {
      setIsConnected(true);
      if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
      if (didConnectRef.current && showToastRef.current) showToastRef.current('Reconnected to SENTINEL', 'success');
      didConnectRef.current = true;
    };

    /* ---------- message router ---------- */
    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data);

      switch (data.type) {

        /* 1. Confidence */
        case 'confidence': {
          const mode  = data.mode || data.source || 'known';
          const score = data.score ?? 0;
          pendingConfRef.current = { mode, score };
          // analytics
          if (mode === 'known' && onAnalyticsRef.current) {
            onAnalyticsRef.current({ type: 'answered_from_kb', score });
          }
          break;
        }

        /* 2. Token */
        case 'token': {
          const tok = data.content ?? data.token ?? '';
          setMessages(prev => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === 'bot' && last.streaming) {
              copy[copy.length - 1] = {
                ...last,
                content: last.content + tok,
                confidence: last.confidence || pendingConfRef.current,
              };
            }
            return copy;
          });
          break;
        }

        /* 3. Done */
        case 'done': {
          setIsStreaming(false);
          setMessages(prev => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === 'bot' && last.streaming) {
              copy[copy.length - 1] = { ...last, streaming: false };
            }
            return copy;
          });
          pendingConfRef.current = null;
          break;
        }

        /* 4. Clarifying question */
        case 'clarifying_question': {
          const question = data.content ?? data.question ?? '';
          setIsStreaming(false);
          setAwaitingClarification(true);
          setMessages(prev => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === 'bot' && last.streaming) {
              copy[copy.length - 1] = { id: crypto.randomUUID(), role: 'clarifying', content: question };
            } else {
              copy.push({ id: crypto.randomUUID(), role: 'clarifying', content: question });
            }
            return copy;
          });
          break;
        }

        /* 5. KB updated */
        case 'kb_updated': {
          const entry = data.entry || {};
          setMessages(prev => [
            ...prev,
            { id: crypto.randomUUID(), role: 'kb_update', content: entry.question || 'New entry' },
          ]);
          if (onKBUpdateRef.current) onKBUpdateRef.current(entry);
          if (onAnalyticsRef.current) onAnalyticsRef.current({ type: 'synthesized' });
          break;
        }

        /* 6. KB duplicate */
        case 'kb_duplicate': {
          if (showToastRef.current) showToastRef.current('Already in knowledge base', 'warning');
          break;
        }

        /* 7. Error */
        case 'error': {
          setIsStreaming(false);
          setMessages(prev => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === 'bot' && last.streaming) {
              copy[copy.length - 1] = { ...last, content: data.content || 'Something went wrong.', streaming: false, isError: true };
            } else {
              copy.push({ id: crypto.randomUUID(), role: 'bot', content: data.content || 'Something went wrong.', isError: true });
            }
            return copy;
          });
          break;
        }

        default: break;
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsStreaming(false);
      wsRef.current = null;
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, []);  // No deps — callbacks accessed via refs

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  /* ================================================================
     Send message
     ================================================================ */
  const send = useCallback((overrideText) => {
    const text = (typeof overrideText === 'string' ? overrideText : input).trim();
    if (!text || isStreaming) return;

    const msgType = awaitingClarification ? 'clarification' : 'user_msg';

    setMessages(prev => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content: text },
      { id: crypto.randomUUID(), role: 'bot',  content: '', streaming: true },
    ]);

    setInput('');
    setIsStreaming(true);
    setAwaitingClarification(false);

    // analytics: count every question
    if (onAnalyticsRef.current) onAnalyticsRef.current({ type: 'question_asked' });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: msgType, message: text }));
    }
  }, [input, isStreaming, awaitingClarification]);

  const handleSubmit = (e) => { e.preventDefault(); send(); };
  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  /* ================================================================
     Confidence badge
     ================================================================ */
  const renderConfBadge = (conf) => {
    if (!conf) return null;
    const pct = (conf.score * 100).toFixed(0);
    let tier, label;
    if (conf.mode === 'synthesized') { tier = 'synth'; label = `SYNTH · ${conf.score.toFixed(2)}`; }
    else if (conf.score >= 0.85)     { tier = 'high';  label = `HIGH · ${pct}%`; }
    else                             { tier = 'med';   label = `MED · ${pct}%`; }
    return <span className={`conf-badge conf-${tier}`}>{label}</span>;
  };

  /* ================================================================
     Render
     ================================================================ */
  const hasMessages = messages.length > 0;

  return (
    <section className="chat-panel">
      <div className="panel-header">
        <h2>Chat</h2>
        <div className="panel-header-right">
          <span className={`connection-badge ${isConnected ? 'connected' : 'disconnected'}`}>
            <span className="conn-dot" />
            {isConnected ? 'Connected' : 'Reconnecting…'}
          </span>
        </div>
      </div>

      <div className="chat-messages">
        {!hasMessages && (
          <div className="chat-empty-state">
            <div className="empty-icon">🛡️</div>
            <h3>SENTINEL is standing by</h3>
            <p>Ask a question about the EdTech platform. If I don't know the answer, I'll learn it from you.</p>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="chat-bubble chat-bubble--user">
                <div className="bubble-pill">{msg.content}</div>
              </div>
            );
          }
          if (msg.role === 'bot') {
            return (
              <div key={msg.id} className={`chat-bubble chat-bubble--bot ${msg.isError ? 'bubble-error' : ''}`}>
                <div className="bubble-glass">
                  <p className="bubble-text">
                    {msg.content}
                    {msg.streaming && <span className="streaming-cursor" />}
                  </p>
                  {!msg.streaming && msg.confidence && renderConfBadge(msg.confidence)}
                </div>
              </div>
            );
          }
          if (msg.role === 'clarifying') {
            return (
              <div key={msg.id} className="chat-bubble chat-bubble--clarifying">
                <div className="clarifying-card">
                  <span className="clarifying-icon">?</span>
                  <p className="bubble-text">{msg.content}</p>
                </div>
              </div>
            );
          }
          if (msg.role === 'kb_update') {
            return (
              <div key={msg.id} className="chat-bubble chat-bubble--kb-update">
                <div className="kb-update-card">
                  🧠 Knowledge Base Updated — learned: <strong>"{msg.content}"</strong>
                </div>
              </div>
            );
          }
          return null;
        })}
        <div ref={messagesEndRef} />
      </div>

      {!hasMessages && (
        <div className="demo-chips-tray">
          {DEMO_CHIPS.map(chip => (
            <button key={chip.label} className="demo-chip" onClick={() => send(chip.text)} disabled={!isConnected || isStreaming}>
              {chip.label}
            </button>
          ))}
        </div>
      )}

      <form className={`chat-input-form ${awaitingClarification ? 'clarification-mode' : ''}`} onSubmit={handleSubmit}>
        <input
          id="chat-input"
          type="text"
          className={awaitingClarification ? 'input-amber' : ''}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={!isConnected ? 'Reconnecting…' : awaitingClarification ? 'Answer the question above…' : 'Ask SENTINEL anything…'}
          disabled={!isConnected || isStreaming}
          autoComplete="off"
        />
        <button id="send-button" type="submit" disabled={!isConnected || isStreaming || !input.trim()} className={awaitingClarification ? 'btn-amber' : ''}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </button>
      </form>
    </section>
  );
}

export default ChatPanel;
