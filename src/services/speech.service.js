// Enhanced polyfills for Azure Speech SDK in Node.js environment
if (typeof window === 'undefined') {
  global.window = {
    navigator: {
      userAgent: 'Node.js',
      platform: 'node',
      mediaDevices: {
        getUserMedia: () => Promise.resolve({
          getAudioTracks: () => [],
          getTracks: () => [],
          stop: () => {}
        }),
        getSupportedConstraints: () => ({
          audio: true,
          video: false,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: true,
          sampleSize: true,
          channelCount: true
        }),
        enumerateDevices: () => Promise.resolve([
          {
            deviceId: 'default',
            kind: 'audioinput',
            label: 'Default - Microphone',
            groupId: 'default'
          }
        ])
      }
    },
    document: {
      createElement: (tagName) => {
        const element = {
          addEventListener: () => {},
          removeEventListener: () => {},
          setAttribute: () => {},
          getAttribute: () => null,
          style: {},
          tagName: tagName.toUpperCase(),
          nodeType: 1,
          nodeName: tagName.toUpperCase(),
          appendChild: () => {},
          removeChild: () => {},
          insertBefore: () => {},
          cloneNode: () => element,
          hasAttribute: () => false,
          removeAttribute: () => {},
          click: () => {},
          focus: () => {},
          blur: () => {}
        };

        if (tagName.toLowerCase() === 'audio') {
          Object.assign(element, {
            play: () => Promise.resolve(),
            pause: () => {},
            load: () => {},
            canPlayType: () => 'probably',
            volume: 1,
            muted: false,
            paused: true,
            ended: false,
            currentTime: 0,
            duration: 0,
            playbackRate: 1,
            defaultPlaybackRate: 1,
            readyState: 4,
            networkState: 1,
            autoplay: false,
            loop: false,
            controls: false,
            crossOrigin: null,
            preload: 'metadata',
            src: '',
            currentSrc: ''
          });
        }

        return element;
      },
      getElementById: () => null,
      getElementsByTagName: () => [],
      getElementsByClassName: () => [],
      querySelector: () => null,
      querySelectorAll: () => [],
      body: {
        appendChild: () => {},
        removeChild: () => {},
        insertBefore: () => {},
        style: {}
      },
      head: {
        appendChild: () => {},
        removeChild: () => {},
        insertBefore: () => {},
        style: {}
      }
    },
    location: {
      href: 'file:///',
      protocol: 'file:',
      host: '',
      hostname: '',
      port: '',
      pathname: '/',
      search: '',
      hash: '',
      origin: 'file://'
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    requestAnimationFrame: (callback) => global.setTimeout(callback, 16),
    cancelAnimationFrame: global.clearTimeout,
    console: global.console || {
      log: () => {},
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {}
    },
    AudioContext: class AudioContext {
      constructor() {
        this.state = 'running';
        this.sampleRate = 16000;
        this.currentTime = 0;
        this.listener = {
          setPosition: () => {},
          setOrientation: () => {}
        };
        this.destination = {
          connect: () => {},
          disconnect: () => {},
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers'
        };
      }
      createMediaStreamSource(stream) {
        return {
          connect: () => {},
          disconnect: () => {},
          mediaStream: stream
        };
      }
      createGain() {
        return {
          connect: () => {},
          disconnect: () => {},
          gain: {
            value: 1,
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {}
          }
        };
      }
      createScriptProcessor(bufferSize = 4096, inputChannels = 1, outputChannels = 1) {
        return {
          connect: () => {},
          disconnect: () => {},
          onaudioprocess: null,
          bufferSize,
          numberOfInputs: inputChannels,
          numberOfOutputs: outputChannels
        };
      }
      createAnalyser() {
        return {
          connect: () => {},
          disconnect: () => {},
          fftSize: 2048,
          frequencyBinCount: 1024,
          minDecibels: -100,
          maxDecibels: -30,
          smoothingTimeConstant: 0.8,
          getByteFrequencyData: () => {},
          getByteTimeDomainData: () => {},
          getFloatFrequencyData: () => {},
          getFloatTimeDomainData: () => {}
        };
      }
      decodeAudioData() {
        return Promise.resolve({
          length: 44100,
          sampleRate: 44100,
          numberOfChannels: 1,
          duration: 1,
          getChannelData: () => new Float32Array(44100)
        });
      }
      suspend() {
        this.state = 'suspended';
        return Promise.resolve();
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
    },
    webkitAudioContext: class webkitAudioContext {
      constructor() {
        this.state = 'running';
        this.sampleRate = 16000;
        this.currentTime = 0;
        this.listener = {
          setPosition: () => {},
          setOrientation: () => {}
        };
        this.destination = {
          connect: () => {},
          disconnect: () => {},
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers'
        };
      }
      createMediaStreamSource(stream) {
        return {
          connect: () => {},
          disconnect: () => {},
          mediaStream: stream
        };
      }
      createGain() {
        return {
          connect: () => {},
          disconnect: () => {},
          gain: {
            value: 1,
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {}
          }
        };
      }
      createScriptProcessor(bufferSize = 4096, inputChannels = 1, outputChannels = 1) {
        return {
          connect: () => {},
          disconnect: () => {},
          onaudioprocess: null,
          bufferSize,
          numberOfInputs: inputChannels,
          numberOfOutputs: outputChannels
        };
      }
      createAnalyser() {
        return {
          connect: () => {},
          disconnect: () => {},
          fftSize: 2048,
          frequencyBinCount: 1024,
          minDecibels: -100,
          maxDecibels: -30,
          smoothingTimeConstant: 0.8,
          getByteFrequencyData: () => {},
          getByteTimeDomainData: () => {},
          getFloatFrequencyData: () => {},
          getFloatTimeDomainData: () => {}
        };
      }
      decodeAudioData() {
        return Promise.resolve({
          length: 44100,
          sampleRate: 44100,
          numberOfChannels: 1,
          duration: 1,
          getChannelData: () => new Float32Array(44100)
        });
      }
      suspend() {
        this.state = 'suspended';
        return Promise.resolve();
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
    },
    URL: class URL {
      constructor(url) {
        this.href = url;
        this.protocol = 'https:';
        this.host = 'localhost';
        this.hostname = 'localhost';
        this.port = '';
        this.pathname = '/';
        this.search = '';
        this.hash = '';
        this.origin = 'https://localhost';
      }
      toString() {
        return this.href;
      }
    },
    Blob: class Blob {
      constructor(parts = [], options = {}) {
        this.size = 0;
        this.type = options.type || '';
        this.parts = parts;
      }
      slice() {
        return new Blob();
      }
      stream() {
        return new ReadableStream();
      }
      text() {
        return Promise.resolve('');
      }
      arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
      }
    },
    File: class File {
      constructor(parts, name, options = {}) {
        this.name = name;
        this.size = 0;
        this.type = options.type || '';
        this.lastModified = Date.now();
        this.parts = parts;
      }
      slice() {
        return new File([], this.name);
      }
      stream() {
        return new ReadableStream();
      }
      text() {
        return Promise.resolve('');
      }
      arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
      }
    }
  };
  global.document = global.window.document;
  global.navigator = global.window.navigator;
  global.AudioContext = global.window.AudioContext;
  global.webkitAudioContext = global.window.webkitAudioContext;
  global.URL = global.window.URL;
  global.Blob = global.window.Blob;
  global.File = global.window.File;

  if (!global.performance) {
    global.performance = {
      now: () => Date.now(),
      mark: () => {},
      measure: () => {},
      clearMarks: () => {},
      clearMeasures: () => {},
      getEntriesByName: () => [],
      getEntriesByType: () => []
    };
  }

  if (!global.crypto) {
    global.crypto = {
      getRandomValues: (arr) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      }
    };
  }
}

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const logger = require('../core/logger').createServiceLogger('SPEECH');
const {
  PcmRingBuffer,
  StablePrefixStabilizer,
  RING_MS,
  DECODE_MS,
  MIN_DECODE_MS,
  INTERVAL_MS,
  OVERLAP_MS,
  UTTERANCE_MS
} = require('./rolling-caption');
const {
  InterviewTurnBuffer,
  TURN_MS,
  TRAILING_SILENCE_MS
} = require('./interview-turn-buffer');
const {
  DeepgramLiveClient,
  buildListenUrl,
  formatSpaceLogLine,
  transcribePrerecorded,
  LOOPBACK_MIN_RMS,
  DEEPGRAM_SPACE_SILENCE_MS,
  DEEPGRAM_SPACE_MAX_WAIT_MS
} = require('./deepgram-live');
const config = require('../core/config');
const WhisperWorkerService = require('./whisper-worker.service');

let sdk = null;
try {
  sdk = require('microsoft-cognitiveservices-speech-sdk');
} catch (error) {
  logger.warn('Azure Speech SDK unavailable', { error: error.message });
}

const WHISPER_MODEL_IDS = new Set([
  'tiny', 'tiny.en', 'base', 'base.en', 'small', 'small.en',
  'medium', 'medium.en', 'large', 'large-v1', 'large-v2', 'large-v3',
  'large-v3-turbo', 'turbo'
]);

function sanitizeWhisperLanguage(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value || value === 'auto' || value === 'detect') {
    return 'auto';
  }
  // Settings used to persist the model name into WHISPER_LANGUAGE.
  if (WHISPER_MODEL_IDS.has(value)) {
    return 'auto';
  }
  return value;
}

let recorder = null;
try {
  recorder = require('node-record-lpcm16');
} catch (error) {
  logger.warn('Local audio recorder dependency unavailable', { error: error.message });
}

class SpeechService extends EventEmitter {
  constructor() {
    super();
    this.recognizer = null;
    this.isRecording = false;
    this.audioConfig = null;
    this.speechConfig = null;
    this.sessionStartTime = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.pushStream = null;
    this.recording = null;
    this.available = false;
    this.provider = 'disabled';
    this.runtimeSettings = {};
    this.segmentBuffers = [];
    this.segmentBytes = 0;
    this.segmentTimer = null;
    this.transcriptionInFlight = false;
    this.pendingFlush = false;
    this.pendingFinal = false;
    this.audioProgram = null;
    this.whisperCommand = null;
    this.whisperWorker = new WhisperWorkerService();
    this.isProcessingAudio = false;
    this.manualStopRequested = false;
    this.whisperKeepAlive = false;
    this._interimInFlight = false;
    this._lastInterimAt = 0;
    this._lastInterimBytes = 0;
    this._speechOnsetAt = 0;
    this._firstCaptionAt = 0;
    this.rollingEnabled = false;
    this.rollingCaptionsPaused = false;
    this._rollingIntervalMsValue = INTERVAL_MS;
    this._rollingTimer = null;
    this._rollingRing = new PcmRingBuffer(RING_MS);
    this._utteranceRing = new PcmRingBuffer(UTTERANCE_MS);
    this._turnBuffer = new InterviewTurnBuffer(TURN_MS);
    this._turnFinalText = '';
    this._captionInterim = '';
    this._deepgramLive = null;
    this._deepgramActive = false;
    this.interviewCapture = false;
    this._deepgramCaptionsPaused = false;
    this._gotLoopbackAudio = false;
    this._lastLoopbackRms = 0;
    this._lastChunkSource = 'mic';
    this._audioCaptureSource = 'mic';
    this.WebSocketImpl = null;
    this._deepgramFetchImpl = null;
    this._deepgramReconnectTimer = null;
    this._deepgramSpaceSilenceMs = DEEPGRAM_SPACE_SILENCE_MS;
    this._deepgramSpaceMaxWaitMs = DEEPGRAM_SPACE_MAX_WAIT_MS;
    this._rollingStabilizer = new StablePrefixStabilizer();
    this._rollingDropped = 0;
    this._rollingEmitted = 0;
    this._rollingWindowStartedAt = 0;
    this._rollingLanguage = null;
    this._resetVadState();

    this.initializeClient();
  }

