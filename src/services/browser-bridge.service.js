const { EventEmitter } = require('events');
const { WebSocketServer, WebSocket } = require('ws');
const logger = require('../core/logger').createServiceLogger('BROWSER_BRIDGE');

const HOST = '127.0.0.1';
const PORT = 17321;
const TOKEN = 'oc_local_7f86c1d293b74b5eb8ae3fd4';
const ALLOWED_ORIGINS = [
  /^chrome-extension:\/\/[a-z]{32}$/i
];

const PUBLIC_CHANNELS = new Set([
  'call-copilot-status',
  'live-screen-status',
  'transcription-received',
  'interim-transcription',
  'transcription-llm-response-start',
  'transcription-llm-response-chunk',
  'transcription-llm-response',
  'llm-response',
  'llm-error',
  'ocr-error',
  'session-cleared'
]);

const ALLOWED_COMMANDS = new Set([
  'toggle-live-screen',
  'toggle-call-copilot',
  'send-chat-message',
  'get-status'
]);

class BrowserBridgeService extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.clients = new Set();
  }

  start() {
    if (this.server) return;
    this.server = new WebSocketServer({
      host: HOST,
      port: PORT,
      verifyClient: ({ req }) => {
        try {
          const url = new URL(req.url, `ws://${HOST}:${PORT}`);
          const origin = String(req.headers.origin || '');
          return ALLOWED_ORIGINS.some(pattern => pattern.test(origin)) &&
            url.searchParams.get('token') === TOKEN;
        } catch (_) {
          return false;
        }
      }
    });

    this.server.on('connection', socket => {
      this.clients.add(socket);
      socket.send(JSON.stringify({ type: 'ready', version: 1 }));
      socket.on('message', raw => this.handleMessage(socket, raw));
      socket.on('close', () => this.clients.delete(socket));
      socket.on('error', error => {
        logger.warn('Browser overlay client error', { error: error.message });
      });
    });
    this.server.on('listening', () => {
      logger.info('Browser overlay bridge listening', { host: HOST, port: PORT });
    });
    this.server.on('error', error => {
      logger.error('Browser overlay bridge failed', { error: error.message });
    });
  }

  handleMessage(socket, raw) {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch (_) {
      return;
    }
    if (message?.type !== 'command' || !ALLOWED_COMMANDS.has(message.command)) return;
    const requestId = String(message.requestId || '');
    const respond = result => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: 'command-result', requestId, result }));
    };
    this.emit('command', {
      command: message.command,
      payload: message.payload || {},
      respond
    });
  }

  broadcastChannel(channel, data) {
    if (!PUBLIC_CHANNELS.has(channel)) return;
    this.broadcast({ type: 'event', channel, data });
  }

  broadcast(message) {
    const serialized = JSON.stringify(message);
    this.clients.forEach(socket => {
      if (socket.readyState === WebSocket.OPEN) socket.send(serialized);
    });
  }

  stop() {
    this.clients.forEach(socket => {
      try { socket.close(); } catch (_) {}
    });
    this.clients.clear();
    if (this.server) {
      try { this.server.close(); } catch (_) {}
      this.server = null;
    }
  }
}

module.exports = new BrowserBridgeService();
module.exports.CONNECTION = { host: HOST, port: PORT, token: TOKEN };
