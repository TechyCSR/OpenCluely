const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * First-run detection and onboarding helper.
 *
 * Responsibilities:
 *   - Decide whether this is the user's first launch of OpenCluely
 *   - Auto-create a default `.env` from `env.example` if one is missing
 *   - Report whether the configured LLM provider is ready
 *   - Persist a "first-run completed" sentinel so we don't nag on every launch
 *
 * The settings UI is the source of truth for Google Cloud project setup. This module
 * only handles the bootstrap so the user has something to edit on first
 * launch.
 */
class FirstRunManager {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    this.envPath = options.envPath || path.join(this.cwd, '.env');
    this.sentinelPath = options.sentinelPath || path.join(this.cwd, '.opencluely-firstrun-completed');
    this.logger = options.logger || console;
  }

  /**
   * Returns true if this looks like a fresh install — no .env, no
   * sentinel file, or .env exists but its selected LLM provider is not configured.
   */
  needsOnboarding() {
    if (!fs.existsSync(this.sentinelPath)) return true;
    if (!fs.existsSync(this.envPath)) return true;
    const content = this._readEnv();
    const provider = (content.LLM_PROVIDER || 'gemini').trim().toLowerCase();
    if (provider === 'antigravity') {
      return !(content.ANTIGRAVITY_COMMAND || '').trim();
    }
    return !(content.GOOGLE_CLOUD_PROJECT || '').trim();
  }

  /**
   * Ensures a .env file exists. If not, copies env.example (if available)
   * or writes a minimal template.
   */
  ensureEnv() {
    if (fs.existsSync(this.envPath)) {
      return { created: false, path: this.envPath };
    }

    const template = this._readTemplate();
    const dir = path.dirname(this.envPath);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.envPath, template, 'utf8');
      try {
        fs.chmodSync(this.envPath, 0o600);
      } catch (_) { /* best effort */ }
      return { created: true, path: this.envPath };
    } catch (e) {
      this.logger.error && this.logger.error('Failed to create .env', { error: e.message });
      return { created: false, path: this.envPath, error: e.message };
    }
  }

  /**
   * Mark the first-run as completed so we don't keep prompting.
   */
  markCompleted() {
    try {
      fs.writeFileSync(this.sentinelPath, new Date().toISOString(), 'utf8');
    } catch (e) {
      this.logger.warn && this.logger.warn('Could not write first-run sentinel', {
        error: e.message
      });
    }
  }

  /**
   * Get a snapshot of the current setup state for UI / logging.
   */
  getStatus() {
    const env = this._readEnv();
    const googleCloudProject = (env.GOOGLE_CLOUD_PROJECT || '').trim();
    const llmProvider = (env.LLM_PROVIDER || 'gemini').trim().toLowerCase();
    const antigravityConfigured = !!(env.ANTIGRAVITY_COMMAND || '').trim();
    return {
      envExists: fs.existsSync(this.envPath),
      sentinelExists: fs.existsSync(this.sentinelPath),
      llmProvider,
      antigravityConfigured,
      geminiConfigured: !!googleCloudProject,
      googleCloudProject,
      needsOnboarding: this.needsOnboarding()
    };
  }

  _readEnv() {
    try {
      const content = fs.readFileSync(this.envPath, 'utf8');
      const result = {};
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();

        // If the value is quoted, find the matching closing quote and
        // take everything between. Anything after the closing quote is
        // treated as trailing whitespace/comment.
        if (value.startsWith('"') || value.startsWith("'")) {
          const quote = value[0];
          const closeIdx = value.indexOf(quote, 1);
          if (closeIdx !== -1) {
            value = value.slice(1, closeIdx);
          }
        } else {
          // Unquoted: strip trailing inline comment (a " #" sequence).
          const hashIdx = value.indexOf(' #');
          if (hashIdx !== -1) value = value.slice(0, hashIdx).trim();
        }

        result[key] = value;
      }
      return result;
    } catch (_) {
      return {};
    }
  }

  _readTemplate() {
    // Prefer env.example if it ships in the project; otherwise write a
    // minimal template that the user can extend.
    const candidates = [
      path.join(this.cwd, 'env.example'),
      path.join(__dirname, '..', '..', 'env.example'),
    ];
    for (const candidate of candidates) {
      try {
        return fs.readFileSync(candidate, 'utf8');
      } catch (_) { /* try next */ }
    }
    return [
      '# OpenCluely configuration',
      '# Choose "antigravity" for Google OAuth via agy, or "gemini" for Vertex AI.',
      'LLM_PROVIDER=gemini',
      'ANTIGRAVITY_COMMAND=',
      'ANTIGRAVITY_MODEL=Gemini 3.1 Pro (Low)',
      'ANTIGRAVITY_TIMEOUT_MS=120000',
      '',
      '# Vertex AI project. Authenticate with: gcloud auth application-default login',
      'GOOGLE_CLOUD_PROJECT=',
      'GOOGLE_CLOUD_LOCATION=europe-west4',
      'GEMINI_LIVE_MODEL=gemini-live-2.5-flash-native-audio',
      '',
      '# macOS system audio is sent directly to Gemini Live.',
      'SYSTEM_AUDIO_COMMAND=',
      'FFMPEG_COMMAND=ffmpeg',
      ''
    ].join(os.EOL);
  }
}

module.exports = FirstRunManager;
module.exports.FirstRunManager = FirstRunManager;
