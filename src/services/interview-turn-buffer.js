'use strict';

const BYTES_PER_MS = 32;
const TURN_MS = 12000;
const TRAILING_SILENCE_MS = 300;

/**
 * Raw PCM for the current interviewer turn.
 * Starts at VAD speech onset, caps at 12 seconds, keeps timestamps.
 */
class InterviewTurnBuffer {
  constructor(maxMs = TURN_MS) {
    this.maxMs = maxMs;
    this.maxBytes = Math.round(maxMs * BYTES_PER_MS);
    this.reset();
  }

  reset() {
    this.active = false;
    this.chunks = [];
    this.bytes = 0;
    this.startedAt = 0;
    this.lastVoiceAt = 0;
    this.lastChunkAt = 0;
    return this.snapshot();
  }

  begin(now = Date.now()) {
    this.reset();
    this.active = true;
    this.startedAt = now;
    this.lastChunkAt = now;
    return this.snapshot();
  }

  get durationMs() {
    return this.bytes / BYTES_PER_MS;
  }

  push(buffer, { now = Date.now(), voiced = false } = {}) {
    if (!this.active || !buffer || !buffer.length) {
      return false;
    }
    if (this.bytes >= this.maxBytes) {
      return false;
    }
    const chunk = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const room = this.maxBytes - this.bytes;
    const take = chunk.length > room ? chunk.subarray(0, room) : chunk;
    this.chunks.push(take);
    this.bytes += take.length;
    this.lastChunkAt = now;
    if (voiced) {
      this.lastVoiceAt = now;
    }
    return true;
  }

  deactivate() {
    this.active = false;
    return this.snapshot();
  }

  trailingSilenceMs(now = Date.now()) {
    if (!this.lastVoiceAt) return now - (this.startedAt || now);
    return Math.max(0, now - this.lastVoiceAt);
  }

  waitMsForTrailingSilence(maxMs = TRAILING_SILENCE_MS, now = Date.now()) {
    const have = this.trailingSilenceMs(now);
    if (have >= maxMs) return 0;
    return Math.min(maxMs, maxMs - have);
  }

  pcm() {
    if (!this.bytes) return Buffer.alloc(0);
    return Buffer.concat(this.chunks, this.bytes);
  }

  snapshot() {
    return {
      active: this.active,
      durationMs: this.durationMs,
      startedAt: this.startedAt,
      lastVoiceAt: this.lastVoiceAt,
      lastChunkAt: this.lastChunkAt,
      bytes: this.bytes,
      pcm: this.pcm()
    };
  }
}

module.exports = {
  BYTES_PER_MS,
  TURN_MS,
  TRAILING_SILENCE_MS,
  InterviewTurnBuffer
};
