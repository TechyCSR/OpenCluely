/**
 * speech-worker.js — Pure Node.js worker for Azure Speech SDK
 *
 * This file runs as a forked child process (child_process.fork) so that
 * the Azure Speech SDK's native networking uses Node's TLS stack instead
 * of Electron/Chromium's boringssl, which was causing CERTIFICATE_VERIFY_FAILED
 * errors and crashing the app when Alt+R was pressed.
 *
 * Audio capture: Uses `child_process.spawn` to capture audio via `sox`.
 * On Windows it uses `-t waveaudio default`, and on other platforms `-d`.
 * The raw PCM stream is written into the Azure SDK's PushAudioInputStream.
 *
 * Communication with the main process is via IPC messages:
 *   Main → Worker:  { type: 'start' | 'stop' | 'test' | 'status' | 'init', ... }
 *   Worker → Main:  { type: 'recording-started' | 'recording-stopped' | 'transcription'
 *                           | 'interim-transcription' | 'error' | 'status' | 'canceled'
 *                           | 'session-started' | 'session-stopped' | 'init-result'
 *                           | 'log', ... }
 */

'use strict';

// ── Deps ────────────────────────────────────────────────────────────────
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { spawn } = require('child_process');

// ── State ───────────────────────────────────────────────────────────────
let recognizer = null;
let pushStream = null;
let audioConfig = null;
let speechConfig = null;
let recordingProcess = null;
let isRecording = false;
let sessionStartTime = null;
let retryCount = 0;
const maxRetries = 3;
let _audioDataLogged = false;
let available = false;

// ── Logging helper (sends to main process) ──────────────────────────────
function log(level, message, data) {
  try {
    process.send({ type: 'log', level, message, data: data || {} });
  } catch (_) {
    // If IPC is broken, just write to stderr so we don't lose the info
    process.stderr.write(`[speech-worker] ${level}: ${message} ${JSON.stringify(data || {})}\n`);
  }
}

// ── Initialisation ──────────────────────────────────────────────────────
function initialize(config) {
  try {
    const subscriptionKey = config.subscriptionKey;
    const region = config.region;

    if (!subscriptionKey || !region) {
      available = false;
      process.send({ type: 'init-result', available: false, reason: 'Missing Azure Speech credentials' });
      return;
    }

    speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);

    // Language & output format
    const lang = (config.azure && config.azure.language) || 'en-US';
    speechConfig.speechRecognitionLanguage = lang;
    speechConfig.outputFormat = sdk.OutputFormat.Detailed;

    // Timeouts
    speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, '5000');
    speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, '2000');
    speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, '2000');

    if (config.azure && config.azure.enableDictation) {
      speechConfig.enableDictation();
    }
    if (config.azure && config.azure.enableAudioLogging) {
      speechConfig.enableAudioLogging();
    }

    available = true;
    log('info', 'Azure Speech service initialized in worker', { region, language: lang });
    process.send({ type: 'init-result', available: true });
  } catch (error) {
    available = false;
    log('error', 'Failed to initialize Azure Speech client in worker', { error: error.message, stack: error.stack });
    process.send({ type: 'init-result', available: false, reason: error.message });
  }
}

// ── Cleanup ─────────────────────────────────────────────────────────────
function cleanup() {
  if (recognizer) {
    try { recognizer.close(); } catch (_) {}
    recognizer = null;
  }
  if (audioConfig) {
    try {
      if (typeof audioConfig.close === 'function') {
        const r = audioConfig.close();
        if (r && typeof r.then === 'function') r.catch(() => {});
      }
    } catch (_) {}
    audioConfig = null;
  }
  if (recordingProcess) {
    try { recordingProcess.kill(); } catch (_) {}
    recordingProcess = null;
  }
  if (pushStream) {
    try {
      if (typeof pushStream.close === 'function') {
        const r = pushStream.close();
        if (r && typeof r.then === 'function') r.catch(() => {});
      }
    } catch (_) {}
    pushStream = null;
  }
  _audioDataLogged = false;
}

// ── Microphone capture ──────────────────────────────────────────────────
function startMicrophoneCapture() {
  if (!pushStream) return;

  try {
    const isWindows = process.platform === 'win32';
    const cmd = 'sox';
    let args = [];

    // sox format arguments: raw PCM, 16kHz, 16-bit, mono, signed integer
    const formatArgs = ['-b', '16', '-e', 'signed', '-c', '1', '-r', '16000', '-t', 'raw', '-'];
    
    if (isWindows) {
      // Windows needs waveaudio driver explicitly
      args = ['-t', 'waveaudio', 'default', '-q', ...formatArgs];
    } else {
      // Unix uses the default device flag
      args = ['-d', '-q', ...formatArgs];
    }

    recordingProcess = spawn(cmd, args);

    recordingProcess.on('error', (error) => {
      log('error', 'Failed to spawn sox', { error: error.message });
      process.send({ type: 'error', error: `Microphone capture failed (sox error): ${error.message}` });
      handleAudioError();
    });

    recordingProcess.on('close', (code) => {
      if (code !== 0 && code !== null && isRecording) {
        log('warn', `sox exited with code ${code}`);
      }
    });

    recordingProcess.stdout.on('data', (chunk) => {
      if (pushStream && isRecording) {
        try {
          pushStream.write(chunk);
          if (!_audioDataLogged) {
            _audioDataLogged = true;
            log('debug', 'First audio chunk received via sox', { size: chunk.length });
          }
        } catch (err) {
          log('error', 'Error writing audio data to push stream', { error: err.message });
        }
      }
    });

    log('info', `Microphone capture started via sox (${isWindows ? 'waveaudio' : 'default device'})`);
  } catch (error) {
    log('error', 'Failed to start microphone capture', { error: error.message, stack: error.stack });
    process.send({ type: 'error', error: `Microphone capture failed: ${error.message}` });
    handleAudioError();
  }
}

