const { spawn, execSync } = require("child_process");
const { clipboard } = require("electron");

/**
 * Humanized Keystroke Auto-Typer
 * Injects code or answers into the active code editor with realistic human typing jitter (30-80ms).
 * Prevents anti-cheat / proctoring copy-paste detection flags.
 */
class AutoTyper {
  constructor() {
    this.isTyping = false;
    this.abortRequested = false;
  }

  abort() {
    if (this.isTyping) {
      this.abortRequested = true;
    }
  }

  /**
   * Extract code from markdown block if present, or return text as-is.
   * @param {string} text
   * @returns {string}
   */
  static extractCode(text) {
    if (!text) return "";
    const codeMatch = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
    if (codeMatch && codeMatch[1]) {
      return codeMatch[1].trim();
    }
    return text.trim();
  }

  /**
   * Type text into the active window.
   * @param {string} text
   * @param {Object} [options]
   * @param {number} [options.baseDelayMs=40]
   * @param {number} [options.jitterMs=25]
   * @param {boolean} [options.extractOnlyCode=true]
   * @returns {Promise<boolean>}
   */
  async typeText(text, options = {}) {
    const { baseDelayMs = 40, jitterMs = 25, extractOnlyCode = true } = options;
    const content = extractOnlyCode ? AutoTyper.extractCode(text) : text;
    if (!content) return false;

    this.isTyping = true;
    this.abortRequested = false;

    // Small initial delay so user can focus editor
    await new Promise(r => setTimeout(r, 400));

    try {
      if (process.platform === "linux") {
        await this._typeLinux(content, baseDelayMs, jitterMs);
      } else {
        await this._typeFallbackClipboard(content);
      }
      return true;
    } finally {
      this.isTyping = false;
      this.abortRequested = false;
    }
  }

  async _typeLinux(content, baseDelay, jitter) {
    // Type in small batches to preserve human timing without spawning thousands of processes
    const chunks = content.split("\n");

    for (let i = 0; i < chunks.length; i++) {
      if (this.abortRequested) break;
      const line = chunks[i];

      if (line.length > 0) {
        // xdotool type --delay ms
        const delay = Math.max(15, baseDelay + Math.floor((Math.random() - 0.5) * jitter));
        await new Promise((resolve) => {
          const proc = spawn("xdotool", ["type", "--clearmodifiers", "--delay", String(delay), line]);
          proc.on("close", () => resolve());
          proc.on("error", () => resolve());
        });
      }

      if (i < chunks.length - 1 && !this.abortRequested) {
        // Hit Return key with realistic newline pause (100-200ms)
        await new Promise((resolve) => {
          const proc = spawn("xdotool", ["key", "Return"]);
          proc.on("close", () => resolve());
          proc.on("error", () => resolve());
        });
        const newlinePause = 120 + Math.floor(Math.random() * 80);
        await new Promise(r => setTimeout(r, newlinePause));
      }
    }
  }

  async _typeFallbackClipboard(content) {
    const prevClipboard = clipboard.readText();
    clipboard.writeText(content);
    // Paste using keyboard shortcut
    if (process.platform === "darwin") {
      try {
        execSync(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`);
      } catch (_) {}
    } else if (process.platform === "win32") {
      try {
        execSync(`powershell -command "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('^v')"`);
      } catch (_) {}
    }
    // Restore clipboard after short interval
    setTimeout(() => {
      try { clipboard.writeText(prevClipboard); } catch (_) {}
    }, 1500);
  }
}

module.exports = { AutoTyper };
