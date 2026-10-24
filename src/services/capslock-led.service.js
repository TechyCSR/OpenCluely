/**
 * Caps Lock LED Service — Rubic Answer Indicator
 *
 * Blinks the MacBook Caps Lock LED in a pattern to indicate the MCQ answer:
 *   A = 1 long blink (500ms)
 *   B = 2 short blinks (250ms each)
 *   C = 3 short blinks
 *   D = 4 short blinks
 *
 * macOS only. Requires the companion scripts/caps_led.swift helper.
 */
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('../core/logger').createServiceLogger('CAPSLOCK');

class CapsLockLEDService {
  constructor() {
    this._blinking = false;
    this._queue = [];
    this._binPath = path.join(__dirname, '..', '..', 'scripts', 'caps_led');
    this._swiftPath = '/usr/bin/swift';
    this._scriptPath = path.join(__dirname, '..', '..', 'scripts', 'caps_led.swift');
  }

  /**
   * Check if the service can run on this platform.
   */
  isAvailable() {
    return process.platform === 'darwin';
  }

  /**
   * Execute command via compiled binary or swift script fallback.
   */
  _runCommand(arg) {
    return new Promise((resolve) => {
      if (!this.isAvailable()) {
        resolve();
        return;
      }

      if (fs.existsSync(this._binPath)) {
        execFile(this._binPath, [arg], { timeout: 4000 }, (err) => {
          if (err) {
            logger.warn('Failed to run caps_led binary', { arg, error: err.message });
          }
          resolve();
        });
      } else {
        execFile(this._swiftPath, [this._scriptPath, arg], { timeout: 4000 }, (err) => {
          if (err) {
            logger.warn('Failed to run caps_led swift script', { arg, error: err.message });
          }
          resolve();
        });
      }
    });
  }

  /**
   * Set the LED state: 'on', 'off', or 'auto'
   */
  _setLED(state) {
    return this._runCommand(state);
  }

  /**
   * Wait for `ms` milliseconds.
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Blink a single answer letter.
   * @param {string} letter - 'A', 'B', 'C', or 'D'
   */
  async blinkAnswer(letter) {
    if (this._blinking) {
      // Queue it
      this._queue.push(letter);
      return;
    }

    this._blinking = true;
    try {
      await this._performBlink(letter);
    } finally {
      this._blinking = false;

      // Process queue
      if (this._queue.length > 0) {
        const next = this._queue.shift();
        // Small gap between queued answers
        await this._sleep(800);
        this.blinkAnswer(next);
      }
    }
  }

  /**
   * Blink pattern for multiple answers (e.g. "A,C" for multi-select).
   * @param {string} letters - Comma-separated answer letters, e.g. "A,C"
   */
  async blinkAnswers(letters) {
    const answers = letters.split(',').map(l => l.trim().toUpperCase()).filter(Boolean);
    for (const letter of answers) {
      await this.blinkAnswer(letter);
      if (answers.indexOf(letter) < answers.length - 1) {
        await this._sleep(1000); // Gap between multiple answers
      }
    }
  }

  async _performBlink(letter) {
    const upperLetter = letter.toUpperCase();
    if (!['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].includes(upperLetter)) {
      logger.warn('Unknown answer letter for LED blink', { letter: upperLetter });
      return;
    }

    logger.info('Blinking Caps Lock LED for answer', { letter: upperLetter });
    await this._runCommand(upperLetter);
  }

  /**
   * Cancel any in-progress blinking and reset LED.
   */
  async reset() {
    this._queue = [];
    this._blinking = false;
    await this._setLED('auto');
  }
}

module.exports = new CapsLockLEDService();
