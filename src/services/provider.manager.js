const logger = require('../core/logger').createServiceLogger('LLMProvider');
const geminiService = require('./llm.service');
const OllamaService = require('./ollama.service');

const VALID_PROVIDERS = ['gemini', 'ollama'];

/**
 * Picks which LLM backend actually answers requests. main.js's core call
 * sites (processTextWithSkillStream, processImageWithSkillStream,
 * processTranscriptionWithIntelligentResponseStream) call this the same way
 * they always called the Gemini-only `llmService` — this class + the Proxy
 * below make that transparent, so switching providers in Settings doesn't
 * require touching any of those call sites.
 *
 * Gemini-specific admin actions (API key entry, Gemini connection test) stay
 * wired directly to `geminiService` in main.js — they should always act on
 * Gemini regardless of which provider is currently active.
 */
class ProviderManager {
  constructor() {
    const initial = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
    this._provider = VALID_PROVIDERS.includes(initial) ? initial : 'gemini';
    this.gemini = geminiService;
    this.ollama = new OllamaService();
    logger.info('LLM provider manager initialized', { provider: this._provider });
  }

  get current() {
    return this._provider === 'ollama' ? this.ollama : this.gemini;
  }

  getProvider() {
    return this._provider;
  }

  setProvider(provider) {
    const next = VALID_PROVIDERS.includes(provider) ? provider : 'gemini';
    if (next !== this._provider) {
      logger.info('LLM provider switched', { from: this._provider, to: next });
    }
    this._provider = next;
    return this._provider;
  }
}

const manager = new ProviderManager();

// Transparent proxy: any property not owned by ProviderManager itself
// (setProvider, getProvider, gemini, ollama, current) is forwarded to
// whichever backend is currently active. This lets existing call sites keep
// writing `llmService.processTextWithSkillStream(...)` unmodified.
module.exports = new Proxy(manager, {
  get(target, prop, receiver) {
    if (prop in target || typeof prop === 'symbol') {
      return Reflect.get(target, prop, receiver);
    }
    const impl = target.current[prop];
    return typeof impl === 'function' ? impl.bind(target.current) : impl;
  }
});
