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
const config = require('../core/config');

let sdk = null;
try {
  sdk = require('microsoft-cognitiveservices-speech-sdk');
} catch (error) {
  logger.warn('Azure Speech SDK unavailable', { error: error.message });
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
    this.audioProgram = null;
    this.whisperCommand = null;
    this._audioCaptureWindow = null;
    this.groqSttModel = null;

    this.initializeClient();
  }

  initializeClient() {
    this._cleanup();
    this.provider = 'disabled';
    this.available = false;
    this.speechConfig = null;
    this.whisperCommand = null;
    this.groqSttModel = null;

    const provider = this._getConfiguredProvider();
    console.log('[SpeechService] initializeClient() provider:', provider);
    this.provider = provider;

    if (provider === 'azure') {
      this._initializeAzureClient();
      return;
    }

    if (provider === 'whisper') {
      this._initializeWhisperClient();
      return;
    }

    if (provider === 'groq') {
      this._initializeGroqClient();
      return;
    }

    const reason = 'Speech recognition disabled. Configure Azure, Groq, or local Whisper.';
    logger.warn(reason);
    this.emit('status', reason);
  }

  _initializeAzureClient() {
    try {
      if (!sdk) {
        throw new Error('Azure Speech SDK dependency is not installed');
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

  _initializeGroqClient() {
    try {
      const apiKey = process.env.GROQ_API_KEY;

      if (!apiKey) {
        const reason = 'Groq STT unavailable. Set GROQ_API_KEY to use Groq speech.';
        logger.warn(reason);
        this.emit('status', reason);
        return;
      }

      this.groqSttModel = this._getSetting('groqSttModel') || process.env.GROQ_STT_MODEL || config.get('speech.groq.sttModel') || 'whisper-large-v3-turbo';

      this.available = true;
      logger.info('Groq STT service initialized successfully', {
        model: this.groqSttModel
      });
      this.emit('status', 'Groq STT ready');
    } catch (error) {
      logger.error('Failed to initialize Groq STT client', {
        error: error.message,
        stack: error.stack
      });
      this.available = false;
      this.emit('status', 'Groq STT unavailable');
    }
  }

  startRecording() {
    console.log('[SpeechService] startRecording() called, provider:', this.provider, 'available:', this.available, 'isRecording:', this.isRecording);
    try {
      if (!this.available) {
        const errorMsg = `Speech provider "${this.provider}" is not available`;
        logger.error(errorMsg);
        this.emit('error', errorMsg);
        return;
      }

      if (this.isRecording) {
        logger.warn('Recording already in progress');
        return;
      }

      this.sessionStartTime = Date.now();
      this.retryCount = 0;

      if (this.provider === 'azure') {
        this._startAzureRecording();
        return;
      }

      if (this.provider === 'whisper') {
        this._startWhisperRecording();
        return;
      }

      if (this.provider === 'groq') {
        this._startGroqRecording();
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
        if (global.windowManager) {
          global.windowManager.handleRecordingStarted();
        }
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
    console.log('[SpeechService] _startWhisperRecording() called');
    this._cleanup();
    this.isRecording = true;
    this.segmentBuffers = [];
    this.segmentBytes = 0;
    this.transcriptionInFlight = false;
    this.pendingFlush = false;
    this.emit('recording-started');
    this.emit('status', 'Local Whisper recording started');
    this._startMicrophoneCapture();

    const segmentMs = this._getWhisperSegmentMs();
    this.segmentTimer = setInterval(() => {
      this._flushWhisperSegment({ final: false }).catch((error) => {
        logger.error('Whisper segment transcription failed', { error: error.message });
      });
    }, segmentMs);

    if (global.windowManager) {
      global.windowManager.handleRecordingStarted();
    }
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
      this._finalizeWhisperStop();
      return;
    }

    if (this.provider === 'groq') {
      this._finalizeGroqStop();
      return;
    }

    this._finalizeStop('Recording stopped');
  }

  async _finalizeWhisperStop() {
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
      this._finalizeStop('Recording stopped');
    }
  }

  _startGroqRecording() {
    this._cleanup();
    this.isRecording = true;
    this.segmentBuffers = [];
    this.segmentBytes = 0;
    this.emit('recording-started');
    this.emit('status', 'Groq STT recording started');
    this._startMicrophoneCapture();

    if (global.windowManager) {
      global.windowManager.handleRecordingStarted();
    }
  }

  async _finalizeGroqStop() {
    if (!this.segmentBytes) {
      this._finalizeStop('Recording stopped');
      return;
    }

    const audioBuffer = Buffer.concat(this.segmentBuffers, this.segmentBytes);
    this.segmentBuffers = [];
    this.segmentBytes = 0;

    try {
      const transcript = await this._groqTranscribe(audioBuffer);
      if (transcript && transcript.trim()) {
        this.emit('transcription', transcript.trim());
      }
    } catch (error) {
      logger.error('Groq STT transcription failed', { error: error.message });
      this.emit('error', `Groq transcription failed: ${error.message}`);
    } finally {
      this._finalizeStop('Recording stopped');
    }
  }

  async _groqTranscribe(audioBuffer) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const baseUrl = 'https://api.groq.com/openai/v1';
    const model = this.groqSttModel;
    const wavBuffer = this._createWavBuffer(audioBuffer);

    const boundary = '----FormBoundary' + Date.now();
    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `${model}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n` +
      `Content-Type: audio/wav\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, wavBuffer, footer]);

    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(body.length)
      },
      body
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq STT API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data.text || '';
  }

  _finalizeStop(statusMessage) {
    this._cleanup();
    this.emit('recording-stopped');
    this.emit('status', statusMessage);
    if (global.windowManager) {
      global.windowManager.handleRecordingStopped();
    }
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

    // Destroy the hidden audio-capture window (renderer-based capture)
    if (this._audioCaptureWindow) {
      try {
        if (!this._audioCaptureWindow.isDestroyed()) {
          this._audioCaptureWindow.webContents.send('stop-audio-capture');
          this._audioCaptureWindow.destroy();
        }
      } catch (error) {
        logger.error('Error cleaning up audio capture window', { error: error.message });
      }
      this._audioCaptureWindow = null;
    }

    // Stop renderer-based capture in the chat window
    if (global.windowManager) {
      try {
        global.windowManager.broadcastToAllWindows('stop-renderer-capture', {});
      } catch (error) {
        logger.error('Error broadcasting stop-renderer-capture', { error: error.message });
      }
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
    this._audioDataLogged = false;
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

    if (this.provider === 'groq') {
      const audioBuffer = fs.readFileSync(audioFilePath);
      return this._groqTranscribe(audioBuffer);
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

    if (this.provider === 'groq') {
      if (!process.env.GROQ_API_KEY) {
        return { success: false, message: 'GROQ_API_KEY not configured' };
      }
      // Test by sending a tiny silent WAV to the transcription API
      try {
        const silentBuffer = Buffer.alloc(16000 * 2); // 1 second of silence (16-bit PCM, 16kHz, mono)
        const result = await this._groqTranscribe(silentBuffer);
        // A successful API call returns empty text or a transcription
        return { success: true, message: `Groq STT connection OK (model: ${this.groqSttModel})` };
      } catch (error) {
        return { success: false, message: `Groq STT connection failed: ${error.message}` };
      }
    }

    return { success: false, message: 'Speech service not initialized' };
  }

  getStatus() {
    const isInitialized = this.provider === 'azure' ? !!this.speechConfig
      : this.provider === 'groq' ? !!process.env.GROQ_API_KEY
      : !!this.whisperCommand;

    return {
      provider: this.provider,
      isRecording: this.isRecording,
      isInitialized,
      sessionDuration: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0,
      retryCount: this.retryCount,
      effectiveSettings: {
        speechProvider: this.provider,
        azureKey: this._getSetting('azureKey') || '',
        azureRegion: this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION || '',
        whisperCommand: this._getSetting('whisperCommand') || process.env.WHISPER_COMMAND || '',
        whisperModelDir: this._getWhisperModelDir(),
        whisperModel: this._getWhisperModel(),
        whisperLanguage: this._getWhisperLanguage(),
        whisperSegmentMs: String(this._getWhisperSegmentMs()),
        groqSttModel: this.groqSttModel || process.env.GROQ_STT_MODEL || ''
      },
      config: {
        azure: config.get('speech.azure') || {},
        whisper: config.get('speech.whisper') || {},
        groq: config.get('speech.groq') || {},
        selectedProvider: this.provider
      }
    };
  }

  isAvailable() {
    if (this.provider === 'azure') {
      return !!this.speechConfig && !!this.available;
    }

    if (this.provider === 'whisper') {
      return !!this.whisperCommand && !!this.available;
    }

    if (this.provider === 'groq') {
      return !!process.env.GROQ_API_KEY && !!this.available;
    }

    return false;
  }

  updateSettings(settings = {}) {
    const speechKeys = ['speechProvider', 'azureKey', 'azureRegion', 'whisperCommand', 'whisperModelDir', 'whisperModel', 'whisperLanguage', 'whisperSegmentMs', 'groqSttModel'];
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
    console.log('[SpeechService] _getConfiguredProvider raw provider string:', provider, 'SPEECH_PROVIDER env:', process.env.SPEECH_PROVIDER);

    if (provider === 'azure' || provider === 'whisper' || provider === 'groq') {
      console.log('[SpeechService] _getConfiguredProvider returning:', provider);
      return provider;
    }

    const hasAzure = !!((this._getSetting('azureKey') || process.env.AZURE_SPEECH_KEY) &&
      (this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION));

    if (hasAzure) {
      console.log('[SpeechService] _getConfiguredProvider auto-detecting azure');
      return 'azure';
    }

    const hasGroq = !!(process.env.GROQ_API_KEY);
    if (hasGroq) {
      console.log('[SpeechService] _getConfiguredProvider auto-detecting groq');
      return 'groq';
    }

    console.log('[SpeechService] _getConfiguredProvider falling back to whisper');
    return 'whisper';
  }

  _getWhisperModel() {
    return this._getSetting('whisperModel') || process.env.WHISPER_MODEL || config.get('speech.whisper.model') || 'turbo';
  }

  _getWhisperModelDir() {
    return this._getSetting('whisperModelDir') || process.env.WHISPER_MODEL_DIR || '';
  }

  _getWhisperLanguage() {
    return this._getSetting('whisperLanguage') || process.env.WHISPER_LANGUAGE || config.get('speech.whisper.language') || 'en';
  }

  _getWhisperSegmentMs() {
    const rawValue = this._getSetting('whisperSegmentMs') || process.env.WHISPER_SEGMENT_MS || config.get('speech.whisper.segmentMs') || 4000;
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? Math.max(2000, parsed) : 4000;
  }

  _getSetting(key) {
    const value = this.runtimeSettings[key];
    return value === '' ? null : value;
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
   * Probe a single candidate: exists check → spawn --help → validate output.
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

    let probe;
    try {
      probe = spawnSync(cmd, args, {
        encoding: 'utf8',
        timeout: 8000,
        // On Windows, some relative paths with forward slashes need shell:true
        shell: process.platform === 'win32' && (cmd.includes('/') || cmd.includes('\\'))
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
    const parts = String(rawCommand || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return null;
    }

    return {
      command: parts[0],
      baseArgs: parts.slice(1)
    };
  }

  _startMicrophoneCapture() {
    console.log('[SpeechService] _startMicrophoneCapture() called');
    try {
      // Instead of creating a hidden BrowserWindow (which fails on unsigned macOS),
      // broadcast to the chat window (already visible) to start its own getUserMedia capture.
      if (global.windowManager) {
        console.log('[SpeechService] Broadcasting start-renderer-capture');
        global.windowManager.broadcastToAllWindows('start-renderer-capture', {});
      }

      this.audioProgram = 'getUserMedia';
      logger.info('Renderer-based microphone capture started via chat window');
    } catch (error) {
      logger.error('Failed to start renderer-based microphone capture', { error: error.message });
      this.emit('error', `Mic capture init failed: ${error.message}`);
    }
  }

  _handleRendererAudioChunk(buffer) {
    // Convert ArrayBuffer (from IPC) to Buffer and feed into the existing pipeline
    if (!buffer) return;
    try {
      const buf = Buffer.from(buffer);
      console.log('[SpeechService] _handleRendererAudioChunk buffer size:', buf.length, 'provider:', this.provider, 'isRecording:', this.isRecording);
      this._handleAudioChunk(buf);
    } catch (error) {
      logger.error('Error handling renderer audio chunk', { error: error.message });
    }
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

    if (this.provider === 'whisper' || this.provider === 'groq') {
      this.segmentBuffers.push(Buffer.from(chunk));
      this.segmentBytes += chunk.length;
      if (this.segmentBytes % 16000 === 0) {
        console.log('[SpeechService] Buffered audio bytes:', this.segmentBytes);
      }
    }
  }

  async _flushWhisperSegment({ final }) {
    if (this.transcriptionInFlight) {
      this.pendingFlush = this.pendingFlush || final;
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
      if (transcript && transcript.trim()) {
        this.emit('transcription', transcript.trim());
      }
    } finally {
      this.transcriptionInFlight = false;

      if (this.pendingFlush) {
        const shouldRunFinal = this.pendingFlush;
        this.pendingFlush = false;
        await this._flushWhisperSegment({ final: shouldRunFinal });
      }
    }
  }

  async _transcribeWhisperBuffer(audioBuffer) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-whisper-'));
    const audioFilePath = path.join(tempDir, 'segment.wav');

    try {
      fs.writeFileSync(audioFilePath, this._createWavBuffer(audioBuffer));
      return await this._transcribeWhisperFile(audioFilePath);
    } finally {
      this._removeTempDir(tempDir);
    }
  }

  async _transcribeWhisperFile(audioFilePath) {
    if (!this.whisperCommand) {
      throw new Error('Local Whisper CLI not configured');
    }

    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-whisper-out-'));
    const args = [
      ...this.whisperCommand.baseArgs,
      audioFilePath,
      '--model', this._getWhisperModel(),
      '--language', this._getWhisperLanguage(),
      '--task', 'transcribe',
      '--output_format', 'txt',
      '--output_dir', outputDir,
      '--verbose', 'False',
      '--fp16', 'False'
    ];

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

module.exports = new SpeechService();
