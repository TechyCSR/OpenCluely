/**
 * Menu Bar Indicator Service — Rubic Answer Display
 *
 * Uses Electron Tray to show the MCQ answer as a macOS menu bar symbol:
 *   A = AirDrop icon (radiating waves) + ᯤ
 *   B = Bluetooth icon (ᛒ rune) + ᛒ
 *   C = Moon icon (DND/Focus crescent) + ☾
 *   D = Bell icon (notification) + ⍾
 *
 * Loads macOS template PNGs and sets system Tray title.
 * Stealth mode: NO tooltips or hover comments are ever displayed.
 */
const { Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const logger = require('../core/logger').createServiceLogger('MENUBAR');

const SYMBOL_MAP = {
  'A': 'ᯤ', // AirDrop
  'B': 'ᛒ', // Bluetooth
  'C': '☾', // Crescent Moon
  'D': '⍾', // Display
  'E': '⏏', // Eject
  'F': '⚯', // Focus
  'G': '⚙', // Gear
  'H': '🎧'  // Headphones
};

class MenuBarIndicatorService {
  constructor() {
    this._tray = null;
    this._currentAnswer = null;
    this._hideTimeout = null;
    this._cycleInterval = null;
  }

  /**
   * Create or update the tray icon showing the answer letter.
   * @param {string} letter - A, B, C, D, E, F, G, or H
   * @param {number} durationMs - Auto-hide duration (default: 25s)
   */
  showAnswer(letter, durationMs = 25000) {
    const upperLetter = String(letter || '').trim().toUpperCase();
    if (!['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].includes(upperLetter)) {
      logger.warn('Invalid answer letter for menu bar indicator', { letter });
      return;
    }

    this._currentAnswer = upperLetter;

    try {
      this._updateTrayDisplay(upperLetter);
      this._scheduleHide(durationMs);
      logger.info('Menu bar indicator showing answer', { letter: upperLetter, symbol: SYMBOL_MAP[upperLetter] });
    } catch (err) {
      logger.error('Failed to show menu bar indicator', { error: err.message });
    }
  }

  /**
   * Internal method to set tray icon and menu bar title.
   * Stealth requirement: Absolutely NO tooltips or hover comments.
   */
  _updateTrayDisplay(upperLetter) {
    const icon = this._createIconForAnswer(upperLetter);
    const symbolChar = SYMBOL_MAP[upperLetter] || upperLetter;
    const barText = ` ${symbolChar}`;

    if (this._tray) {
      try {
        this._tray.setImage(icon);
        if (typeof this._tray.setTitle === 'function') {
          this._tray.setTitle(barText);
        }
      } catch (e) {
        logger.warn('Error updating existing tray, recreating', { error: e.message });
        this.hide();
        this._createTray(icon, barText);
      }
    } else {
      this._createTray(icon, barText);
    }
  }

  _createTray(icon, barText) {
    this._tray = new Tray(icon);
    if (typeof this._tray.setTitle === 'function') {
      this._tray.setTitle(barText);
    }
    // Clicking dismisses the indicator immediately
    this._tray.on('click', () => {
      this.hide();
    });
    this._tray.on('double-click', () => {
      this.hide();
    });
  }

  /**
   * Show multiple answers sequentially (for multi-select).
   * @param {string} letters - Comma-separated, e.g. "A,C"
   * @param {number} totalDurationMs - Duration to cycle
   */
  async showAnswers(letters, totalDurationMs = 25000) {
    const answers = letters.split(',').map(l => l.trim().toUpperCase()).filter(Boolean);
    if (answers.length === 0) return;

    if (answers.length === 1) {
      this.showAnswer(answers[0], totalDurationMs);
      return;
    }

    if (this._cycleInterval) {
      clearInterval(this._cycleInterval);
      this._cycleInterval = null;
    }

    // Cycle through answers every 2.5 seconds
    let idx = 0;
    this._updateTrayDisplay(answers[idx]);

    this._cycleInterval = setInterval(() => {
      idx = (idx + 1) % answers.length;
      this._updateTrayDisplay(answers[idx]);
    }, 2500);

    this._scheduleHide(totalDurationMs);
  }

  /**
   * Hide and destroy the tray icon.
   */
  hide() {
    if (this._cycleInterval) {
      clearInterval(this._cycleInterval);
      this._cycleInterval = null;
    }
    if (this._hideTimeout) {
      clearTimeout(this._hideTimeout);
      this._hideTimeout = null;
    }
    if (this._tray) {
      try {
        this._tray.destroy();
      } catch (_) { /* already destroyed */ }
      this._tray = null;
    }
    this._currentAnswer = null;
  }

  _scheduleHide(ms) {
    if (this._hideTimeout) clearTimeout(this._hideTimeout);
    this._hideTimeout = setTimeout(() => {
      this.hide();
    }, ms);
  }

  /**
   * Load PNG template icon from assets, or fallback to empty image for pure text title.
   */
  _createIconForAnswer(letter) {
    const pngPath = path.join(__dirname, `../../assests/icons/menubar/menubar_${letter}Template.png`);
    if (fs.existsSync(pngPath)) {
      try {
        const img = nativeImage.createFromPath(pngPath);
        if (img && !img.isEmpty()) {
          img.setTemplateImage(true);
          return img.resize({ width: 16, height: 16 });
        }
      } catch (err) {
        logger.warn('Failed to load menubar PNG icon, falling back', { letter, error: err.message });
      }
    }

    // Fallback: 16x16 empty image so macOS status item renders the title cleanly
    return nativeImage.createEmpty();
  }
}

module.exports = new MenuBarIndicatorService();
