'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const Groq = require('groq-sdk');

let groqClients = [];
let currentClientIndex = 0;
let isRecording = false;
let sessionStartTime = null;
let recordingProcess = null;
let available = false;
let retryCount = 0;

function log(level, message, data) {
  try {
    process.send({ type: 'log', level, message, data: data || {} });
  } catch (_) {
    process.stderr.write(`[speech-worker] ${level}: ${message} ${JSON.stringify(data || {})}\n`);
  }
}

function initialize(config) {
  try {
    if (!config.groqKeys || config.groqKeys.length === 0) {
      available = false;
      process.send({ type: 'init-result', available: false, reason: 'Missing GROQ_API_KEY' });
      return;
    }

    groqClients = config.groqKeys.map(key => new Groq({ apiKey: key }));

    // Auto-select Key 2 (index 1) for voice if available, else fallback to index 0
    currentClientIndex = groqClients.length > 1 ? 1 : 0;

    available = true;
    log('info', 'Groq SDK initialized in worker', { keyCount: groqClients.length, startingIndex: currentClientIndex });
    process.send({ type: 'init-result', available: true });
  } catch (error) {
    available = false;
    log('error', 'Failed to initialize Groq SDK', { error: error.message });
    process.send({ type: 'init-result', available: false, reason: error.message });
  }
}

function cleanup() {
  if (recordingProcess) {
    try { recordingProcess.kill('SIGKILL'); } catch (_) { }
    recordingProcess = null;
  }
}

async function runRecordingLoop() {
  if (!isRecording) return;

  const tempWavPath = path.join(__dirname, 'temp_audio.wav');
  const isWindows = process.platform === 'win32';
  const cmd = 'sox';
  let args = [];

  // sox format arguments: raw PCM, 16kHz, 16-bit, mono
  // we wait for 0.1s of sound > 1%, then stop after 0.9s of silence < 1%
  const formatArgs = ['-b', '16', '-e', 'signed', '-c', '1', '-r', '16000', tempWavPath, 'silence', '1', '0.1', '1%', '1', '0.99', '1%'];

  if (isWindows) {
    args = ['-t', 'waveaudio', 'default', '-q', ...formatArgs];
  } else {
    args = ['-d', '-q', ...formatArgs];
  }

  recordingProcess = spawn(cmd, args);

  recordingProcess.on('error', (error) => {
    log('error', 'Failed to spawn sox', { error: error.message });
    if (isRecording) {
      process.send({ type: 'error', error: `Microphone capture failed (sox error): ${error.message}` });
      stopRecording();
    }
  });

  recordingProcess.on('close', async (code) => {
    recordingProcess = null;

    if (!isRecording) return;

    if (code !== 0 && code !== null) {
      log('warn', `sox exited with code ${code}`);
    }

    // Process the file
    try {
      if (fs.existsSync(tempWavPath)) {
        const stats = fs.statSync(tempWavPath);
        if (stats.size > 2000) { // Check if it's not basically empty (WAV headers are ~44 bytes)
          log('debug', 'Uploading audio to Groq Whisper...', { size: stats.size });

          process.send({ type: 'interim-transcription', text: 'Transcribing...' });

          const transcription = await groqClients[currentClientIndex].audio.transcriptions.create({
            file: fs.createReadStream(tempWavPath),
            model: 'whisper-large-v3-turbo',
            response_format: 'text',
            language: 'en'
          });

          if (transcription && transcription.trim().length > 0) {
            const dur = Date.now() - sessionStartTime;
            log('info', 'Final transcription', { text: transcription.trim(), sessionDuration: `${dur}ms` });
            process.send({ type: 'transcription', text: transcription.trim() });
          }
        }
      }
    } catch (err) {
      log('error', 'Groq transcription failed', { error: err.message });

      // If we hit a rate limit, rotate to the next key automatically
      if (err.status === 429 || (err.message && err.message.includes('429'))) {
        currentClientIndex = (currentClientIndex + 1) % groqClients.length;
        log('warn', `Rate limit hit! Rotating to API Key Index ${currentClientIndex}`);
      }

      // We don't stop recording on API error, we just keep looping unless it's fatal
    }

    // Loop!
    if (isRecording) {
      setTimeout(() => runRecordingLoop(), 10);
    }
  });
}

function startRecording() {
  if (!available) {
    process.send({ type: 'error', error: 'Groq API not initialized' });
    return;
  }
  if (isRecording) {
    log('warn', 'Recording already in progress');
    return;
  }
  isRecording = true;
  sessionStartTime = Date.now();
  retryCount = 0;
  process.send({ type: 'recording-started' });
  process.send({ type: 'session-started', sessionId: 'groq-' + Date.now() });

  cleanup();
  runRecordingLoop();
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  cleanup();

  const dur = sessionStartTime ? Date.now() - sessionStartTime : 0;
  log('info', 'Stopping speech recognition', { sessionDuration: `${dur}ms` });

  process.send({ type: 'recording-stopped' });
  process.send({ type: 'session-stopped', sessionId: 'groq-' + Date.now() });
}

function getStatus() {
  return {
    isRecording,
    isInitialized: available,
    available,
    sessionDuration: sessionStartTime ? Date.now() - sessionStartTime : 0,
    retryCount
  };
}

function testConnection() {
  if (!available) {
    process.send({ type: 'test-result', success: false, message: 'Groq not initialized' });
    return;
  }
  process.send({ type: 'test-result', success: true, message: 'Connection test successful' });
}

process.on('message', (msg) => {
  try {
    switch (msg.type) {
      case 'init': initialize(msg.config); break;
      case 'start': startRecording(); break;
      case 'stop': stopRecording(); break;
      case 'test': testConnection(); break;
      case 'status': process.send({ type: 'status', status: getStatus() }); break;
      case 'shutdown':
        stopRecording();
        log('info', 'Worker shutting down');
        setTimeout(() => process.exit(0), 500);
        break;
      default: log('warn', `Unknown message type: ${msg.type}`);
    }
  } catch (error) {
    log('error', `Error handling message ${msg.type}`, { error: error.message });
    process.send({ type: 'error', error: `Worker error: ${error.message}` });
  }
});

process.on('SIGTERM', () => {
  stopRecording();
  process.exit(0);
});
process.on('uncaughtException', (error) => {
  log('error', 'Uncaught exception in speech worker', { error: error.message });
});
process.on('unhandledRejection', (reason) => {
  log('error', 'Unhandled rejection in speech worker', { error: String(reason) });
});
log('info', 'Speech worker process started (Groq Whisper)', { pid: process.pid });
