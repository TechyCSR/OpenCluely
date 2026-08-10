const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../core/logger').createServiceLogger('SYSTEM_AUDIO');

class SystemAudioService extends EventEmitter {
  constructor() {
    super();
    this.captureProcess = null;
    this.converterProcess = null;
    this.isCapturing = false;
    this.speaking = false;
    this.speechMs = 0;
    this.silenceMs = 0;
    this.noiseFloor = 0;
    this.noiseInitialized = false;
    this.segmentBuffers = [];
    this.preRoll = [];
    this.preRollMs = 0;
  }

  getBinaryPath() {
    const configured = process.env.SYSTEM_AUDIO_COMMAND;
    if (configured) return configured;
    try {
      const { app } = require('electron');
      if (app?.isPackaged) {
        return path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', 'SystemAudioDump');
      }
    } catch (_) {
      // Running in a plain Node test rather than Electron.
    }
    return path.join(process.cwd(), 'bin', 'SystemAudioDump');
  }

  isAvailable() {
    return process.platform === 'darwin' &&
      fs.existsSync(this.getBinaryPath()) &&
      !!this.getFfmpegCommand();
  }

  getFfmpegCommand() {
    return process.env.FFMPEG_COMMAND || 'ffmpeg';
  }

  start() {
    if (this.isCapturing) return this.getStatus();
    if (process.platform !== 'darwin') {
      throw new Error('Call Copilot system-audio capture currently requires macOS');
    }

    const binary = this.getBinaryPath();
    if (!fs.existsSync(binary)) {
      throw new Error(`SystemAudioDump not found at ${binary}`);
    }

    this.resetVad();
    this.converterProcess = spawn(this.getFfmpegCommand(), [
      '-hide_banner', '-loglevel', 'error',
      '-f', 's16le', '-ar', '24000', '-ac', '2', '-i', 'pipe:0',
      '-f', 's16le', '-ar', '16000', '-ac', '1', 'pipe:1'
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.captureProcess = spawn(binary, [], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.captureProcess.stdout.pipe(this.converterProcess.stdin);
    this.converterProcess.stdout.on('data', chunk => {
      if (!this.isCapturing || !chunk?.length) return;
      this.emit('audio-chunk', chunk);
      this.ingestPcm(chunk);
    });

    let captureError = '';
    let converterError = '';
    this.captureProcess.stderr.on('data', chunk => {
      captureError += chunk.toString();
      if (captureError.length > 8000) captureError = captureError.slice(-8000);
    });
    this.converterProcess.stderr.on('data', chunk => {
      converterError += chunk.toString();
      if (converterError.length > 8000) converterError = converterError.slice(-8000);
    });

    this.captureProcess.on('error', error => this.handleProcessError('capture', error));
    this.converterProcess.on('error', error => this.handleProcessError('converter', error));
    this.captureProcess.on('close', code => {
      if (this.isCapturing && code !== 0) {
        this.handleProcessError(
          'capture',
          new Error(captureError.trim() || `SystemAudioDump exited with code ${code}`)
        );
      }
    });
    this.converterProcess.on('close', code => {
      if (this.isCapturing && code !== 0) {
        this.handleProcessError(
          'converter',
          new Error(converterError.trim() || `ffmpeg exited with code ${code}`)
        );
      }
    });

    this.isCapturing = true;
    logger.info('System audio capture started', {
      binary,
      format: '16kHz mono PCM'
    });
    this.emit('started', this.getStatus());
    return this.getStatus();
  }

  stop() {
    if (!this.isCapturing) return this.getStatus();
    this.isCapturing = false;

    if (this.speaking && this.speechMs >= 350) {
      this.flushUtterance();
    }

    if (this.captureProcess) {
      this.captureProcess.kill('SIGTERM');
      this.captureProcess = null;
    }
    if (this.converterProcess) {
      if (this.converterProcess.stdin && !this.converterProcess.stdin.destroyed) {
        this.converterProcess.stdin.end();
      }
      this.converterProcess.kill('SIGTERM');
      this.converterProcess = null;
    }

    this.resetVad();
    logger.info('System audio capture stopped');
    this.emit('stopped', this.getStatus());
    return this.getStatus();
  }

  toggle() {
    return this.isCapturing ? this.stop() : this.start();
  }

  getStatus() {
    return {
      available: this.isAvailable(),
      isCapturing: this.isCapturing,
      command: this.getBinaryPath()
    };
  }

  ingestPcm(buffer) {
    if (!this.isCapturing || !buffer?.length) return;
    const chunkMs = buffer.length / 32;
    const energy = this.rms(buffer);
    const floor = Number(process.env.CALL_COPILOT_VAD_FLOOR) || 0.006;

    if (!this.noiseInitialized) {
      this.noiseFloor = Math.min(energy, floor);
      this.noiseInitialized = true;
    }

    const enterThreshold = Math.max(floor, this.noiseFloor * 2.5);
    const exitThreshold = Math.max(floor * 0.75, this.noiseFloor * 1.6);
    const voiced = this.speaking ? energy >= exitThreshold : energy >= enterThreshold;

    if (!this.speaking) {
      if (voiced) {
        this.speaking = true;
        this.segmentBuffers = [...this.preRoll, buffer];
        this.speechMs = chunkMs;
        this.silenceMs = 0;
        this.preRoll = [];
        this.preRollMs = 0;
      } else {
        this.noiseFloor = this.noiseFloor * 0.95 + energy * 0.05;
        this.preRoll.push(buffer);
        this.preRollMs += chunkMs;
        while (this.preRollMs > 300 && this.preRoll.length > 1) {
          const dropped = this.preRoll.shift();
          this.preRollMs -= dropped.length / 32;
        }
      }
      return;
    }

    this.segmentBuffers.push(buffer);
    if (voiced) {
      this.speechMs += chunkMs;
      this.silenceMs = 0;
    } else {
      this.silenceMs += chunkMs;
    }

    const paused = this.silenceMs >= (Number(process.env.CALL_COPILOT_SILENCE_MS) || 800);
    const tooLong = this.speechMs >= (Number(process.env.CALL_COPILOT_MAX_UTTERANCE_MS) || 20000);
    if ((paused && this.speechMs >= 450) || tooLong) {
      this.flushUtterance();
    }
  }

  flushUtterance() {
    const audio = Buffer.concat(this.segmentBuffers);
    const speechMs = this.speechMs;
    this.speaking = false;
    this.speechMs = 0;
    this.silenceMs = 0;
    this.segmentBuffers = [];
    this.preRoll = [];
    this.preRollMs = 0;
    if (audio.length) {
      logger.info('System-audio utterance detected', {
        audioBytes: audio.length,
        speechMs: Math.round(speechMs)
      });
      this.emit('utterance', audio);
    }
  }

  resetVad() {
    this.speaking = false;
    this.speechMs = 0;
    this.silenceMs = 0;
    this.noiseFloor = 0;
    this.noiseInitialized = false;
    this.segmentBuffers = [];
    this.preRoll = [];
    this.preRollMs = 0;
  }

  rms(buffer) {
    const samples = Math.floor(buffer.length / 2);
    if (!samples) return 0;
    let sum = 0;
    for (let i = 0; i < samples; i++) {
      const value = buffer.readInt16LE(i * 2) / 32768;
      sum += value * value;
    }
    return Math.sqrt(sum / samples);
  }

  handleProcessError(component, error) {
    logger.error('System audio process failed', {
      component,
      error: error.message
    });
    this.emit('error', error);
    this.stop();
  }
}

module.exports = new SystemAudioService();