function handleAudioError() {
  if (recordingProcess) {
    try { recordingProcess.kill(); } catch (_) {}
    recordingProcess = null;
  }
}

// ── Start recording ─────────────────────────────────────────────────────
function startRecording() {
  try {
    if (!speechConfig) {
      process.send({ type: 'error', error: 'Azure Speech client not initialized' });
      return;
    }
    if (isRecording) {
      log('warn', 'Recording already in progress');
      return;
    }

    sessionStartTime = Date.now();
    retryCount = 0;
    attemptRecording();
  } catch (error) {
    log('error', 'Critical error in startRecording', { error: error.message, stack: error.stack });
    process.send({ type: 'error', error: `Speech recognition failed to start: ${error.message}` });
    isRecording = false;
  }
}

function attemptRecording() {
  try {
    isRecording = true;
    process.send({ type: 'recording-started' });

    cleanup();

    try {
      pushStream = sdk.AudioInputStream.createPushStream();
      audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
      startMicrophoneCapture();
    } catch (audioError) {
      log('error', 'Failed to create audio config', { error: audioError.message });
      process.send({ type: 'error', error: 'Audio configuration failed.' });
      isRecording = false;
      return;
    }

    // Create recognizer
    try {
      recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    } catch (recErr) {
      log('error', 'Failed to create speech recognizer', { error: recErr.message });
      process.send({ type: 'error', error: `Failed to create recognizer: ${recErr.message}` });
      isRecording = false;
      cleanup();
      return;
    }

    // ── Event handlers ──────────────────────────────────────────────────
    recognizer.recognizing = (_s, e) => {
      try {
        if (e.result.reason === sdk.ResultReason.RecognizingSpeech) {
          log('debug', 'Interim transcription', { text: e.result.text });
          process.send({ type: 'interim-transcription', text: e.result.text });
        }
      } catch (err) {
        log('error', 'Error in recognizing handler', { error: err.message });
      }
    };

    recognizer.recognized = (_s, e) => {
      try {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
          const dur = Date.now() - sessionStartTime;
          if (e.result.text && e.result.text.trim().length > 0) {
            log('info', 'Final transcription', { text: e.result.text, sessionDuration: `${dur}ms` });
            process.send({ type: 'transcription', text: e.result.text });
          } else {
            log('debug', 'Empty transcription ignored');
          }
        } else if (e.result.reason === sdk.ResultReason.NoMatch) {
          log('debug', 'No speech pattern detected');
        }
      } catch (err) {
        log('error', 'Error in recognized handler', { error: err.message });
      }
    };

    recognizer.canceled = (_s, e) => {
      log('warn', 'Recognition canceled', {
        reason: e.reason,
        errorCode: e.errorCode,
        errorDetails: e.errorDetails
      });

      if (e.reason === sdk.CancellationReason.Error) {
        let userMsg;
        if (e.errorDetails && e.errorDetails.includes('1006')) {
          userMsg = 'Network connection failed. Please check your internet connection.';
        } else if (e.errorDetails && e.errorDetails.includes('InvalidServiceCredentials')) {
          userMsg = 'Invalid Azure Speech credentials. Please check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.';
        } else if (e.errorDetails && e.errorDetails.includes('Forbidden')) {
          userMsg = 'Access denied. Please check your Azure Speech service subscription and region.';
        } else if (e.errorDetails && e.errorDetails.includes('AudioInputMicrophone_InitializationFailure')) {
          userMsg = 'Microphone initialization failed. Please check microphone permissions and availability.';
        } else {
          userMsg = `Recognition error: ${e.errorDetails}`;
        }
        process.send({ type: 'error', error: userMsg });

        // Retry for transient errors
        if (retryCount < maxRetries && e.errorDetails &&
            (e.errorDetails.includes('1006') || e.errorDetails.includes('timeout') || e.errorDetails.includes('network'))) {
          retryCount++;
          log('info', `Retrying recognition (attempt ${retryCount}/${maxRetries})`);
          setTimeout(() => {
            if (!isRecording) attemptRecording();
          }, 1000 * retryCount);
          return;
        }

        // Persistent credential / network errors → notify UI to stop gracefully
        if (e.errorDetails &&
            (e.errorDetails.includes('InvalidServiceCredentials') || e.errorDetails.includes('Forbidden'))) {
          process.send({ type: 'fatal-error', error: userMsg });
        }
      }
      stopRecording();
    };

    recognizer.sessionStarted = (_s, e) => {
      log('info', 'Recognition session started', { sessionId: e.sessionId });
      process.send({ type: 'session-started', sessionId: e.sessionId });
    };

    recognizer.sessionStopped = (_s, e) => {
      log('info', 'Recognition session ended', { sessionId: e.sessionId });
      process.send({ type: 'session-stopped', sessionId: e.sessionId });
      stopRecording();
    };

    // ── Start continuous recognition ────────────────────────────────────
    const startTimeout = setTimeout(() => {
      log('error', 'Recognition start timeout');
      process.send({ type: 'error', error: 'Speech recognition start timeout. Please try again.' });
      stopRecording();
    }, 10000);

    recognizer.startContinuousRecognitionAsync(
      () => {
        clearTimeout(startTimeout);
        log('info', 'Continuous speech recognition started successfully');
      },
      (error) => {
        clearTimeout(startTimeout);
        log('error', 'Failed to start continuous recognition', { error: error.toString(), retryCount });

        if (retryCount < maxRetries) {
          retryCount++;
          log('info', `Retrying recognition start (attempt ${retryCount}/${maxRetries})`);
          isRecording = false;
          setTimeout(() => { attemptRecording(); }, 2000 * retryCount);
        } else {
          process.send({ type: 'error', error: `Recognition startup failed after ${maxRetries} attempts: ${error}` });
          isRecording = false;
        }
      }
    );
  } catch (error) {
    log('error', 'Failed to start recording session', { error: error.message, stack: error.stack });
    process.send({ type: 'error', error: `Recording startup failed: ${error.message}` });
    isRecording = false;
  }
}

