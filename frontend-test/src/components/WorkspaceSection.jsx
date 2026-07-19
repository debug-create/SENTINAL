import React, { useState, useEffect, useRef, useCallback } from 'react';
import './WorkspaceSection.css';
import { ChatService } from '../services/api';



// STAGE_MAP logic will now be handled inside processMsg to accurately reflect the flow
const STAGE_MAP = {};

const DISPLAY_STAGES = [
  "Searching Knowledge Base",
  "Retrieving Documents",
  "Validating Confidence",
  "Decision",
  "Response / Supervisor Approval",
  "Knowledge Repository Update"
];

const KNOWN_QUESTIONS = [
  "How do I reset my password?",
  "Can I share my course enrollment with a family member?",
  "Where can I download my course certificate?",
  "How do I update my billing information?",
  "Can I access courses offline?",
  "How do I contact technical support?",
  "What payment methods are accepted?",
  "How do I cancel my subscription?"
];

const SYNTHESIS_QUESTIONS = [
  "Does the Family Learning Plan include certificate sharing?",
  "Can enterprise licenses be transferred after activation?",
  "What happens when a student's organization changes?",
  "Can course vouchers be merged across accounts?",
  "How are instructor credits calculated for enterprise customers?",
  "Can I use one license across multiple institutions?",
  "What happens to my certifications if I switch to a free tier?",
  "Are proctored exam credits refunded if a course is cancelled?",
  "Can an alumni account retain access to corporate training modules?",
  "Do team admins have visibility into individual assessment scores?",
  "Is there a grace period for inactive enterprise seats before reallocation?",
  "How do hybrid learning paths handle prerequisite waivers?"
];

const AMBIGUOUS_QUESTIONS = [
  "Can I upgrade it?",
  "Is this allowed?",
  "What happens after that?",
  "Can I change it later?"
];

