const path = require('path');
const os = require('os');

class ConfigManager {
  constructor() {
    this.env = process.env.NODE_ENV || 'development';
    this.appDataDir = path.join(os.homedir(), '.sysconfig');
    this.loadConfiguration();
  }

  loadConfiguration() {
    this.config = {
      app: {
        name: 'Settings',
        version: '1.0.0',
        processTitle: 'Settings',
        dataDir: this.appDataDir,
        isDevelopment: this.env === 'development',
        isProduction: this.env === 'production'
      },
      
      window: {
        defaultWidth: 400,
        defaultHeight: 600,
        minWidth: 300,
        minHeight: 400,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false,
          preload: path.join(__dirname, '../../preload.js')
        }
      },

      ocr: {
        language: 'eng',
        tempDir: os.tmpdir(),
        cleanupDelay: 5000
      },

      llm: {
        gemini: {
          model: 'gemini-3.5-flash-lite',
          fallbackModels: ['gemini-flash-lite-latest', 'gemini-3.5-flash'],
          maxRetries: 1,
          timeout: 5000,
          fallbackEnabled: true,
          enableFallbackMethod: true,
          generation: {
            temperature: 0.15,
            topK: 32,
            topP: 0.9,
            maxOutputTokens: 800,
            thinkingConfig: {
              thinkingBudget: 0
            }
          }
        }
      },

      speech: {
        provider: 'azure',
        azure: {
          language: 'en-US',
          enableDictation: true,
          enableAudioLogging: false,
          outputFormat: 'detailed'
        },
        whisper: {
          model: 'small',
          language: 'auto',
          // segmentMs is the legacy fixed-window size and now acts as the
          // hard upper bound for a single utterance when VAD is enabled.
          segmentMs: 4000,
          // Voice-activity-detection driven segmentation. Instead of cutting
          // audio on a blind timer (which splits sentences mid-word), we flush
          // a segment when the speaker pauses. This makes transcription align
          // with natural utterance boundaries.
          vadEnabled: true,
          // Trailing silence (ms) that ends an utterance and triggers a flush.
          // Optimized to 380ms for ultra-low latency interview responsiveness.
          silenceHangoverMs: 380,
          // Minimum accumulated speech (ms) before a pause counts as an
          // utterance — guards against coughs/clicks producing empty flushes.
          minUtteranceMs: 300,
          // Hard cap (ms): force-flush a long monologue even without a pause.
          maxUtteranceMs: 15000,
          // Pre-roll (ms) of audio kept before speech onset so the first
          // syllable isn't clipped when we start capturing.
          preRollMs: 300,
          // Absolute RMS energy floor (normalized 0..1). Energy below this is
          // always treated as silence regardless of the adaptive noise floor.
          vadEnergyFloor: 0.008
        }
      },

      session: {
        maxMemorySize: 1000,
        compressionThreshold: 500,
        clearOnRestart: false
      },

      stealth: {
        hideFromDock: true,
        noAttachConsole: true,
        disguiseProcess: true
      }
    };
  }

  get(keyPath) {
    return keyPath.split('.').reduce((obj, key) => obj?.[key], this.config);
  }

  set(keyPath, value) {
    const keys = keyPath.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => obj[key] = obj[key] || {}, this.config);
    target[lastKey] = value;
  }

  getApiKey(service) {
    const envKey = `${service.toUpperCase()}_API_KEY`;
    return process.env[envKey] || process.env[`${service.toUpperCase()}_API_KEY_SECONDARY`];
  }

  getApiKeys(service) {
    const s = service.toUpperCase();
    const primary = (process.env[`${s}_API_KEY`] || '').trim();
    const secondary = (process.env[`${s}_API_KEY_SECONDARY`] || process.env[`${s}_API_KEY_2`] || process.env[`${s}_API_KEY_BACKUP`] || '').trim();
    const keys = [];
    if (primary) keys.push(primary);
    if (secondary && secondary !== primary) keys.push(secondary);
    return keys;
  }

  isFeatureEnabled(feature) {
    return this.get(`features.${feature}`) !== false;
  }
}

module.exports = new ConfigManager();
