const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const logger = require('../core/logger').createServiceLogger('TTS');

const GROQ_TTS_URL = 'https://api.groq.com/openai/v1/audio/speech';

class TtsService extends EventEmitter {
  constructor() {
    super();
    this._currentProcess = null;
    this._enabled = false;
    this._voice = 'tara';
    this._model = 'orpheus-tts-0.1-ayane';
    this._speed = 1.0;
    this._initialize();
  }

  _initialize() {
    try {
      this._model = process.env.GROQ_TTS_MODEL || 'orpheus-tts-0.1-ayane';
      this._voice = process.env.GROQ_TTS_VOICE || 'tara';
      this._speed = parseFloat(process.env.GROQ_TTS_SPEED || '1.0') || 1.0;
      this._enabled = !!process.env.GROQ_API_KEY;
      logger.info(`TTS service initialized (model: ${this._model}, voice: ${this._voice})`);
    } catch (error) {
      logger.error('Failed to initialize TTS service', { error: error.message });
      this._enabled = false;
    }
  }

  isEnabled() {
    return this._enabled;
  }

  updateSettings(settings = {}) {
    if (settings.ttsEnabled !== undefined) {
      this._enabled = !!settings.ttsEnabled && !!process.env.GROQ_API_KEY;
    }
    if (settings.ttsVoice !== undefined) {
      this._voice = settings.ttsVoice;
    }
    if (settings.ttsSpeed !== undefined) {
      this._speed = parseFloat(settings.ttsSpeed) || 1.0;
    }
    if (settings.ttsModel !== undefined) {
      this._model = settings.ttsModel;
    }
    // Re-enable check if GROQ_API_KEY might have changed
    if (settings.groqKey !== undefined || settings.ttsEnabled !== undefined) {
      this._enabled = !!process.env.GROQ_API_KEY && settings.ttsEnabled !== false;
    }
  }

  async synthesizeSpeech(text, options = {}) {
    if (!this._enabled) {
      throw new Error('TTS is not enabled. Configure GROQ_API_KEY and enable TTS.');
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const model = options.model || this._model;
    const voice = options.voice || this._voice;
    const speed = options.speed || this._speed;

    this.emit('tts-started');

    try {
      const response = await fetch(GROQ_TTS_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          input: text,
          voice,
          response_format: 'wav',
          speed
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq TTS API error ${response.status}: ${errText}`);
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      await this._playAudio(audioBuffer);
      this.emit('tts-completed');
    } catch (error) {
      logger.error('TTS synthesis failed', { error: error.message });
      this.emit('tts-error', error.message);
      throw error;
    }
  }

  async _playAudio(audioBuffer) {
    const ext = '.wav';
    const tempFile = path.join(os.tmpdir(), `opencluely-tts-${Date.now()}${ext}`);

    try {
      fs.writeFileSync(tempFile, audioBuffer);
      await this._spawnPlayer(tempFile);
    } finally {
      try {
        fs.unlinkSync(tempFile);
      } catch (_) {}
    }
  }

  _spawnPlayer(filePath) {
    return new Promise((resolve, reject) => {
      let cmd, args;

      if (process.platform === 'darwin') {
        cmd = 'afplay';
        args = [filePath];
      } else if (process.platform === 'win32') {
        // Windows: try using PowerShell's Media.SoundPlayer
        cmd = 'powershell';
        args = ['-c', `(New-Object Media.SoundPlayer "${filePath}").PlaySync();`];
      } else {
        // Linux: try ffplay, aplay, or paplay
        cmd = 'ffplay';
        args = ['-nodisp', '-autoexit', filePath];
      }

      try {
        const player = spawn(cmd, args, { stdio: 'ignore' });
        this._currentProcess = player;

        player.on('error', (err) => {
          this._currentProcess = null;
          // Fallback for Linux: try aplay
          if (process.platform !== 'linux' || cmd === 'aplay') {
            reject(new Error(`Audio player failed: ${err.message}`));
            return;
          }
          // Try aplay as fallback on Linux
          const fallback = spawn('aplay', [filePath], { stdio: 'ignore' });
          this._currentProcess = fallback;
          fallback.on('error', () => reject(new Error('No audio player available (tried ffplay, aplay)')));
          fallback.on('close', (code) => {
            this._currentProcess = null;
            code === 0 ? resolve() : reject(new Error(`aplay exited with code ${code}`));
          });
        });

        player.on('close', (code) => {
          this._currentProcess = null;
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Audio player exited with code ${code}`));
          }
        });
      } catch (error) {
        this._currentProcess = null;
        reject(new Error(`Failed to spawn audio player: ${error.message}`));
      }
    });
  }

  stopPlayback() {
    if (this._currentProcess) {
      try {
        this._currentProcess.kill();
      } catch (_) {}
      this._currentProcess = null;
    }
  }
}

module.exports = new TtsService();
