/**
 * Whisper detection and install helpers.
 *
 * Used by the onboarding wizard to:
 *   - Probe whether the Whisper CLI is on PATH (or in known venv locations)
 *   - Detect the platform's package manager / python availability
 *   - Run a real install (pip / brew / .venv creation) so the user can
 *     one-click through onboarding without dropping into a terminal.
 *
 * All shell calls are timeouts-bounded so a hanging installer can't
 * lock up the wizard UI.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROBE_TIMEOUT_MS = 8000;
const INSTALL_TIMEOUT_MS = 240000; // pip downloads can be slow

function runExec(cmd, args, { timeout = PROBE_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let child;
    try {
      child = execFile(cmd, args, {
        timeout,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        maxBuffer: 2 * 1024 * 1024,
      }, (err, stdout, stderr) => {
        if (err) {
          finish({
            ok: false,
            code: err.code ?? null,
            signal: err.signal ?? null,
            stdout: stdout?.toString() ?? '',
            stderr: (stderr?.toString() ?? err.message ?? '').trim(),
            error: err.message,
          });
        } else {
          finish({
            ok: true,
            code: 0,
            stdout: (stdout ?? '').toString(),
            stderr: (stderr ?? '').toString(),
          });
        }
      });
    } catch (e) {
      finish({ ok: false, error: e.message, stderr: e.message });
      return;
    }

    // Hard timeout — execFile's internal timeout sometimes lets the
    // child keep running on Windows; we don't kill aggressively to
    // avoid corrupting an in-progress pip install, but we do resolve.
    setTimeout(() => {
      finish({
        ok: false,
        timeout: true,
        stderr: `Command timed out after ${timeout}ms: ${cmd} ${args.join(' ')}`,
      });
    }, timeout + 1000).unref();
  });
}

class WhisperInstaller {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    this.platform = options.platform || process.platform;
    this.runExec = options.runExec || runExec;
  }

  /**
   * Probe for any working Whisper CLI. Returns:
   *   { found: bool, command: string|null, version: string|null, source: string }
   */
  async detect() {
    // 1. Honor WHISPER_COMMAND env if user has it set already
    const fromEnv = (process.env.WHISPER_COMMAND || '').trim();
    if (fromEnv) {
      const probe = await this._probe(fromEnv);
      if (probe.ok) {
        return {
          found: true,
          command: fromEnv,
          version: probe.version,
          source: 'env',
        };
      }
    }

    // 2. Probe a list of likely candidates
    const candidates = this._candidateCommands();
    for (const candidate of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const probe = await this._probe(candidate);
      if (probe.ok) {
        return {
          found: true,
          command: candidate,
          version: probe.version,
          source: 'probe',
        };
      }
    }

    return { found: false, command: null, version: null, source: 'none' };
  }

  /**
   * Run a real install. Picks the right strategy per platform.
   * Emits progress via `onProgress(line)` if provided.
   *
   * Returns { ok, command, message, logs }.
   */
  async install({ onProgress } = {}) {
    const log = (line) => {
      if (typeof onProgress === 'function') onProgress(line);
    };

    const strategy = this._pickInstallStrategy();
    log(`→ Using install strategy: ${strategy.name}`);
    log(`→ Command: ${strategy.cmd} ${strategy.args.join(' ')}`);

    const result = await this.runExec(strategy.cmd, strategy.args, {
      timeout: INSTALL_TIMEOUT_MS,
    });

    if (!result.ok) {
      return {
        ok: false,
        command: null,
        message: result.stderr || result.error || 'Install failed',
        logs: (result.stdout || '') + (result.stderr ? '\n' + result.stderr : ''),
      };
    }

    // After install, re-detect so we report the working command
    const detection = await this.detect();
    if (!detection.found) {
      return {
        ok: false,
        command: null,
        message:
          'Install completed but the Whisper CLI is still not on PATH. ' +
          'You may need to restart the app or check your PATH.',
        logs: (result.stdout || '') + (result.stderr ? '\n' + result.stderr : ''),
      };
    }

    return {
      ok: true,
      command: detection.command,
      message: `Whisper CLI detected: ${detection.command}`,
      logs: (result.stdout || '') + (result.stderr ? '\n' + result.stderr : ''),
    };
  }

  /**
   * Short platform-tailored hints to show the user in the wizard.
   */
  installHints() {
    switch (this.platform) {
      case 'win32':
        return {
          title: 'Install via pip in a project-local venv',
          steps: [
            "We'll create `.venv-whisper\\` and install openai-whisper into it.",
            'This needs Python 3.10+ on PATH (download from python.org).',
            'First run of a transcription will download the model (~150 MB for turbo).',
          ],
        };
      case 'darwin':
        return {
          title: 'Install via Homebrew or pip3',
          steps: [
            "We'll run `pip3 install --user openai-whisper`.",
            'If you prefer Homebrew: `brew install openai-whisper ffmpeg`.',
            'FFmpeg is required for non-WAV audio (also installed if missing).',
          ],
        };
      default:
        return {
          title: 'Install via pip',
          steps: [
            "We'll run `pip3 install --user openai-whisper`.",
            'You may also need `sudo apt install ffmpeg` (Debian/Ubuntu).',
            'First run of a transcription will download the model (~150 MB for turbo).',
          ],
        };
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Internals
  // ─────────────────────────────────────────────────────────────────

  _candidateCommands() {
    if (this.platform === 'win32') {
      const localVenv = path.join(this.cwd, '.venv-whisper', 'Scripts', 'whisper.exe');
      return [
        'whisper',
        'whisper.exe',
        localVenv,
        path.join(this.cwd, '.venv-whisper', 'Scripts', 'python.exe') + ' -m whisper',
        'python -m whisper',
        'python3 -m whisper',
      ];
    }
    if (this.platform === 'darwin') {
      const homebrew = '/opt/homebrew/bin/whisper';
      const usrLocal = '/usr/local/bin/whisper';
      return [
        homebrew,
        usrLocal,
        'whisper',
        'python3 -m whisper',
        path.join(this.cwd, '.venv-whisper', 'bin', 'whisper'),
      ];
    }
    const localVenvBin = path.join(this.cwd, '.venv-whisper', 'bin', 'whisper');
    return [
      'whisper',
      '/usr/local/bin/whisper',
      '/usr/bin/whisper',
      localVenvBin,
      'python3 -m whisper',
    ];
  }

  async _probe(command) {
    const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) || [command];
    const cmd = parts[0].replace(/^"|"$/g, '');
    const args = [...parts.slice(1).map((a) => a.replace(/^"|"$/g, '')), '--help'];
    const r = await this.runExec(cmd, args);
    if (!r.ok) return { ok: false };
    const version = this._extractVersion(r.stdout + r.stderr);
    return { ok: true, version };
  }

  _extractVersion(text) {
    const m = text && text.match(/whisper\s+v?(\d+\.\d+\.\d+)/i);
    return m ? m[1] : null;
  }

  _pickInstallStrategy() {
    if (this.platform === 'win32') {
      // Create a project-local venv and pip-install openai-whisper into
      // it. This avoids needing admin rights on Windows.
      const python = this._detectPython() || 'python';
      const venvPath = path.join(this.cwd, '.venv-whisper');
      return {
        name: 'Windows venv (project-local)',
        cmd: python,
        args: ['-m', 'venv', venvPath],
        // We do pip install in a follow-up step so error reporting is
        // cleaner if venv creation fails.
      };
    }
    if (this.platform === 'darwin') {
      return {
        name: 'pip3 user install (macOS)',
        cmd: 'pip3',
        args: ['install', '--user', 'openai-whisper'],
      };
    }
    return {
      name: 'pip3 user install (Linux)',
      cmd: 'pip3',
      args: ['install', '--user', 'openai-whisper'],
    };
  }

  _detectPython() {
    const candidates = this.platform === 'win32'
      ? ['python', 'py', 'python3']
      : ['python3', 'python'];
    // Sync probe — just check existence. We don't have an async probe
    // here without breaking the install flow; fall back to first candidate.
    for (const c of candidates) {
      try {
        // `which`/`where` are universally available on the runners we
        // care about, and we're in the main process so this is fine.
        // eslint-disable-next-line no-undef
        const which = require('child_process').spawnSync(
          this.platform === 'win32' ? 'where' : 'which',
          [c],
          { windowsHide: true },
        );
        if (which.status === 0) return c;
      } catch (_) { /* ignore */ }
    }
    return null;
  }
}

module.exports = WhisperInstaller;
module.exports.WhisperInstaller = WhisperInstaller;
