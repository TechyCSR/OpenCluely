/**
 * Muse provider for the Meta Model API (https://api.meta.ai/v1).
 *
 * The API is OpenAI-compatible: chat-completions shape, Bearer
 * MODEL_API_KEY auth, configurable muse-spark model id (default
 * muse-spark-1.1). This module owns request shaping, transport
 * (non-streaming + SSE streaming), and retry/fallback policy for the
 * Muse path. LLMService delegates to it whenever the active provider
 * is 'muse' and keeps the Gemini path untouched otherwise.
 *
 * NOTE: the image path uses the chat-completions image_url format
 * (data-URI). It has not been verified against a live call — no
 * MODEL_API_KEY was available to this worker — and is implemented
 * per the Meta docs' OpenAI compatibility statement.
 */
const https = require('https');
const logger = require('../core/logger').createServiceLogger('Muse');
const config = require('../core/config');

const DEFAULT_BASE_URL = 'https://api.meta.ai/v1';
const DEFAULT_MODEL = 'muse-spark-1.1';

/**
 * Convert a Gemini-shaped request ({ systemInstruction, contents })
 * into OpenAI chat-completions messages. Text parts become message
 * text; inlineData image parts become image_url data-URI parts.
 */
function geminiRequestToChatMessages(geminiRequest) {
  const messages = [];
  const request = geminiRequest || {};

  const systemText = (request.systemInstruction?.parts || [])
    .filter((part) => typeof part?.text === 'string' && part.text.trim().length > 0)
    .map((part) => part.text)
    .join('\n');
  if (systemText.trim().length > 0) {
    messages.push({ role: 'system', content: systemText });
  }

  for (const content of request.contents || []) {
    const role = content?.role === 'model' ? 'assistant' : 'user';
    const texts = [];
    const images = [];
    for (const part of content?.parts || []) {
      if (typeof part?.text === 'string' && part.text.length > 0) {
        texts.push(part.text);
      }
      if (part?.inlineData?.data) {
        const mimeType = part.inlineData.mimeType || 'image/png';
        images.push({
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${part.inlineData.data}` }
        });
      }
    }
    if (texts.length === 0 && images.length === 0) {
      continue;
    }
    if (images.length === 0) {
      messages.push({ role, content: texts.join('\n') });
    } else {
      messages.push({
        role,
        content: [
          ...texts.map((text) => ({ type: 'text', text })),
          ...images
        ]
      });
    }
  }

  return messages;
}

function extractMessageText(choiceMessage) {
  if (typeof choiceMessage === 'string') return choiceMessage;
  if (typeof choiceMessage?.content === 'string') return choiceMessage.content;
  if (Array.isArray(choiceMessage?.content)) {
    return choiceMessage.content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('');
  }
  return '';
}

class MuseProvider {
  getBaseURL() {
    const raw = (process.env.MUSE_BASE_URL || config.get('llm.muse.baseURL') || DEFAULT_BASE_URL).trim();
    return raw.replace(/\/+$/, '');
  }

  getModel() {
    return (process.env.MUSE_MODEL || config.get('llm.muse.model') || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  }

  getApiKey() {
    return config.getApiKey('MODEL');
  }

  isConfigured() {
    const key = this.getApiKey();
    return !!key && key !== 'your-model-api-key-here' && key !== 'your_api_key_here';
  }

  getChatDefaults(overrides = {}) {
    const generation = config.get('llm.muse.generation') || {};
    const fallback = { temperature: 0.7, topP: 0.9, maxOutputTokens: 4096 };
    const merged = { ...fallback, ...generation, ...overrides };
    const body = {};
    if (merged.temperature !== undefined && merged.temperature !== null) body.temperature = merged.temperature;
    if (merged.topP !== undefined && merged.topP !== null) body.top_p = merged.topP;
    if (merged.maxOutputTokens !== undefined && merged.maxOutputTokens !== null) body.max_tokens = merged.maxOutputTokens;
    return body;
  }

  buildBody(messages, { stream = false, generationOverrides = {} } = {}) {
    return {
      model: this.getModel(),
      messages,
      ...this.getChatDefaults(generationOverrides),
      ...(stream ? { stream: true } : {})
    };
  }

  async complete(messages, { generationOverrides = {} } = {}) {
    const maxRetries = config.get('llm.muse.maxRetries') || 3;
    const timeout = config.get('llm.muse.timeout') || 30000;
    const primaryModel = this.getModel();
    const fallbackModels = config.get('llm.muse.fallbackModels') || [];
    const modelsToTry = [primaryModel, ...fallbackModels];
    let lastError = null;

    for (const modelName of modelsToTry) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const body = {
            model: modelName,
            messages,
            ...this.getChatDefaults(generationOverrides)
          };
          const postData = JSON.stringify(body);
          const text = await this._postCompletion(postData, timeout);
          return text;
        } catch (error) {
          lastError = error;
          logger.warn(`Muse completion attempt ${attempt} failed for model ${modelName}`, {
            error: error.message,
            remainingAttempts: maxRetries - attempt,
            model: modelName
          });
          if (this._isModelUnavailable(error) && modelName !== modelsToTry[modelsToTry.length - 1]) {
            break; // try next fallback model
          }
          if (attempt === maxRetries) break;
          await this._delay(this._backoffDelay(attempt, error));
        }
      }
    }

    throw lastError || new Error('Muse completion failed');
  }

  _postCompletion(postData, timeout) {
    const baseURL = this.getBaseURL();
    const url = new URL('chat/completions', `${baseURL}/`);
    const apiKey = this.getApiKey();
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout
    };

    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              return;
            }
            const response = JSON.parse(data);
            const message = response?.choices?.[0]?.message;
            const text = extractMessageText(message).trim();
            if (!text) {
              reject(new Error('Empty response from Muse API'));
              return;
            }
            resolve(text);
          } catch (error) {
            reject(new Error(`Failed to parse Muse response: ${error.message}`));
          }
        });
        res.on('error', (error) => reject(new Error(`Muse response error: ${error.message}`)));
      });
      req.on('error', (error) => reject(new Error(`Muse request failed: ${error.message}`)));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Muse request timeout'));
      });
      req.write(postData);
      req.end();
    });
  }

  async completeStream(messages, onDelta, { generationOverrides = {} } = {}) {
    const maxRetries = config.get('llm.muse.maxRetries') || 3;
    const timeout = config.get('llm.muse.timeout') || 30000;
    const primaryModel = this.getModel();
    const fallbackModels = config.get('llm.muse.fallbackModels') || [];
    const modelsToTry = [primaryModel, ...fallbackModels];
    let lastError = null;
    let streamStarted = false;
    const trackedOnDelta = (piece) => {
      streamStarted = true;
      if (typeof onDelta === 'function') onDelta(piece);
    };

    for (const modelName of modelsToTry) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const body = {
            model: modelName,
            messages,
            ...this.getChatDefaults(generationOverrides),
            stream: true
          };
          const fullText = await this._postStream(JSON.stringify(body), timeout, trackedOnDelta);
          if (!fullText) {
            throw new Error('Empty streamed response from Muse API');
          }
          return fullText;
        } catch (error) {
          lastError = error;
          if (streamStarted) {
            error.streamStarted = true;
            throw error;
          }
          logger.warn(`Muse streaming attempt ${attempt} failed for model ${modelName}`, {
            error: error.message,
            remainingAttempts: maxRetries - attempt,
            model: modelName
          });
          if (this._isModelUnavailable(error) && modelName !== modelsToTry[modelsToTry.length - 1]) {
            break; // try next fallback model
          }
          if (attempt === maxRetries) break;
          await this._delay(this._backoffDelay(attempt, error));
        }
      }
    }

    throw lastError || new Error('Muse streaming request failed');
  }

  _postStream(postData, timeout, onDelta) {
    const baseURL = this.getBaseURL();
    const url = new URL('chat/completions', `${baseURL}/`);
    const apiKey = this.getApiKey();
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData),
        Accept: 'text/event-stream'
      },
      timeout
    };

    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        if (res.statusCode !== 200) {
          let errBody = '';
          res.on('data', (chunk) => { errBody += chunk; });
          res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errBody}`)));
          return;
        }

        let fullText = '';
        let buffer = '';
        res.setEncoding('utf8');
        const handleLine = (rawLine) => {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) return;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') return;
          try {
            const json = JSON.parse(payload);
            const piece = json?.choices?.[0]?.delta?.content || '';
            if (piece) {
              fullText += piece;
              if (typeof onDelta === 'function') onDelta(piece);
            }
          } catch (_) {
            // Skip unparseable lines.
          }
        };
        res.on('data', (chunk) => {
          buffer += chunk;
          let idx;
          while ((idx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);
            handleLine(line);
          }
        });
        res.on('end', () => {
          handleLine(buffer);
          buffer = '';
          resolve(fullText.trim());
        });
        res.on('error', (error) => reject(new Error(`Muse streaming response error: ${error.message}`)));
      });
      req.on('error', (error) => reject(new Error(`Muse streaming request failed: ${error.message}`)));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Muse streaming request timeout'));
      });
      req.write(postData);
      req.end();
    });
  }

  async testConnection() {
    const startTime = Date.now();
    try {
      const text = await this.complete(
        [{ role: 'user', content: 'Test connection. Please respond with "OK".' }],
        { generationOverrides: { temperature: 0, maxOutputTokens: 64 } }
      );
      return {
        success: true,
        response: text,
        latency: Date.now() - startTime,
        model: this.getModel()
      };
    } catch (error) {
      return { success: false, error: this.friendlyError(error), rawError: error.message };
    }
  }

  friendlyError(error) {
    const raw = (error?.message || '').toLowerCase();
    if (raw.includes('401') || raw.includes('403') || raw.includes('unauthorized') || raw.includes('invalid api key') || raw.includes('forbidden')) {
      return 'Invalid MODEL_API_KEY. Create one at dev.meta.ai and paste it in Settings.';
    }
    if (raw.includes('429') || raw.includes('quota') || raw.includes('rate limit')) {
      return 'Rate limit or quota exceeded on the Meta Model API. Wait a moment and try again.';
    }
    if (raw.includes('timeout') || raw.includes('enotfound') || raw.includes('econnrefused') || raw.includes('fetch failed')) {
      return 'Cannot reach api.meta.ai. Check your internet connection, firewall, or VPN settings.';
    }
    if (raw.includes('404') || raw.includes('model')) {
      return 'The configured Muse model is unavailable. Check the model id in Settings.';
    }
    return (error?.message || 'Connection failed');
  }

  _isModelUnavailable(error) {
    const raw = (error?.message || '').toLowerCase();
    return raw.includes('429') || raw.includes('503') || raw.includes('unavailable') ||
      raw.includes('overloaded') || raw.includes('quota') || raw.includes('rate limit') ||
      raw.includes('high demand');
  }

  _backoffDelay(attempt, error) {
    const raw = (error?.message || '').toLowerCase();
    const baseDelay = (raw.includes('enotfound') || raw.includes('timeout') || raw.includes('fetch failed')) ? 2500 : 1500;
    return baseDelay * attempt + Math.random() * 1000;
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = {
  MuseProvider,
  geminiRequestToChatMessages,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL
};