  initializeClient() {
    this._cleanup();
    this.provider = 'disabled';
    this.available = false;
    this.speechConfig = null;
    this.whisperCommand = null;

    const provider = this._getConfiguredProvider();
    this.provider = provider;

    if (provider === 'azure') {
      this._initializeAzureClient();
      return;
    }

    if (provider === 'deepgram') {
      if (this._hasDeepgramKey()) {
        this._initializeDeepgramClient();
        try {
          this._initializeWhisperClient();
        } catch (_) { /* Whisper remains offline fallback only */ }
        return;
      }
      logger.warn('SPEECH_PROVIDER=deepgram but DEEPGRAM_API_KEY is missing; using Whisper fallback');
      this.provider = 'whisper';
      this._initializeWhisperClient();
      return;
    }

    if (provider === 'whisper') {
      this._initializeWhisperClient();
      return;
    }

    const reason = 'Speech recognition disabled. Configure Azure, Deepgram, or local Whisper.';
    logger.warn(reason);
    this.emit('status', reason);
  }

  _initializeDeepgramClient() {
    if (!this._hasDeepgramKey()) {
      const reason = 'Deepgram API key not found. Speech recognition disabled.';
      logger.warn('Speech service disabled (missing Deepgram credentials)');
      this.emit('status', reason);
      return;
    }
    this.available = true;
    logger.info('Deepgram Speech service initialized', {
      model: (config.get('speech.deepgram') || {}).model || 'nova-3',
      loopbackInterview: true
    });
    this.emit('status', 'Deepgram Speech ready');
  }

