const { clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../core/logger').createServiceLogger('CLIPBOARD_TRACKER');

class ClipboardTrackerManager {
  constructor() {
    this.intervalId = null;
    this.lastCopiedText = '';
    
    // Store in ~/.cluely/clipboard_history.json
    const cluelyDir = path.join(os.homedir(), '.cluely');
    if (!fs.existsSync(cluelyDir)) {
      fs.mkdirSync(cluelyDir, { recursive: true });
    }
    this.historyFilePath = path.join(cluelyDir, 'clipboard_history.json');
    this.history = this.loadHistory();
  }

  start() {
    if (this.intervalId) return;
    
    // Initialize with current clipboard to avoid immediately saving what's already there
    this.lastCopiedText = clipboard.readText();
    
    this.intervalId = setInterval(() => {
      this.checkClipboard();
    }, 1000); // Check every second
    logger.info('Clipboard tracker started');
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Clipboard tracker stopped');
    }
  }

  checkClipboard() {
    const currentText = clipboard.readText();
    if (currentText && currentText !== this.lastCopiedText && currentText.trim().length > 0) {
      this.lastCopiedText = currentText;
      this.saveToHistory(currentText);
    }
  }

  getCurrentSessionKey() {
    // Session is defined as an hourly time window
    const now = new Date();
    // Round down to the current hour
    now.setMinutes(0, 0, 0);
    return now.toISOString();
  }

  saveToHistory(text) {
    const sessionKey = this.getCurrentSessionKey();
    
    if (!this.history[sessionKey]) {
      this.history[sessionKey] = [];
    }
    
    // Check if it's a duplicate in the same session to avoid spam
    if (this.history[sessionKey].includes(text)) {
      return;
    }

    this.history[sessionKey].push(text);
    this.cleanupOldSessions();
    this.persistHistory();
    logger.debug('Saved new item to clipboard history', { session: sessionKey });
  }

  cleanupOldSessions() {
    // Keep only the last two and current session (3 total)
    const sessionKeys = Object.keys(this.history).sort().reverse();
    if (sessionKeys.length > 3) {
      const keysToRemove = sessionKeys.slice(3);
      keysToRemove.forEach(key => {
        delete this.history[key];
      });
    }
  }

  loadHistory() {
    try {
      if (fs.existsSync(this.historyFilePath)) {
        const data = fs.readFileSync(this.historyFilePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (e) {
      logger.error('Failed to load clipboard history', { error: e.message });
    }
    return {};
  }

  persistHistory() {
    try {
      fs.writeFileSync(this.historyFilePath, JSON.stringify(this.history, null, 2), 'utf8');
    } catch (e) {
      logger.error('Failed to save clipboard history', { error: e.message });
    }
  }

  getHistory() {
    // Reload from disk to ensure it's fresh
    this.history = this.loadHistory();
    return this.history;
  }
}

module.exports = new ClipboardTrackerManager();
