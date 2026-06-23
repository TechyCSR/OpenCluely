/**
 * Whisper detection and install helpers.
 *
 * Used by the onboarding wizard to:
 *   - Probe whether the Whisper CLI is on PATH (or in a project-local venv)
 *   - Run a real install into a project-local venv (no sudo, no PEP 668)
 *   - Stream live progress so the wizard can paint install output
 *
 * Why a venv on every platform:
 *   - Windows: avoids needing admin rights to install into system Python
 *   - Linux (PEP 668): pip refuses to install into externally-managed
 *     environments on Ubuntu 23.04+, Debian 12+, Fedora 38+, etc.
 *   - macOS: keeps system Python untouched; respects Homebrew isolation
 *
 * All shell calls are timeouts-bounded and stream stdout/stderr live
 * via the optional `onProgress` callback so the UI can show real-time
 * install output instead of a frozen spinner.
 */

const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROBE_TIMEOUT_MS = 8000;
const INSTALL_TIMEOUT_MS = 300000; // pip downloads can be slow on cold cache

/**
 * Run a command, streaming stdout/stderr lines to `onProgress` as they
 * arrive. Resolves with the full result once the process exits.
 */
function runExec(cmd, args, { timeout = PROBE_TIMEOUT_MS, onProgress } = {}) {
  const log = (line) => {
    if (typeof onProgress === 'function' && line) {
      try { onProgress(line); } catch (_) { /* swallow handler errors */ }
    }
  };

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    // Use `spawn` (not `execFile`) so we can stream stdout/stderr line
    // by line instead of buffering the entire pip run.
    let child;
    try {
      child = spawn(cmd, args, {
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
      });
    } catch (e) {
      finish({ ok: false, error: e.message, stderr: e.message, stdout: '', code: null });
      return;
    }

    let stdoutBuf = '';
    let stderrBuf = '';

    const handleChunk = (buf, isErr) => {
      buf.data += buf.chunk;
      const lines = buf.data.split(/\r?\n/);
      buf.data = lines.pop() ?? '';
      for (const line of lines) {
        if (line.length === 0) continue;
        if (isErr) stderrBuf += (stderrBuf ? '\n' : '') + line;
        else stdoutBuf += (stdoutBuf ? '\n' : '') + line;
        log(line);
      }
    };

    const outBuf = { data: '', chunk: '' };
    const errBuf = { data: '', chunk: '' };
    child.stdout.on('data', (chunk) => { outBuf.chunk = chunk.toString('utf8'); handleChunk(outBuf, false); });
    child.stderr.on('data', (chunk) => { errBuf.chunk = chunk.toString('utf8'); handleChunk(errBuf, true); });

    const killTimer = setTimeout(() => {
      log(`! Command timed out after ${timeout}ms — killing`);
      try { child.kill('SIGKILL'); } catch (_) { /* ignore */ }
      finish({
        ok: false,
        timeout: true,
        stdout: stdoutBuf,
        stderr: (stderrBuf + (stderrBuf ? '\n' : '') + 'Timed out').trim(),
        error: `Timeout after ${timeout}ms: ${cmd} ${args.join(' ')}`,
        code: null,
      });
    }, timeout);

    child.on('error', (err) => {
      clearTimeout(killTimer);
      log(`! Spawn error: ${err.message}`);
      finish({
        ok: false,
        stdout: stdoutBuf,
        stderr: stderrBuf || err.message,
        error: err.message,
        code: err.code ?? null,
      });
    });

    child.on('close', (code, signal) => {
      clearTimeout(killTimer);
      // Flush any trailing partial line
      if (outBuf.data) { stdoutBuf += (stdoutBuf ? '\n' : '') + outBuf.data; log(outBuf.data); }
      if (errBuf.data) { stderrBuf += (stderrBuf ? '\n' : '') + errBuf.data; log(errBuf.data); }

      if (code === 0) {
        finish({ ok: true, code, stdout: stdoutBuf, stderr: stderrBuf });
      } else {
        finish({
          ok: false,
          code,
          signal,
          stdout: stdoutBuf,
          stderr: stderrBuf,
          error: `Exited with code ${code}${signal ? ` (signal ${signal})` : ''}`,
        });
      }
    });
  });
}

