'use strict';

const https = require('https');
const { EventEmitter } = require('events');

const DEFAULT_KEYTERMS = ['Kafka', 'Kubernetes', 'HPA', 'microservices'];
const LOOPBACK_MIN_RMS = 0.0008;
const DEEPGRAM_SPACE_SILENCE_MS = 700;
const DEEPGRAM_SPACE_MAX_WAIT_MS = 2000;
const LIVE_HOST = 'wss://api.deepgram.com/v1/listen';
const REST_HOST = 'https://api.deepgram.com/v1/listen';

function defaultKeyterms() {
  return DEFAULT_KEYTERMS.slice();
}

function buildQuery(options = {}) {
  const params = new URLSearchParams();
  params.set('model', options.model || 'nova-3');
  params.set('language', options.language || 'en');
  params.set('punctuate', 'true');
  params.set('smart_format', 'true');
  if (options.encoding !== false) {
    params.set('encoding', options.encoding || 'linear16');
  }
  params.set('sample_rate', String(options.sampleRate || 16000));
  params.set('channels', String(options.channels || 1));
  if (options.interim !== false) {
    params.set('interim_results', 'true');
  }
  if (options.endpointing != null) {
    params.set('endpointing', String(options.endpointing));
  }
  if (options.utteranceEndMs != null) {
    params.set('utterance_end_ms', String(options.utteranceEndMs));
  }
  const keyterms = Array.isArray(options.keyterms) && options.keyterms.length
    ? options.keyterms
    : defaultKeyterms();
  for (const term of keyterms) {
    if (term) params.append('keyterm', String(term));
  }
  return params.toString();
}

function buildListenUrl(options = {}) {
  return `${LIVE_HOST}?${buildQuery({
    endpointing: options.endpointing != null ? options.endpointing : 800,
    utteranceEndMs: options.utteranceEndMs != null ? options.utteranceEndMs : 1200,
    ...options
  })}`;
}

function buildPrerecordedUrl(options = {}) {
  const asWav = options.asWav !== false;
  return `${REST_HOST}?${buildQuery({
    ...options,
    interim: false,
    endpointing: undefined,
    utteranceEndMs: undefined,
    encoding: asWav ? false : (options.encoding || 'linear16')
  })}`;
}

function extractTranscript(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (payload.channel && Array.isArray(payload.channel.alternatives)) {
    return String((payload.channel.alternatives[0] && payload.channel.alternatives[0].transcript) || '').trim();
  }
  const channels = payload.results && payload.results.channels;
  if (Array.isArray(channels) && channels[0] && Array.isArray(channels[0].alternatives)) {
    return String((channels[0].alternatives[0] && channels[0].alternatives[0].transcript) || '').trim();
  }
  return '';
}

function formatSpaceLogLine({
  source,
  provider = 'deepgram',
  bufferMs = 0,
  rms = 0,
  transcript = ''
} = {}) {
  const rmsText = Number.isFinite(Number(rms)) ? Number(rms).toFixed(4) : '0.0000';
  const ms = Number.isFinite(Number(bufferMs)) ? Math.round(Number(bufferMs)) : 0;
  const text = String(transcript || '').replace(/\s+/g, ' ').trim();
  return `source=${source || 'mic'} provider=${provider || 'deepgram'} bufferMs=${ms} rms=${rmsText} transcript=${text}`;
}

function loadWebSocket() {
  try {
    return require('ws');
  } catch (error) {
    throw new Error(`Deepgram live STT needs the ws package: ${error.message}`);
  }
}

