'use strict';

/**
 * Interview Mode session state. No Gemini, no routing — just listen/submit
 * lifecycle so the main process can skip auto-send until Space.
 *
 * States: idle | listening | thinking | answering
 */
class InterviewSession {
  constructor() {
    this.enabled = false;
    this.state = 'idle';
    this.committed = '';
    this.interim = '';
  }

  enable() {
    this.enabled = true;
    this.state = 'listening';
    this.clearTranscript();
    return this.toPayload();
  }

  disable() {
    this.enabled = false;
    this.state = 'idle';
    this.clearTranscript();
    return this.toPayload();
  }

  clearTranscript() {
    this.committed = '';
    this.interim = '';
    return this.toPayload();
  }

  /** Final Whisper/Azure segment. Ignored unless listening. */
  appendFinal(text) {
    if (!this.enabled || this.state !== 'listening') {
      return false;
    }
    const fragment = String(text || '').trim();
    if (!fragment) {
      return false;
    }
    const current = this.displayText();
    const norm = (value) => value.toLowerCase().replace(/\s+/g, ' ').trim();
    if (current && (norm(fragment).startsWith(norm(current)) || norm(current).startsWith(norm(fragment)))) {
      if (fragment.length > current.length) {
        this.committed = fragment;
        this.interim = '';
      }
      return true;
    }
    this.committed = this.committed ? `${this.committed} ${fragment}` : fragment;
    this.interim = '';
    return true;
  }

  /** Azure (and any future) partial. Ignored unless listening. */
  setInterim(text) {
    if (!this.enabled || this.state !== 'listening') {
      return false;
    }
    this.interim = String(text || '').trim();
    return true;
  }

  setRollingParts(committed, interim) {
    if (!this.enabled || this.state !== 'listening') {
      return false;
    }
    const nextCommitted = String(committed || '').trim();
    const nextInterim = String(interim || '').trim();
    const oldWords = String(this.committed || '').toLowerCase().split(/\s+/).filter(Boolean);
    const newWords = nextCommitted.toLowerCase().split(/\s+/).filter(Boolean);
    const isPrefix = (prefix, words) => {
      if (prefix.length > words.length) return false;
      for (let i = 0; i < prefix.length; i += 1) {
        if (prefix[i] !== words[i]) return false;
      }
      return true;
    };
    // Visible white text is monotonic. A shorter committed decode is a rollback.
    if (oldWords.length && newWords.length < oldWords.length && isPrefix(newWords, oldWords)) {
      this.interim = nextInterim;
      return true;
    }
    if (oldWords.length && newWords.length && !isPrefix(oldWords, newWords) && !isPrefix(newWords, oldWords)) {
      this.interim = nextInterim;
      return true;
    }
    this.committed = nextCommitted;
    this.interim = nextInterim;
    return true;
  }

  displayText() {
    return [this.committed, this.interim].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  snapshot() {
    return this.displayText();
  }

  /** Existing voice path must not call Gemini while Interview Mode is on. */
  shouldAutoSendToLlm() {
    return !this.enabled;
  }

  canSubmit() {
    return this.enabled && this.state === 'listening' && this.snapshot().length >= 2;
  }

  beginAnalyze() {
    if (!this.enabled) {
      return false;
    }
    this.state = 'thinking';
    return true;
  }

  /** Space failed or was empty — keep the caption, keep listening. */
  resumeListening() {
    if (!this.enabled) {
      return false;
    }
    this.state = 'listening';
    return true;
  }

  beginSubmit() {
    if (!this.canSubmit()) {
      return null;
    }
    const text = this.snapshot();
    this.committed = text;
    this.interim = '';
    this.state = 'thinking';
    return text;
  }

  markAnswering() {
    if (this.enabled && this.state === 'thinking') {
      this.state = 'answering';
      return true;
    }
    return false;
  }

  /** @deprecated Use markAnswering — kept so older call sites still compile. */
  markSpeaking() {
    return this.markAnswering();
  }

  finishAnswer() {
    if (!this.enabled) {
      return false;
    }
    this.clearTranscript();
    this.state = 'listening';
    return true;
  }

  toPayload() {
    return {
      enabled: this.enabled,
      state: this.state,
      text: this.displayText(),
      committed: this.committed,
      interim: this.interim
    };
  }
}

module.exports = { InterviewSession };
