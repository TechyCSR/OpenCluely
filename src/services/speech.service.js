/**
 * speech.service.js — Thin IPC wrapper that delegates all Azure Speech SDK
 * work to speech-worker.js (a forked child process).
 *
 * Why:  The Azure Speech SDK's native networking uses a TLS stack that
 *       conflicts with Electron/Chromium's boringssl, producing
 *       CERTIFICATE_VERIFY_FAILED errors and crashing the app on Alt+R.
 *       By running the SDK in a pure Node child process we avoid
 *       Chromium's socket layer entirely.
 */

const { fork } = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');
const logger = require('../core/logger').createServiceLogger('SPEECH');
const config = require('../core/config');

class SpeechService extends EventEmitter {
  constructor() {
    super();
    this.worker = null;
    this.isRecording = false;
    this.available = false;
    this._workerReady = false;
    this._pendingStatusCallbacks = [];
    this._lastStatus = {
      isRecording: false,
      isInitialized: false,
      sessionDuration: 0,
      retryCount: 0
    };

    this._spawnWorker();
  }

  // ── Worker lifecycle ──────────────────────────────────────────────────

  _spawnWorker() {
    const workerPath = path.join(__dirname, '../../speech-worker.js');

    try {
      this.worker = fork(workerPath, [], {
        // No special env manipulation — pure Node TLS
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        // Ensure the worker doesn't inherit Electron's altered env
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1'  // Forces pure Node.js mode
        }
      });

      this.worker.on('message', (msg) => this._handleWorkerMessage(msg));

      this.worker.on('error', (err) => {
        logger.error('Speech worker process error', { error: err.message });
        this.available = false;
        this.isRecording = false;
        this.emit('error', `Speech worker error: ${err.message}`);
      });

      this.worker.on('exit', (code, signal) => {
        logger.warn('Speech worker exited', { code, signal });
        this._workerReady = false;
        this.isRecording = false;

        // Auto-restart the worker after a short delay (unless the app is quitting)
        if (!this._shuttingDown) {
          setTimeout(() => {
            logger.info('Restarting speech worker');
            this._spawnWorker();
          }, 2000);
        }
      });

      // Capture worker stdout/stderr for logging
      if (this.worker.stdout) {
        this.worker.stdout.on('data', (data) => {
          logger.debug('Worker stdout: ' + data.toString().trim());
        });
      }
      if (this.worker.stderr) {
        this.worker.stderr.on('data', (data) => {
          logger.warn('Worker stderr: ' + data.toString().trim());
        });
      }

      // Send init message with credentials and config
      const groqKeyRaw = process.env.GROQ_API_KEY || '';
      const groqKey = groqKeyRaw.split(',')[0].trim();

      this.worker.send({
        type: 'init',
        config: {
          groqKey
        }
      });

      logger.info('Speech worker spawned', { pid: this.worker.pid });
    } catch (error) {
      logger.error('Failed to spawn speech worker', { error: error.message, stack: error.stack });
      this.available = false;
      this.emit('status', 'Speech recognition unavailable (worker failed to start)');
    }
  }

  _sendToWorker(message) {
    if (!this.worker || !this.worker.connected) {
      logger.warn('Cannot send to worker — not connected', { type: message.type });
      return false;
    }
    try {
      this.worker.send(message);
      return true;
    } catch (error) {
      logger.error('Error sending message to worker', { error: error.message, type: message.type });
      return false;
    }
  }

  // ── Handle messages from worker ───────────────────────────────────────

  _handleWorkerMessage(msg) {
    switch (msg.type) {
      case 'init-result':
        this.available = !!msg.available;
        this._workerReady = true;
        if (msg.available) {
          logger.info('Azure Speech service initialized in worker');
          this.emit('status', 'Azure Speech Services ready');
        } else {
          logger.warn('Speech service unavailable', { reason: msg.reason });
          this.emit('status', msg.reason || 'Speech recognition unavailable');
        }
        break;

      case 'recording-started':
        this.isRecording = true;
        this.emit('recording-started');
        break;

      case 'recording-stopped':
        this.isRecording = false;
        this.emit('recording-stopped');
        this.emit('status', 'Recording stopped');
        break;

      case 'transcription':
        this.emit('transcription', msg.text);
        break;

      case 'interim-transcription':
        this.emit('interim-transcription', msg.text);
        break;

      case 'error':
        logger.error('Speech worker reported error', { error: msg.error });
        this.emit('error', msg.error);
        break;

      case 'fatal-error':
        logger.error('Speech worker reported FATAL error — stopping gracefully', { error: msg.error });
        this.isRecording = false;
        this.emit('error', msg.error);
        this.emit('recording-stopped');
        break;

      case 'session-started':
        logger.info('Recognition session started', { sessionId: msg.sessionId });
        break;

      case 'session-stopped':
        logger.info('Recognition session ended', { sessionId: msg.sessionId });
        break;

      case 'status':
        this._lastStatus = msg.status || this._lastStatus;
        // Resolve any pending status callbacks
        while (this._pendingStatusCallbacks.length > 0) {
          const cb = this._pendingStatusCallbacks.shift();
          cb(this._lastStatus);
        }
        break;

      case 'test-result':
        // Handled by testConnection promise
        if (this._testResolve) {
          this._testResolve(msg);
          this._testResolve = null;
        }
        break;

      case 'log':
        // Forward worker logs through the service logger
        {
          const level = msg.level || 'debug';
          const logMsg = msg.message || '';
          const logData = msg.data || {};
          if (logger[level]) {
            logger[level](`[worker] ${logMsg}`, logData);
          } else {
            logger.debug(`[worker] ${logMsg}`, logData);
          }
        }
        break;

      default:
        logger.debug('Unknown worker message type', { type: msg.type });
    }
  }

  // ── Public API (matches the old SpeechService interface) ──────────────

  startRecording() {
    if (!this.available) {
      const errorMsg = 'Azure Speech client not initialized';
      logger.error(errorMsg);
      this.emit('error', errorMsg);
      return;
    }
    if (this.isRecording) {
      logger.warn('Recording already in progress');
      return;
    }
    this._sendToWorker({ type: 'start' });
  }

  stopRecording() {
    if (!this.isRecording) return;
    this._sendToWorker({ type: 'stop' });
  }

  getStatus() {
    // Return the last known status synchronously (for backward compat)
    return {
      isRecording: this.isRecording,
      isInitialized: this.available,
      sessionDuration: this._lastStatus.sessionDuration || 0,
      retryCount: this._lastStatus.retryCount || 0,
      config: config.get('speech.azure') || {}
    };
  }

  async testConnection() {
    if (!this.available) {
      return { success: false, message: 'Speech service not initialized' };
    }
    return new Promise((resolve) => {
      this._testResolve = resolve;
      const sent = this._sendToWorker({ type: 'test' });
      if (!sent) {
        resolve({ success: false, message: 'Worker not connected' });
      }
      // Timeout after 5 seconds
      setTimeout(() => {
        if (this._testResolve === resolve) {
          this._testResolve = null;
          resolve({ success: false, message: 'Test timed out' });
        }
      }, 5000);
    });
  }

  isAvailable() {
    return this.available;
  }

  // ── Shutdown ──────────────────────────────────────────────────────────

  shutdown() {
    this._shuttingDown = true;
    if (this.worker && this.worker.connected) {
      this._sendToWorker({ type: 'shutdown' });
      // Give the worker a moment, then force-kill
      setTimeout(() => {
        if (this.worker && !this.worker.killed) {
          this.worker.kill();
        }
      }, 2000);
    }
  }
}

module.exports = new SpeechService();