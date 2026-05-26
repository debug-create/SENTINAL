import React, { useState, useRef, useEffect, useCallback } from 'react';

const SESSION_ID = crypto.randomUUID();
const WS_URL = `ws://localhost:8000/ws/${SESSION_ID}`;

function ChatPanel({ onKBUpdate, onConfidence }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I\'m SENTINEL, your AI support assistant. Ask me anything about our EdTech platform. If I don\'t know the answer, I\'ll learn it from you! 🚀',
      type: 'greeting'
    }
  ]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [toast, setToast] = useState(null);
  const wsRef = useRef(null);
  const streamBufferRef = useRef('');
  const currentConfidenceRef = useRef(null);
  const messagesEndRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      setIsConnected(true);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'confidence':
          currentConfidenceRef.current = data;
          if (onConfidence) onConfidence(data.score, data.mode);
          break;

        case 'token':
          setIsThinking(false);
          const chunk = data.content;
          setMessages(prev => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            if (lastIndex >= 0 && updated[lastIndex].role === 'assistant') {
              updated[lastIndex] = {
                ...updated[lastIndex],
                content: updated[lastIndex].content + chunk,
                streaming: true,
                confidence: currentConfidenceRef.current
              };
            }
            return updated;
          });
          break;

        case 'done':
          setIsStreaming(false);
          setMessages(prev => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            if (lastIndex >= 0 && updated[lastIndex].role === 'assistant') {
              updated[lastIndex] = {
                ...updated[lastIndex],
                streaming: false
              };
            }
            return updated;
          });
          streamBufferRef.current = '';
          currentConfidenceRef.current = null;
          break;

        case 'clarifying_question':
          setIsThinking(false);
          setIsStreaming(false);
          setMessages(prev => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            if (lastIndex >= 0 && updated[lastIndex].role === 'assistant') {
              updated[lastIndex] = {
                ...updated[lastIndex],
                content: data.content,
                type: 'clarifying',
                streaming: false
              };
            }
            return updated;
          });
          break;

        case 'kb_updated':
          setMessages(prev => [
            ...prev,
            {
              role: 'system',
              content: `✨ New knowledge synthesized! Added: "${data.entry.question}"`,
              type: 'kb_update'
            }
          ]);
          if (onKBUpdate) onKBUpdate(data.entry);
          break;

        case 'kb_duplicate':
          setToast({ type: 'warning', message: '⚠ Similar entry exists — KB not updated' });
          setTimeout(() => setToast(null), 3000);
          break;

        case 'error':
          setIsThinking(false);
          setIsStreaming(false);
          setMessages(prev => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            if (lastIndex >= 0 && updated[lastIndex].role === 'assistant') {
              updated[lastIndex] = {
                ...updated[lastIndex],
                content: data.content,
                type: 'error',
                streaming: false
              };
            }
            return updated;
          });
          streamBufferRef.current = '';
          break;

        default:
          break;
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsStreaming(false);
      setIsThinking(false);
      wsRef.current = null;
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [onKBUpdate]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  const sendMessage = (overrideContent, e) => {
    if (e && e.preventDefault) e.preventDefault();
    const content = (typeof overrideContent === "string" 
      ? overrideContent 
      : input
    ).trim();
    if (!content || isStreaming) return;

    setMessages(prev => [...prev, 
      { id: crypto.randomUUID(), role: "user", content },
      { id: crypto.randomUUID(), role: "assistant", content: "", streaming: true }
    ]);
    setIsThinking(true);
    setIsStreaming(true);
    if (typeof overrideContent !== "string") setInput("");

    const doSend = (msgText) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "message", content: msgText, message: msgText }));
      } else {
        setTimeout(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "message", content: msgText, message: msgText }));
          }
        }, 500);
      }
    };

    doSend(content);
  };

  return (
    <section className="chat-panel">
      <div className="panel-header">
        <h2>Chat</h2>
        <div className={`connection-badge ${isConnected ? 'connected' : 'disconnected'}`}>
          <span className="conn-dot"></span>
          {isConnected ? 'Connected' : 'Reconnecting...'}
        </div>
      </div>
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div
            key={msg.id || i}
            className={`chat-bubble ${msg.role === 'assistant' ? 'bot' : msg.role} ${msg.type || ''} ${msg.streaming ? 'streaming' : ''}`}
          >
            {(msg.role === 'bot' || msg.role === 'assistant') && (
              <div className="bubble-avatar bot-avatar">
                <svg width="16" height="16" viewBox="0 0 28 28" fill="none">
                  <path d="M14 2L2 8v12l12 6 12-6V8L14 2z" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <circle cx="14" cy="14" r="3" fill="currentColor"/>
                </svg>
              </div>
            )}
            <div className="bubble-content">
              {msg.confidence && (
                <div className={`confidence-pill ${msg.confidence.mode}`}>
                  {msg.confidence.mode === 'known' 
                    ? `KB Match · ${Math.round(msg.confidence.score * 100)}%` 
                    : `✦ Synthesized · New entry added`}
                </div>
              )}
              {msg.type === 'clarifying' && (
                <span className="clarifying-badge">🔍 Clarification needed</span>
              )}
              {msg.type === 'kb_update' && (
                <span className="kb-update-badge">Knowledge Base</span>
              )}
              <p>{msg.content}</p>
              {msg.streaming && <span className="cursor-blink">▊</span>}
            </div>
          </div>
        ))}
        {isThinking && (
          <div className="thinking-bubble">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>
        )}
        {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && !isThinking && (
          <div className="chat-bubble bot">
            <div className="bubble-avatar bot-avatar">
              <svg width="16" height="16" viewBox="0 0 28 28" fill="none">
                <path d="M14 2L2 8v12l12 6 12-6V8L14 2z" stroke="currentColor" strokeWidth="2" fill="none"/>
                <circle cx="14" cy="14" r="3" fill="currentColor"/>
              </svg>
            </div>
            <div className="bubble-content">
              <div className="typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {messages.length <= 1 && (
        <div className="demo-chips">
          <p className="demo-label">TRY THESE TO SEE SENTINEL LEARN →</p>
          <div className="demo-chips-row">
            {[
              "How do I download my certificate?",
              "Can I get a certificate if I only finished 60% of the course?",
              "What happens to my progress if I switch to a different plan?"
            ].map(chip => (
              <button
                key={chip}
                className="chip-btn"
                onClick={() => sendMessage(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}

      <form className="chat-input-form" onSubmit={(e) => sendMessage(undefined, e)}>
        <input
          id="chat-input"
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage(undefined, e);
            }
          }}
          placeholder={isConnected ? 'Ask SENTINEL anything...' : 'Reconnecting...'}
          disabled={!isConnected || isStreaming}
          autoComplete="off"
        />
        <button
          id="send-button"
          type="submit"
          disabled={!isConnected || isStreaming || !input.trim()}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </button>
      </form>
    </section>
  );
}

export default ChatPanel;