class WhisperInstaller {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    this.platform = options.platform || process.platform;
    this.runExec = options.runExec || runExec;
  }

  // ─────────────────────────────────────────────────────────────────
  // Paths
  // ─────────────────────────────────────────────────────────────────

  get venvPath() {
    return path.join(this.cwd, '.venv-whisper');
  }

  /**
   * Inside the venv:
   *   - macOS/Linux: bin/whisper, bin/python, bin/pip
   *   - Windows:     Scripts\whisper.exe, Scripts\python.exe, Scripts\pip.exe
   */
  get venvPaths() {
    const bin = this.platform === 'win32' ? 'Scripts' : 'bin';
    const ext = this.platform === 'win32' ? '.exe' : '';
    const dir = path.join(this.venvPath, bin);
    return {
      dir,
      python: path.join(dir, `python${ext}`),
      pip: path.join(dir, `pip${ext}`),
      whisper: path.join(dir, `whisper${ext}`),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Detection
  // ─────────────────────────────────────────────────────────────────

  async detect() {
    // 1. Honor WHISPER_COMMAND env if user has it set already
    const fromEnv = (process.env.WHISPER_COMMAND || '').trim();
    if (fromEnv) {
      const parsed = this._parseCommandString(fromEnv);
      if (parsed && parsed.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        const probe = await this._probe(parsed);
        if (probe.ok) {
          return {
            found: true,
            command: fromEnv,
            version: probe.version,
            source: 'env',
          };
        }
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
          command: candidate.join(' '),
          version: probe.version,
          source: 'probe',
        };
      }
    }

    return { found: false, command: null, version: null, source: 'none' };
  }

  // ─────────────────────────────────────────────────────────────────
  // Install
  // ─────────────────────────────────────────────────────────────────

  /**
   * Install whisper into a project-local venv. Works on every platform
   * without admin rights and without hitting PEP 668.
   *
   * Steps:
   *   1. Find Python on the system (py / python3 / python)
   *   2. Create .venv-whisper/ if missing
   *   3. pip install openai-whisper into it (live progress)
   *   4. Verify the resulting whisper CLI works
   *
   * @param {object} options
   * @param {(line: string) => void} [options.onProgress] Live output
   * @returns {Promise<{ok: boolean, command: string|null, message: string, logs: string}>}
   */
  async install({ onProgress } = {}) {
    const log = (line) => {
      if (typeof onProgress === 'function') onProgress(line);
    };

    log('→ Detecting Python on the system…');
    const python = this._detectPython();
    if (!python) {
      const msg = this.platform === 'win32'
        ? 'Python 3.10+ not found. Install from python.org and make sure "Add Python to PATH" is checked.'
        : 'python3 not found. Install with your package manager (e.g. `sudo apt install python3 python3-venv`).';
      log(`! ${msg}`);
      return { ok: false, command: null, message: msg, logs: msg };
    }
    log(`✓ Found Python: ${python}`);

    // openai-whisper requires Python 3.9+ (3.10+ recommended for best
    // performance). Catch version mismatch BEFORE attempting pip
    // install — the pip error is cryptic and confusing.
    const version = await this._getPythonVersion(python);
    if (!version) {
      log('! Could not determine Python version');
      return { ok: false, command: null, message: 'Could not determine Python version', logs: '' };
    }
    log(`→ Python version: ${version}`);
    if (!this._isPythonVersionOk(version)) {
      const msg = `Python ${version} is too old. openai-whisper requires Python 3.9 or newer. Please upgrade Python and retry.`;
      log(`! ${msg}`);
      return { ok: false, command: null, message: msg, logs: msg };
    }
    log('✓ Python version OK');

    const vp = this.venvPaths;
    const venvExists = fs.existsSync(vp.python);

    // Step 2: create venv if needed
    if (!venvExists) {
      log(`→ Creating venv at ${this.venvPath}…`);
      const venvResult = await this.runExec(python, ['-m', 'venv', this.venvPath], {
        timeout: 60000,
        onProgress: log,
      });
      if (!venvResult.ok) {
        const msg = `Failed to create venv: ${venvResult.stderr || venvResult.error}`;
        log(`! ${msg}`);
        return { ok: false, command: null, message: msg, logs: venvResult.stdout + '\n' + venvResult.stderr };
      }
      log('✓ Venv created');
    } else {
      log(`✓ Venv already exists at ${this.venvPath}`);
    }

    // Confirm the venv's python actually exists now (venv creation can
    // partially fail on Windows without admin rights to symlink).
    if (!fs.existsSync(vp.python)) {
      const msg = `Venv created but ${vp.python} is missing. Try deleting ${this.venvPath} and retrying.`;
      log(`! ${msg}`);
      return { ok: false, command: null, message: msg, logs: msg };
    }

    // Step 3: pip install into the venv
    log(`→ Installing openai-whisper into venv (this can take a few minutes)…`);
    const pipResult = await this.runExec(vp.python, ['-m', 'pip', 'install', '--upgrade', 'openai-whisper'], {
      timeout: INSTALL_TIMEOUT_MS,
      onProgress: log,
    });
    if (!pipResult.ok) {
      const msg = `pip install failed: ${pipResult.stderr || pipResult.error}`;
      log(`! ${msg}`);
      return { ok: false, command: null, message: msg, logs: pipResult.stdout + '\n' + pipResult.stderr };
    }
    log('✓ openai-whisper installed');

    // Step 4: verify the resulting CLI
    log(`→ Verifying whisper CLI at ${vp.whisper}…`);
    if (!fs.existsSync(vp.whisper)) {
      const msg = `Install reported success but ${vp.whisper} was not created. Check your pip output above.`;
      log(`! ${msg}`);
      return { ok: false, command: null, message: msg, logs: msg };
    }

    const verify = await this._probe([vp.whisper]);
    if (!verify.ok) {
      const msg = `whisper binary exists but doesn't respond to --help. It may be corrupted.`;
      log(`! ${msg}`);
      return { ok: false, command: null, message: msg, logs: msg };
    }

    // Check for ffmpeg — whisper needs it for any non-WAV audio.
    // We log a warning but don't fail; user can install it later.
    const ffmpeg = await this._probeFfmpeg();
    if (ffmpeg.found) {
      log(`✓ ffmpeg detected (${ffmpeg.path})`);
    } else {
      const ffmpegMsg = this.platform === 'win32'
        ? 'ffmpeg not found — install with `winget install ffmpeg` or download from gyan.dev. Required for non-WAV audio.'
        : this.platform === 'darwin'
          ? 'ffmpeg not found — install with `brew install ffmpeg`. Required for non-WAV audio.'
          : 'ffmpeg not found — install with `sudo apt install ffmpeg` (Debian/Ubuntu). Required for non-WAV audio.';
      log(`! ${ffmpegMsg}`);
      log('  (Whisper will work for WAV files; install ffmpeg later for other formats)');
    }

    const commandStr = `${vp.python} -m whisper`;
    log(`✓ Whisper CLI ready: ${commandStr} (v${verify.version || '?'})`);

    return {
      ok: true,
      command: commandStr,
      message: `Installed Whisper v${verify.version || '?'} into ${this.venvPath}`,
      logs: pipResult.stdout,
      ffmpegDetected: ffmpeg.found,
    };
  }

  /**
   * Probe for ffmpeg on PATH. Returns { found, path }.
   */
  async _probeFfmpeg() {
    try {
      const { spawnSync } = require('child_process');
      const r = spawnSync(
        this.platform === 'win32' ? 'where' : 'which',
        ['ffmpeg'],
        { windowsHide: true },
      );
      if (r.status === 0) {
        const path = (r.stdout || '').toString().split(/\r?\n/)[0].trim();
        return { found: true, path };
      }
    } catch (_) { /* ignore */ }
    return { found: false, path: null };
  }

  /**
   * Short platform-tailored hints to show the user in the wizard.
   */
  installHints() {
    switch (this.platform) {
      case 'win32':
        return {
          title: 'Install via a project-local Python venv',
          steps: [
            'Python 3.10+ must be on PATH (download from python.org if missing).',
            "We'll create <code>.venv-whisper\\</code> in the app directory — no admin needed.",
            'openai-whisper installs into the venv via pip (live progress shown below).',
            'First transcription downloads the <code>turbo</code> model (~150 MB).',
          ],
        };
      case 'darwin':
        return {
          title: 'Install via a project-local Python venv',
          steps: [
            'Uses your existing Python 3 (install via Homebrew if missing).',
            "We'll create <code>.venv-whisper/</code> in the app directory.",
            'openai-whisper installs into the venv — no <code>sudo</code> required.',
            'First transcription downloads the <code>turbo</code> model (~150 MB).',
          ],
        };
      default:
        return {
          title: 'Install via a project-local Python venv',
          steps: [
            'Uses your system Python 3.',
            "We'll create <code>.venv-whisper/</code> in the app directory.",
            'This avoids the "externally-managed-environment" pip error on Ubuntu 23.04+, Debian 12+, Fedora 38+.',
            'First transcription downloads the <code>turbo</code> model (~150 MB).',
          ],
        };
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Internals
  // ─────────────────────────────────────────────────────────────────

  /**
   * List of [cmd, ...args] candidates to probe. Always uses array form
   * so paths with spaces survive intact.
   */
  _candidateCommands() {
    const vp = this.venvPaths;
    const out = [
      // Project-local venv — the canonical location we install into.
      [vp.whisper],
      [vp.python, '-m', 'whisper'],
    ];

    if (this.platform === 'win32') {
      out.push(
        ['whisper'],
        ['whisper.exe'],
        // System Python via the launcher `py` (canonical Windows invocation)
        ['py', '-m', 'whisper'],
        ['python', '-m', 'whisper'],
      );
    } else if (this.platform === 'darwin') {
      out.push(
        ['/opt/homebrew/bin/whisper'],
        ['/usr/local/bin/whisper'],
        ['whisper'],
        ['python3', '-m', 'whisper'],
      );
    } else {
      out.push(
        ['whisper'],
        ['/usr/local/bin/whisper'],
        ['/usr/bin/whisper'],
        ['python3', '-m', 'whisper'],
      );
    }
    return out;
  }

  /**
   * Parse a user-supplied command string (e.g. from WHISPER_COMMAND env)
   * into a `[cmd, ...args]` tuple. Respects double-quoted segments so
   * paths-with-spaces survive intact.
   */
  _parseCommandString(cmdString) {
    if (!cmdString) return null;
    const trimmed = String(cmdString).trim();
    if (!trimmed) return null;
    const parts = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) || [trimmed];
    return parts.map((p) => p.replace(/^"|"$/g, ''));
  }

  async _probe(candidate) {
    const cmd = candidate[0];
    const args = [...candidate.slice(1), '--help'];
    const r = await this.runExec(cmd, args);
    if (!r.ok) return { ok: false };
    const version = this._extractVersion(r.stdout + r.stderr);
    return { ok: true, version };
  }

  _extractVersion(text) {
    const m = text && text.match(/whisper\s+v?(\d+\.\d+\.\d+)/i);
    return m ? m[1] : null;
  }

  /**
   * Find a Python interpreter. Returns the resolved command name (which
   * may be a full path) or null if nothing usable is on PATH.
   */
  _detectPython() {
    const candidates = this.platform === 'win32'
      ? ['py', 'python', 'python3']
      : ['python3', 'python'];
    for (const c of candidates) {
      try {
        const which = require('child_process').spawnSync(
          this.platform === 'win32' ? 'where' : 'which',
          [c],
          { windowsHide: true },
        );
        if (which.status === 0) {
          const stdout = (which.stdout || '').toString().split(/\r?\n/)[0].trim();
          return stdout || c;
        }
      } catch (_) { /* ignore */ }
    }
    return null;
  }

  /**
   * Resolve Python's `--version` string into a `major.minor` tuple
   * (e.g. '3.11'). Returns null if it can't be determined.
   */
  async _getPythonVersion(pythonCmd) {
    const r = await this.runExec(pythonCmd, ['-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'], {
      timeout: 10000,
    });
    if (!r.ok) return null;
    const m = (r.stdout || '').trim().match(/^(\d+)\.(\d+)/);
    return m ? `${m[1]}.${m[2]}` : null;
  }

  /**
   * openai-whisper requires Python 3.9+. We warn below 3.10 and refuse
   * below 3.9. Returns false if the version is too old.
   */
  _isPythonVersionOk(version) {
    const m = (version || '').match(/^(\d+)\.(\d+)/);
    if (!m) return false;
    const major = parseInt(m[1], 10);
    const minor = parseInt(m[2], 10);
    if (major > 3) return true;
    if (major === 3 && minor >= 9) return true;
    return false;
  }

  /**
   * Download a Whisper model using the installed CLI.
   * Models: tiny, base, small, medium, large, turbo
   */
  async downloadModel(modelName = 'turbo', { onProgress } = {}) {
    const log = (line) => {
      if (typeof onProgress === 'function' && line) {
        try { onProgress(line); } catch (_) { /* swallow handler errors */ }
      }
    };

    // Get the whisper command
    const detectResult = await this.detect();
    if (!detectResult.found) {
      return { ok: false, message: 'Whisper CLI not found. Install Whisper first.' };
    }

    const command = detectResult.command;
    log(`→ Downloading ${modelName} model using ${command}…`);

    // Parse the command to get the python executable and module
    let pythonCmd, moduleName;
    if (command.includes(' -m ')) {
      const parts = command.split(' -m ');
      pythonCmd = parts[0].trim();
      moduleName = parts[1].trim();
    } else if (command.endsWith(' -m whisper')) {
      pythonCmd = command.replace(' -m whisper', '').trim();
      moduleName = 'whisper';
    } else {
      // Fallback: assume it's a direct whisper command
      pythonCmd = 'python3';
      moduleName = 'whisper';
    }

    const result = await this.runExec(pythonCmd, ['-m', moduleName, '--model', modelName, '--help'], {
      timeout: 30000,
      onProgress: log,
    });

    if (!result.ok) {
      // Try running a small transcription to trigger download
      log(`→ Triggering model download via test transcription…`);
      const testResult = await this.runExec(pythonCmd, ['-m', moduleName, '--model', modelName, '--language', 'en', '/dev/null'], {
        timeout: 120000,
        onProgress: log,
      });
      
      if (!testResult.ok) {
        // Check if it's just a file not found error (model downloading)
        if (testResult.stderr && testResult.stderr.includes('Downloading')) {
          // Wait for download to complete
          const downloadResult = await this.runExec(pythonCmd, ['-m', moduleName, '--model', modelName, '--help'], {
            timeout: 300000,
            onProgress: log,
          });
          if (downloadResult.ok) {
            const modelPath = this._getModelPath(modelName);
            return { ok: true, message: `Model ${modelName} downloaded successfully`, path: modelPath };
          }
        }
        return { ok: false, message: testResult.stderr || testResult.error };
      }
    }

    const modelPath = this._getModelPath(modelName);
    log(`✓ Model ${modelName} ready at ${modelPath}`);
    return { ok: true, message: `Model ${modelName} downloaded successfully`, path: modelPath };
  }

  /**
   * Get the expected model cache path.
   */
  _getModelPath(modelName) {
    const homeDir = require('os').homedir();
    return path.join(homeDir, '.cache', 'whisper', `${modelName}.pt`);
  }
}

module.exports = WhisperInstaller;
module.exports.WhisperInstaller = WhisperInstaller;
module.exports.runExec = runExec;
