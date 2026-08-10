const { EventEmitter } = require('events');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const logger = require('../core/logger').createServiceLogger('GEMINI_LIVE');

class GeminiLiveService extends EventEmitter {
  constructor() {
    super();
    this.session = null;
    this.connecting = null;
    this.connected = false;
    this.inputTranscript = '';
    this.outputTranscript = '';
    this.accessToken = '';
    this.accessTokenExpiresAt = 0;
  }

  getConfig() {
    return {
      project: process.env.GOOGLE_CLOUD_PROJECT || '',
      location: process.env.GOOGLE_CLOUD_LOCATION || 'europe-west4',
      model: process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio'
    };
  }

  async connect() {
    if (this.connected && this.session) return this.getStatus();
    if (this.connecting) return this.connecting;

    const { project, location, model } = this.getConfig();
    if (!project) {
      throw new Error('GOOGLE_CLOUD_PROJECT is required for Gemini Live');
    }
    this.connecting = (async () => {
      const token = await this.getAccessToken();
      const url = `wss://${location}-aiplatform.googleapis.com/ws/` +
        'google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent';
      const setup = {
        setup: {
          model: `projects/${project}/locations/${location}/publishers/google/models/${model}`,
          generationConfig: {
            responseModalities: ['AUDIO']
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: {
            role: 'system',
            parts: [{
              text: [
                'You are a silent, real-time copilot for a consented call.',
                'Listen to the other participant and help the user respond across any subject.',
                'After each natural turn, produce a concise useful response.',
                'For a question, give the direct answer the user can say.',
                'For an objection or request, suggest a natural reply.',
                'For explanatory speech, summarize the useful point in one sentence.',
                'Answer from first principles. Use simple sentences.',
                'When screen frames are provided, use the visible screen as context for the spoken conversation.',
                'Be intent-driven: infer the exact active objective before responding.',
                'For a visible coding challenge, proactively anchor its statement, required output, constraints, examples, signature, and existing code.',
                'Use this answer structure when technical help is requested: intent, approach, correctness idea, walkthrough, exact code, complexity, edge cases.',
                'A scroll, editor change, popup, or brief unrelated speech refines or detours from the task; it does not replace the task.',
                'Do not guess unreadable constraints. State the uncertainty and use later frames to complete the task model.',
                'When code is visible, act as a senior coding mentor, not a screen describer.',
                'Identify the language and explain what the code does, including important syntax.',
                'Find correctness bugs, edge cases, complexity problems, and maintainability issues.',
                'Recommend specific improvements and show corrected code when that is useful.',
                'If a coding problem statement is visible, derive the solution and explain the algorithm and complexity.',
                'A spoken question always takes priority. Answer it using the latest visible code and screen context.',
                'Maintain an active-task anchor and a short stack of temporary conversational detours.',
                'A single unrelated social question is a detour, not a task change.',
                'Answer the detour briefly while preserving the active task, code, approach, and last unfinished step.',
                'When the user says continue, go back, resume, or asks another task-related question, resume the anchored task.',
                'Only replace the active task when the user explicitly switches tasks or clearly works on a new task for multiple turns.',
                'Never reveal private chain-of-thought. Provide concise conclusions and useful reasoning instead.',
                'Do not merely list visible UI elements or repeat code without explaining it.',
                'Never say that you are listening, never ask the user to provide a question,',
                'and never output SILENT. Be concise for calls, but use up to 250 words when technical detail is needed.'
              ].join(' ')
            }]
          }
        }
      };

      await new Promise((resolve, reject) => {
        let settled = false;
        const socket = new WebSocket(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-goog-user-project': project
          }
        });
        this.session = socket;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          socket.close();
          reject(new Error('Gemini Live setup timed out'));
        }, 15000);

        socket.on('open', () => {
          logger.info('Vertex Gemini Live socket opened', { project, location, model });
          socket.send(JSON.stringify(setup));
        });
        socket.on('message', data => {
          let message;
          try {
            message = JSON.parse(data.toString());
          } catch (_) {
            return;
          }
          if (!settled && message.setupComplete !== undefined) {
            settled = true;
            clearTimeout(timeout);
            resolve();
            return;
          }
          this.handleMessage(message);
        });
        socket.on('error', error => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(error);
          } else {
            this.handleError(error);
          }
        });
        socket.on('close', (code, reason) => {
          const event = { code, reason: reason?.toString() || '' };
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(new Error(
              event.reason || `Gemini Live socket closed during setup (${code})`
            ));
          } else {
            this.handleClose(event);
          }
        });
      });

      this.connected = true;
      this.emit('connected', this.getStatus());
      logger.info('Vertex Gemini Live session connected', { project, location, model });
      return this.getStatus();
    })();

    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  sendAudio(buffer) {
    if (!this.connected ||
        !this.session ||
        this.session.readyState !== WebSocket.OPEN ||
        !buffer?.length) return false;
    try {
      this.session.send(JSON.stringify({
        realtimeInput: {
          audio: {
            data: buffer.toString('base64'),
            mimeType: 'audio/pcm;rate=16000'
          }
        }
      }));
      return true;
    } catch (error) {
      this.handleError(error);
      return false;
    }
  }

  sendVideoFrame(buffer, mimeType = 'image/jpeg') {
    if (!this.connected ||
        !this.session ||
        this.session.readyState !== WebSocket.OPEN ||
        !buffer?.length) return false;
    try {
      this.session.send(JSON.stringify({
        realtimeInput: {
          video: {
            data: buffer.toString('base64'),
            mimeType
          }
        }
      }));
      return true;
    } catch (error) {
      this.handleError(error);
      return false;
    }
  }

  sendRealtimeText(text) {
    if (!this.connected ||
        !this.session ||
        this.session.readyState !== WebSocket.OPEN ||
        !String(text || '').trim()) return false;
    try {
      this.session.send(JSON.stringify({
        realtimeInput: {
          text: String(text).trim()
        }
      }));
      return true;
    } catch (error) {
      this.handleError(error);
      return false;
    }
  }

  sendContext(text) {
    if (!this.connected ||
        !this.session ||
        this.session.readyState !== WebSocket.OPEN ||
        !String(text || '').trim()) return false;
    try {
      this.session.send(JSON.stringify({
        clientContent: {
          turns: [{
            role: 'user',
            parts: [{ text: String(text).trim() }]
          }],
          turnComplete: false
        }
      }));
      return true;
    } catch (error) {
      this.handleError(error);
      return false;
    }
  }

  sendTextTurn(text) {
    if (!this.connected ||
        !this.session ||
        this.session.readyState !== WebSocket.OPEN ||
        !String(text || '').trim()) return false;
    try {
      this.session.send(JSON.stringify({
        clientContent: {
          turns: [{
            role: 'user',
            parts: [{ text: String(text).trim() }]
          }],
          turnComplete: true
        }
      }));
      return true;
    } catch (error) {
      this.handleError(error);
      return false;
    }
  }

  disconnect() {
    const session = this.session;
    this.session = null;
    this.connected = false;
    this.connecting = null;
    this.inputTranscript = '';
    this.outputTranscript = '';
    try {
      if (session?.readyState === WebSocket.OPEN) {
        session.send(JSON.stringify({
          realtimeInput: { audioStreamEnd: true }
        }));
      }
    } catch (_) {
      // The socket may already be closed.
    }
    try {
      session?.close(1000);
    } catch (_) {
      // The socket may already be closed.
    }
    this.emit('disconnected', this.getStatus());
    logger.info('Vertex Gemini Live session disconnected');
    return this.getStatus();
  }

  handleMessage(message) {
    const content = message?.serverContent;
    if (!content) return;

    if (content.interrupted) {
      this.outputTranscript = '';
      this.emit('interrupted');
    }

    const inputText = content.inputTranscription?.text;
    if (inputText) {
      this.inputTranscript += inputText;
      this.emit('input-transcription', inputText);
    }

    const outputText = content.outputTranscription?.text ||
      (content.modelTurn?.parts || []).map(part => part?.text || '').join('');
    if (outputText) {
      this.outputTranscript += outputText;
      this.emit('response-delta', outputText);
    }

    if (content.turnComplete) {
      const turn = {
        input: this.inputTranscript.trim(),
        response: this.outputTranscript.trim()
      };
      this.inputTranscript = '';
      this.outputTranscript = '';
      this.emit('turn-complete', turn);
    }
  }

  handleError(error) {
    const normalized = error instanceof Error
      ? error
      : new Error(error?.message || String(error || 'Gemini Live error'));
    logger.error('Vertex Gemini Live error', { error: normalized.message });
    this.emit('service-error', normalized);
  }

  handleClose(event) {
    const wasConnected = this.connected;
    this.session = null;
    this.connected = false;
    if (wasConnected) {
      logger.warn('Vertex Gemini Live socket closed', {
        code: event?.code,
        reason: event?.reason || ''
      });
      this.emit('disconnected', this.getStatus());
    }
  }

  async getAccessToken() {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 60000) {
      return this.accessToken;
    }

    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json');
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    if (credentials.type !== 'authorized_user' ||
        !credentials.client_id ||
        !credentials.client_secret ||
        !credentials.refresh_token) {
      throw new Error(
        'Gemini Live requires local user ADC from gcloud auth application-default login'
      );
    }

    const body = new URLSearchParams({
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: credentials.refresh_token,
      grant_type: 'refresh_token'
    });
    const payload = await new Promise((resolve, reject) => {
      const encoded = body.toString();
      const request = https.request({
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(encoded)
        }
      }, response => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { raw += chunk; });
        response.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch (_) {
            reject(new Error(`ADC token refresh returned HTTP ${response.statusCode}`));
            return;
          }
          if (response.statusCode < 200 ||
              response.statusCode >= 300 ||
              !parsed.access_token) {
            reject(new Error(
              parsed.error_description || parsed.error || 'ADC token refresh failed'
            ));
            return;
          }
          resolve(parsed);
        });
      });
      request.on('error', reject);
      request.setTimeout(10000, () => {
        request.destroy(new Error('ADC token refresh timed out'));
      });
      request.end(encoded);
    });

    this.accessToken = payload.access_token;
    this.accessTokenExpiresAt = Date.now() + (Number(payload.expires_in) || 3600) * 1000;
    return this.accessToken;
  }

  getStatus() {
    return {
      connected: this.connected,
      ...this.getConfig()
    };
  }
}

module.exports = new GeminiLiveService();
