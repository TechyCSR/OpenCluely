const http = require('http');
const https = require('https');
const { URL } = require('url');
const logger = require('../core/logger').createServiceLogger('Ollama');
const config = require('../core/config');
const { promptLoader } = require('../../prompt-loader');
// Reuse the existing (Gemini) service's pure prompt/history builders and text
// helpers instead of re-implementing skill prompts, conversation-history
// shaping, and language enforcement a second time. None of the reused methods
// touch `this.client`/`this.isInitialized`, so they're safe to call whether or
// not a Gemini API key is configured — they just build a provider-neutral
// {systemInstruction, contents} shape that we convert to Ollama's chat format.
const geminiService = require('./llm.service');

class OllamaService {
  constructor() {
    this.requestCount = 0;
    this.errorCount = 0;
    // No API key required for a local server, so this provider is always
    // "initialized" — actual reachability is verified by testConnection().
    this.isInitialized = true;
    this.host = process.env.OLLAMA_HOST || config.get('llm.ollama.host') || 'http://127.0.0.1:11434';
    this.model = process.env.OLLAMA_MODEL || config.get('llm.ollama.model') || 'phi3.5:3.8b';
  }

  /** Update host/model live (called after settings are saved). */
  updateConfig({ host, model } = {}) {
    if (host) this.host = host;
    if (model) this.model = model;
    logger.info('Ollama config updated', { host: this.host, model: this.model });
  }

  // Ollama needs no API key. Kept as a no-op so this class satisfies the same
  // surface as LLMService when routed through the provider proxy.
  updateApiKey() {}

  _endpoint(path) {
    return `${this.host.replace(/\/+$/, '')}${path}`;
  }

  /**
   * Convert the provider-neutral {systemInstruction, contents} shape (as
   * produced by geminiService.buildGeminiRequest / buildIntelligentTranscriptionRequest)
   * into Ollama's /api/chat `messages` array.
   */
  _geminiRequestToMessages(geminiRequest) {
    const messages = [];
    const sysText = geminiRequest?.systemInstruction?.parts?.[0]?.text;
    if (sysText) messages.push({ role: 'system', content: sysText });

    const contents = Array.isArray(geminiRequest?.contents) ? geminiRequest.contents : [];
    for (const c of contents) {
      const parts = c.parts || [];
      const text = parts.filter(p => typeof p.text === 'string').map(p => p.text).join('\n');
      if (!text) continue;
      messages.push({ role: c.role === 'model' ? 'assistant' : 'user', content: text });
    }
    return messages;
  }

  /**
   * List locally pulled models (used by Settings for a model picker and by
   * capability checks before attempting image analysis).
   */
  async listModels() {
    const data = await this._get('/api/tags');
    const models = Array.isArray(data?.models) ? data.models : [];
    return models.map(m => ({
      name: m.name || m.model,
      size: m.size,
      capabilities: m.details?.capabilities || m.capabilities || []
    }));
  }

  async _modelSupportsVision(modelName) {
    try {
      const models = await this.listModels();
      const match = models.find(m => m.name === modelName);
      return !!match && Array.isArray(match.capabilities) && match.capabilities.includes('vision');
    } catch (_) {
      // If we can't determine capabilities (server unreachable, etc.), don't
      // block the attempt here — the actual request will surface the real error.
      return true;
    }
  }