export default function WorkspaceSection() {
  const sessionIdRef = useRef(crypto.randomUUID());
  const chatServiceRef = useRef(null);
  const messagesEndRef = useRef(null);
  const pendingConfRef = useRef(null);
  
  const [messages, setMessages] = useState([]);
  const [inputVal, setInputVal] = useState('');
  
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [awaitingClarification, setAwaitingClarification] = useState(false);
  const [activeStageIdx, setActiveStageIdx] = useState(-1);
  const [showMetadata, setShowMetadata] = useState(false);
  const [completedStages, setCompletedStages] = useState(new Set());
  
  const [pipelineState, setPipelineState] = useState('idle'); // idle, processing, supervisor_wait, supervisor_approved, completed, failed
  const msgQueue = useRef([]);
  const isPausedRef = useRef(false);
  const [toast, setToast] = useState(null);

  const [metrics, setMetrics] = useState({ asked: 12, kb: 9, synth: 3, pending: 1, sumConf: 92 * 12, countConf: 12 });
  const [activityFeed, setActivityFeed] = useState([]);
  
  const addActivity = useCallback((desc) => {
    setActivityFeed(prev => {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const newFeed = [{ id: crypto.randomUUID(), time, desc }, ...prev];
      return newFeed.slice(0, 20);
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  useEffect(scrollToBottom, [messages, scrollToBottom]);

  const showToastMsg = (msg, type) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  /* ================================================================
     WebSocket lifecycle via ChatService
     ================================================================ */
  useEffect(() => {
    let timeoutId;
    
    const processMsg = (data) => {
        switch (data.type) {
          case 'stage': {
            const s = data.stage;
            if (s === 'searching_kb') {
              addActivity("Searching knowledge base");
              setActiveStageIdx(0);
              // start simulation timers for Retrieving (1) and Validating (2)
              setTimeout(() => {
                setActiveStageIdx(prev => {
                  if (prev === 0) {
                     setCompletedStages(set => new Set(set).add(0));
                     return 1;
                  }
                  return prev;
                });
              }, 700);
              setTimeout(() => {
                setActiveStageIdx(prev => {
                  if (prev === 1) {
                     setCompletedStages(set => new Set(set).add(0).add(1));
                     return 2;
                  }
                  return prev;
                });
              }, 1500);
            }
            else if (s === 'confident_match') { 
              setMetrics(m => ({ ...m, kb: m.kb + 1 })); 
              addActivity("Knowledge retrieved"); 
              setCompletedStages(set => new Set(set).add(0).add(1).add(2));
              setActiveStageIdx(3);
              setTimeout(() => {
                 setCompletedStages(set => new Set(set).add(0).add(1).add(2).add(3));
                 setActiveStageIdx(4);
              }, 500);
            }
            else if (s === 'low_confidence') {
              addActivity("Knowledge gap detected");
              setCompletedStages(set => new Set(set).add(0).add(1).add(2));
              setActiveStageIdx(3);
            }
            else if (s === 'synthesizing') {
              addActivity("Knowledge synthesized");
              setCompletedStages(set => new Set([0, 1, 2]));
              setActiveStageIdx(3);
            }
            else if (s === 'kb_write') { 
              setMetrics(m => ({ ...m, synth: m.synth + 1 })); 
              addActivity("Knowledge stored"); 
              setCompletedStages(set => new Set([0, 1, 2, 3, 4]));
              setActiveStageIdx(5);
            }
            else if (s === 'streaming') {
              addActivity("Answer streamed");
              setActiveStageIdx(prev => {
                 if (prev < 4) {
                    setCompletedStages(set => new Set([0, 1, 2, 3]));
                    return 4;
                 }
                 return prev;
              });
            }
            else if (s === 'clarifying') {
              setCompletedStages(set => new Set([0, 1, 2, 3]));
              setActiveStageIdx(4);
            }
            break;
          }
          case 'confidence': {
            const mode = data.mode || data.source || 'known';
            const score = data.score ?? 0;
            const conf = Math.round(score * 100);
            setMetrics(m => ({ ...m, sumConf: m.sumConf + conf, countConf: m.countConf + 1 }));
            addActivity(`Confidence ${conf}%`);
            pendingConfRef.current = { mode, score };
            break;
          }
          case 'token': {
            const tok = data.content ?? data.token ?? '';
            setMessages(prev => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === 'assistant' && last.streaming) {
                copy[copy.length - 1] = {
                  ...last,
                  text: last.text + tok,
                  confidence: last.confidence || pendingConfRef.current,
                };
              }
              return copy;
            });
            break;
          }
          case 'done': {
            setIsProcessing(false);
            setPipelineState('completed');
            setAwaitingClarification(false);
            setShowMetadata(true);
            setMessages(prev => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === 'assistant' && last.streaming) {
                copy[copy.length - 1] = { ...last, streaming: false };
              }
              return copy;
            });
            pendingConfRef.current = null;
            
            // Leave pipeline visible and mark all as completed
            setActiveStageIdx(-1);
            setCompletedStages(new Set([0, 1, 2, 3, 4, 5]));
            break;
          }
          case 'clarifying_question': {
            const question = data.content ?? data.question ?? '';
            setIsProcessing(false);
            setPipelineState('completed');
            setActiveStageIdx(-1);
            setCompletedStages(new Set([0, 1, 2, 3, 4]));
            setAwaitingClarification(true);
            setShowMetadata(false);
            setMessages(prev => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === 'assistant' && last.streaming) {
                copy[copy.length - 1] = { id: crypto.randomUUID(), role: 'clarifying', text: question };
              } else {
                copy.push({ id: crypto.randomUUID(), role: 'clarifying', text: question });
              }
              return copy;
            });
            break;
          }
          case 'kb_updated': {
            const entry = data.entry || {};
            showToastMsg(`Knowledge Base Updated: ${entry.question || 'New entry'}`, 'success');
            break;
          }
          case 'kb_pending_approval': {
            // Handled during supervisor simulation
            break;
          }
          case 'kb_duplicate': {
            showToastMsg('Already in knowledge base', 'warning');
            break;
          }
          case 'error': {
            setIsProcessing(false);
            setPipelineState('failed');
            setMessages(prev => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === 'assistant' && last.streaming) {
                copy[copy.length - 1] = { ...last, text: data.content || 'Something went wrong.', streaming: false, isError: true };
              } else {
                copy.push({ id: crypto.randomUUID(), role: 'assistant', text: data.content || 'Something went wrong.', isError: true });
              }
              return copy;
            });
            break;
          }
          default: break;
        }
    };

    const flushQueue = () => {
        while (msgQueue.current.length > 0 && !isPausedRef.current) {
            const data = msgQueue.current[0];
            
            if (data.type === 'stage' && data.stage === 'pending_approval') {
                isPausedRef.current = true;
                setPipelineState('supervisor_wait');
                setMetrics(m => ({ ...m, pending: m.pending + 1 }));
                addActivity("Supervisor approval required");
                
                setCompletedStages(set => new Set([0, 1, 2, 3]));
                setActiveStageIdx(4);
                
                // Add temporary chat message to show wait state
                setMessages(prev => {
                  const copy = [...prev];
                  const last = copy[copy.length - 1];
                  if (last && last.role === 'assistant' && last.streaming) {
                    copy[copy.length - 1] = {
                      ...last,
                      text: "Awaiting supervisor validation before committing knowledge...",
                      isTemp: true
                    };
                  }
                  return copy;
                });
                
                timeoutId = setTimeout(() => {
                    setPipelineState('processing');
                    setMetrics(m => ({ ...m, pending: Math.max(0, m.pending - 1) }));
                    addActivity("Knowledge approved");
                    
                    setCompletedStages(set => new Set([0, 1, 2, 3, 4]));
                    setActiveStageIdx(5);
                    
                    setMessages(prev => {
                      const copy = [...prev];
                      const last = copy[copy.length - 1];
                      if (last && last.role === 'assistant' && last.streaming && last.isTemp) {
                        copy[copy.length - 1] = { ...last, text: "", isTemp: false };
                      }
                      return copy;
                    });
                    
                    timeoutId = setTimeout(() => {
                        setPipelineState('processing');
                        isPausedRef.current = false;
                        msgQueue.current.shift(); // remove the stage message
                        flushQueue(); // resume
                    }, 1000);
                }, 5000); // 5 sec wait
                
                return;
            }

            msgQueue.current.shift();
            processMsg(data);
        }
    };

    const callbacks = {
      onConnect: () => {
        setIsConnected(true);
      },
      onDisconnect: () => {
        setIsConnected(false);
        setIsProcessing(false);
        setPipelineState('idle');
        setActiveStageIdx(-1);
        setCompletedStages(new Set());
      },
      onMessage: (data) => {
        msgQueue.current.push(data);
        flushQueue();
      }
    };

    chatServiceRef.current = new ChatService(sessionIdRef.current, callbacks);
    chatServiceRef.current.connect();

    return () => {
      clearTimeout(timeoutId);
      if (chatServiceRef.current) {
        chatServiceRef.current.disconnect();
      }
    };
  }, []);

  /* ================================================================
     Send message
     ================================================================ */
  const send = useCallback((overrideText) => {
    const text = (typeof overrideText === 'string' ? overrideText : inputVal).trim();
    if (!text || isProcessing) return;

    setMetrics(m => ({ ...m, asked: m.asked + 1 }));
    addActivity("Question asked");

    const msgType = awaitingClarification ? 'clarification' : 'user_msg';

    setMessages(prev => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', text: text },
      { id: crypto.randomUUID(), role: 'assistant', text: '', streaming: true },
    ]);

    setInputVal('');
    setIsProcessing(true);
    setAwaitingClarification(false);
    setShowMetadata(false);
    setPipelineState('processing');
    setActiveStageIdx(0);
    setCompletedStages(new Set());
    setShowMetadata(false);
    msgQueue.current = [];
    isPausedRef.current = false;

    if (chatServiceRef.current && chatServiceRef.current.isConnected) {
      chatServiceRef.current.sendMessage(text, msgType);
    }
  }, [inputVal, isProcessing, awaitingClarification]);

  const handleSubmit = (e) => { e.preventDefault(); send(); };
  
  const handleRandomSuggestion = (pool) => {
    const q = pool[Math.floor(Math.random() * pool.length)];
    send(q);
  };

  /* ================================================================
     Replay Mode (Mock frontend-only sequence)
     ================================================================ */
  useEffect(() => {
    const handleReplay = (e) => {
      const entry = e.detail;
      // Setup mock replay flow
      setMessages([
        { id: crypto.randomUUID(), role: 'user', text: entry.question },
        { id: crypto.randomUUID(), role: 'assistant', text: '', streaming: true },
      ]);
      setIsProcessing(true);
      setPipelineState('processing');
      setActiveStageIdx(0);
      setCompletedStages(new Set());
      setShowMetadata(false);
      // We simulate stages for the replay
      const stages = [0, 1, 2, 3, 5, 4]; // Searching -> Retrieving -> Validating -> Decision -> KB Update -> Response
      let step = 0;
      const interval = setInterval(() => {
        if (step >= stages.length) {
          clearInterval(interval);
          setMessages(prev => {
            const copy = [...prev];
            copy[1] = { ...copy[1], text: entry.answer, streaming: false, confidence: { score: entry.confidence, mode: "replayed" } };
            return copy;
          });
          setIsProcessing(false);
          setPipelineState('completed');
          setShowMetadata(true);
          // Mark all as completed
          setActiveStageIdx(-1);
          setCompletedStages(new Set([0, 1, 2, 3, 4, 5]));
          return;
        }
        
        setActiveStageIdx(prev => {
            if (prev !== -1) {
                setCompletedStages(set => {
                    const newSet = new Set(set);
                    newSet.add(prev);
                    return newSet;
                });
            }
            return stages[step];
        });
        if (step === stages.length - 1) {
            setMessages(prev => {
              const copy = [...prev];
              copy[1] = { ...copy[1], text: entry.answer.substring(0, 15) + "..." };
              return copy;
            });
        }
        step++;
      }, 1500);
      
    };
    
    window.addEventListener('sentinel:replay', handleReplay);
    return () => window.removeEventListener('sentinel:replay', handleReplay);
  }, []);

  return (
    <section className="section workspace-section" id="workspace">
      
      {/* Header */}
      <div className="assistant-header">
        <div className="ah-left">
          <h2 className="ah-title">SENTINEL</h2>
          <span className="ah-subtitle">Enterprise Knowledge Assistant</span>
        </div>
        <div className="ah-right">
          <div className="ah-status">
            <span className={`status-dot ${!isConnected ? 'offline' : ''}`} style={!isConnected ? { background: 'var(--danger)', boxShadow: '0 0 8px var(--danger)'} : {}}></span>
            <span className="font-mono text-muted">{isConnected ? 'Ready' : 'Connecting...'}</span>
          </div>
        </div>
      </div>

      {/* Main Layout Area */}
      <div className="workspace-layout">
        <div className="workspace-content-left">
          {/* Main Conversation Area */}
          <div className="assistant-main">
        {messages.length === 0 && !isProcessing ? (
          <div className="assistant-empty-state">
            <div className="empty-logo shield-logo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ fill: 'rgba(59, 130, 246, 0.2)' }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
            </div>
            <h2>SENTINEL is standing by</h2>
            <p className="empty-prompt text-muted" style={{ maxWidth: '400px', margin: '1rem auto 2.5rem', lineHeight: '1.5', fontSize: '0.95rem' }}>
              Ask a question about the EdTech platform. If I don't know the answer, I'll learn it from you.
            </p>
            
            <div className="suggestion-chips">
              <button onClick={() => handleRandomSuggestion(KNOWN_QUESTIONS)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                Known Question
              </button>
              <button onClick={() => handleRandomSuggestion(SYNTHESIS_QUESTIONS)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>
                Trigger Synthesis
              </button>
              <button onClick={() => handleRandomSuggestion(AMBIGUOUS_QUESTIONS)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Low Confidence
              </button>
            </div>
          </div>
        ) : (
          <div className="chat-area custom-scrollbar">
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={`chat-bubble-container ${msg.role === 'user' ? 'user' : 'assistant'}`}>
                <div className="chat-bubble">
                  {msg.role !== 'user' && <div className={`assistant-avatar ${msg.role === 'clarifying' ? 'clarifying-avatar' : ''}`}>
                    {msg.role === 'clarifying' ? '?' : 'S'}
                  </div>}
                  <div className="chat-content">
                    <p>{msg.text}</p>
                    {msg.streaming && <span className="streaming-cursor"></span>}
                    
                    {!msg.streaming && msg.role === 'assistant' && msg.confidence && showMetadata && (
                      <div className="message-metadata font-mono">
                        <div className="meta-item">
                          <span className="meta-label">Confidence</span>
                          <span className="meta-val" style={{color: msg.confidence.score > 0.8 ? 'var(--success)' : 'var(--warning)'}}>
                            {(msg.confidence.score * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Composer Area */}
      <div className="assistant-footer">
        
        {/* Composer */}
        <form className="composer-container" onSubmit={handleSubmit}>
          
          <input 
            type="text" 
            className="composer-input" 
            placeholder={!isConnected ? "Connecting..." : awaitingClarification ? "Answer SENTINEL's clarification..." : "Ask SENTINEL anything..."}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            disabled={!isConnected || isProcessing}
          />
          
          <button type="submit" className="composer-send" disabled={!isConnected || isProcessing || !inputVal.trim()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </form>

        <div className={`active-pipeline-container state-${pipelineState}`}>
          <div className="pipeline-track">
            {DISPLAY_STAGES.map((stage, idx) => {
              let statusClass = "future";
              
              if (pipelineState === 'idle' || pipelineState === 'completed' && !completedStages.has(idx)) {
                 statusClass = "waiting";
              } else if (pipelineState === 'failed') {
                 statusClass = idx <= activeStageIdx ? "failed" : "waiting";
              } else {
                 if (completedStages.has(idx)) statusClass = "completed";
                 if (idx === activeStageIdx) {
                    if (pipelineState === 'supervisor_wait') statusClass = "supervisor-wait";
                    else statusClass = "running";
                 }
                 if (!completedStages.has(idx) && idx > activeStageIdx) statusClass = "waiting";
              }

              return (
                <React.Fragment key={stage}>
                  <div className={`pipeline-node ${statusClass}`}>
                    <span className="node-icon"></span>
                    <span className="node-label font-mono">{stage}</span>
                  </div>
                  {idx < DISPLAY_STAGES.length - 1 && (
                    <div className={`pipeline-edge ${completedStages.has(idx) ? 'completed' : ''}`}>
                       {idx === activeStageIdx && pipelineState === 'processing' && <div className="packet-anim"></div>}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>

    {/* Right Sidebar */}
        <div className="workspace-sidebar-right custom-scrollbar">
          <div className="sidebar-section">
            <h3 className="sidebar-section-title">Overview</h3>
            <div className="overview-metrics">
              <div className="metric-row"><span className="metric-label">Questions Asked</span><span className="metric-value">{metrics.asked}</span></div>
              <div className="metric-row"><span className="metric-label">Answered From KB</span><span className="metric-value">{metrics.kb}</span></div>
              <div className="metric-row"><span className="metric-label">Synthesized</span><span className="metric-value">{metrics.synth}</span></div>
              <div className="metric-row"><span className="metric-label">Average Confidence</span><span className="metric-value">{metrics.countConf ? Math.round(metrics.sumConf / metrics.countConf) : 0}%</span></div>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="admin-toast" style={{ borderColor: toast.type === 'success' ? 'var(--success)' : 'var(--warning)' }}>
          {toast.msg}
        </div>
      )}

    </section>
  );
}
