const { EventEmitter } = require('events');

class DisabledSpeechService extends EventEmitter {
  constructor() {
    super();
    this.provider = 'disabled';
  }

  initializeClient() {
    return false;
  }

  isAvailable() {
    return false;
  }

  isManualCaptureMode() {
    return false;
  }

  getStatus() {
    return {
      isInitialized: false,
      isRecording: false,
      available: false,
      provider: 'disabled',
      message: 'Legacy speech recognition removed; use Gemini Live'
    };
  }

  startRecording() {
    this.emit('status', 'Legacy speech recognition removed; use Gemini Live');
    return false;
  }

  stopRecording() {
    return false;
  }

  handleAudioChunkFromRenderer() {}

  shutdown() {}
}

module.exports = new DisabledSpeechService();
