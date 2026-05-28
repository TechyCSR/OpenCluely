const http = require('http');
const https = require('https');
const logger = require('../core/logger').createServiceLogger('OLLAMA');
const config = require('../core/config');

class OllamaService {
  constructor() {
    this.isInitialized = false;
    this.requestCount = 0;
    this.errorCount = 0;
    this.initializeClient();
  }

  initializeClient() {
    // Ollama requires no API key — just mark ready and verify on first use
    this.isInitialized = true;
    logger.info('Ollama service ready', {
      baseUrl: this.getBaseUrl(),
      model: this.getModel(),
      visionModel: this.getVisionModel()
    });
  }

  getBaseUrl() {
    return process.env.OLLAMA_BASE_URL || config.get('llm.ollama.baseUrl') || 'http://localhost:11434';
  }

  getModel() {
    return process.env.OLLAMA_MODEL || config.get('llm.ollama.model') || 'llama3.2';
  }

  getVisionModel() {
    return process.env.OLLAMA_VISION_MODEL || config.get('llm.ollama.visionModel') || 'llava';
  }

  getTimeout() {
    return config.get('llm.ollama.timeout') || 120000;
  }

  // ── Public interface (matches GeminiService) ─────────────────────────────

  async processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
      throw new Error('Invalid image buffer provided to processImageWithSkill');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const { promptLoader } = require('../../prompt-loader');
      const skillPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';

      const base64 = imageBuffer.toString('base64');
      const instruction = this.formatImageInstruction(activeSkill, programmingLanguage);

      const messages = [];
      if (skillPrompt) {
        messages.push({ role: 'system', content: skillPrompt });
      }
      messages.push({
        role: 'user',
        content: instruction,
        images: [base64]
      });

      const responseText = await this.callOllama(messages, { model: this.getVisionModel() });

      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(responseText, programmingLanguage)
        : responseText;