// ── Stop recording ──────────────────────────────────────────────────────
function stopRecording() {
  if (!isRecording) return;

  isRecording = false;
  const dur = sessionStartTime ? Date.now() - sessionStartTime : 0;
  log('info', 'Stopping speech recognition', { sessionDuration: `${dur}ms` });

  if (recognizer) {
    try {
      recognizer.stopContinuousRecognitionAsync(
        () => {
          log('info', 'Speech recognition stopped successfully');
          process.send({ type: 'recording-stopped' });
          cleanup();
        },
        (error) => {
          log('error', 'Error stopping recognition', { error: error.toString() });
          process.send({ type: 'recording-stopped' });
          cleanup();
        }
      );
    } catch (error) {
      log('error', 'Error stopping recognizer', { error: error.message });
      process.send({ type: 'recording-stopped' });
      cleanup();
    }
  } else {
    process.send({ type: 'recording-stopped' });
    cleanup();
  }
}

// ── Status ──────────────────────────────────────────────────────────────
function getStatus() {
  return {
    isRecording,
    isInitialized: !!speechConfig,
    available,
    sessionDuration: sessionStartTime ? Date.now() - sessionStartTime : 0,
    retryCount
  };
}

// ── Test connection ─────────────────────────────────────────────────────
function testConnection() {
  if (!speechConfig) {
    process.send({ type: 'test-result', success: false, message: 'Speech service not initialized' });
    return;
  }
  try {
    // Simple validation — just creating a recognizer tests credential format
    const testPush = sdk.AudioInputStream.createPushStream();
    const testAudio = sdk.AudioConfig.fromStreamInput(testPush);
    const testRec = new sdk.SpeechRecognizer(speechConfig, testAudio);
    testRec.close();
    try { testAudio.close(); } catch (_) {}
    try { testPush.close(); } catch (_) {}
    process.send({ type: 'test-result', success: true, message: 'Connection test successful' });
  } catch (error) {
    process.send({ type: 'test-result', success: false, message: error.message });
  }
}

// ── IPC message handler ─────────────────────────────────────────────────
process.on('message', (msg) => {
  try {
    switch (msg.type) {
      case 'init':
        initialize(msg.config);
        break;
      case 'start':
        startRecording();
        break;
      case 'stop':
        stopRecording();
        break;
      case 'test':
        testConnection();
        break;
      case 'status':
        process.send({ type: 'status', status: getStatus() });
        break;
      case 'shutdown':
        stopRecording();
        cleanup();
        log('info', 'Worker shutting down');
        setTimeout(() => process.exit(0), 500);
        break;
      default:
        log('warn', `Unknown message type: ${msg.type}`);
    }
  } catch (error) {
    log('error', `Error handling message ${msg.type}`, { error: error.message, stack: error.stack });
    process.send({ type: 'error', error: `Worker error: ${error.message}` });
  }
});

// ── Graceful exit ───────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  stopRecording();
  cleanup();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  log('error', 'Uncaught exception in speech worker', { error: error.message, stack: error.stack });
  process.send({ type: 'error', error: `Worker crash: ${error.message}` });
  // Don't exit — let main process decide
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  log('error', 'Unhandled rejection in speech worker', { error: msg });
});

log('info', 'Speech worker process started', { pid: process.pid });