  _get(path) {
    const url = new URL(this._endpoint(path));
    const lib = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const req = lib.get(url, { timeout: 8000 }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Ollama returned ${res.statusCode}: ${body.slice(0, 300)}`));
            return;
          }
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (e) {
            reject(new Error(`Failed to parse Ollama response: ${e.message}`));
          }
        });
      });
      req.on('timeout', () => req.destroy(new Error('Ollama request timed out')));
      req.on('error', reject);
    });
  }

  /**
   * POST to /api/chat. Handles both streamed (newline-delimited JSON) and
   * single-shot responses with the same parser, since a non-streamed response
   * is just one JSON line.
   */
  _chat(messages, { stream = false, onDelta = null, temperature } = {}) {
    const body = JSON.stringify({
      model: this.model,
      messages,
      stream,
      options: temperature !== undefined ? { temperature } : undefined
    });

    const url = new URL(this._endpoint('/api/chat'));
    const lib = url.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const req = lib.request(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            let errBody = '';
            res.setEncoding('utf8');
            res.on('data', (c) => (errBody += c));
            res.on('end', () => reject(new Error(`Ollama returned ${res.statusCode}: ${errBody.slice(0, 300)}`)));
            return;
          }

          let full = '';
          let buffer = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              this._consumeLine(trimmed, (delta) => {
                full += delta;
                if (stream && typeof onDelta === 'function') onDelta(delta);
              }, reject);
            }
          });
          res.on('end', () => {
            const trimmed = buffer.trim();
            if (trimmed) {
              this._consumeLine(trimmed, (delta) => {
                full += delta;
                if (stream && typeof onDelta === 'function') onDelta(delta);
              }, () => {});
            }
            resolve(full);
          });
        }
      );

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  _consumeLine(line, onText, onError) {
    let json;
    try {
      json = JSON.parse(line);
    } catch (_) {
      return; // ignore partial/non-JSON fragments
    }
    if (json.error) {
      onError(new Error(json.error));
      return;
    }
    const delta = json?.message?.content;
    if (typeof delta === 'string' && delta.length > 0) {
      onText(delta);
    }
  }

  _temperature() {
    return geminiService.getGenerationConfig()?.temperature;
  }

  // ── Text (chat) ──────────────────────────────────────────────────────

  async processTextWithSkill(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    const startTime = Date.now();
    this.requestCount++;
    try {
      const geminiRequest = geminiService.buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage);
      const messages = this._geminiRequestToMessages(geminiRequest);
      const responseText = await this._chat(messages, { stream: false, temperature: this._temperature() });
      const finalResponse = programmingLanguage
        ? geminiService.enforceProgrammingLanguage(responseText, programmingLanguage)
        : responseText;

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          provider: 'ollama',
          model: this.model
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Ollama text processing failed', { error: error.message, activeSkill });
      return geminiService.generateFallbackResponse(text, activeSkill);
    }
  }

  async processTextWithSkillStream(text, activeSkill, sessionMemory = [], programmingLanguage = null, onDelta = null) {
    const startTime = Date.now();
    this.requestCount++;
    try {
      const geminiRequest = geminiService.buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage);
      const messages = this._geminiRequestToMessages(geminiRequest);
      const fullText = await this._chat(messages, {
        stream: true,
        temperature: this._temperature(),
        onDelta: (delta) => {
          if (typeof onDelta === 'function' && delta) onDelta(delta);
        }
      });
      const finalResponse = programmingLanguage
        ? geminiService.enforceProgrammingLanguage(fullText, programmingLanguage)
        : fullText;

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          streamed: true,
          provider: 'ollama',
          model: this.model
        }
      };
    } catch (error) {
      logger.warn('Ollama streaming failed, falling back to non-streaming', { error: error.message });
      return this.processTextWithSkill(text, activeSkill, sessionMemory, programmingLanguage);
    }
  }

  // ── Image (screenshot) ──────────────────────────────────────────────

  async _buildImageMessages(activeSkill, programmingLanguage, imageBuffer) {
    const skillPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';
    const instruction = geminiService.formatImageInstruction(activeSkill, programmingLanguage);
    const base64 = imageBuffer.toString('base64');
    const messages = [];
    if (skillPrompt.trim()) messages.push({ role: 'system', content: skillPrompt });
    messages.push({ role: 'user', content: instruction, images: [base64] });
    return messages;
  }

  async processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
      throw new Error('Invalid image buffer provided to processImageWithSkill');
    }
    const startTime = Date.now();
    this.requestCount++;
    try {
      const supportsVision = await this._modelSupportsVision(this.model);
      if (!supportsVision) {
        throw new Error(
          `Configured Ollama model '${this.model}' has no vision capability, so it can't read screenshots. ` +
          `Pull a vision-capable model (e.g. "ollama pull llava" or "qwen2.5vl") and select it in Settings, or switch the LLM provider to Gemini for screenshot analysis.`
        );
      }
      const messages = await this._buildImageMessages(activeSkill, programmingLanguage, imageBuffer);
      const responseText = await this._chat(messages, { stream: false, temperature: this._temperature() });
      const finalResponse = programmingLanguage
        ? geminiService.enforceProgrammingLanguage(responseText, programmingLanguage)
        : responseText;

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isImageAnalysis: true,
          mimeType,
          provider: 'ollama',
          model: this.model
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Ollama image processing failed', { error: error.message, activeSkill });
      return geminiService.generateFallbackResponse('[image]', activeSkill);
    }
  }

  async processImageWithSkillStream(imageBuffer, mimeType, activeSkill, sessionMemory = [], programmingLanguage = null, onDelta = null) {
    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
      throw new Error('Invalid image buffer provided to processImageWithSkillStream');
    }
    const startTime = Date.now();
    this.requestCount++;
    try {
      const supportsVision = await this._modelSupportsVision(this.model);
      if (!supportsVision) {
        throw new Error(
          `Configured Ollama model '${this.model}' has no vision capability, so it can't read screenshots. ` +
          `Pull a vision-capable model (e.g. "ollama pull llava" or "qwen2.5vl") and select it in Settings, or switch the LLM provider to Gemini for screenshot analysis.`
        );
      }
      const messages = await this._buildImageMessages(activeSkill, programmingLanguage, imageBuffer);
      const fullText = await this._chat(messages, {
        stream: true,
        temperature: this._temperature(),
        onDelta: (delta) => {
          if (typeof onDelta === 'function' && delta) onDelta(delta);
        }
      });
      const finalResponse = programmingLanguage
        ? geminiService.enforceProgrammingLanguage(fullText, programmingLanguage)
        : fullText;

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          streamed: true,
          isImageAnalysis: true,
          mimeType,
          provider: 'ollama',
          model: this.model
        }
      };
    } catch (error) {
      logger.warn('Ollama image streaming failed, falling back to non-streaming', { error: error.message });
      return this.processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory, programmingLanguage);
    }
  }

  // ── Voice / transcription ───────────────────────────────────────────

  async processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    const startTime = Date.now();
    this.requestCount++;
    try {
      const geminiRequest = geminiService.buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage);
      const messages = this._geminiRequestToMessages(geminiRequest);
      const responseText = await this._chat(messages, { stream: false, temperature: this._temperature() });
      const finalResponse = programmingLanguage
        ? geminiService.enforceProgrammingLanguage(responseText, programmingLanguage)
        : responseText;

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isTranscriptionResponse: true,
          provider: 'ollama',
          model: this.model
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Ollama transcription processing failed', { error: error.message, activeSkill });
      return geminiService.generateIntelligentFallbackResponse(text, activeSkill);
    }
  }

  async processTranscriptionWithIntelligentResponseStream(text, activeSkill, sessionMemory = [], programmingLanguage = null, onDelta = null) {
    const startTime = Date.now();
    this.requestCount++;
    try {
      const geminiRequest = geminiService.buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage);
      const messages = this._geminiRequestToMessages(geminiRequest);
      const fullText = await this._chat(messages, {
        stream: true,
        temperature: this._temperature(),
        onDelta: (delta) => {
          if (typeof onDelta === 'function' && delta) onDelta(delta);
        }
      });
      const finalResponse = programmingLanguage
        ? geminiService.enforceProgrammingLanguage(fullText, programmingLanguage)
        : fullText;

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          streamed: true,
          isTranscriptionResponse: true,
          provider: 'ollama',
          model: this.model
        }
      };
    } catch (error) {
      logger.warn('Ollama transcription streaming failed, falling back to non-streaming', { error: error.message });
      return this.processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory, programmingLanguage);
    }
  }

  // Local heuristic fallback, no network involved — delegate to the Gemini
  // service's implementation since it's provider-agnostic canned text.
  generateIntelligentFallbackResponse(text, activeSkill) {
    return geminiService.generateIntelligentFallbackResponse(text, activeSkill);
  }

  generateFallbackResponse(text, activeSkill) {
    return geminiService.generateFallbackResponse(text, activeSkill);
  }

  // ── Diagnostics ──────────────────────────────────────────────────────

  async testConnection() {
    try {
      const startTime = Date.now();
      const tags = await this._get('/api/tags');
      const latency = Date.now() - startTime;
      const models = Array.isArray(tags?.models) ? tags.models : [];
      const modelNames = models.map(m => m.name || m.model);
      const modelAvailable = modelNames.includes(this.model);

      if (!modelAvailable) {
        return {
          success: false,
          error: `Ollama is reachable, but model '${this.model}' isn't pulled yet. Run "ollama pull ${this.model}" or pick a different model in Settings.`,
          latency,
          model: this.model,
          availableModels: modelNames
        };
      }

      return {
        success: true,
        response: `Reachable. ${modelNames.length} model(s) available.`,
        latency,
        model: this.model,
        availableModels: modelNames
      };
    } catch (error) {
      return {
        success: false,
        error: `Can't reach Ollama at ${this.host}. Is it running? (${error.message})`,
        model: this.model
      };
    }
  }

  async checkNetworkConnectivity() {
    const result = await this.testConnection();
    return {
      tests: [{ name: 'Ollama server', success: result.success, error: result.error || null }]
    };
  }

  getStats() {
    return {
      isInitialized: this.isInitialized,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 0,
      config: { host: this.host, model: this.model }
    };
  }
}

module.exports = OllamaService;