      logger.info('Ollama image processing complete', {
        activeSkill,
        imageSize: imageBuffer.length,
        responseLength: finalResponse.length,
        processingTime: Date.now() - startTime
      });

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
          model: this.getVisionModel()
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Ollama image processing failed', { error: error.message, activeSkill });
      if (config.get('llm.ollama.fallbackEnabled')) {
        return this.generateFallbackResponse('[image]', activeSkill);
      }
      throw error;
    }
  }

  async processTextWithSkill(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    const startTime = Date.now();
    this.requestCount++;

    try {
      logger.info('Ollama: processing text', {
        activeSkill,
        textLength: text.length,
        programmingLanguage: programmingLanguage || 'not specified'
      });

      const messages = this.buildChatMessages(text, activeSkill, sessionMemory, programmingLanguage);
      const responseText = await this.callOllama(messages);

      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(responseText, programmingLanguage)
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
          model: this.getModel()
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Ollama text processing failed', { error: error.message, activeSkill });
      if (config.get('llm.ollama.fallbackEnabled')) {
        return this.generateFallbackResponse(text, activeSkill);
      }
      throw error;
    }
  }

  async processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    const cleanText = text && typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      throw new Error('Empty transcription text');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      logger.info('Ollama: processing transcription', {
        activeSkill,
        textLength: cleanText.length,
        programmingLanguage: programmingLanguage || 'not specified'
      });

      const messages = this.buildTranscriptionMessages(cleanText, activeSkill, sessionMemory, programmingLanguage);
      const responseText = await this.callOllama(messages);

      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(responseText, programmingLanguage)
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
          model: this.getModel()
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Ollama transcription processing failed', { error: error.message, activeSkill });
      if (config.get('llm.ollama.fallbackEnabled')) {
        return this.generateIntelligentFallbackResponse(cleanText, activeSkill);
      }
      throw error;
    }
  }

  async testConnection() {
    try {
      const baseUrl = this.getBaseUrl();
      const parsed = new URL(baseUrl);

      // Hit /api/tags — lightweight endpoint that lists available models
      const responseText = await this.httpGet(`${baseUrl}/api/tags`);
      const data = JSON.parse(responseText);
      const models = (data.models || []).map(m => m.name);

      logger.info('Ollama connection test successful', { baseUrl, models });
      return { success: true, baseUrl, models, provider: 'ollama' };
    } catch (error) {
      logger.error('Ollama connection test failed', { error: error.message });
      return { success: false, error: error.message, provider: 'ollama' };
    }
  }

  async checkNetworkConnectivity() {
    const baseUrl = this.getBaseUrl();
    let parsed;
    try {
      parsed = new URL(baseUrl);
    } catch {
      parsed = { hostname: 'localhost', port: 11434 };
    }

    const host = parsed.hostname || 'localhost';
    const port = parseInt(parsed.port) || 11434;

    const tests = [{ host, port, name: `Ollama server (${host}:${port})` }];
    const results = await Promise.allSettled(tests.map(t => this.testTcpConnection(t)));

    return {
      timestamp: new Date().toISOString(),
      tests: results.map((result, i) => ({
        ...tests[i],
        success: result.status === 'fulfilled' && result.value,
        error: result.status === 'rejected' ? result.reason.message : null
      }))
    };
  }

  testTcpConnection({ host, port }) {
    return new Promise((resolve, reject) => {
      const net = require('net');
      const socket = new net.Socket();

      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connection timeout to ${host}:${port}`));
      }, 5000);

      socket.on('connect', () => { clearTimeout(timeout); socket.destroy(); resolve(true); });
      socket.on('error', err => { clearTimeout(timeout); reject(new Error(`Connection failed to ${host}:${port}: ${err.message}`)); });
      socket.connect(port, host);
    });
  }

  getStats() {
    return {
      isInitialized: this.isInitialized,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 0,
      baseUrl: this.getBaseUrl(),
      model: this.getModel(),
      visionModel: this.getVisionModel(),
      provider: 'ollama'
    };
  }

  // updateApiKey is a no-op for Ollama (no API key required)
  updateApiKey(_key) {
    logger.info('Ollama does not use an API key — skipping updateApiKey');
  }

  // ── Message builders ──────────────────────────────────────────────────────

  buildChatMessages(text, activeSkill, sessionMemory, programmingLanguage) {
    const { promptLoader } = require('../../prompt-loader');
    const skillPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage);

    const messages = [];

    if (skillPrompt) {
      messages.push({ role: 'system', content: skillPrompt });
    }

    // Add conversation history from session manager
    try {
      const sessionManager = require('../managers/session.manager');
      if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
        const history = sessionManager.getConversationHistory(15);
        for (const event of history) {
          if (event.role === 'system') continue;
          if (!event.content || !event.content.trim()) continue;
          messages.push({
            role: event.role === 'model' ? 'assistant' : 'user',
            content: event.content.trim()
          });
        }
      }
    } catch (_) { /* session manager unavailable */ }

    messages.push({
      role: 'user',
      content: `Context: ${activeSkill.toUpperCase()} analysis request\n\nText to analyze:\n${text}`
    });

    return messages;
  }

  buildTranscriptionMessages(text, activeSkill, sessionMemory, programmingLanguage) {
    const systemPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage);
    const messages = [{ role: 'system', content: systemPrompt }];

    try {
      const sessionManager = require('../managers/session.manager');
      if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
        const history = sessionManager.getConversationHistory(10);
        const recent = history.filter(e => e.role !== 'system' && e.content && e.content.trim()).slice(-8);
        for (const event of recent) {
          messages.push({
            role: event.role === 'model' ? 'assistant' : 'user',
            content: event.content.trim()
          });
        }
      }
    } catch (_) { /* session manager unavailable */ }

    messages.push({ role: 'user', content: text });
    return messages;
  }

  getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage) {
    let prompt = `# Intelligent Transcription Response System

Assume you are asked a question in ${activeSkill.toUpperCase()} mode. Your job is to intelligently respond to question/message with appropriate brevity.
Assume you are in an interview and you need to perform best in ${activeSkill.toUpperCase()} mode.
Always respond to the point, do not repeat the question or unnecessary information which is not related to ${activeSkill}.`;

    if (programmingLanguage) {
      const lang = String(programmingLanguage).toLowerCase();
      const languageMap = { cpp: 'C++', c: 'C', python: 'Python', java: 'Java', javascript: 'JavaScript', js: 'JavaScript' };
      const fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      const languageTitle = languageMap[lang] || (lang.charAt(0).toUpperCase() + lang.slice(1));
      const fenceTag = fenceTagMap[lang] || lang || 'text';
      prompt += `\n\nCODING CONTEXT: Respond ONLY in ${languageTitle}. All code blocks must use triple backticks with language tag \`\`\`${fenceTag}\`\`\`. Do not include other languages unless explicitly asked.`;
    }

    prompt += `

## Response Rules:

### If the transcription is casual conversation, greetings, or NOT related to ${activeSkill}:
- Respond with: "Yeah, I'm listening. Ask your question relevant to ${activeSkill}."

### If the transcription IS relevant to ${activeSkill} or is a follow-up question:
- Provide a comprehensive, detailed response
- Use bullet points, examples, and explanations
- Focus on actionable insights and complete answers

If the user's input is a coding or DSA problem statement and contains no code, produce a complete, runnable solution in the selected programming language without asking for more details. Always include the final implementation in a properly tagged code block.

Remember: Be intelligent about filtering - only provide detailed responses when the user actually needs help with ${activeSkill}.`;

    return prompt;
  }

  formatImageInstruction(activeSkill, programmingLanguage) {
    const langNote = programmingLanguage ? ` Use only ${programmingLanguage.toUpperCase()} for any code.` : '';
    return `Analyze this image for a ${activeSkill.toUpperCase()} question. Extract the problem concisely and provide the best possible solution with explanation and final code.${langNote}`;
  }

  enforceProgrammingLanguage(text, programmingLanguage) {
    try {
      if (!text || !programmingLanguage) return text;
      const norm = String(programmingLanguage).toLowerCase();
      const fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      const fenceTag = fenceTagMap[norm] || norm || 'text';

      const replaced = text.replace(/```([^\n]*)\n/g, (match, info) => {
        const current = (info || '').trim();
        if (current.split(/\s+/)[0].toLowerCase() === fenceTag) return match;
        return '```' + fenceTag + '\n';
      });
      return replaced.replace(/~~~([^\n]*)\n/g, () => '```' + fenceTag + '\n');
    } catch (_) {
      return text;
    }
  }

  // ── HTTP helpers ──────────────────────────────────────────────────────────

  async callOllama(messages, opts = {}) {
    const baseUrl = this.getBaseUrl();
    const model = opts.model || this.getModel();
    const timeout = this.getTimeout();

    const body = {
      model,
      messages,
      stream: false,
      options: {
        temperature: config.get('llm.ollama.generation.temperature') ?? 0.7,
        num_predict: config.get('llm.ollama.generation.maxOutputTokens') ?? 4096
      }
    };

    const postData = JSON.stringify(body);
    const parsed = new URL(`${baseUrl}/api/chat`);
    const isHttps = parsed.protocol === 'https:';
    const port = parsed.port || (isHttps ? 443 : 11434);

    logger.debug('Calling Ollama', { model, messagesCount: messages.length, baseUrl });

    return new Promise((resolve, reject) => {
      const lib = isHttps ? https : http;
      const options = {
        hostname: parsed.hostname,
        port,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const timer = setTimeout(() => {
        req.destroy();
        reject(new Error(`Ollama request timed out after ${timeout}ms`));
      }, timeout);

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          clearTimeout(timer);
          try {
            if (res.statusCode !== 200) {
              reject(new Error(`Ollama HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
              return;
            }
            const parsed = JSON.parse(data);
            const content = parsed?.message?.content;
            if (typeof content !== 'string' || !content.trim()) {
              reject(new Error('Ollama returned empty content'));
              return;
            }
            resolve(content.trim());
          } catch (e) {
            reject(new Error(`Failed to parse Ollama response: ${e.message}`));
          }
        });
      });

      req.on('error', err => { clearTimeout(timer); reject(new Error(`Ollama connection error: ${err.message}`)); });
      req.write(postData);
      req.end();
    });
  }

  httpGet(url) {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      const req = lib.get(url, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
          } else {
            resolve(data);
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('Request timeout')); });
    });
  }

  // ── Fallback responses ────────────────────────────────────────────────────

  generateFallbackResponse(text, activeSkill) {
    const fallbackResponses = {
      'dsa': 'This appears to be a data structures and algorithms problem. Consider breaking it down into smaller components and identifying the appropriate algorithm or data structure to use.',
      'system-design': 'For this system design question, consider scalability, reliability, and the trade-offs between different architectural approaches.',
      'programming': 'This looks like a programming challenge. Focus on understanding the requirements, edge cases, and optimal time/space complexity.',
      'default': 'I can help analyze this content. Please ensure Ollama is running and a model is pulled (e.g., ollama pull llama3.2).'
    };

    return {
      response: fallbackResponses[activeSkill] || fallbackResponses.default,
      metadata: {
        skill: activeSkill,
        processingTime: 0,
        requestId: this.requestCount,
        usedFallback: true,
        provider: 'ollama'
      }
    };
  }

  generateIntelligentFallbackResponse(text, activeSkill) {
    const skillKeywords = {
      'dsa': ['algorithm', 'data structure', 'array', 'tree', 'graph', 'sort', 'search', 'complexity', 'big o'],
      'programming': ['code', 'function', 'variable', 'class', 'method', 'bug', 'debug', 'syntax'],
      'system-design': ['scalability', 'database', 'architecture', 'microservice', 'load balancer', 'cache']
    };

    const textLower = text.toLowerCase();
    const relevantKeywords = skillKeywords[activeSkill] || [];
    const hasRelevantKeywords = relevantKeywords.some(kw => textLower.includes(kw));
    const questionIndicators = ['how', 'what', 'why', 'when', 'where', 'can you', 'could you', '?'];
    const seemsLikeQuestion = questionIndicators.some(i => textLower.includes(i));

    const response = (hasRelevantKeywords || seemsLikeQuestion)
      ? `I'm having trouble connecting to Ollama right now. Please ensure Ollama is running and a model is available (ollama pull ${this.getModel()}).`
      : `Yeah, I'm listening. Ask your question relevant to ${activeSkill}.`;

    return {
      response,
      metadata: {
        skill: activeSkill,
        processingTime: 0,
        requestId: this.requestCount,
        usedFallback: true,
        isTranscriptionResponse: true,
        provider: 'ollama'
      }
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new OllamaService();
