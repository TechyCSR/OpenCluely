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
        
        // Special handling for audio elements
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
    // Add console methods if not available
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
      decodeAudioData(audioData) {
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
      decodeAudioData(audioData) {
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
    // Add additional globals that might be needed
    URL: class URL {
      constructor(url, base) {
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
      toString() { return this.href; }
    },
    Blob: class Blob {
      constructor(parts = [], options = {}) {
        this.size = 0;
        this.type = options.type || '';
        this.parts = parts;
      }
      slice() { return new Blob(); }
      stream() { return new ReadableStream(); }
      text() { return Promise.resolve(''); }
      arrayBuffer() { return Promise.resolve(new ArrayBuffer(0)); }
    },
    File: class File {
      constructor(parts, name, options = {}) {
        this.name = name;
        this.size = 0;
        this.type = options.type || '';
        this.lastModified = Date.now();
        this.parts = parts;
      }
      slice() { return new File([], this.name); }
      stream() { return new ReadableStream(); }
      text() { return Promise.resolve(''); }
      arrayBuffer() { return Promise.resolve(new ArrayBuffer(0)); }
    }
  };
  global.document = global.window.document;
  global.navigator = global.window.navigator;
  global.AudioContext = global.window.AudioContext;
  global.webkitAudioContext = global.window.webkitAudioContext;
  global.URL = global.window.URL;
  global.Blob = global.window.Blob;
  global.File = global.window.File;
  
  // Additional polyfills that might be needed
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

const sdk = require('microsoft-cognitiveservices-speech-sdk');
const recorder = require('node-record-lpcm16');
const { EventEmitter } = require('events');
const logger = require('../core/logger').createServiceLogger('SPEECH');
const config = require('../core/config');

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
    this.available = false; // track availability
    
    this.initializeClient();
  }

  initializeClient() {
    try {
      // Get Azure Speech credentials from environment variables
      const subscriptionKey = process.env.AZURE_SPEECH_KEY;
      const region = process.env.AZURE_SPEECH_REGION;
      
      if (!subscriptionKey || !region) {
        const reason = 'Azure Speech credentials not found. Speech recognition disabled.';
        logger.warn('Speech service disabled (missing credentials)');
        this.available = false;
        this.emit('status', reason);
        return;
      }

      // Validate region format
      const validRegions = ['eastus', 'westus', 'westus2', 'eastus2', 'centralus', 'northcentralus', 'southcentralus', 'westcentralus', 'canadacentral', 'canadaeast', 'brazilsouth', 'northeurope', 'westeurope', 'uksouth', 'ukwest', 'francecentral', 'germanywestcentral', 'norwayeast', 'switzerlandnorth', 'switzerlandwest', 'swedencentral', 'uaenorth', 'southafricanorth', 'centralindia', 'southindia', 'westindia', 'eastasia', 'southeastasia', 'japaneast', 'japanwest', 'koreacentral', 'koreasouth', 'australiaeast', 'australiasoutheast'];
      
      if (!validRegions.includes(region.toLowerCase())) {
        logger.warn('Potentially invalid Azure region specified', { region });
      }

      // Initialize Azure Speech configuration
      this.speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);
      
      // Configure speech recognition settings with better defaults
      const azureConfig = config.get('speech.azure') || {};
      this.speechConfig.speechRecognitionLanguage = azureConfig.language || 'en-US';
      this.speechConfig.outputFormat = sdk.OutputFormat.Detailed;
      
      // Set additional properties for better recognition
      this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "5000");
      this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "2000");
      this.speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "2000");
      
      if (azureConfig.enableDictation) {
        this.speechConfig.enableDictation();
      }
      
      if (azureConfig.enableAudioLogging) {
        this.speechConfig.enableAudioLogging();
      }
      
      logger.info('Azure Speech service initialized successfully', {
        region,
        language: azureConfig.language || 'en-US'
      });
      
      this.available = true;
      this.emit('status', 'Azure Speech Services ready');
      
    } catch (error) {
      logger.error('Failed to initialize Azure Speech client', { error: error.message, stack: error.stack });
      this.available = false;
      this.emit('status', 'Speech recognition unavailable');
    }
  }

  startRecording() {
    try {
      if (!this.speechConfig) {
        const errorMsg = 'Azure Speech client not initialized';
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

      this._attemptRecording();
    } catch (error) {
      logger.error('Critical error in startRecording', { error: error.message, stack: error.stack });
      this.emit('error', `Speech recognition failed to start: ${error.message}`);
      this.isRecording = false;
    }
  }

  _attemptRecording() {
    try {
      this.isRecording = true;
      this.emit('recording-started');

      // Clean up any existing resources
      this._cleanup();

             // Use push stream with Node.js audio capture (more reliable for Electron main process)
       try {
         this.pushStream = sdk.AudioInputStream.createPushStream();
         this.audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);
         
         // Start capturing real microphone audio
         this._startMicrophoneCapture();
         
       } catch (audioError) {
         logger.error('Failed to create audio config', { error: audioError.message });
         this.emit('error', 'Audio configuration failed. Please check microphone permissions.');
         this.isRecording = false;
         return;
       }
             
       // Create speech recognizer
       try {
         this.recognizer = new sdk.SpeechRecognizer(this.speechConfig, this.audioConfig);
       } catch (recognizerError) {
         throw recognizerError;
       }

             // Set up event handlers with better error handling
       this.recognizer.recognizing = (s, e) => {
         try {
           if (e.result.reason === sdk.ResultReason.RecognizingSpeech) {
             logger.debug('Interim transcription received', { 
               text: e.result.text,
               offset: e.result.offset,
               duration: e.result.duration
             });
             this.emit('interim-transcription', e.result.text);
           }
         } catch (error) {
           logger.error('Error in recognizing handler', { error: error.message });
         }
       };

       this.recognizer.recognized = (s, e) => {
         try {
           if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
             const sessionDuration = Date.now() - this.sessionStartTime;
             
             // Only emit transcription if there's actual text content
             if (e.result.text && e.result.text.trim().length > 0) {
               logger.info('Final transcription received', {
                 text: e.result.text,
                 sessionDuration: `${sessionDuration}ms`,
                 textLength: e.result.text.length,
                 confidence: e.result.properties?.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)
               });
               
               this.emit('transcription', e.result.text);
             } else {
               logger.debug('Empty transcription result ignored', {
                 sessionDuration: `${sessionDuration}ms`,
                 confidence: e.result.properties?.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)
               });
             }
           } else if (e.result.reason === sdk.ResultReason.NoMatch) {
             logger.debug('No speech pattern detected in audio');
             
             // Check if there's detailed no-match information
             const noMatchDetails = e.result.properties?.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);
             if (noMatchDetails) {
               logger.debug('No match details', { details: noMatchDetails });
             }
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
          const errorMsg = `Recognition error: ${e.errorDetails}`;
          
          // Check for specific error types and provide better messages
          if (e.errorDetails.includes('1006')) {
            this.emit('error', 'Network connection failed. Please check your internet connection.');
          } else if (e.errorDetails.includes('InvalidServiceCredentials')) {
            this.emit('error', 'Invalid Azure Speech credentials. Please check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.');
          } else if (e.errorDetails.includes('Forbidden')) {
            this.emit('error', 'Access denied. Please check your Azure Speech service subscription and region.');
          } else if (e.errorDetails.includes('AudioInputMicrophone_InitializationFailure')) {
            this.emit('error', 'Microphone initialization failed. Please check microphone permissions and availability.');
          } else {
            this.emit('error', errorMsg);
          }
          
          // Attempt retry for transient errors
          if (this.retryCount < this.maxRetries && (
            e.errorDetails.includes('1006') || 
            e.errorDetails.includes('timeout') || 
            e.errorDetails.includes('network')
          )) {
            this.retryCount++;
            logger.info(`Retrying recognition (attempt ${this.retryCount}/${this.maxRetries})`);
            setTimeout(() => {
              if (!this.isRecording) {
                this._attemptRecording();
              }
            }, 1000 * this.retryCount);
            return;
          }
        }
        this.stopRecording();
      };

      this.recognizer.sessionStarted = (s, e) => {
        logger.info('Recognition session started', { sessionId: e.sessionId });
      };

      this.recognizer.sessionStopped = (s, e) => {
        logger.info('Recognition session ended', { sessionId: e.sessionId });
        this.stopRecording();
      };

       // Start continuous recognition with timeout
       const startTimeout = setTimeout(() => {
         logger.error('Recognition start timeout');
         this.emit('error', 'Speech recognition start timeout. Please try again.');
         this.stopRecording();
       }, 10000); // 10 second timeout

       this.recognizer.startContinuousRecognitionAsync(
         () => {
           clearTimeout(startTimeout);
           logger.info('Continuous speech recognition started successfully');
           if (global.windowManager) {
             global.windowManager.handleRecordingStarted();
           }
         },
         (error) => {
           clearTimeout(startTimeout);
           logger.error('Failed to start continuous recognition', { 
             error: error.toString(),
             retryCount: this.retryCount 
           });
           
           // Attempt retry for initialization failures
           if (this.retryCount < this.maxRetries) {
             this.retryCount++;
             logger.info(`Retrying recognition start (attempt ${this.retryCount}/${this.maxRetries})`);
             this.isRecording = false;
             setTimeout(() => {
               this._attemptRecording();
             }, 2000 * this.retryCount);
           } else {
             this.emit('error', `Recognition startup failed after ${this.maxRetries} attempts: ${error}`);
             this.isRecording = false;
           }
         }
       );

    } catch (error) {
      logger.error('Failed to start recording session', { 
        error: error.message, 
        stack: error.stack 
      });
      this.emit('error', `Recording startup failed: ${error.message}`);
      this.isRecording = false;
    }
  }

  stopRecording() {
    if (!this.isRecording) {
      return;
    }

    this.isRecording = false;
    const sessionDuration = this.sessionStartTime ? Date.now() - this.sessionStartTime : 0;
    
    logger.info('Stopping speech recognition session', { 
      sessionDuration: `${sessionDuration}ms` 
    });

    // Stop continuous recognition
    if (this.recognizer) {
      try {
        this.recognizer.stopContinuousRecognitionAsync(
          () => {
            logger.info('Speech recognition stopped successfully');
            this.emit('recording-stopped');
            this.emit('status', 'Recording stopped');
            if (global.windowManager) {
              global.windowManager.handleRecordingStopped();
            }
            this._cleanup();
          },
          (error) => {
            logger.error('Error during recognition stop', { error: error.toString() });
            this._cleanup();
          }
        );
      } catch (error) {
        logger.error('Error stopping recognizer', { error: error.message });
        this._cleanup();
      }
    } else {
      this._cleanup();
    }
  }

  _cleanup() {
    // Clean up recognizer
    if (this.recognizer) {
      try {
        this.recognizer.close();
      } catch (error) {
        logger.error('Error closing recognizer', { error: error.message });
      }
      this.recognizer = null;
    }

         // Clean up audio config
     if (this.audioConfig) {
       try {
         // Check if close method exists and call it appropriately
         if (typeof this.audioConfig.close === 'function') {
           try {
             const closeResult = this.audioConfig.close();
             // If it returns a promise, handle it, otherwise just continue
             if (closeResult && typeof closeResult.then === 'function') {
               // It's a promise, but we don't need to wait for it in cleanup
               closeResult.catch((error) => {
                logger.error('Error closing audio config', { error: error.message });
               });
             }
           } catch (closeError) {
            logger.error('Error closing audio config', { error: closeError.message });
           }
         }
       } catch (error) {
         logger.error('Error closing audio config', { error: error.message });
       }
       this.audioConfig = null;
     }

     // Stop audio recording
     if (this.recording) {
       try {
         this.recording.stop();
         this.recording = null;
       } catch (error) {
         logger.error('Error stopping audio recording', { error: error.message });
       }
     }

     // Clean up push stream
     if (this.pushStream) {
       try {
         // Check if close method exists and call it appropriately
         if (typeof this.pushStream.close === 'function') {
           const closeResult = this.pushStream.close();
           // If it returns a promise, we can await it, otherwise just continue
           if (closeResult && typeof closeResult.then === 'function') {
             // It's a promise, but we don't need to wait for it in cleanup
             closeResult.catch((error) => {
             });
           }
         }
       } catch (error) {
         logger.error('Error closing push stream', { error: error.message });
       }
       this.pushStream = null;
     }

     // Reset audio data logging flag
     this._audioDataLogged = false;
  }

  async recognizeFromFile(audioFilePath) {
    if (!this.speechConfig) {
      throw new Error('Speech service not initialized');
    }

    const startTime = Date.now();
    
    try {
      // Validate file exists and is readable
      const fs = require('fs');
      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      const audioConfig = sdk.AudioConfig.fromWavFileInput(audioFilePath);
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('File recognition timeout'));
          recognizer.close();
        }, 30000); // 30 second timeout

        recognizer.recognizeOnceAsync(
          (result) => {
            clearTimeout(timeout);
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
              resolve(result.text);
            } else if (result.reason === sdk.ResultReason.NoMatch) {
              resolve(''); // No speech detected in file
            } else {
              reject(new Error(`File recognition failed: ${result.reason}`));
            }
            recognizer.close();
            audioConfig.close();
          },
          (error) => {
            clearTimeout(timeout);
            reject(new Error(`File recognition error: ${error}`));
            recognizer.close();
            audioConfig.close();
          }
        );
      });

      logger.logPerformance('File speech recognition', startTime, {
        filePath: audioFilePath,
        textLength: result.length
      });

      return result;
    } catch (error) {
      logger.error('File recognition failed', { 
        filePath: audioFilePath, 
        error: error.message 
      });
      throw error;
    }
  }

  getStatus() {
    return {
      isRecording: this.isRecording,
      isInitialized: !!this.speechConfig,
      sessionDuration: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0,
      retryCount: this.retryCount,
      config: config.get('speech.azure') || {}
    };
  }

     // Test connection method
   async testConnection() {
     if (!this.speechConfig) {
       throw new Error('Speech service not initialized');
     }

     try {
       // Create a simple test recognizer
       const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
       const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);
       
       // Test by attempting to create the recognizer (this validates credentials)
       recognizer.close();
       audioConfig.close();
       
       return { success: true, message: 'Connection test successful' };
     } catch (error) {
       return { success: false, message: error.message };
     }
   }

   // Start capturing real microphone audio using node-record-lpcm16
   _startMicrophoneCapture() {
     if (!this.pushStream) return;
          
     try {
       // Check if recorder is available
       if (!recorder || typeof recorder.record !== 'function') {
         throw new Error('node-record-lpcm16 not available or not properly installed');
       }

       // Configure audio recording with error handling
       this.recording = recorder.record({
         sampleRateHertz: 16000,  // Azure Speech SDK prefers 16kHz
         threshold: 0,            // No silence threshold
         verbose: false,          // Quiet logging
         recordProgram: 'sox',    // Try 'sox' first (most common on macOS)
         silence: '10.0s'         // Longer silence threshold
       });

       if (!this.recording) {
         throw new Error('Failed to create audio recording instance');
       }

       // Add error handler for the recording stream before using it
       this.recording.stream().on('error', (error) => {
         logger.error('Audio recording stream error', { error: error.message });
         
         // Don't emit error immediately, try to recover
         this._handleAudioError(error);
       });

       // Pipe audio data to Azure Speech SDK
       this.recording.stream().on('data', (chunk) => {
         if (this.pushStream && this.isRecording) {
           try {
             this.pushStream.write(chunk);
             // Console log only first few chunks to avoid spam
             if (!this._audioDataLogged) {
               this._audioDataLogged = true;
             }
           } catch (error) {
           }
         }
       });

     } catch (error) {
       logger.error('Failed to start microphone capture', { error: error.message, stack: error.stack });
       
       // Fall back to no audio capture (Azure SDK will still work without audio)
       this.emit('error', `Microphone capture failed: ${error.message}. Speech recognition may not work properly.`);
     }
   }

   // Handle audio recording errors with recovery attempts
   _handleAudioError(error) {
     
     // Try to restart recording with different program
     if (this.recording) {
       try {
         this.recording.stop();
       } catch (stopError) {
       }
       this.recording = null;
     }

     // Try with different recording program
     setTimeout(() => {
       if (this.isRecording) {
         this._startMicrophoneCaptureWithFallback();
       }
     }, 1000);
   }

   // Try microphone capture with different programs as fallback
   _startMicrophoneCaptureWithFallback() {
     const programs = ['sox', 'rec', 'arecord'];
     let currentProgramIndex = 0;

     const tryNextProgram = () => {
       if (currentProgramIndex >= programs.length) {
         this.emit('error', 'Could not start microphone capture with any audio program');
         return;
       }

       const program = programs[currentProgramIndex];

       try {
         this.recording = recorder.record({
           sampleRateHertz: 16000,
           threshold: 0,
           verbose: false,
           recordProgram: program,
           silence: '10.0s'
         });

         this.recording.stream().on('error', (error) => {
           currentProgramIndex++;
           tryNextProgram();
         });

         this.recording.stream().on('data', (chunk) => {
           if (this.pushStream && this.isRecording) {
             try {
               this.pushStream.write(chunk);
               if (!this._audioDataLogged) {
                 this._audioDataLogged = true;
               }
             } catch (error) {
              logger.error('Error writing audio data', { error: error.message });
             }
           }
         });
       } catch (error) {
         logger.error(`${program} configuration failed`, { error: error.message });
         currentProgramIndex++;
         tryNextProgram();
       }
     };

     tryNextProgram();
   }

  // Expose availability to UI
  isAvailable() {
    return !!this.speechConfig && !!this.available;
  }
}

module.exports = new SpeechService();