function pcmToWav(rawPcm, sampleRate = 16000) {
  const pcm = Buffer.isBuffer(rawPcm) ? rawPcm : Buffer.from(rawPcm || []);
  const header = Buffer.alloc(44);
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function transcribePrerecorded(pcm, options = {}) {
  const apiKey = String(options.apiKey || '').trim();
  if (!apiKey) {
    return Promise.reject(new Error('Deepgram API key missing'));
  }
  const raw = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm || []);
  const body = options.asWav === false ? raw : pcmToWav(raw, options.sampleRate || 16000);
  const url = options.url || buildPrerecordedUrl(options);

  if (typeof options.fetchImpl === 'function') {
    return Promise.resolve(options.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': options.asWav === false ? 'application/octet-stream' : 'audio/wav'
      },
      body
    })).then((res) => {
      if (res && typeof res.json === 'function') {
        return res.json().then((json) => extractTranscript(json));
      }
      return extractTranscript(res);
    });
  }

  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      reject(error);
      return;
    }
    const req = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': options.asWav === false ? 'application/octet-stream' : 'audio/wav',
        'Content-Length': body.length
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Deepgram prerecorded HTTP ${res.statusCode}: ${rawBody.slice(0, 180)}`));
          return;
        }
        try {
          resolve(extractTranscript(JSON.parse(rawBody)));
        } catch (error) {
          reject(new Error(`Deepgram prerecorded parse failed (${res.statusCode || 'no-status'}): ${error.message}`));
        }
      });
    });
    req.on('error', (error) => {
      reject(new Error(`Deepgram prerecorded network: ${error && error.message}`));
    });
    req.write(body);
    req.end();
  });
}

class DeepgramLiveClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.apiKey = String(options.apiKey || '').trim();
    this.WebSocketImpl = options.WebSocketImpl || null;
    this.url = options.url || buildListenUrl(options);
    this.ws = null;
    this.open = false;
    this._queue = [];
    this._keepAliveTimer = null;
    this._intentionalClose = false;
  }

  connect() {
    if (this.ws) {
      return this;
    }
    if (!this.apiKey) {
      const error = new Error('Deepgram API key missing');
      this.emit('error', error);
      return this;
    }
    const Impl = this.WebSocketImpl || loadWebSocket();
    this._intentionalClose = false;
    this.ws = new Impl(this.url, {
      headers: {
        Authorization: `Token ${this.apiKey}`
      }
    });
    this.ws.on('open', () => {
      this.open = true;
      this._flushQueue();
      this._armKeepAlive();
      this.emit('open');
    });
    this.ws.on('message', (data) => {
      const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (_) {
        return;
      }
      this.emit('message', msg);
    });
    this.ws.on('error', (error) => {
      this.emit('error', error);
    });
    this.ws.on('close', (code, reason) => {
      this.open = false;
      this._clearKeepAlive();
      this.ws = null;
      this.emit('close', code, reason);
    });
    return this;
  }

  sendPcm(buffer) {
    if (!buffer || !buffer.length) {
      return false;
    }
    const chunk = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    if (!this.open || !this.ws || this.ws.readyState !== 1) {
      this._queue.push(chunk);
      if (this._queue.length > 80) {
        this._queue.shift();
      }
      return false;
    }
    try {
      this.ws.send(chunk, { binary: true });
    } catch (error) {
      this.emit('error', error);
      return false;
    }
    return true;
  }

  close() {
    this._intentionalClose = true;
    this._clearKeepAlive();
    this._queue = [];
    this.open = false;
    if (this.ws) {
      try {
        if (typeof this.ws.send === 'function' && this.ws.readyState === 1) {
          this.ws.send(JSON.stringify({ type: 'CloseStream' }));
        }
      } catch (_) { /* ignore */ }
      try {
        this.ws.close();
      } catch (_) { /* ignore */ }
      this.ws = null;
    }
  }

  _flushQueue() {
    if (!this.open || !this.ws) return;
    while (this._queue.length) {
      const chunk = this._queue.shift();
      try {
        this.ws.send(chunk);
      } catch (_) {
        break;
      }
    }
  }

  _armKeepAlive() {
    this._clearKeepAlive();
    this._keepAliveTimer = setInterval(() => {
      if (!this.open || !this.ws || this.ws.readyState !== 1) return;
      try {
        this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
      } catch (_) { /* ignore */ }
    }, 8000);
    if (this._keepAliveTimer.unref) this._keepAliveTimer.unref();
  }

  _clearKeepAlive() {
    if (this._keepAliveTimer) {
      clearInterval(this._keepAliveTimer);
      this._keepAliveTimer = null;
    }
  }
}

module.exports = {
  DeepgramLiveClient,
  buildListenUrl,
  buildPrerecordedUrl,
  buildQuery,
  extractTranscript,
  formatSpaceLogLine,
  transcribePrerecorded,
  DEFAULT_KEYTERMS,
  LOOPBACK_MIN_RMS,
  DEEPGRAM_SPACE_SILENCE_MS,
  DEEPGRAM_SPACE_MAX_WAIT_MS
};
