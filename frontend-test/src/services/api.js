const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';
const API_KEY = import.meta.env.VITE_API_KEY || '';

/**
 * Standard HTTP fetch wrapper with timeout, error handling, and headers
 */
export async function apiFetch(endpoint, options = {}) {
  const { timeout = 8000, ...fetchOptions } = options;
  
  const headers = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers
  };
  
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal
    });
    
    clearTimeout(id);
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  }
}

/**
 * Chat WebSocket Service
 */
export class ChatService {
  constructor(sessionId, callbacks) {
    this.sessionId = sessionId;
    this.callbacks = callbacks;
    this.ws = null;
    this.reconnectTimer = null;
    this.isConnected = false;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    let url = `${WS_URL}/ws/${this.sessionId}`;
    if (API_KEY) url += `?api_key=${encodeURIComponent(API_KEY)}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.isConnected = true;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (this.callbacks.onConnect) this.callbacks.onConnect();
    };

    this.ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (this.callbacks.onMessage) this.callbacks.onMessage(data);
      } catch (err) {
        console.error("Failed to parse WS message", err);
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.ws = null;
      if (this.callbacks.onDisconnect) this.callbacks.onDisconnect();
      
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = () => {
      if (this.ws) this.ws.close();
    };
  }

  sendMessage(text, msgType = 'user_msg') {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: msgType, message: text }));
    } else {
      console.error("WebSocket is not connected");
    }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      // Avoid auto-reconnect trigger by clearing callback before close
      this.ws.onclose = null;
      this.ws.close();
    }
  }
}