  _initializeAzureClient() {
    try {
      if (!sdk) {
        throw new Error('Azure Speech SDK dependency is not installed');
      }

      if (!recorder || typeof recorder.record !== 'function') {
        throw new Error('Local microphone recorder dependency is not installed');
      }

      const subscriptionKey = this._getSetting('azureKey') || process.env.AZURE_SPEECH_KEY;
      const region = this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION;

      if (!subscriptionKey || !region) {
        const reason = 'Azure Speech credentials not found. Speech recognition disabled.';
        logger.warn('Speech service disabled (missing Azure credentials)');
        this.emit('status', reason);
        return;
      }

      this.speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);

      const azureConfig = config.get('speech.azure') || {};
      this.speechConfig.speechRecognitionLanguage = azureConfig.language || 'en-US';
      this.speechConfig.outputFormat = sdk.OutputFormat.Detailed;
      this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, '5000');
      this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, '2000');
      this.speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, '2000');

      if (azureConfig.enableDictation) {
        this.speechConfig.enableDictation();
      }

      if (azureConfig.enableAudioLogging) {
        this.speechConfig.enableAudioLogging();
      }

      this.available = true;
      logger.info('Azure Speech service initialized successfully', {
        region,
        language: azureConfig.language || 'en-US'
      });
      this.emit('status', 'Azure Speech Services ready');
    } catch (error) {
      logger.error('Failed to initialize Azure Speech client', {
        error: error.message,
        stack: error.stack
      });
      this.available = false;
      this.emit('status', 'Azure speech unavailable');
    }
  }

  _initializeWhisperClient() {
    try {
      this.whisperCommand = this._resolveWhisperCommand();
      if (!this.whisperCommand) {
        const reason = 'Local Whisper unavailable. Install the Whisper CLI or set WHISPER_COMMAND.';
        logger.warn(reason);
        this.emit('status', reason);
        return;
      }

      this.available = true;
      this._configureWhisperWorker();
      logger.info('Local Whisper service initialized successfully', {
        command: [this.whisperCommand.command, ...this.whisperCommand.baseArgs].join(' '),
        model: this._getWhisperModel(),
        language: this._getWhisperLanguage()
      });
      this.emit('status', 'Local Whisper ready');
    } catch (error) {
      logger.error('Failed to initialize local Whisper client', {
        error: error.message,
        stack: error.stack
      });
      this.available = false;
      this.emit('status', 'Local Whisper unavailable');
    }
  }

  startRecording() {
    try {
      if (!this.available && !this._shouldStartDeepgram()) {
        const errorMsg = `Speech provider "${this.provider}" is not available`;
        logger.error(errorMsg);
        this.emit('error', errorMsg);
        return;
      }

      if (this.isRecording) {
        logger.warn('Recording already in progress');
        return;
      }

      if (this.isProcessingAudio) {
        this.emit('status', 'Please wait for the current transcription to finish');
        return;
      }

      this.sessionStartTime = Date.now();
      this.retryCount = 0;

      if (this._shouldStartDeepgram()) {
        this._startDeepgramRecording({ loopback: this.usesDeepgramInterview() });
        return;
      }

      if (this.provider === 'azure') {
        this._startAzureRecording();
        return;
      }

      if (this.provider === 'whisper') {
        this._startWhisperRecording();
        return;
      }

      throw new Error(`Unsupported speech provider: ${this.provider}`);
    } catch (error) {
      logger.error('Critical error in startRecording', { error: error.message, stack: error.stack });
      this.emit('error', `Speech recognition failed to start: ${error.message}`);
      this.isRecording = false;
    }
  }

  _startAzureRecording() {
    if (!this.speechConfig) {
      throw new Error('Azure Speech client not initialized');
    }

    this.isRecording = true;
    this.emit('recording-started');
    this.emit('status', 'Azure recording started');
    this._cleanup();

    try {
      this.pushStream = sdk.AudioInputStream.createPushStream();
      this.audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);
      this._startMicrophoneCapture();
      this.recognizer = new sdk.SpeechRecognizer(this.speechConfig, this.audioConfig);
    } catch (error) {
      logger.error('Failed to start Azure recording session', { error: error.message });
      this.emit('error', `Audio configuration failed: ${error.message}`);
      this.isRecording = false;
      return;
    }

    this.recognizer.recognizing = (s, e) => {
      try {
        if (e.result.reason === sdk.ResultReason.RecognizingSpeech) {
          this.emit('interim-transcription', e.result.text);
        }
      } catch (error) {
        logger.error('Error in recognizing handler', { error: error.message });
      }
    };

    this.recognizer.recognized = (s, e) => {
      try {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text && e.result.text.trim()) {
          this.emit('transcription', e.result.text);
        }
      } catch (error) {
        logger.error('Error in recognized handler', { error: error.message });
      }
    };

    this.recognizer.canceled = (s, e) => {
      logger.warn('Recognition session canceled', {
        reason: e.reason,
        errorCode: e.errorCode,
        errorDetails: e.errorDetails
      });

      if (e.reason === sdk.CancellationReason.Error) {
        const details = e.errorDetails || '';
        if (details.includes('1006')) {
          this.emit('error', 'Network connection failed. Please check your internet connection.');
        } else if (details.includes('InvalidServiceCredentials')) {
          this.emit('error', 'Invalid Azure Speech credentials. Please check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.');
        } else if (details.includes('Forbidden')) {
          this.emit('error', 'Access denied. Please check your Azure Speech service subscription and region.');
        } else if (details.includes('AudioInputMicrophone_InitializationFailure')) {
          this.emit('error', 'Microphone initialization failed. Please check microphone permissions and availability.');
        } else {
          this.emit('error', `Recognition error: ${details}`);
        }
      }

      this.stopRecording();
    };

    this.recognizer.sessionStarted = (s, e) => {
      logger.info('Recognition session started', { sessionId: e.sessionId });
    };

    this.recognizer.sessionStopped = () => {
      this.stopRecording();
    };

    const startTimeout = setTimeout(() => {
      logger.error('Recognition start timeout');
      this.emit('error', 'Speech recognition start timeout. Please try again.');
      this.stopRecording();
    }, 10000);

    this.recognizer.startContinuousRecognitionAsync(
      () => {
        clearTimeout(startTimeout);
        logger.info('Continuous Azure speech recognition started successfully');
      },
      (error) => {
        clearTimeout(startTimeout);
        logger.error('Failed to start continuous recognition', { error: error.toString() });
        this.emit('error', `Recognition startup failed: ${error}`);
        this.isRecording = false;
        this._cleanup();
      }
    );
  }

  _startWhisperRecording() {
    this._cleanup();
    this.isRecording = true;
    this.segmentBuffers = [];
    this.segmentBytes = 0;
    this.transcriptionInFlight = false;
    this.pendingFlush = false;
    this.pendingFinal = false;
    this.manualStopRequested = false;
    this._interimInFlight = false;
    this._lastInterimAt = 0;
    this._lastInterimBytes = 0;
    this._speechOnsetAt = 0;
    this._firstCaptionAt = 0;
    this._perfFirstAudio = false;
    if (!this.rollingEnabled) {
      this._resetRollingState();
    } else if (!this._rollingTimer) {
      this._startRollingTimer();
    }
    this._resetVadState();
    this.emit('recording-started');
    this.emit('status', 'Local Whisper recording started');

    if (this.whisperWorker.isConfigured()) {
      this.whisperWorker.warmup({
        model: this._getWhisperModel(),
        modelDir: this._getWhisperModelDir(),
        device: this._getWhisperDevice()
      }).then((result) => {
        logger.info('Whisper GPU warmup completed while recording', {
          model: result.model,
          device: result.device,
          gpu: result.gpu
        });
      }).catch((error) => {
        logger.warn('Whisper warmup failed; transcription will use fallback', {
          error: error.message
        });
      });
    }

    // Capture microphone audio in the renderer via the Web Audio API on Windows
    // and macOS. Windows lacks the Unix sox/rec/arecord tools node-record-lpcm16
    // needs; macOS would otherwise require a Homebrew `sox` install (not bundled)
    // and a child-process mic that the system TCC prompt can't attribute. The
    // renderer path uses getUserMedia, which macOS prompts for cleanly via the
    // app's NSMicrophoneUsageDescription. Linux keeps the native recorder path.
    this.useRendererCapture = process.platform === 'win32' || process.platform === 'darwin';
    if (this.useRendererCapture) {
      this.emit('status', 'Waiting for microphone audio…');
      // The renderer starts sending chunks once it receives the recording-started event.
      if (!this._isManualCaptureMode() && !this.rollingEnabled) {
        this._startSegmentWatchdog();
      }
      return;
    }

    this._startMicrophoneCapture();
    if (!this._isManualCaptureMode() && !this.rollingEnabled) {
      this._startSegmentWatchdog();
    }

  }

  /**
   * Reset the voice-activity-detection state machine. VAD replaces the old
   * fixed-interval segmentation: instead of cutting audio every N seconds
   * (which split sentences mid-word and transcribed silent windows), we
   * accumulate audio while the user is speaking and flush a segment once a
   * natural pause is detected. State is intentionally simple so it works for
   * both the renderer (Web Audio) and native (sox/arecord) capture paths.
   */
  _resetVadState() {
    this.vadSpeaking = false;        // currently inside an utterance
    this.vadSpeechMs = 0;            // accumulated voiced audio in this segment
    this.vadSilenceMs = 0;           // trailing silence since last voiced chunk
    this.vadNoiseFloor = 0;          // adaptive EMA of background energy
    this.vadNoiseInit = false;       // has the noise floor been seeded
    this.vadPreRoll = [];            // ring of recent pre-speech chunks
    this.vadPreRollMs = 0;           // duration held in the pre-roll ring
    this.vadLastChunkAt = 0;         // timestamp of the last ingested chunk
  }

  /**
   * Lightweight watchdog. Silence is normally detected from incoming chunks
   * (which keep flowing at low energy), but if the capture pipeline stalls
   * mid-utterance we still want to flush what we have. The watchdog also
   * enforces the max-utterance cap as a backstop.
   */
  _startSegmentWatchdog() {
    if (this.segmentTimer) {
      clearInterval(this.segmentTimer);
    }
    this.segmentTimer = setInterval(() => {
      if (!this.isRecording || this.provider !== 'whisper') {
        return;
      }

      // VAD disabled (fallback): preserve the legacy fixed-window behaviour by
      // flushing once the accumulated audio reaches the configured segment size.
      if (!this._isVadEnabled()) {
        if (this.segmentBytes && this.vadSpeechMs >= this._getWhisperSegmentMs()) {
          this._endUtteranceFlush();
        }
        return;
      }

      // If we're mid-utterance and no audio has arrived recently, the mic may
      // have stalled — flush what we captured rather than holding it forever.
      const sinceLastChunk = this.vadLastChunkAt ? Date.now() - this.vadLastChunkAt : 0;
      const stalled = this.vadSpeaking && sinceLastChunk > 1500;
      const tooLong = this.vadSpeaking && this.vadSpeechMs >= this._getMaxUtteranceMs();
      if (stalled || tooLong) {
        this._endUtteranceFlush();
      }
    }, 500);
  }

  /**
   * Receive raw 16kHz mono 16-bit PCM audio from the renderer and add it to
   * the current Whisper segment buffer.
   */
  handleAudioChunkFromRenderer(chunk, source = 'mic') {
    if (!this.isRecording) {
      return;
    }
    if (!chunk || !chunk.length) {
      return;
    }
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const tag = source === 'loopback' ? 'loopback' : 'mic';
    this._lastChunkSource = tag;

    if (this._deepgramActive) {
      if (this.usesDeepgramInterview() && tag !== 'loopback') {
        return;
      }
      this._ingestDeepgramAudio(buffer, tag);
      return;
    }

    if (this.provider !== 'whisper' || !this.useRendererCapture) {
      return;
    }
    this._ingestWhisperAudio(buffer);
  }

  /**
   * Compute the RMS energy (normalized to 0..1) of a 16-bit little-endian PCM
   * buffer. Used as the voice-activity signal.
   */
  _chunkRmsEnergy(buffer) {
    const sampleCount = Math.floor(buffer.length / 2);
    if (sampleCount === 0) {
      return 0;
    }
    let sumSquares = 0;
    for (let i = 0; i < sampleCount; i++) {
      const sample = buffer.readInt16LE(i * 2) / 32768;
      sumSquares += sample * sample;
    }
    return Math.sqrt(sumSquares / sampleCount);
  }

  /**
   * Single ingest path for both capture backends. Runs the VAD state machine:
   * accumulate audio while the user speaks, and flush the segment to Whisper
   * once a natural pause (trailing silence) is detected. Falls back to plain
   * buffering when VAD is disabled.
   */
  _ingestWhisperAudio(buffer) {
    if (!buffer || !buffer.length) {
      return;
    }

    if (!this._perfFirstAudio) {
      this._perfFirstAudio = true;
      this.emit('first-audio-chunk');
    }

    if (this.rollingEnabled) {
      if (!this.rollingCaptionsPaused) {
        if (!this._rollingWindowStartedAt) {
          this._rollingWindowStartedAt = Date.now();
        }
        this._rollingRing.push(buffer);
        this._utteranceRing.push(buffer);
        const voiced = this._noteRollingSpeech(buffer);
        this._turnBuffer.push(buffer, { now: Date.now(), voiced });
      }
      return;
    }

    if (this._isManualCaptureMode()) {
      this.segmentBuffers.push(buffer);
      this.segmentBytes += buffer.length;
      this.vadLastChunkAt = Date.now();
      this.vadSpeaking = true;
      this.vadSpeechMs = this.segmentBytes / 32;
      if (!this.rollingEnabled) this._maybeScheduleLiveCaption();

      const capturedMs = this.segmentBytes / 32;
      if (!this.manualStopRequested && capturedMs >= this._getManualCaptureMaxMs()) {
        this.manualStopRequested = true;
        this.emit('status', 'Maximum recording duration reached; processing audio');
        setImmediate(() => this.stopRecording());
      }
      return;
    }

    if (!this._isVadEnabled()) {
      // Legacy behaviour: the watchdog/max-utterance cap drives flushing.
      this.segmentBuffers.push(buffer);
      this.segmentBytes += buffer.length;
      this.vadSpeaking = true;
      this.vadSpeechMs += this._chunkDurationMs(buffer);
      this.vadLastChunkAt = Date.now();
      if (!this.rollingEnabled) this._maybeScheduleLiveCaption();
      return;
    }

    this.vadLastChunkAt = Date.now();
    const chunkMs = this._chunkDurationMs(buffer);
    const energy = this._chunkRmsEnergy(buffer);

    const floor = this._getVadEnergyFloor();
    // Seed / adapt the background noise floor while not actively speaking so
    // the threshold tracks the room rather than a hard-coded constant. Seed
    // conservatively: if the very first chunk is already loud (the user started
    // talking immediately), clamp to the configured floor so a high seed can't
    // push the enter-threshold out of reach and stall VAD for the whole session.
    if (!this.vadNoiseInit) {
      this.vadNoiseFloor = Math.min(energy, floor);
      this.vadNoiseInit = true;
    }
    // Hysteresis: it takes more energy to *start* an utterance than to keep
    // one going, so a brief dip mid-sentence doesn't end it prematurely.
    const enterThreshold = Math.max(floor, this.vadNoiseFloor * 2.5);
    const exitThreshold = Math.max(floor * 0.7, this.vadNoiseFloor * 1.6);
    const isVoiced = this.vadSpeaking ? energy >= exitThreshold : energy >= enterThreshold;

    if (!this.vadSpeaking) {
      if (isVoiced) {
        // Speech onset: prepend the pre-roll so the first syllable survives.
        this.vadSpeaking = true;
        this.vadSpeechMs = 0;
        this.vadSilenceMs = 0;
        this._speechOnsetAt = Date.now();
        this._firstCaptionAt = 0;
        this._lastInterimBytes = 0;
        this.emit('vad-speech-start');
        for (const pre of this.vadPreRoll) {
          this.segmentBuffers.push(pre);
          this.segmentBytes += pre.length;
        }
        this.vadPreRoll = [];
        this.vadPreRollMs = 0;
        this.segmentBuffers.push(buffer);
        this.segmentBytes += buffer.length;
        this.vadSpeechMs += chunkMs;
      } else {
        // Background: adapt the noise floor and keep a short pre-roll ring.
        this.vadNoiseFloor = this.vadNoiseFloor * 0.95 + energy * 0.05;
        this.vadPreRoll.push(buffer);
        this.vadPreRollMs += chunkMs;
        const preRollLimit = this._getPreRollMs();
        while (this.vadPreRollMs > preRollLimit && this.vadPreRoll.length > 1) {
          const dropped = this.vadPreRoll.shift();
          this.vadPreRollMs -= this._chunkDurationMs(dropped);
        }
      }
      return;
    }

    // Already speaking: keep capturing (including trailing silence so word
    // endings aren't clipped) and watch for a pause that ends the utterance.
    this.segmentBuffers.push(buffer);
    this.segmentBytes += buffer.length;
    if (isVoiced) {
      this.vadSpeechMs += chunkMs;
      this.vadSilenceMs = 0;
    } else {
      this.vadSilenceMs += chunkMs;
    }

    const pausedLongEnough = this.vadSilenceMs >= this._getSilenceHangoverMs();
    const haveRealSpeech = this.vadSpeechMs >= this._getMinUtteranceMs();
    const tooLong = this.vadSpeechMs >= this._getMaxUtteranceMs();

    if ((pausedLongEnough && haveRealSpeech) || tooLong) {
      this._endUtteranceFlush();
    } else if (pausedLongEnough && !haveRealSpeech) {
      // Just noise (cough/click) with no real speech — discard, don't waste a
      // Whisper spawn or risk a hallucinated transcript.
      this.segmentBuffers = [];
      this.segmentBytes = 0;
      this.vadSpeaking = false;
      this.vadSpeechMs = 0;
      this.vadSilenceMs = 0;
      this._lastInterimBytes = 0;
    } else if (!this.rollingEnabled) {
      this._maybeScheduleLiveCaption();
    }
  }

  /** Flush the accumulated utterance and reset VAD for the next one. */
  _endUtteranceFlush() {
    this.vadSpeaking = false;
    this.vadSpeechMs = 0;
    this.vadSilenceMs = 0;
    this.vadPreRoll = [];
    this.vadPreRollMs = 0;
    this._lastInterimBytes = 0;
    if (this.rollingEnabled) {
      const snapshot = this._rollingStabilizer.promoteAll();
      this._emitRollingCaption(snapshot);
      return;
    }
    this._flushWhisperSegment({ final: false }).catch((error) => {
      logger.error('Whisper segment transcription failed', { error: error.message });
    });
  }

  _noteRollingSpeech(buffer) {
    const energy = this._chunkRmsEnergy(buffer);
    const floor = this._getVadEnergyFloor();
    if (!this.vadNoiseInit) {
      this.vadNoiseFloor = Math.min(energy, floor);
      this.vadNoiseInit = true;
    }
    const enterThreshold = Math.max(floor, this.vadNoiseFloor * 2.5);
    if (energy >= enterThreshold) {
      if (!this._speechOnsetAt) {
        this._speechOnsetAt = Date.now();
        this._turnBuffer.begin(this._speechOnsetAt);
        this.emit('vad-speech-start');
      }
      return true;
    }
    if (!this._speechOnsetAt) {
      this.vadNoiseFloor = this.vadNoiseFloor * 0.95 + energy * 0.05;
    }
    return false;
  }

  _resetRollingState() {
    this._rollingRing.reset();
    this._utteranceRing.reset();
    this._turnBuffer.reset();
    this._rollingStabilizer.reset();
    this._rollingDropped = 0;
    this._rollingEmitted = 0;
    this._rollingWindowStartedAt = 0;
    this.rollingCaptionsPaused = false;
  }

  _rollingIntervalMs() {
    return this._rollingIntervalMsValue || INTERVAL_MS;
  }

  setRollingIntervalMs(ms) {
    const next = Math.max(50, Number(ms) || INTERVAL_MS);
    this._rollingIntervalMsValue = next;
    if (this._rollingTimer) {
      this._stopRollingTimer();
      this._startRollingTimer();
    }
  }

  _startRollingTimer() {
    if (this._rollingTimer) return;
    this._rollingTimer = setInterval(() => {
      this._tickRollingCaption().catch((error) => {
        logger.debug('Rolling caption tick failed', { error: error.message });
      });
    }, this._rollingIntervalMs());
  }

  _stopRollingTimer() {
    if (this._rollingTimer) {
      clearInterval(this._rollingTimer);
      this._rollingTimer = null;
    }
  }

  async _tickRollingCaption() {
    if (!this.rollingEnabled || !this.isRecording || this.rollingCaptionsPaused) {
      return;
    }
    if (!this.whisperWorker || !this.whisperWorker.isConfigured()) {
      return;
    }
    if (this._interimInFlight || this.transcriptionInFlight) {
      this._rollingDropped += 1;
      return;
    }
    const availableMs = this._rollingRing.durationMs;
    if (availableMs < MIN_DECODE_MS) {
      return;
    }
    const windowMs = availableMs >= 600
      ? Math.min(DECODE_MS, availableMs)
      : availableMs;
    const pcm = this._rollingRing.snapshotMs(windowMs);
    if (!pcm.length) {
      return;
    }
    const energy = this._chunkRmsEnergy(pcm);
    const floor = this._getVadEnergyFloor();
    const hasStable = this._rollingStabilizer.snapshot().stablePrefixLength > 0;
    if (energy < floor * 1.15 && !hasStable) {
      return;
    }
    if (energy < floor * 0.7) {
      return;
    }

    this._interimInFlight = true;
    const startedAt = Date.now();
    try {
      const text = await this._transcribeWhisperBuffer(pcm, {
        fast: true,
        rolling: true,
        language: this._rollingFastLanguage(),
        initialPrompt: this._rollingStabilizer.locked.slice(-8).join(' ')
      });
      const decodeMs = Date.now() - startedAt;
      const clean = text && typeof text === 'string' ? text.trim() : '';
      if (!clean || this._isHallucinatedTranscript(clean)) {
        return;
      }
      if (!this._firstCaptionAt) {
        this._firstCaptionAt = Date.now();
        const onset = this._speechOnsetAt || this._rollingWindowStartedAt || startedAt;
        this.emit('first-caption', {
          decodeMs,
          msFromSpeechOnset: this._firstCaptionAt - onset
        });
        logger.info('Live caption first word', {
          msFromSpeechOnset: this._firstCaptionAt - onset,
          decodeMs,
          audioMs: Math.round(pcm.length / 32),
          rolling: true
        });
      }
      const snapshot = this._rollingStabilizer.update(clean);
      this._emitRollingCaption(snapshot, decodeMs);
    } finally {
      this._interimInFlight = false;
    }
  }

  _rollingFastLanguage() {
    if (this._rollingLanguage) return this._rollingLanguage;
    const configured = this._getWhisperLanguage();
    if (configured && configured !== 'auto') return configured;
    return 'en';
  }

  async _primeRollingDecoder() {
    if (!this.whisperWorker || !this.whisperWorker.isConfigured()) return;
    try {
      await this._transcribeWhisperBuffer(Buffer.alloc(MIN_DECODE_MS * 32), {
        fast: true,
        rolling: true,
        language: this._rollingFastLanguage()
      });
    } catch (error) {
      logger.debug('Rolling decoder prime skipped', { error: error.message });
    }
  }

  _emitRollingCaption(snapshot, decodeMs) {
    this._rollingEmitted += 1;
    this.emit('rolling-caption', {
      committed: snapshot.committed,
      interim: snapshot.interim,
      text: snapshot.text,
      stablePrefixLength: snapshot.stablePrefixLength,
      decodeMs,
      droppedUpdates: this._rollingDropped
    });
    if (snapshot.text) {
      this.emit('interim-transcription', snapshot.text);
    }
  }

  getRollingStats() {
    const elapsedSec = this._rollingWindowStartedAt
      ? Math.max(0.001, (Date.now() - this._rollingWindowStartedAt) / 1000)
      : (this.sessionStartTime
        ? Math.max(0.001, (Date.now() - this.sessionStartTime) / 1000)
        : 0);
    const snapshot = this._rollingStabilizer.snapshot();
    return {
      rollingIntervalMs: this._rollingIntervalMs(),
      ringBufferMs: RING_MS,
      overlapMs: OVERLAP_MS,
      decodeWindowMs: DECODE_MS,
      stablePrefixLength: snapshot.stablePrefixLength,
      committedWords: snapshot.committedWords,
      interimWords: snapshot.interimWords,
      rollbackCount: snapshot.rollbackCount,
      submittedText: snapshot.text || '',
      interimUpdates: this._rollingEmitted,
      droppedUpdates: this._rollingDropped,
      interimUpdatesPerSec: elapsedSec ? this._rollingEmitted / elapsedSec : 0,
      stabilityScore: snapshot.stabilityScore,
      workerRunning: !!(this.whisperWorker && this.whisperWorker.isRunning()),
      workerPid: this.whisperWorker && this.whisperWorker.pid
    };
  }

  clearInterviewTurn() {
    this._speechOnsetAt = 0;
    this._turnFinalText = '';
    this._captionInterim = '';
    this._deepgramCaptionsPaused = false;
    this._resetVadState();
    return this._turnBuffer.reset();
  }

  getInterviewTurnSnapshot() {
    return this._turnBuffer.snapshot();
  }

  getInterviewTurnFinalText() {
    return String(this._turnFinalText || '').trim();
  }

  setInterviewCapture(enabled) {
    this.interviewCapture = !!enabled;
    if (this.interviewCapture && this._hasDeepgramKey()) {
      this.rollingEnabled = false;
      this._stopRollingTimer();
      this.whisperKeepAlive = false;
    }
    if (!this.interviewCapture && !this.isRecording) {
      this._deepgramActive = false;
    }
    return this.usesDeepgramInterview();
  }

  usesDeepgramInterview() {
    return !!this.interviewCapture && this._hasDeepgramKey();
  }

  usesTurnFinalSubmit() {
    return !!this.rollingEnabled || this.usesDeepgramInterview() || !!this._deepgramActive;
  }

  _shouldStartDeepgram() {
    if (!this._hasDeepgramKey()) return false;
    if (this.usesDeepgramInterview()) return true;
    return this.provider === 'deepgram';
  }

  _hasDeepgramKey() {
    return !!this._getDeepgramApiKey();
  }

  _getDeepgramApiKey() {
    const raw = this._getSetting('deepgramKey') || process.env.DEEPGRAM_API_KEY || '';
    return String(raw || '').trim();
  }

  /**
   * Space: snapshot the current interviewer turn.
   * Does not read or return the live caption string. Mic stays running.
   */
  async finalizeInterviewTurn({ waitTrailingSilence = true } = {}) {
    if (this.usesDeepgramInterview() || this._deepgramActive) {
      return this._finalizeDeepgramTurn({ waitTrailingSilence });
    }

    const wasRecording = this.isRecording;
    if (waitTrailingSilence) {
      const waitMs = this._turnBuffer.waitMsForTrailingSilence(TRAILING_SILENCE_MS);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    const snapshot = this._turnBuffer.snapshot();
    this._turnBuffer.deactivate();
    this.rollingCaptionsPaused = true;

    const result = {
      text: '',
      usedCaption: false,
      durationMs: snapshot.durationMs,
      startedAt: snapshot.startedAt,
      lastVoiceAt: snapshot.lastVoiceAt,
      lastChunkAt: snapshot.lastChunkAt,
      micStillRecording: this.isRecording === wasRecording && this.isRecording === true
    };

    if (!snapshot.pcm.length || snapshot.durationMs < 80) {
      return result;
    }

    try {
      const raw = await this._transcribeWhisperBuffer(snapshot.pcm, {
        model: 'tiny',
        fast: false,
        rolling: false,
        language: this._rollingFastLanguage()
      });
      const clean = raw && typeof raw === 'string' ? raw.trim() : '';
      if (clean && !this._isHallucinatedTranscript(clean)) {
        result.text = clean;
      }
    } catch (error) {
      logger.warn('Interview turn Tiny decode failed', { error: error.message });
    }

    return result;
  }

  _startDeepgramRecording({ loopback = false } = {}) {
    this._cleanup();
    this.isRecording = true;
    this._deepgramActive = true;
    this._deepgramCaptionsPaused = false;
    this._turnFinalText = '';
    this._captionInterim = '';
    this._gotLoopbackAudio = false;
    this._lastLoopbackRms = 0;
    this._lastChunkSource = loopback ? 'loopback' : 'mic';
    this._audioCaptureSource = loopback ? 'loopback' : 'mic';
    this.useRendererCapture = true;
    this.rollingEnabled = false;
    this._stopRollingTimer();
    this._resetVadState();
    this._resetRollingState();
    this._connectDeepgramLive();
    this.emit('recording-started', {
      source: loopback ? 'loopback' : 'mic',
      provider: 'deepgram'
    });
    this.emit('status', loopback ? 'Deepgram loopback listening' : 'Deepgram recording started');
  }

  _connectDeepgramLive() {
    this._closeDeepgramLive();
    const apiKey = this._getDeepgramApiKey();
    if (!apiKey) {
      logger.warn('Deepgram live socket skipped (missing credentials)');
      return;
    }
    const dg = config.get('speech.deepgram') || {};
    const client = new DeepgramLiveClient({
      apiKey,
      WebSocketImpl: this.WebSocketImpl,
      url: buildListenUrl({
        model: dg.model,
        language: dg.language,
        endpointing: dg.endpointing,
        utteranceEndMs: dg.utteranceEndMs,
        sampleRate: dg.sampleRate,
        keyterms: dg.keyterms
      })
    });
    client.on('open', () => {
      logger.info('Deepgram live socket open');
    });
    client.on('message', (msg) => {
      this._handleDeepgramMessage(msg);
    });
    client.on('error', (error) => {
      logger.warn('Deepgram live error', { error: error && error.message });
    });
    client.on('close', () => {
      if (this._deepgramActive && this.isRecording && !client._intentionalClose) {
        this._deepgramReconnectTimer = setTimeout(() => {
          this._deepgramReconnectTimer = null;
          if (this._deepgramActive && this.isRecording) {
            this._connectDeepgramLive();
          }
        }, 500);
      }
    });
    this._deepgramLive = client;
    client.connect();
  }

  _closeDeepgramLive() {
    if (this._deepgramReconnectTimer) {
      clearTimeout(this._deepgramReconnectTimer);
      this._deepgramReconnectTimer = null;
    }
    if (this._deepgramLive) {
      try {
        this._deepgramLive.close();
      } catch (_) { /* ignore */ }
      this._deepgramLive = null;
    }
  }

  _ingestDeepgramAudio(buffer, source = 'loopback') {
    if (!buffer || !buffer.length) {
      return;
    }
    const energy = this._chunkRmsEnergy(buffer);
    if (!this._perfFirstAudio) {
      this._perfFirstAudio = true;
      this.emit('first-audio-chunk');
      logger.info('First interview audio chunk', {
        source,
        rms: Number(energy).toFixed(4),
        bytes: buffer.length
      });
    }

    if (source === 'loopback') {
      this._gotLoopbackAudio = true;
      this._lastLoopbackRms = energy;
      this._audioCaptureSource = 'loopback';
    }

    if (!this._deepgramCaptionsPaused) {
      const voiced = energy >= 0.004;
      if (voiced && !this._turnBuffer.active) {
        this._speechOnsetAt = Date.now();
        this._turnBuffer.begin(this._speechOnsetAt);
        this.emit('vad-speech-start');
      }
      if (this._turnBuffer.active) {
        this._turnBuffer.push(buffer, { now: Date.now(), voiced });
      }
    }

    if (this._deepgramLive) {
      this._deepgramLive.sendPcm(buffer);
    }
  }

  _handleDeepgramMessage(msg) {
    if (!msg || typeof msg !== 'object') {
      return;
    }
    if (msg.type === 'Error' || msg.error) {
      logger.warn('Deepgram live message error', {
        type: msg.type,
        description: msg.description || msg.message || msg.error
      });
      return;
    }
    if (msg.type === 'UtteranceEnd') {
      this._lastUtteranceEndAt = Date.now();
      return;
    }
    if (msg.type && msg.type !== 'Results') {
      return;
    }

    const transcript = (((msg.channel || {}).alternatives || [])[0] || {}).transcript;
    const text = String(transcript || '').trim();
    if (!text) {
      return;
    }

    const isFinal = !!(msg.is_final || msg.speech_final);
    if (!isFinal) {
      if (this._deepgramCaptionsPaused) {
        return;
      }
      if (!this._firstCaptionAt) {
        logger.info('Deepgram live caption', { chars: text.length });
      }
      this._captionInterim = text;
      if (!this._firstCaptionAt) {
        this._firstCaptionAt = Date.now();
        const onset = this._speechOnsetAt || this._rollingWindowStartedAt || this._firstCaptionAt;
        this.emit('first-caption', {
          decodeMs: 0,
          msFromSpeechOnset: this._firstCaptionAt - onset
        });
      }
      this.emit('interim-transcription', text);
      return;
    }

    this._appendTurnFinal(text);
  }

  _appendTurnFinal(text) {
    if (this._deepgramCaptionsPaused) {
      return;
    }
    const next = String(text || '').trim();
    if (!next) {
      return;
    }
    if (!this._turnBuffer.active && !this._speechOnsetAt) {
      this._speechOnsetAt = Date.now();
      this._turnBuffer.begin(this._speechOnsetAt);
    }
    if (!this._turnFinalText) {
      this._turnFinalText = next;
      return;
    }
    const current = this._turnFinalText;
    const a = current.toLowerCase();
    const b = next.toLowerCase();
    if (b.startsWith(a) && next.length >= current.length) {
      this._turnFinalText = next;
      return;
    }
    if (a.endsWith(b)) {
      return;
    }
    this._turnFinalText = `${current} ${next}`;
  }

  async _waitForLoopbackSilence() {
    const silenceMs = this._deepgramSpaceSilenceMs || DEEPGRAM_SPACE_SILENCE_MS;
    const maxWaitMs = this._deepgramSpaceMaxWaitMs || DEEPGRAM_SPACE_MAX_WAIT_MS;
    const floor = this._getVadEnergyFloor();
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      const energyHigh = this._lastLoopbackRms >= floor;
      const trailing = this._turnBuffer.trailingSilenceMs();
      if (!energyHigh && trailing >= silenceMs) {
        return 'silence';
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return 'timeout';
  }

  async _transcribeDeepgramPrerecorded(pcm) {
    return transcribePrerecorded(pcm, {
      apiKey: this._getDeepgramApiKey(),
      fetchImpl: this._deepgramFetchImpl,
      model: (config.get('speech.deepgram') || {}).model,
      language: (config.get('speech.deepgram') || {}).language,
      sampleRate: (config.get('speech.deepgram') || {}).sampleRate,
      keyterms: (config.get('speech.deepgram') || {}).keyterms
    });
  }

  async _finalizeDeepgramTurn({ waitTrailingSilence = true } = {}) {
    const wasRecording = this.isRecording;
    if (waitTrailingSilence) {
      await this._waitForLoopbackSilence();
    }

    const snapshot = this._turnBuffer.snapshot();
    this._turnBuffer.deactivate();
    this._deepgramCaptionsPaused = true;
    this.rollingCaptionsPaused = true;

    const source = this._gotLoopbackAudio ? 'loopback' : (this._lastChunkSource || 'mic');
    const rms = snapshot.pcm.length ? this._chunkRmsEnergy(snapshot.pcm) : (this._lastLoopbackRms || 0);
    const bufferMs = Math.round(snapshot.durationMs);
    let text = String(this._turnFinalText || '').trim();
    const blocked = source !== 'loopback' || rms < LOOPBACK_MIN_RMS;

    const result = {
      text: '',
      usedCaption: false,
      durationMs: snapshot.durationMs,
      startedAt: snapshot.startedAt,
      lastVoiceAt: snapshot.lastVoiceAt,
      lastChunkAt: snapshot.lastChunkAt,
      source,
      rms,
      bufferMs,
      blocked,
      micStillRecording: this.isRecording === wasRecording && this.isRecording === true,
      spaceLog: ''
    };

    if (!text && !blocked && snapshot.pcm.length && snapshot.durationMs >= 80) {
      try {
        const raw = await this._transcribeDeepgramPrerecorded(snapshot.pcm);
        text = raw && typeof raw === 'string' ? raw.trim() : '';
      } catch (error) {
        logger.warn('Deepgram prerecorded fallback failed', {
          error: (error && error.message) || String(error)
        });
      }
    }

    const spaceLog = formatSpaceLogLine({
      source,
      provider: 'deepgram',
      bufferMs,
      rms,
      transcript: blocked ? '' : text
    });
    result.spaceLog = spaceLog;
    logger.info(spaceLog);

    if (blocked) {
      return result;
    }
    result.text = text;
    return result;
  }

  async flushRollingForSubmit() {
    if (!this.rollingEnabled) return null;
    const deadline = Date.now() + 1500;
    while (this._interimInFlight && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    try {
      const availableMs = this._utteranceRing.durationMs;
      if (availableMs >= MIN_DECODE_MS && this.whisperWorker && this.whisperWorker.isConfigured()) {
        const pcm = this._utteranceRing.snapshotMs(Math.min(UTTERANCE_MS, availableMs));
        const text = await this._transcribeWhisperBuffer(pcm, {
          fast: true,
          rolling: true,
          language: this._rollingFastLanguage(),
          initialPrompt: this._rollingStabilizer.snapshot().committed.split(' ').slice(-12).join(' ')
        });
        const clean = text && typeof text === 'string' ? text.trim() : '';
        if (clean && !this._isHallucinatedTranscript(clean)) {
          this._rollingStabilizer.update(clean);
        }
      }
    } catch (error) {
      logger.debug('Rolling submit flush decode failed', { error: error.message });
    }
    const snapshot = this._rollingStabilizer.promoteAll();
    this._emitRollingCaption(snapshot);
    this.rollingCaptionsPaused = true;
    return snapshot;
  }

  resetRollingTranscript() {
    this._resetRollingState();
    this._speechOnsetAt = 0;
    this._firstCaptionAt = 0;
    this._perfFirstAudio = false;
    this._turnFinalText = '';
    this._captionInterim = '';
    this._deepgramCaptionsPaused = false;
  }

  _liveCaptionIntervalMs() {
    return 500;
  }

  _maybeScheduleLiveCaption() {
    if (this.rollingEnabled) {
      return;
    }
    if (!this.whisperWorker || !this.whisperWorker.isConfigured()) {
      return;
    }
    if (!this.isRecording || this.transcriptionInFlight || this._interimInFlight) {
      return;
    }
    if (this.vadSpeechMs < 400 || this.segmentBytes < 400 * 32) {
      return;
    }
    if (this.segmentBytes <= this._lastInterimBytes) {
      return;
    }
    const now = Date.now();
    if (now - this._lastInterimAt < this._liveCaptionIntervalMs()) {
      return;
    }
    this._lastInterimAt = now;
    this._decodeLiveCaption().catch((error) => {
      logger.debug('Live caption decode failed', { error: error.message });
    });
  }

  async _decodeLiveCaption() {
    if (this._interimInFlight || this.transcriptionInFlight || !this.segmentBytes) {
      return;
    }
    this._interimInFlight = true;
    const startedAt = Date.now();
    try {
      const snapshot = Buffer.concat(this.segmentBuffers, this.segmentBytes);
      this._lastInterimBytes = snapshot.length;
      const maxBytes = 6000 * 32;
      const window = snapshot.length > maxBytes
        ? snapshot.subarray(snapshot.length - maxBytes)
        : snapshot;
      const text = await this._transcribeWhisperBuffer(window, { fast: true });
      const clean = text && typeof text === 'string' ? text.trim() : '';
      if (clean && !this._isHallucinatedTranscript(clean)) {
        if (!this._firstCaptionAt && this._speechOnsetAt) {
          this._firstCaptionAt = Date.now();
          const decodeMs = Date.now() - startedAt;
          logger.info('Live caption first word', {
            msFromSpeechOnset: this._firstCaptionAt - this._speechOnsetAt,
            decodeMs,
            audioMs: Math.round(window.length / 32)
          });
          this.emit('first-caption', {
            decodeMs,
            msFromSpeechOnset: this._firstCaptionAt - this._speechOnsetAt
          });
        }
        this.emit('interim-transcription', clean);
      }
    } finally {
      this._interimInFlight = false;
      if (this.isRecording && this.vadSpeaking && !this.transcriptionInFlight) {
        this._maybeScheduleLiveCaption();
      }
    }
  }

  _chunkDurationMs(buffer) {
    // 16kHz mono 16-bit => 2 bytes/sample => 32 bytes/ms.
    return buffer.length / 32;
  }

  stopRecording() {
    if (!this.isRecording) {
      return;
    }

    this.isRecording = false;
    const sessionDuration = this.sessionStartTime ? Date.now() - this.sessionStartTime : 0;
    logger.info('Stopping speech recognition session', {
      provider: this.provider,
      sessionDuration: `${sessionDuration}ms`
    });

    if (this._deepgramActive || this.provider === 'deepgram') {
      this._deepgramActive = false;
      this._closeDeepgramLive();
      this._finalizeStop('Recording stopped');
      return;
    }

    if (this.provider === 'azure' && this.recognizer) {
      try {
        this.recognizer.stopContinuousRecognitionAsync(
          () => {
            this._finalizeStop('Recording stopped');
          },
          (error) => {
            logger.error('Error during recognition stop', { error: error.toString() });
            this._finalizeStop('Recording stopped');
          }
        );
      } catch (error) {
        logger.error('Error stopping recognizer', { error: error.message });
        this._finalizeStop('Recording stopped');
      }
      return;
    }

    if (this.provider === 'whisper') {
      this.isProcessingAudio = true;
      this.emit('recording-stopped');
      this.emit('status', 'Processing local speech…');
      this._finalizeWhisperStop({ captureAlreadyStopped: true });
      return;
    }

    this._finalizeStop('Recording stopped');
  }

  async _finalizeWhisperStop({ captureAlreadyStopped = false } = {}) {
    if (this.segmentTimer) {
      clearInterval(this.segmentTimer);
      this.segmentTimer = null;
    }

    if (this.recording) {
      try {
        this.recording.stop();
      } catch (error) {
        logger.error('Error stopping audio recording', { error: error.message });
      }
      this.recording = null;
    }

    try {
      await this._flushWhisperSegment({ final: true });
    } catch (error) {
      logger.error('Final Whisper transcription failed', { error: error.message });
      this.emit('error', `Whisper transcription failed: ${error.message}`);
    } finally {
      this._cleanup();
      this.isProcessingAudio = false;
      if (!this.whisperKeepAlive) {
        this.whisperWorker.releaseWhenIdle();
      }
      if (!captureAlreadyStopped) {
        this.emit('recording-stopped');
      }
      this.emit('status', 'Recording stopped');
    }
  }

  _finalizeStop(statusMessage) {
    this._cleanup();
    this.emit('recording-stopped');
    this.emit('status', statusMessage);
  }

  _cleanup() {
    if (this.segmentTimer) {
      clearInterval(this.segmentTimer);
      this.segmentTimer = null;
    }

    if (this.recognizer) {
      try {
        this.recognizer.close();
      } catch (error) {
        logger.error('Error closing recognizer', { error: error.message });
      }
      this.recognizer = null;
    }

    if (this.audioConfig) {
      try {
        if (typeof this.audioConfig.close === 'function') {
          this.audioConfig.close();
        }
      } catch (error) {
        logger.error('Error closing audio config', { error: error.message });
      }
      this.audioConfig = null;
    }

    if (this.recording) {
      try {
        this.recording.stop();
      } catch (error) {
        logger.error('Error stopping audio recording', { error: error.message });
      }
      this.recording = null;
    }

    if (this.pushStream) {
      try {
        if (typeof this.pushStream.close === 'function') {
          this.pushStream.close();
        }
      } catch (error) {
        logger.error('Error closing push stream', { error: error.message });
      }
      this.pushStream = null;
    }

    this.segmentBuffers = [];
    this.segmentBytes = 0;
    this.transcriptionInFlight = false;
    this.pendingFlush = false;
    this.pendingFinal = false;
    this._resetVadState();
    this._audioDataLogged = false;
    this.useRendererCapture = false;
    if (!this.isRecording) {
      this._deepgramActive = false;
      this._closeDeepgramLive();
    }
  }

  async recognizeFromFile(audioFilePath) {
    if (this.provider === 'azure') {
      if (!this.speechConfig) {
        throw new Error('Speech service not initialized');
      }

      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      const audioConfig = sdk.AudioConfig.fromWavFileInput(audioFilePath);
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      return await new Promise((resolve, reject) => {
        recognizer.recognizeOnceAsync(
          (result) => {
            resolve(result.reason === sdk.ResultReason.RecognizedSpeech ? result.text : '');
            recognizer.close();
            audioConfig.close();
          },
          (error) => {
            reject(new Error(`File recognition error: ${error}`));
            recognizer.close();
            audioConfig.close();
          }
        );
      });
    }

    if (this.provider === 'whisper') {
      return this._transcribeWhisperFile(audioFilePath);
    }

    throw new Error('Speech service not initialized');
  }

  async testConnection() {
    if (this.provider === 'azure') {
      if (!this.speechConfig) {
        throw new Error('Speech service not initialized');
      }

      try {
        const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
        const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);
        recognizer.close();
        audioConfig.close();
        return { success: true, message: 'Azure connection test successful' };
      } catch (error) {
        return { success: false, message: error.message };
      }
    }

    if (this.provider === 'whisper') {
      if (!this.whisperCommand) {
        return { success: false, message: 'Local Whisper CLI not found' };
      }
      // Actually probe the executable to confirm it works
      const probe = spawnSync(
        this.whisperCommand.command,
        [...this.whisperCommand.baseArgs, '--help'],
        { encoding: 'utf8', timeout: 10000 }
      );
      if (probe.error || probe.status !== 0) {
        const err = probe.error ? probe.error.message : `exit code ${probe.status}`;
        return {
          success: false,
          message: `Local Whisper CLI detected but probe failed: ${err}`
        };
      }
      return {
        success: true,
        message: `Local Whisper CLI works: ${this.whisperCommand.command}`
      };
    }

    return { success: false, message: 'Speech service not initialized' };
  }

  setWhisperKeepAlive(enabled) {
    if (enabled && this.usesDeepgramInterview()) {
      this.whisperKeepAlive = false;
      this.rollingEnabled = false;
      this._stopRollingTimer();
      return;
    }
    this.whisperKeepAlive = !!enabled;
    this.rollingEnabled = !!enabled
      && this.provider === 'whisper'
      && !!(this.whisperWorker && this.whisperWorker.isConfigured());
    if (this.whisperKeepAlive) {
      this.whisperWorker.hold();
      this._resetRollingState();
      if (this.rollingEnabled) {
        this._startRollingTimer();
        logger.info('Rolling Whisper captions enabled', {
          intervalMs: this._rollingIntervalMs(),
          ringBufferMs: RING_MS,
          overlapMs: OVERLAP_MS,
          decodeWindowMs: DECODE_MS
        });
      }
      if (this.whisperWorker.isConfigured()) {
        this.whisperWorker.warmup({
          model: this._getWhisperModel(),
          modelDir: this._getWhisperModelDir(),
          device: this._getWhisperDevice()
        }).then(() => this._primeRollingDecoder()).catch((error) => {
          logger.warn('Whisper keep-alive warmup failed', { error: error.message });
        });
      }
      return;
    }
    this._stopRollingTimer();
    this.rollingCaptionsPaused = false;
    this.whisperWorker.releaseWhenIdle();
  }

  getStatus() {
    return {
      provider: this.usesDeepgramInterview() ? 'deepgram' : this.provider,
      isRecording: this.isRecording,
      isProcessingAudio: this.isProcessingAudio,
      isInitialized: this.provider === 'azure'
        ? !!this.speechConfig
        : (this.provider === 'deepgram' || this._hasDeepgramKey())
          ? this._hasDeepgramKey()
          : !!this.whisperCommand,
      sessionDuration: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0,
      retryCount: this.retryCount,
      effectiveSettings: {
        speechProvider: this.usesDeepgramInterview() ? 'deepgram' : this.provider,
        azureKey: this._getSetting('azureKey') || '',
        azureRegion: this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION || '',
        deepgramKeyConfigured: this._hasDeepgramKey(),
        whisperCommand: this._getSetting('whisperCommand') || process.env.WHISPER_COMMAND || '',
        whisperModelDir: this._getWhisperModelDir(),
        whisperModel: this._getWhisperModel(),
        whisperLanguage: this._getWhisperLanguage(),
        whisperCaptureMode: this._getWhisperCaptureMode(),
        whisperDevice: this._getWhisperDevice(),
        whisperSegmentMs: String(this._getWhisperSegmentMs())
      },
      config: {
        azure: config.get('speech.azure') || {},
        whisper: config.get('speech.whisper') || {},
        deepgram: config.get('speech.deepgram') || {},
        selectedProvider: this.usesDeepgramInterview() ? 'deepgram' : this.provider
      }
    };
  }

  isAvailable() {
    if (this._hasDeepgramKey()) {
      return true;
    }

    if (this.provider === 'azure') {
      return !!this.speechConfig && !!this.available;
    }

    if (this.provider === 'whisper') {
      return !!this.whisperCommand && !!this.available;
    }

    if (this.provider === 'deepgram') {
      return this._hasDeepgramKey();
    }

    return false;
  }

  isManualCaptureMode() {
    return this.provider === 'whisper' && this._getWhisperCaptureMode() === 'manual';
  }

  shutdown() {
    this.isRecording = false;
    this.isProcessingAudio = false;
    this.rollingEnabled = false;
    this._deepgramActive = false;
    this.interviewCapture = false;
    this._stopRollingTimer();
    this._closeDeepgramLive();
    this._cleanup();
    this.whisperWorker.close();
  }

  updateSettings(settings = {}) {
    const speechKeys = ['speechProvider', 'azureKey', 'azureRegion', 'deepgramKey', 'whisperCommand', 'whisperModelDir', 'whisperModel', 'whisperLanguage', 'whisperCaptureMode', 'whisperDevice', 'whisperSegmentMs'];
    let changed = false;

    for (const key of speechKeys) {
      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        this.runtimeSettings[key] = settings[key];
        changed = true;
      }
    }

    if (changed) {
      this.initializeClient();
    }

    return this.getStatus();
  }

  _getConfiguredProvider() {
    const provider = String(this._getSetting('speechProvider') || process.env.SPEECH_PROVIDER || '').trim().toLowerCase();

    if (provider === 'azure' || provider === 'whisper' || provider === 'deepgram') {
      return provider;
    }

    if (this._hasDeepgramKey()) {
      return 'deepgram';
    }

    const hasAzure = !!((this._getSetting('azureKey') || process.env.AZURE_SPEECH_KEY) &&
      (this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION));

    if (hasAzure) {
      return 'azure';
    }

    return 'whisper';
  }

  _getWhisperModel() {
    const raw = this._getSetting('whisperModel') || process.env.WHISPER_MODEL || config.get('speech.whisper.model') || 'small';
    const value = String(raw || '').trim();
    return value || 'small';
  }

  _getWhisperModelDir() {
    const configured = this._getSetting('whisperModelDir') || process.env.WHISPER_MODEL_DIR || '';
    // Honor an absolute configured dir. Empty or relative values (the old
    // `.whisper-models` default resolved against an unstable cwd) are replaced
    // with the stable userData location the installer downloads weights into,
    // so --model_dir and download_root always agree.
    if (configured && path.isAbsolute(configured)) {
      return configured;
    }
    return this._getUserDataModelDir() || configured;
  }

  /**
   * Absolute model-weights dir under Electron userData — matches
   * WhisperInstaller.modelDir so transcription finds downloaded models.
   */
  _getUserDataModelDir() {
    try {
      const { app } = require('electron');
      return path.join(app.getPath('userData'), '.whisper-models');
    } catch (_) {
      return '';
    }
  }

  _getWhisperLanguage() {
    const raw = this._getSetting('whisperLanguage') || process.env.WHISPER_LANGUAGE || config.get('speech.whisper.language') || 'auto';
    return sanitizeWhisperLanguage(raw);
  }

  _getWhisperSegmentMs() {
    const rawValue = this._getSetting('whisperSegmentMs') || process.env.WHISPER_SEGMENT_MS || config.get('speech.whisper.segmentMs') || 4000;
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? Math.max(2000, parsed) : 4000;
  }

  _vadNumber(settingKey, envKey, configPath, fallback, min) {
    const raw = this._getSetting(settingKey) || process.env[envKey] || config.get(configPath) || fallback;
    const parsed = Number(raw);
    const value = Number.isFinite(parsed) ? parsed : fallback;
    return typeof min === 'number' ? Math.max(min, value) : value;
  }

  _isVadEnabled() {
    const override = this._getSetting('whisperVadEnabled');
    if (override === false || override === 'false') return false;
    if (override === true || override === 'true') return true;
    if (process.env.WHISPER_VAD_ENABLED === 'false') return false;
    const configured = config.get('speech.whisper.vadEnabled');
    return configured !== false;
  }

  _getSilenceHangoverMs() {
    return this._vadNumber('whisperSilenceHangoverMs', 'WHISPER_SILENCE_HANGOVER_MS', 'speech.whisper.silenceHangoverMs', 700, 200);
  }

  _getMinUtteranceMs() {
    return this._vadNumber('whisperMinUtteranceMs', 'WHISPER_MIN_UTTERANCE_MS', 'speech.whisper.minUtteranceMs', 350, 100);
  }

  _getMaxUtteranceMs() {
    return this._vadNumber('whisperMaxUtteranceMs', 'WHISPER_MAX_UTTERANCE_MS', 'speech.whisper.maxUtteranceMs', 15000, 2000);
  }

  _getPreRollMs() {
    return this._vadNumber('whisperPreRollMs', 'WHISPER_PRE_ROLL_MS', 'speech.whisper.preRollMs', 300, 0);
  }

  _getVadEnergyFloor() {
    return this._vadNumber('whisperVadEnergyFloor', 'WHISPER_VAD_ENERGY_FLOOR', 'speech.whisper.vadEnergyFloor', 0.008, 0.0005);
  }

  _getSetting(key) {
    const value = this.runtimeSettings[key];
    return value === '' ? null : value;
  }

  _isManualCaptureMode() {
    return this._getWhisperCaptureMode() === 'manual';
  }

  _getWhisperCaptureMode() {
    const configured = String(
      this._getSetting('whisperCaptureMode') || process.env.WHISPER_CAPTURE_MODE || ''
    ).trim().toLowerCase();
    if (configured === 'manual' || configured === 'vad') {
      return configured;
    }

    // Backward compatibility for existing local configurations.
    if (process.env.WHISPER_MANUAL_CAPTURE !== undefined) {
      return process.env.WHISPER_MANUAL_CAPTURE === 'false' ? 'vad' : 'manual';
    }
    return 'vad';
  }

  _getManualCaptureMaxMs() {
    const parsed = Number(process.env.WHISPER_MANUAL_MAX_MS || 90000);
    return Number.isFinite(parsed) ? Math.max(5000, parsed) : 90000;
  }

  _getWhisperDevice() {
    return String(process.env.WHISPER_DEVICE || 'auto').trim().toLowerCase();
  }

  _getWhisperPythonPath() {
    const seen = new Set();
    const accept = (pythonPath, extraArgs = []) => {
      if (!pythonPath || seen.has(pythonPath)) return null;
      seen.add(pythonPath);
      if (!fs.existsSync(pythonPath)) return null;
      return this._pythonHasWhisper(pythonPath, extraArgs) ? pythonPath : null;
    };

    const configuredPython = String(process.env.WHISPER_PYTHON || '').trim();
    if (configuredPython) {
      const resolvedPython = path.isAbsolute(configuredPython)
        ? path.normalize(configuredPython)
        : path.resolve(configuredPython);
      const hit = accept(resolvedPython);
      if (hit) return hit;
    }

    const userDataCandidate = this._getUserDataWhisperCandidate();
    if (userDataCandidate) {
      const hit = accept(userDataCandidate.command);
      if (hit) return hit;
    }

    const projectVenv = path.join(
      process.cwd(),
      '.venv-whisper',
      process.platform === 'win32' ? path.join('Scripts', 'python.exe') : path.join('bin', 'python')
    );
    const projectHit = accept(projectVenv);
    if (projectHit) return projectHit;

    if (this.whisperCommand) {
      const moduleIndex = this.whisperCommand.baseArgs.indexOf('-m');
      if (
        moduleIndex !== -1 &&
        this.whisperCommand.baseArgs[moduleIndex + 1] === 'whisper' &&
        fs.existsSync(this.whisperCommand.command)
      ) {
        const hit = accept(this.whisperCommand.command);
        if (hit) return hit;
      }

      const whisperAbs = this._resolveExecutable(this.whisperCommand.command);
      if (whisperAbs) {
        const dir = path.dirname(whisperAbs);
        const pythonName = process.platform === 'win32' ? 'python.exe' : 'python';
        for (const candidate of [
          path.join(dir, pythonName),
          path.join(dir, '..', pythonName)
        ]) {
          const hit = accept(path.normalize(candidate));
          if (hit) return hit;
        }
      }
    }

    if (process.platform === 'win32') {
      const launcherPython = this._resolvePyLauncherPython();
      const hit = accept(launcherPython);
      if (hit) return hit;
    }

    for (const name of process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python']) {
      const abs = this._resolveExecutable(name);
      const hit = accept(abs);
      if (hit) return hit;
    }

    return null;
  }

  _resolveExecutable(command) {
    if (!command) return null;
    if (path.isAbsolute(command) && fs.existsSync(command)) {
      return path.normalize(command);
    }
    try {
      const finder = process.platform === 'win32' ? 'where' : 'which';
      const probe = spawnSync(finder, [command], {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true
      });
      if (probe.status === 0 && probe.stdout) {
        const first = probe.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0];
        if (first && fs.existsSync(first)) {
          return path.normalize(first);
        }
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  _resolvePyLauncherPython() {
    try {
      const probe = spawnSync('py', ['-3', '-c', 'import sys; print(sys.executable)'], {
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true
      });
      if (probe.status === 0) {
        const resolved = String(probe.stdout || '').trim().split(/\r?\n/).filter(Boolean)[0];
        if (resolved && fs.existsSync(resolved)) {
          return path.normalize(resolved);
        }
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  _pythonHasWhisper(pythonPath, extraArgs = []) {
    try {
      const probe = spawnSync(
        pythonPath,
        [...extraArgs, '-c', 'import importlib.util,sys; sys.exit(0 if importlib.util.find_spec("whisper") else 1)'],
        { encoding: 'utf8', timeout: 8000, windowsHide: true }
      );
      return !probe.error && probe.status === 0;
    } catch (_) {
      return false;
    }
  }

  _getWhisperWorkerScriptPath() {
    const sourcePath = path.resolve(__dirname, '..', '..', 'scripts', 'whisper_worker.py');
    return sourcePath.includes('app.asar')
      ? sourcePath.replace('app.asar', 'app.asar.unpacked')
      : sourcePath;
  }

  _configureWhisperWorker() {
    const pythonPath = this._getWhisperPythonPath();
    const scriptPath = this._getWhisperWorkerScriptPath();
    const idleUnloadMs = Math.max(10000, Number(process.env.WHISPER_GPU_IDLE_MS || 60000));
    this.whisperWorker.configure({ pythonPath, scriptPath, idleUnloadMs });

    logger.info('Whisper worker configuration', {
      configured: this.whisperWorker.isConfigured(),
      pythonPath,
      scriptPath,
      device: this._getWhisperDevice(),
      idleUnloadMs
    });
  }

  /**
   * Build a whisper candidate pointing at the app-local venv inside
   * Electron's userData directory. This is where the onboarding installer
   * creates the venv in packaged builds.
   */
  _getUserDataWhisperCandidate() {
    try {
      const { app } = require('electron');
      const userData = app.getPath('userData');
      const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
      const ext = process.platform === 'win32' ? '.exe' : '';
      const python = path.join(userData, '.venv-whisper', binDir, `python${ext}`);
      if (fs.existsSync(python)) {
        return { command: python, baseArgs: ['-m', 'whisper'] };
      }
    } catch (_) {
      // electron may not be available in unit tests
    }
    return null;
  }

  _resolveWhisperCommand() {
    const configured = this._getSetting('whisperCommand') || process.env.WHISPER_COMMAND;
    const candidates = [];

    if (configured) {
      candidates.push(...this._expandConfiguredWhisperCandidates(configured));
    }

    // Persistent app venv (highest priority after explicit config)
    const userDataVenv = this._getUserDataWhisperCandidate();
    if (userDataVenv) {
      candidates.push({ ...userDataVenv, source: 'app userData venv' });
    }

    // Platform-aware fallback candidates (higher priority = tried first)
    candidates.push({ command: 'whisper', baseArgs: [], source: 'system PATH' });
    if (process.platform === 'win32') {
      candidates.push({ command: 'whisper.exe', baseArgs: [], source: 'system PATH (exe)' });
      candidates.push({ command: 'py', baseArgs: ['-3', '-m', 'whisper'], source: 'py launcher' });
    }
    candidates.push({ command: 'python3', baseArgs: ['-m', 'whisper'], source: 'python3 module' });
    candidates.push({ command: 'python', baseArgs: ['-m', 'whisper'], source: 'python module' });

    for (const candidate of candidates) {
      if (!candidate || !candidate.command) {
        continue;
      }

      const resolved = this._probeWhisperCandidate(candidate);
      if (resolved) {
        logger.info('Whisper command resolved', {
          command: resolved.command,
          baseArgs: resolved.baseArgs,
          source: resolved.source || candidate.source || 'unknown'
        });
        return resolved;
      }
    }

    logger.warn('No Whisper CLI candidate succeeded after probing all fallbacks');
    return null;
  }

  /**
   * Fast, torch-free check for python `-m whisper` candidates. Importing the
   * whisper package pulls in torch/numba and can take well over 8 s on a cold
   * cache (first run after install), which made `--help` time out and the mic
   * button stay hidden until a second launch. `importlib.util.find_spec`
   * confirms the module is installed without importing it, returning in well
   * under a second. Returns the candidate on success, else null.
   */
  _probeWhisperModuleFast(candidate) {
    const mIdx = candidate.baseArgs.indexOf('-m');
    if (mIdx === -1 || candidate.baseArgs[mIdx + 1] !== 'whisper') {
      return null; // not a `-m whisper` form (e.g. a whisper binary)
    }
    const pyArgs = candidate.baseArgs.slice(0, mIdx);
    const script = 'import importlib.util,sys; sys.exit(0 if importlib.util.find_spec("whisper") else 1)';
    try {
      // No shell: an absolute .exe runs directly. shell:true on Windows does
      // NOT quote args, so a spaced path like
      //   C:\Users\CANDAN SINGH\...\python.exe
      // would be split at the space and the probe would wrongly fail —
      // hiding the mic for any user whose profile name contains a space.
      const probe = spawnSync(candidate.command, [...pyArgs, '-c', script], {
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true,
      });
      if (!probe.error && probe.status === 0) {
        return candidate;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  /**
   * Probe a single candidate: exists check → fast module check → spawn --help.
   * Returns the working candidate object, or null on failure.
   */
  _probeWhisperCandidate(candidate) {
    const cmd = candidate.command;
    const args = [...candidate.baseArgs, '--help'];

    // Fast path: skip spawnSync if the file clearly doesn't exist
    if (path.isAbsolute(cmd) || cmd.includes(path.sep) || cmd.includes('/')) {
      try {
        const normalized = path.normalize(cmd);
        if (!fs.existsSync(normalized)) {
          logger.debug('Whisper probe skipped: file does not exist', {
            command: cmd,
            normalized
          });
          return null;
        }
      } catch (e) {
        // fs.existsSync can throw on invalid paths; treat as missing
        return null;
      }
    }

    // Cheap torch-free check first so the mic appears on the first run.
    const fast = this._probeWhisperModuleFast(candidate);
    if (fast) {
      logger.debug('Whisper module confirmed via find_spec', { command: cmd });
      return fast;
    }

    let probe;
    try {
      probe = spawnSync(cmd, args, {
        encoding: 'utf8',
        // First `import whisper` (torch/numba) can be slow on a cold cache.
        timeout: 30000,
        windowsHide: true,
        // No shell — see _probeWhisperModuleFast: shell:true on Windows splits
        // spaced paths (e.g. "C:\Users\CANDAN SINGH\...") and breaks the probe.
      });
    } catch (spawnErr) {
      logger.debug('Whisper probe spawn error', {
        command: cmd,
        error: spawnErr.message
      });
      return null;
    }

    const output = `${probe.stdout || ''}\n${probe.stderr || ''}`;
    const noModule = output.includes('No module named whisper');
    const isHelpOutput = output.includes('usage:') || output.includes('whisper') || output.includes('options');

    if (!probe.error && probe.status === 0 && !noModule) {
      return candidate;
    }

    // Some whisper builds exit with non-zero on --help but still print usage
    if (!probe.error && !noModule && isHelpOutput) {
      logger.debug('Whisper probe accepted non-zero help output', {
        command: cmd,
        status: probe.status
      });
      return candidate;
    }

    logger.debug('Whisper probe failed', {
      command: cmd,
      status: probe.status,
      error: probe.error ? probe.error.message : null,
      noModule,
      isHelpOutput,
      outputPreview: output.substring(0, 200)
    });
    return null;
  }

  _expandConfiguredWhisperCandidates(rawCommand) {
    const parsed = this._parseCommand(rawCommand);
    if (!parsed) {
      return [];
    }

    const candidates = [];
    // Normalize forward slashes to platform separator before trying anything
    const normalizedCmd = path.normalize(parsed.command);

    candidates.push({
      command: normalizedCmd,
      baseArgs: parsed.baseArgs,
      source: 'configured (normalized)'
    });

    const resolvedPath = path.resolve(normalizedCmd);
    if (resolvedPath !== normalizedCmd) {
      candidates.push({
        command: resolvedPath,
        baseArgs: parsed.baseArgs,
        source: 'configured (resolved)'
      });
    }

    if (process.platform === 'win32') {
      const base = normalizedCmd;
      // Try .exe / .cmd / .bat variants when extension is missing
      if (!/\.(exe|cmd|bat)$/i.test(base)) {
        candidates.push({ command: `${base}.exe`, baseArgs: parsed.baseArgs, source: 'configured (.exe)' });
        candidates.push({ command: `${base}.cmd`, baseArgs: parsed.baseArgs, source: 'configured (.cmd)' });
        if (resolvedPath !== base) {
          candidates.push({ command: `${resolvedPath}.exe`, baseArgs: parsed.baseArgs, source: 'configured (resolved .exe)' });
        }
      }
      // Some Windows venvs create whisper-script.py alongside whisper.exe
      const scriptPath = base + '-script.py';
      candidates.push({ command: 'python', baseArgs: [scriptPath, ...parsed.baseArgs], source: 'configured (script.py)' });
      // Try using the venv's own python with -m whisper
      const venvPython = path.join(path.dirname(base), 'python.exe');
      if (fs.existsSync(venvPython)) {
        candidates.push({ command: venvPython, baseArgs: ['-m', 'whisper', ...parsed.baseArgs], source: 'configured (venv python -m whisper)' });
      }
    } else {
      // On Unix, try the directory's python3 with -m whisper if the configured path looks like a venv entry point
      const venvPython3 = path.join(path.dirname(normalizedCmd), 'python3');
      if (fs.existsSync(venvPython3)) {
        candidates.push({ command: venvPython3, baseArgs: ['-m', 'whisper', ...parsed.baseArgs], source: 'configured (venv python3 -m whisper)' });
      }
      const venvPython = path.join(path.dirname(normalizedCmd), 'python');
      if (fs.existsSync(venvPython)) {
        candidates.push({ command: venvPython, baseArgs: ['-m', 'whisper', ...parsed.baseArgs], source: 'configured (venv python -m whisper)' });
      }
    }

    return candidates;
  }

  _parseCommand(rawCommand) {
    // Respect double-quoted segments so Windows userData paths like
    // "C:\Users\CANDAN SINGH\...\python.exe" survive intact.
    const trimmed = String(rawCommand || '').trim();
    if (!trimmed) {
      return null;
    }
    const parts = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) || [trimmed];
    const normalized = parts.map((p) => p.replace(/^"|"$/g, '')).filter(Boolean);
    if (normalized.length === 0) {
      return null;
    }

    return {
      command: normalized[0],
      baseArgs: normalized.slice(1)
    };
  }

  _startMicrophoneCapture() {
    if (!recorder || typeof recorder.record !== 'function') {
      this.emit('error', 'Local microphone capture dependency is missing. Run npm install to restore speech recording support.');
      return;
    }

    // node-record-lpcm16 only ships two recorder modules: `sox` and `arecord`.
    // `recorder` is the option it actually reads (the old `recordProgram` name
    // was silently ignored, so every attempt fell back to sox). Each entry maps
    // the recorder module to the binary we must verify is on PATH.
    //   - macOS: sox (via Homebrew)
    //   - Linux: arecord (ALSA, usually preinstalled) then sox
    const candidates = process.platform === 'darwin'
      ? [{ recorder: 'sox', bin: 'sox' }]
      : [{ recorder: 'arecord', bin: 'arecord' }, { recorder: 'sox', bin: 'sox' }];
    this._startMicrophoneCaptureWithFallback(candidates);
  }

  /**
   * Whether an audio capture binary is on PATH. node-record-lpcm16 spawns
   * these directly and, when the binary is missing, emits an `error` on its
   * child process with no listener — which would otherwise crash the whole
   * app. We pre-filter to binaries that exist so the library never receives a
   * missing program.
   */
  _audioProgramExists(bin) {
    try {
      const r = spawnSync(
        process.platform === 'win32' ? 'where' : 'which',
        [bin],
        { windowsHide: true, timeout: 4000 }
      );
      return r.status === 0;
    } catch (_) {
      return false;
    }
  }

  _startMicrophoneCaptureWithFallback(candidates) {
    const available = candidates.filter((c) => this._audioProgramExists(c.bin));

    if (available.length === 0) {
      const hint = process.platform === 'darwin'
        ? 'Install one with `brew install sox`.'
        : process.platform === 'linux'
          ? 'Install one with `sudo apt install alsa-utils` (arecord) or `sudo apt install sox`.'
          : 'No supported microphone capture tool was found.';
      logger.warn('No audio capture program available', {
        tried: candidates.map((c) => c.bin),
        platform: process.platform,
      });
      this.isRecording = false;
      this.emit('error', `Microphone capture needs sox or arecord, but none was found. ${hint}`);
      return;
    }

    const queue = [...available];

    const tryNextProgram = () => {
      const candidate = queue.shift();
      if (!candidate) {
        this.isRecording = false;
        this.emit('error', 'Could not start microphone capture with any available audio program');
        return;
      }

      const program = candidate.bin;
      try {
        this.recording = recorder.record({
          sampleRate: 16000,
          sampleRateHertz: 16000,
          channels: 1,
          threshold: 0,
          verbose: false,
          recorder: candidate.recorder,
          silence: '10.0s'
        });

        const stream = this.recording.stream();
        this.audioProgram = program;

        // Guard the spawned child process directly. A spawn failure (e.g. the
        // binary disappeared between our probe and the spawn, or a permission
        // error) emits `error` on the child, which node-record-lpcm16 leaves
        // unhandled — fatal without this listener.
        const child = this.recording.process;
        if (child && typeof child.on === 'function') {
          child.on('error', (error) => {
            logger.error('Audio recording process error', { error: error.message, program });
            if (this.recording) {
              try { this.recording.stop(); } catch (_) { /* ignore */ }
              this.recording = null;
            }
            if (this.isRecording) tryNextProgram();
          });
        }

        stream.on('error', (error) => {
          logger.error('Audio recording stream error', { error: error.message, program });
          if (this.recording) {
            try {
              this.recording.stop();
            } catch (stopError) {
              logger.error('Error stopping failed recording program', { error: stopError.message });
            }
            this.recording = null;
          }

          if (this.isRecording) {
            tryNextProgram();
          }
        });

        stream.on('data', (chunk) => {
          this._handleAudioChunk(chunk);
        });
      } catch (error) {
        logger.error('Failed to start microphone capture program', { program, error: error.message });
        tryNextProgram();
      }
    };

    tryNextProgram();
  }

  _handleAudioChunk(chunk) {
    if (!chunk || !chunk.length || !this.isRecording) {
      return;
    }

    if (this.provider === 'azure' && this.pushStream) {
      try {
        this.pushStream.write(chunk);
      } catch (error) {
        logger.error('Error writing audio data to Azure push stream', { error: error.message });
      }
      return;
    }

    if (this._deepgramActive) {
      this._ingestDeepgramAudio(Buffer.from(chunk), this._audioCaptureSource || 'mic');
      return;
    }

    if (this.provider === 'whisper') {
      this._ingestWhisperAudio(Buffer.from(chunk));
    }
  }

  async _flushWhisperSegment({ final }) {
    if (this.transcriptionInFlight) {
      // A flush was requested while a transcription is still running. Record
      // that we owe a follow-up flush for ANY request (not just a final one),
      // otherwise an utterance that ended mid-transcription stays stranded in
      // the buffer until the next utterance ends or the session stops. Track
      // final-ness separately so a queued stop still finalises correctly.
      this.pendingFlush = true;
      if (final) {
        this.pendingFinal = true;
      }
      return;
    }

    if (!this.segmentBytes) {
      return;
    }

    const audioBuffer = Buffer.concat(this.segmentBuffers, this.segmentBytes);
    this.segmentBuffers = [];
    this.segmentBytes = 0;

    this.transcriptionInFlight = true;

    try {
      const transcript = await this._transcribeWhisperBuffer(audioBuffer);
      const clean = transcript ? transcript.trim() : '';
      if (clean && !this._isHallucinatedTranscript(clean)) {
        this.emit('transcription', clean);
      } else if (clean) {
        logger.debug('Dropped likely Whisper silence hallucination', { transcript: clean });
      }
    } finally {
      this.transcriptionInFlight = false;

      if (this.pendingFlush) {
        this.pendingFlush = false;
        const runFinal = this.pendingFinal;
        this.pendingFinal = false;
        await this._flushWhisperSegment({ final: runFinal });
      }
    }
  }

  /**
   * Whisper reliably hallucinates a small set of stock phrases when fed near-
   * silence or non-speech audio (training-data artifacts from video captions).
   * VAD already prevents most silent flushes; this is the final guard so these
   * phantom phrases never reach the chat or the LLM.
   */
  _isHallucinatedTranscript(text) {
    const normalized = text.toLowerCase().replace(/[\s.,!?¡¿"'`]+/g, ' ').trim();
    if (!normalized) {
      return true;
    }
    const HALLUCINATIONS = new Set([
      'thank you',
      'thank you for watching',
      'thanks for watching',
      'thank you so much for watching',
      'please subscribe',
      'like and subscribe',
      'you',
      'bye',
      'bye bye',
      'okay',
      'ok',
      'so',
      'the end',
      'subtitles by the amara org community'
    ]);
    return HALLUCINATIONS.has(normalized);
  }

  async _transcribeWhisperBuffer(audioBuffer, options = {}) {
    if (this.whisperWorker.isConfigured() && audioBuffer && audioBuffer.length) {
      const startedAt = Date.now();
      try {
        const result = await this.whisperWorker.transcribe(null, {
          pcm: audioBuffer,
          sampleRate: 16000,
          model: options.model || this._getWhisperModel(),
          language: options.language || this._getWhisperLanguage(),
          modelDir: this._getWhisperModelDir(),
          device: this._getWhisperDevice(),
          fast: !!options.fast,
          rolling: !!options.rolling,
          initialPrompt: options.initialPrompt || undefined
        });
        if (result.language) {
          this._rollingLanguage = result.language;
        }
        if (!options.fast) {
          logger.info('Persistent Whisper transcription completed', {
            processingTime: Date.now() - startedAt,
            model: result.model,
            device: result.device,
            gpu: result.gpu,
            detectedLanguage: result.language
          });
        } else {
          logger.debug('Live caption chunk decoded', {
            processingTime: Date.now() - startedAt,
            textLength: (result.text || '').length,
            rolling: !!options.rolling
          });
        }
        return result.text || '';
      } catch (error) {
        if (options.fast) {
          throw error;
        }
        logger.warn('Persistent Whisper PCM decode failed; falling back to WAV file', {
          error: error.message
        });
      }
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-whisper-'));
    const audioFilePath = path.join(tempDir, options.fast ? 'live.wav' : 'segment.wav');

    try {
      fs.writeFileSync(audioFilePath, this._createWavBuffer(audioBuffer));
      return await this._transcribeWhisperFile(audioFilePath, options);
    } finally {
      this._removeTempDir(tempDir);
    }
  }

  async _transcribeWhisperFile(audioFilePath, options = {}) {
    if (!this.whisperCommand) {
      throw new Error('Local Whisper CLI not configured');
    }

    if (this.whisperWorker.isConfigured()) {
      const startedAt = Date.now();
      try {
        const result = await this.whisperWorker.transcribe(audioFilePath, {
          model: options.model || this._getWhisperModel(),
          language: options.language || this._getWhisperLanguage(),
          modelDir: this._getWhisperModelDir(),
          device: this._getWhisperDevice(),
          fast: !!options.fast,
          rolling: !!options.rolling
        });
        if (result.language) {
          this._rollingLanguage = result.language;
        }
        if (!options.fast) {
          logger.info('Persistent Whisper transcription completed', {
            processingTime: Date.now() - startedAt,
            model: result.model,
            device: result.device,
            gpu: result.gpu,
            detectedLanguage: result.language
          });
        } else {
          logger.debug('Live caption chunk decoded', {
            processingTime: Date.now() - startedAt,
            textLength: (result.text || '').length
          });
        }
        return result.text || '';
      } catch (error) {
        if (options.fast) {
          throw error;
        }
        logger.warn('Persistent Whisper worker failed; falling back to CLI', {
          error: error.message,
          workerTraceback: error.workerTraceback
        });
      }
    }

    if (options.fast) {
      return '';
    }

    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-whisper-out-'));
    const args = [
      ...this.whisperCommand.baseArgs,
      audioFilePath,
      '--model', this._getWhisperModel(),
      '--task', 'transcribe',
      '--output_format', 'txt',
      '--output_dir', outputDir,
      '--verbose', 'False',
      '--fp16', 'False'
    ];

    const language = this._getWhisperLanguage();
    if (language && language !== 'auto' && language !== 'detect') {
      args.push('--language', language);
    }

    if (this._getWhisperModelDir()) {
      args.push('--model_dir', this._getWhisperModelDir());
    }

    try {
      await new Promise((resolve, reject) => {
        const child = spawn(this.whisperCommand.command, args, {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stderr = '';
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });

        child.on('error', (error) => {
          reject(error);
        });

        child.on('close', (code) => {
          if (code === 0) {
            resolve();
            return;
          }

          reject(new Error(stderr.trim() || `Whisper exited with code ${code}`));
        });
      });

      const transcriptPath = path.join(outputDir, `${path.parse(audioFilePath).name}.txt`);
      if (!fs.existsSync(transcriptPath)) {
        return '';
      }

      return fs.readFileSync(transcriptPath, 'utf8').trim();
    } finally {
      this._removeTempDir(outputDir);
    }
  }

  _createWavBuffer(rawPcmBuffer) {
    const header = Buffer.alloc(44);
    const sampleRate = 16000;
    const channels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + rawPcmBuffer.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(rawPcmBuffer.length, 40);

    return Buffer.concat([header, rawPcmBuffer]);
  }

  _removeTempDir(tempDir) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      logger.error('Failed to remove Whisper temp directory', {
        tempDir,
        error: error.message
      });
    }
  }
}

const speechService = new SpeechService();
speechService.sanitizeWhisperLanguage = sanitizeWhisperLanguage;
module.exports = speechService;
