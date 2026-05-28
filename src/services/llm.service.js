const config = require('../core/config');
const logger = require('../core/logger').createServiceLogger('LLMProvider');

function getProviderName() {
  return (process.env.LLM_PROVIDER || config.get('llm.provider') || 'gemini').toLowerCase();
}

function getService() {
  const provider = getProviderName();
  if (provider === 'ollama') {
    return require('./ollama.service');
  }
  return require('./gemini.service');
}

// Dynamic proxy — all property accesses are forwarded to the active provider service.
// Switching LLM_PROVIDER at runtime (or via config.set) is picked up automatically.
module.exports = new Proxy(
  { _getProviderName: getProviderName },
  {
    get(target, prop) {
      if (prop === '_getProviderName') return target._getProviderName;
      const svc = getService();
      const val = svc[prop];
      return typeof val === 'function' ? val.bind(svc) : val;
    },
    set(_, prop, value) {
      getService()[prop] = value;
      return true;
    }
  }
);
