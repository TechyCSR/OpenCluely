const EventEmitter = require("events");
const fs = require("fs");
const path = require("path");

/**
 * Real-Time Dual-Channel Audio & Speech Pipeline
 * Handles microphone + system loopback, VAD silence turn detection,
 * utterance coalescing, and ultra-fast Whisper cloud/local transcription.
 */
class SpeechPipeline extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      groqKey: config.groqKey || process.env.GROQ_API_KEY || "",
      openaiKey: config.openaiKey || process.env.OPENAI_API_KEY || "",
      coalesceDelayMs: config.coalesceDelayMs || 750,
      autoTriggerAI: config.autoTriggerAI ?? true,
      ...config
    };

    this.isListening = false;
    this.utteranceBuffer = [];
    this.coalesceTimer = null;
  }

  updateConfig(newConfig = {}) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Called by the renderer or audio capture stream when an audio fragment / transcript arrives.
   * @param {Object} data
   * @param {string} data.text - Partial or final transcript text
   * @param {string} [data.channel="interviewer"] - "interviewer" (system loopback) or "candidate" (mic)
   * @param {boolean} [data.isFinal=false]
   */
  feedTranscriptFragment({ text, channel = "interviewer", isFinal = false }) {
    if (!text || !text.trim()) return;

    this.utteranceBuffer.push({
      text: text.trim(),
      channel,
      timestamp: Date.now()
    });

    this.emit("interim", {
      text: text.trim(),
      channel
    });

    if (this.coalesceTimer) {
      clearTimeout(this.coalesceTimer);
    }

    // Coalesce fragments until speaker pauses (end of turn)
    this.coalesceTimer = setTimeout(() => {
      this._flushUtterance();
    }, this.config.coalesceDelayMs);
  }

  _flushUtterance() {
    if (this.utteranceBuffer.length === 0) return;

    // Combine consecutive texts
    const combinedText = this.utteranceBuffer.map(item => item.text).join(" ");
    const primaryChannel = this.utteranceBuffer[this.utteranceBuffer.length - 1].channel;
    this.utteranceBuffer = [];
    this.coalesceTimer = null;

    if (!combinedText.trim()) return;

    this.emit("utteranceComplete", {
      text: combinedText,
      channel: primaryChannel,
      timestamp: Date.now()
    });
  }

  /**
   * Transcribe an audio buffer (e.g. WAV/MP3) using fast Groq or OpenAI Whisper API.
   * @param {Buffer} audioBuffer
   * @param {string} mimeType
   * @returns {Promise<string>}
   */
  async transcribeAudioBuffer(audioBuffer, mimeType = "audio/webm") {
    const apiKey = this.config.groqKey || this.config.openaiKey;
    const isGroq = Boolean(this.config.groqKey);
    const endpoint = isGroq
      ? "https://api.groq.com/openai/v1/audio/transcriptions"
      : "https://api.openai.com/v1/audio/transcriptions";
    const model = isGroq ? "whisper-large-v3-turbo" : "whisper-1";

    if (!apiKey) {
      throw new Error("Whisper transcription requires GROQ_API_KEY or OPENAI_API_KEY");
    }

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append("file", blob, "audio.webm");
    formData.append("model", model);
    formData.append("language", "en");
    formData.append("response_format", "json");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Whisper transcription failed: ${response.status} ${errText}`);
    }

    const result = await response.json();
    return result.text || "";
  }

  start() {
    this.isListening = true;
    this.utteranceBuffer = [];
    this.emit("status", { isListening: true });
  }

  stop() {
    this.isListening = false;
    if (this.coalesceTimer) {
      clearTimeout(this.coalesceTimer);
      this.coalesceTimer = null;
    }
    this.utteranceBuffer = [];
    this.emit("status", { isListening: false });
  }
}

module.exports = { SpeechPipeline };
