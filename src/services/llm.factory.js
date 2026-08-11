/**
 * LLM Provider Factory
 *
 * Selects the active LLM service based on config.get('llm.provider').
 * The value is read once at require() time from config, which itself reads
 * the LLM_PROVIDER environment variable (set in .env before app start).
 *
 * Changing the provider via the settings UI updates .env and process.env,
 * but takes effect only on the NEXT app restart because Node caches modules.
 *
 * Default: 'gemini' (backward-compatible).
 */
'use strict';

const config = require('../core/config');
const provider = config.get('llm.provider') || 'gemini';

if (provider === 'openrouter') {
  module.exports = require('./openrouter.service');
} else {
  module.exports = require('./llm.service');
}
