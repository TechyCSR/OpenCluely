const { spawn } = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');
const { clipboard } = require('electron');
const logger = require('../core/logger').createServiceLogger('AUTOTYPE');

class AutoTypeService extends EventEmitter {
  constructor() {
    super();
    this.currentProcess = null;
    this._isTyping = false;
    this.pythonScriptPath = path.join(__dirname, '../../scripts/human_typer.py');
    this.pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
  }

  /**
   * Check if typing simulation is currently active
   * @returns {boolean}
   */
  isTyping() {
    return this._isTyping;
  }

  /**
   * Type arbitrary text character-by-character at human speed (90-120 WPM)
   * @param {string} text 
   * @param {Object} options 
   * @returns {Promise<Object>}
   */
  async typeText(text, options = {}) {
    if (!text || typeof text !== 'string' || text.length === 0) {
      return { success: false, reason: 'empty_text' };
    }

    // If already typing, stop the current session first
    if (this._isTyping) {
      this.stop();
      await new Promise(r => setTimeout(r, 100));
    }

    const {
      minWpm = 90.0,
      maxWpm = 120.0,
      startDelay = 0.35 // Give user brief pause after triggering shortcut
    } = options;

    return new Promise((resolve) => {
      this._isTyping = true;
      this.emit('autotype-started', { total: text.length, minWpm, maxWpm });

      const inputPayload = JSON.stringify({
        text,
        min_wpm: minWpm,
        max_wpm: maxWpm,
        start_delay: startDelay
      });

      try {
        this.currentProcess = spawn(this.pythonCommand, [this.pythonScriptPath, '--stdin'], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        this.currentProcess.stdin.write(inputPayload);
        this.currentProcess.stdin.end();

        let buffer = '';

        this.currentProcess.stdout.on('data', (data) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep remainder in buffer

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const eventData = JSON.parse(line.trim());
              if (eventData.event === 'progress') {
                this.emit('autotype-progress', eventData);
              } else if (eventData.event === 'completed') {
                this._isTyping = false;
                this.emit('autotype-completed', eventData);
                resolve({ success: true, total: eventData.total });
              } else if (eventData.event === 'stopped') {
                this._isTyping = false;
                this.emit('autotype-stopped', eventData);
                resolve({ success: false, stopped: true });
              }
            } catch (_) {
              // Non-JSON output ignored
            }
          }
        });

        this.currentProcess.stderr.on('data', (data) => {
          logger.warn('AutoType stderr:', { output: data.toString().trim() });
        });

        this.currentProcess.on('error', (err) => {
          logger.error('AutoType process error:', { error: err.message });
          this._isTyping = false;
          this.currentProcess = null;
          this.emit('autotype-error', { error: err.message });
          // Fallback to pure node-based typing if python fails
          this.fallbackType(text, minWpm, maxWpm, resolve);
        });

        this.currentProcess.on('close', (code) => {
          this.currentProcess = null;
          if (this._isTyping) {
            this._isTyping = false;
            this.emit('autotype-stopped', { code });
            resolve({ success: code === 0 });
          }
        });

      } catch (error) {
        logger.error('Failed to spawn autotype process:', { error: error.message });
        this._isTyping = false;
        this.emit('autotype-error', { error: error.message });
        this.fallbackType(text, minWpm, maxWpm, resolve);
      }
    });
  }

  /**
   * Fallback typing routine in case python executable is unavailable
   */
  async fallbackType(text, minWpm, maxWpm, resolve) {
    logger.info('Using fallback system typing');
    this._isTyping = true;
    const total = text.length;
    const startTime = Date.now();

    const keyboardAdjacent = {
      q: 'wa', w: 'qes', e: 'wrd', r: 'etf', t: 'ryg',
      y: 'tuh', u: 'yij', i: 'uok', o: 'ipl', p: 'ol',
      a: 'qwsz', s: 'awedxz', d: 'serfcx', f: 'drtgvc', g: 'ftyhbv',
      h: 'gyujnb', j: 'huikmn', k: 'jiolm', l: 'kop',
      z: 'asx', x: 'zsdc', c: 'xdfv', v: 'cfgb', b: 'vghn',
      n: 'bhjm', m: 'njk'
    };

    try {
      const { exec } = require('child_process');
      const isMac = process.platform === 'darwin';

      const typeChar = (c) => new Promise((res) => {
        if (isMac) {
          if (c === '\n') {
            exec('osascript -e \'tell application "System Events" to key code 36\'', () => res());
          } else if (c === '\t') {
            exec('osascript -e \'tell application "System Events" to key code 48\'', () => res());
          } else {
            const escaped = c.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            exec(`osascript -e 'tell application "System Events" to keystroke "${escaped}"'`, () => res());
          }
        } else {
          res();
        }
      });

      const backspace = () => new Promise((res) => {
        if (isMac) {
          exec('osascript -e \'tell application "System Events" to key code 51\'', () => res());
        } else {
          res();
        }
      });

      let charsSinceMistake = 25;
      let charsSincePause = 0;
      let mistakeCount = 0;
      const maxMistakes = Math.min(3, Math.max(1, Math.floor(total / 300)));

      for (let i = 0; i < total; i++) {
        if (!this._isTyping) {
          this.emit('autotype-stopped', { index: i, total });
          if (resolve) resolve({ success: false, stopped: true });
          return;
        }

        const char = text[i];
        charsSinceMistake++;
        charsSincePause++;

        // Strict mistake safety rules:
        // 1. NEVER in the final 35% or last 60 characters
        // 2. NEVER in first 8 characters
        // 3. NEVER on non-letters or edges of words
        const isSafeForMistake = (
          i < Math.floor(total * 0.65) &&
          (total - i) > 60 &&
          i >= 8 &&
          mistakeCount < maxMistakes &&
          charsSinceMistake >= 35 &&
          /[a-zA-Z]/.test(char) &&
          i > 0 && /[a-zA-Z]/.test(text[i - 1]) &&
          i < total - 1 && /[a-zA-Z]/.test(text[i + 1])
        );

        if (isSafeForMistake && Math.random() < 0.022) {
          const lower = char.toLowerCase();
          const adjacent = keyboardAdjacent[lower];
          if (adjacent) {
            const typo = adjacent[Math.floor(Math.random() * adjacent.length)];
            const typoChar = char === char.toUpperCase() ? typo.toUpperCase() : typo;
            await typeChar(typoChar);
            await new Promise(r => setTimeout(r, 160 + Math.random() * 120));
            await backspace();
            await new Promise(r => setTimeout(r, 90 + Math.random() * 80));
            charsSinceMistake = 0;
            mistakeCount++;
          }
        }

        await typeChar(char);

        const currentWpm = Math.random() * (maxWpm - minWpm) + minWpm;
        let delayMs = (60000 / (currentWpm * 5)) + (Math.random() * 20 - 10);

        // Realistic thought pauses
        if (/[.!?\n]/.test(char) && charsSincePause > 8 && Math.random() < 0.18) {
          delayMs += (350 + Math.random() * 400);
          charsSincePause = 0;
        } else if (charsSincePause > 30 && Math.random() < 0.025) {
          delayMs += (400 + Math.random() * 450);
          charsSincePause = 0;
        }

        const typedCount = i + 1;
        const percent = Math.round((typedCount / total) * 100);
        const elapsedSec = (Date.now() - startTime) / 1000;
        const cps = elapsedSec > 0 ? (typedCount / elapsedSec) : 1;
        const remaining = total - typedCount;
        const etaSeconds = Math.max(0, Math.ceil(remaining / cps));
        const etaText = etaSeconds < 60 ? `${etaSeconds}s` : `${Math.floor(etaSeconds / 60)}m ${String(etaSeconds % 60).padStart(2, '0')}s`;

        if (typedCount % 3 === 0 || typedCount === total) {
          this.emit('autotype-progress', {
            index: typedCount,
            total,
            percent,
            wpm: Math.round(currentWpm),
            eta_seconds: etaSeconds,
            eta_text: etaText
          });
        }

        await new Promise(r => setTimeout(r, Math.max(30, delayMs)));
      }

      this._isTyping = false;
      this.emit('autotype-completed', { total, percent: 100, eta_seconds: 0, eta_text: '0s' });
      if (resolve) resolve({ success: true, total });
    } catch (e) {
      this._isTyping = false;
      logger.error('Fallback typing failed:', { error: e.message });
      if (resolve) resolve({ success: false, error: e.message });
    }
  }

  /**
   * Reads clipboard text and types it
   * @param {Object} options 
   * @returns {Promise<Object>}
   */
  async typeClipboard(options = {}) {
    let clipboardText = '';
    try {
      clipboardText = clipboard.readText();
    } catch (e) {
      logger.error('Failed to read from clipboard:', { error: e.message });
      return { success: false, reason: 'clipboard_read_failed', error: e.message };
    }

    if (!clipboardText || clipboardText.trim().length === 0) {
      logger.warn('Clipboard is empty; auto-type cancelled');
      return { success: false, reason: 'empty_clipboard' };
    }

    logger.info('Auto-typing clipboard content', {
      length: clipboardText.length,
      preview: clipboardText.substring(0, 40) + '...'
    });

    return this.typeText(clipboardText, options);
  }

  /**
   * Stop/cancel the current typing task immediately
   */
  stop() {
    if (this.currentProcess) {
      try {
        this.currentProcess.kill('SIGTERM');
      } catch (_) {}
      this.currentProcess = null;
    }
    const wasTyping = this._isTyping;
    this._isTyping = false;
    if (wasTyping) {
      this.emit('autotype-stopped', { cancelled: true });
    }
  }
}

module.exports = new AutoTypeService();
