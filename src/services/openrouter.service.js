/**
 * OpenRouter LLM Service
 * Drop-in replacement for llm.service.js with identical public API.
 * Uses https://openrouter.ai/api/v1/chat/completions (OpenAI-compatible).
 */
'use strict';

const https = require('https');
const logger = require('../core/logger').createServiceLogger('LLM');
const config = require('../core/config');
const { promptLoader } = require('../../prompt-loader');

const OPENROUTER_HOST = 'openrouter.ai';
const OPENROUTER_PATH = '/api/v1/chat/completions';
const HTTP_REFERER = 'https://github.com/OpenCluely/OpenCluely';
const X_TITLE = 'OpenCluely';

class OpenRouterService {
  constructor() {
    this.apiKey = null;
    this.model = null;
    this.isInitialized = false;
    this.requestCount = 0;
    this.errorCount = 0;
    this.initializeClient();
  }

  // ── Initialization ─────────────────────────────────────────────────

  initializeClient() {
    // Always reset state first so we never keep stale credentials/model.
    this.apiKey = null;
    this.model = null;
    this.isInitialized = false;

    const apiKey = config.getApiKey('OPENROUTER');
    if (!apiKey || apiKey === 'your_openrouter_key_here') {
      logger.warn('OpenRouter API key not configured', { keyExists: !!apiKey });
      return;
    }
    try {
      this.apiKey = apiKey;
      // Read model directly from process.env so settings changes apply
      // immediately when initializeClient() is called after save (no restart needed).
      const envModel = (process.env.OPENROUTER_MODEL || '').trim();
      this.model = envModel || config.get('llm.openrouter.model') || 'anthropic/claude-sonnet-4';
      this.isInitialized = true;
      logger.info('OpenRouter client initialized successfully', { model: this.model });
    } catch (error) {
      logger.error('Failed to initialize OpenRouter client', { error: error.message });
    }
  }

  // ── Public API (mirrors llm.service.js exactly) ────────────────────

  async processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory, programmingLanguage) {
    if (sessionMemory === undefined) sessionMemory = [];
    if (programmingLanguage === undefined) programmingLanguage = null;
    if (!this.isInitialized) throw new Error('OpenRouter service not initialized. Check OPENROUTER_API_KEY configuration.');
    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) throw new Error('Invalid image buffer provided to processImageWithSkill');

    const startTime = Date.now();
    this.requestCount++;
    try {
      const skillPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';
      const base64 = imageBuffer.toString('base64');
      const messages = this._buildImageMessages(base64, mimeType, activeSkill, programmingLanguage, skillPrompt);
      const responseText = await this._executeRequest(messages);
      const finalResponse = programmingLanguage ? this.enforceProgrammingLanguage(responseText, programmingLanguage) : responseText;
      logger.logPerformance('OpenRouter image processing', startTime, { activeSkill, imageSize: imageBuffer.length, responseLength: finalResponse.length, requestId: this.requestCount });
      return { response: finalResponse, metadata: { skill: activeSkill, programmingLanguage, processingTime: Date.now() - startTime, requestId: this.requestCount, usedFallback: false, isImageAnalysis: true, mimeType } };
    } catch (error) {
      this.errorCount++;
      logger.error('OpenRouter image processing failed', { error: error.message, activeSkill, requestId: this.requestCount });
      if (config.get('llm.openrouter.fallbackEnabled')) return this.generateFallbackResponse('[image]', activeSkill);
      throw error;
    }
  }

  async processImageWithSkillStream(imageBuffer, mimeType, activeSkill, sessionMemory, programmingLanguage, onDelta) {
    if (sessionMemory === undefined) sessionMemory = [];
    if (programmingLanguage === undefined) programmingLanguage = null;
    if (onDelta === undefined) onDelta = null;
    if (!this.isInitialized) throw new Error('OpenRouter service not initialized. Check OPENROUTER_API_KEY configuration.');
    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) throw new Error('Invalid image buffer provided to processImageWithSkillStream');

    const startTime = Date.now();
    this.requestCount++;
    try {
      const skillPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';
      const base64 = imageBuffer.toString('base64');
      const messages = this._buildImageMessages(base64, mimeType, activeSkill, programmingLanguage, skillPrompt);
      const fullText = await this._executeStreamingRequest(messages, function(delta) { if (typeof onDelta === 'function' && delta) onDelta(delta); });
      const finalResponse = programmingLanguage ? this.enforceProgrammingLanguage(fullText, programmingLanguage) : fullText;
      logger.logPerformance('OpenRouter image streaming', startTime, { activeSkill, imageSize: imageBuffer.length, responseLength: finalResponse.length, requestId: this.requestCount });
      return { response: finalResponse, metadata: { skill: activeSkill, programmingLanguage, processingTime: Date.now() - startTime, requestId: this.requestCount, usedFallback: false, streamed: true, isImageAnalysis: true, mimeType } };
    } catch (error) {
      logger.warn('OpenRouter streaming image failed, falling back to non-streaming', { error: error.message });
      return this.processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory, programmingLanguage);
    }
  }

  async processTextWithSkill(text, activeSkill, sessionMemory, programmingLanguage) {
    if (sessionMemory === undefined) sessionMemory = [];
    if (programmingLanguage === undefined) programmingLanguage = null;
    if (!this.isInitialized) throw new Error('OpenRouter service not initialized. Check OPENROUTER_API_KEY configuration.');

    const startTime = Date.now();
    this.requestCount++;
    try {
      logger.info('Processing text with OpenRouter', { activeSkill, textLength: text.length, requestId: this.requestCount });
      const messages = this._buildTextMessages(text, activeSkill, sessionMemory, programmingLanguage);
      const responseText = await this._executeRequest(messages);
      const finalResponse = programmingLanguage ? this.enforceProgrammingLanguage(responseText, programmingLanguage) : responseText;
      logger.logPerformance('OpenRouter text processing', startTime, { activeSkill, textLength: text.length, responseLength: finalResponse.length, requestId: this.requestCount });
      return { response: finalResponse, metadata: { skill: activeSkill, programmingLanguage, processingTime: Date.now() - startTime, requestId: this.requestCount, usedFallback: false } };
    } catch (error) {
      this.errorCount++;
      logger.error('OpenRouter text processing failed', { error: error.message, activeSkill, requestId: this.requestCount });
      if (config.get('llm.openrouter.fallbackEnabled')) return this.generateFallbackResponse(text, activeSkill);
      throw error;
    }
  }

  async processTextWithSkillStream(text, activeSkill, sessionMemory, programmingLanguage, onDelta) {
    if (sessionMemory === undefined) sessionMemory = [];
    if (programmingLanguage === undefined) programmingLanguage = null;
    if (onDelta === undefined) onDelta = null;
    if (!this.isInitialized) throw new Error('OpenRouter service not initialized. Check OPENROUTER_API_KEY configuration.');

    const startTime = Date.now();
    this.requestCount++;
    try {
      const messages = this._buildTextMessages(text, activeSkill, sessionMemory, programmingLanguage);
      const fullText = await this._executeStreamingRequest(messages, function(delta) { if (typeof onDelta === 'function' && delta) onDelta(delta); });
      const finalResponse = programmingLanguage ? this.enforceProgrammingLanguage(fullText, programmingLanguage) : fullText;
      logger.logPerformance('OpenRouter text streaming', startTime, { activeSkill, textLength: text.length, responseLength: finalResponse.length, requestId: this.requestCount });
      return { response: finalResponse, metadata: { skill: activeSkill, programmingLanguage, processingTime: Date.now() - startTime, requestId: this.requestCount, usedFallback: false, streamed: true } };
    } catch (error) {
      logger.warn('OpenRouter streaming text failed, falling back to non-streaming', { error: error.message });
      return this.processTextWithSkill(text, activeSkill, sessionMemory, programmingLanguage);
    }
  }

  async processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory, programmingLanguage) {
    if (sessionMemory === undefined) sessionMemory = [];
    if (programmingLanguage === undefined) programmingLanguage = null;
    if (!this.isInitialized) throw new Error('OpenRouter service not initialized. Check OPENROUTER_API_KEY configuration.');

    const startTime = Date.now();
    this.requestCount++;
    try {
      const cleanText = (text && typeof text === 'string') ? text.trim() : '';
      if (!cleanText) throw new Error('Empty transcription text');
      logger.info('Processing transcription with OpenRouter', { activeSkill, textLength: cleanText.length, requestId: this.requestCount });
      const messages = this._buildTranscriptionMessages(cleanText, activeSkill, sessionMemory, programmingLanguage);
      const responseText = await this._executeRequest(messages);
      const finalResponse = programmingLanguage ? this.enforceProgrammingLanguage(responseText, programmingLanguage) : responseText;
      logger.logPerformance('OpenRouter transcription processing', startTime, { activeSkill, textLength: cleanText.length, responseLength: finalResponse.length, requestId: this.requestCount });
      return { response: finalResponse, metadata: { skill: activeSkill, programmingLanguage, processingTime: Date.now() - startTime, requestId: this.requestCount, usedFallback: false, isTranscriptionResponse: true } };
    } catch (error) {
      this.errorCount++;
      logger.error('OpenRouter transcription processing failed', { error: error.message, activeSkill, requestId: this.requestCount });
      if (config.get('llm.openrouter.fallbackEnabled')) return this.generateIntelligentFallbackResponse(text, activeSkill);
      throw error;
    }
  }

  async processTranscriptionWithIntelligentResponseStream(text, activeSkill, sessionMemory, programmingLanguage, onDelta) {
    if (sessionMemory === undefined) sessionMemory = [];
    if (programmingLanguage === undefined) programmingLanguage = null;
    if (onDelta === undefined) onDelta = null;
    if (!this.isInitialized) throw new Error('OpenRouter service not initialized. Check OPENROUTER_API_KEY configuration.');

    const startTime = Date.now();
    this.requestCount++;
    try {
      const cleanText = (text && typeof text === 'string') ? text.trim() : '';
      if (!cleanText) throw new Error('Empty transcription text');
      const messages = this._buildTranscriptionMessages(cleanText, activeSkill, sessionMemory, programmingLanguage);
      const fullText = await this._executeStreamingRequest(messages, function(delta) { if (typeof onDelta === 'function' && delta) onDelta(delta); });
      const finalResponse = programmingLanguage ? this.enforceProgrammingLanguage(fullText, programmingLanguage) : fullText;
      logger.logPerformance('OpenRouter transcription streaming', startTime, { activeSkill, textLength: cleanText.length, responseLength: finalResponse.length, requestId: this.requestCount });
      return { response: finalResponse, metadata: { skill: activeSkill, programmingLanguage, processingTime: Date.now() - startTime, requestId: this.requestCount, usedFallback: false, streamed: true, isTranscriptionResponse: true } };
    } catch (error) {
      logger.warn('OpenRouter streaming transcription failed, falling back to non-streaming', { error: error.message });
      return this.processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory, programmingLanguage);
    }
  }

  // Pure-text fallback — identical logic to llm.service.js (provider-agnostic)
  generateIntelligentFallbackResponse(text, activeSkill) {
    logger.info('Generating intelligent fallback response', { activeSkill });
    const skillKeywords = {
      'dsa': ['algorithm', 'data structure', 'array', 'tree', 'graph', 'sort', 'search', 'complexity', 'big o'],
      'programming': ['code', 'function', 'variable', 'class', 'method', 'bug', 'debug', 'syntax'],
      'system-design': ['scalability', 'database', 'architecture', 'microservice', 'load balancer', 'cache'],
      'behavioral': ['interview', 'experience', 'situation', 'leadership', 'conflict', 'team'],
      'sales': ['customer', 'deal', 'negotiation', 'price', 'revenue', 'prospect'],
      'presentation': ['slide', 'audience', 'public speaking', 'presentation', 'nervous'],
      'data-science': ['data', 'model', 'machine learning', 'statistics', 'analytics', 'python', 'pandas'],
      'devops': ['deployment', 'ci/cd', 'docker', 'kubernetes', 'infrastructure', 'monitoring'],
      'negotiation': ['negotiate', 'compromise', 'agreement', 'terms', 'conflict resolution'],
      'code-explanation': ['explain', 'understand', 'how does this work', 'meaning', 'logic', 'trace'],
      'aptitude': ['math', 'puzzle', 'logic', 'reasoning', 'sequence', 'calculate', 'probability']
    };
    var textLower = (text || '').toLowerCase();
    var relevantKeywords = skillKeywords[activeSkill] || [];
    var hasRelevantKeywords = relevantKeywords.some(function(kw) { return textLower.indexOf(kw) !== -1; });
    var questionIndicators = ['how', 'what', 'why', 'when', 'where', 'can you', 'could you', 'should i', '?'];
    var seemsLikeQuestion = questionIndicators.some(function(ind) { return textLower.indexOf(ind) !== -1; });
    var response = (hasRelevantKeywords || seemsLikeQuestion)
      ? 'I\'m having trouble processing that right now, but it sounds like a ' + activeSkill + ' question. Could you rephrase or ask more specifically about what you need help with?'
      : 'Yeah, I\'m listening. Ask your question relevant to ' + activeSkill + '.';
    return { response: response, metadata: { skill: activeSkill, processingTime: 0, requestId: this.requestCount, usedFallback: true, isTranscriptionResponse: true } };
  }

  async testConnection() {
    if (!this.isInitialized) return { success: false, error: 'Service not initialized. Check OPENROUTER_API_KEY.' };
    try {
      var networkCheck = await this.checkNetworkConnectivity();
      var hasNetworkIssues = networkCheck.tests.some(function(t) { return !t.success; });
      if (hasNetworkIssues) logger.warn('Network issues before OpenRouter test', networkCheck);
      var startTime = Date.now();
      var messages = [{ role: 'user', content: 'Test connection. Please respond with "OK".' }];
      var responseText = await this._rawRequest(messages, { max_tokens: 16 });
      var latency = Date.now() - startTime;
      logger.info('OpenRouter connection test successful', { response: responseText, latency: latency, model: this.model });
      return { success: true, response: responseText, latency: latency, model: this.model, networkConnectivity: networkCheck };
    } catch (error) {
      var errorAnalysis = this.analyzeError(error);
      logger.error('OpenRouter connection test failed', { error: error.message, errorAnalysis: errorAnalysis });
      var friendlyError = this._friendlyTestError(error, errorAnalysis);
      return { success: false, error: friendlyError, errorType: (errorAnalysis && errorAnalysis.type) || 'UNKNOWN', errorAnalysis: errorAnalysis, networkConnectivity: await this.checkNetworkConnectivity().catch(function() { return null; }) };
    }
  }

  async checkNetworkConnectivity() {
    var connectivityTests = [
      { host: 'google.com', port: 443, name: 'Google (HTTPS)' },
      { host: 'openrouter.ai', port: 443, name: 'OpenRouter API Endpoint' }
    ];
    var self = this;
    var results = await Promise.allSettled(connectivityTests.map(function(test) { return self.testNetworkConnection(test); }));
    var connectivity = {
      timestamp: new Date().toISOString(),
      tests: results.map(function(result, index) {
        return Object.assign({}, connectivityTests[index], {
          success: result.status === 'fulfilled' && result.value,
          error: result.status === 'rejected' ? result.reason.message : null
        });
      })
    };
    logger.info('Network connectivity check completed', connectivity);
    return connectivity;
  }

  testNetworkConnection(opts) {
    var host = opts.host, port = opts.port;
    return new Promise(function(resolve, reject) {
      var net = require('net');
      var socket = new net.Socket();
      var timeout = setTimeout(function() { socket.destroy(); reject(new Error('Connection timeout to ' + host + ':' + port)); }, 5000);
      socket.on('connect', function() { clearTimeout(timeout); socket.destroy(); resolve(true); });
      socket.on('error', function(err) { clearTimeout(timeout); reject(new Error('Connection failed to ' + host + ':' + port + ': ' + err.message)); });
      socket.connect(port, host);
    });
  }

  updateApiKey(newApiKey) {
    process.env.OPENROUTER_API_KEY = newApiKey;
    this.isInitialized = false;
    this.initializeClient();
    logger.info('OpenRouter API key updated and client reinitialized');
  }

  getStats() {
    return { isInitialized: this.isInitialized, requestCount: this.requestCount, errorCount: this.errorCount, successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 0, config: config.get('llm.openrouter') };
  }

  // ── Message builders ────────────────────────────────────────────────

  _buildImageMessages(base64, mimeType, activeSkill, programmingLanguage, skillPrompt) {
    var messages = [];
    if (skillPrompt && skillPrompt.trim().length > 0) messages.push({ role: 'system', content: skillPrompt });
    var langNote = programmingLanguage ? ' Use only ' + programmingLanguage.toUpperCase() + ' for any code.' : '';
    var textInstruction = 'Analyze this image for a ' + activeSkill.toUpperCase() + ' question. Extract the problem concisely and provide the best possible solution with explanation and final code.' + langNote;
    messages.push({ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:' + mimeType + ';base64,' + base64 } }, { type: 'text', text: textInstruction }] });
    return messages;
  }

  _buildTextMessages(text, activeSkill, sessionMemory, programmingLanguage) {
    var messages = [];
    try {
      var sessionManager = require('../managers/session.manager');
      if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
        var skillContext = sessionManager.getSkillContext(activeSkill, programmingLanguage);
        if (skillContext && skillContext.skillPrompt) messages.push({ role: 'system', content: skillContext.skillPrompt });
        var history = sessionManager.getConversationHistory(15);
        for (var i = 0; i < history.length; i++) {
          var event = history[i];
          if (event.role === 'system' || !event.content || !event.content.trim()) continue;
          messages.push({ role: event.role === 'model' ? 'assistant' : 'user', content: event.content.trim() });
        }
      } else {
        var components = promptLoader.getRequestComponents(activeSkill, text, sessionMemory, programmingLanguage);
        if (components.skillPrompt) messages.push({ role: 'system', content: components.skillPrompt });
      }
    } catch (e) { /* session manager unavailable */ }
    messages.push({ role: 'user', content: 'Context: ' + activeSkill.toUpperCase() + ' analysis request\n\nText to analyze:\n' + text });
    return messages;
  }

  _buildTranscriptionMessages(text, activeSkill, sessionMemory, programmingLanguage) {
    var messages = [];
    messages.push({ role: 'system', content: this._getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage) });
    try {
      var sessionManager = require('../managers/session.manager');
      if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
        var history = sessionManager.getConversationHistory(10);
        var recent = history.filter(function(e) { return e.role !== 'system' && e.content && e.content.trim(); }).slice(-8);
        for (var i = 0; i < recent.length; i++) {
          var event = recent[i];
          messages.push({ role: event.role === 'model' ? 'assistant' : 'user', content: event.content.trim() });
        }
      }
    } catch (e) { /* no history */ }
    messages.push({ role: 'user', content: text });
    return messages;
  }

  _getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage) {
    var prompt = '# Intelligent Transcription Response System\n\nAssume you are asked a question in ' + activeSkill.toUpperCase() + ' mode. Your job is to intelligently respond to question/message with appropriate brevity.\nAssume you are in an interview and you need to perform best in ' + activeSkill.toUpperCase() + ' mode.\nAlways respond to the point, do not repeat the question or unnecessary information which is not related to ' + activeSkill + '.';

    if (programmingLanguage) {
      var lang = String(programmingLanguage).toLowerCase();
      var languageMap = { cpp: 'C++', c: 'C', python: 'Python', java: 'Java', javascript: 'JavaScript', js: 'JavaScript' };
      var fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      var languageTitle = languageMap[lang] || (lang.charAt(0).toUpperCase() + lang.slice(1));
      var fenceTag = fenceTagMap[lang] || lang || 'text';
      prompt += '\n\nCODING CONTEXT: Respond ONLY in ' + languageTitle + '. All code blocks must use triple backticks with language tag ```' + fenceTag + '```. Do not include other languages unless explicitly asked.';
    }

    prompt += '\n\n## Response Rules:\n\n### If the transcription is casual conversation, greetings, or NOT related to ' + activeSkill + ':\n- Respond with: "Yeah, I\'m listening. Ask your question relevant to ' + activeSkill + '."\n- Or similar brief acknowledgments.\n\n### If the transcription IS relevant to ' + activeSkill + ' or is a follow-up question:\n- Provide a comprehensive, detailed response\n- Use bullet points, examples, and explanations\n- Focus on actionable insights and complete answers\n- Do not truncate or shorten your response\n\n## Response Format:\n- Keep responses detailed\n- Use bullet points for structured answers\n- Be encouraging and helpful\n- Stay focused on ' + activeSkill + '\n\nIf the user\'s input is a coding or DSA problem statement and contains no code, produce a complete, runnable solution in the selected programming language without asking for more details. Always include the final implementation in a properly tagged code block.\n\nRemember: Be intelligent about filtering - only provide detailed responses when the user actually needs help with ' + activeSkill + '.';

    return prompt;
  }

  // ── HTTP execution ──────────────────────────────────────────────────

  async _executeRequest(messages) {
    var maxRetries = config.get('llm.openrouter.maxRetries') || 3;
    var lastError = null;
    for (var attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug('OpenRouter request attempt ' + attempt, { model: this.model });
        var text = await this._rawRequest(messages, { stream: false });
        logger.debug('OpenRouter request successful', { attempt: attempt, responseLength: text.length });
        return text;
      } catch (error) {
        var info = this.analyzeError(error);
        lastError = error;
        logger.warn('OpenRouter attempt ' + attempt + ' failed', { error: error.message, errorType: info.type });
        if (attempt === maxRetries) break;
        if (info.type === 'AUTH_ERROR' || info.type === 'CREDITS_ERROR') break;
        var delay = (info.isNetworkError ? 2500 : 1500) * attempt + Math.random() * 1000;
        await this._delay(delay);
      }
    }
    throw lastError || new Error('OpenRouter request failed after all retries');
  }

  _executeStreamingRequest(messages, onDelta) {
    var timeout = config.get('llm.openrouter.timeout') || 60000;
    var genConfig = config.get('llm.openrouter.generation') || {};
    var apiKey = this.apiKey;
    var model = this.model;
    var bodyObj = {
      model: model,
      messages: messages,
      stream: true,
      temperature: genConfig.temperature != null ? genConfig.temperature : 0.7,
      max_tokens: genConfig.max_tokens || 3000
    };
    var body = JSON.stringify(bodyObj);
    var options = {
      hostname: OPENROUTER_HOST, path: OPENROUTER_PATH, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'HTTP-Referer': HTTP_REFERER,
        'X-Title': X_TITLE,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    return new Promise(function(resolve, reject) {
      var req = https.request(options, function(res) {
        if (res.statusCode !== 200) {
          var errBody = '';
          res.on('data', function(c) { errBody += c; });
          res.on('end', function() { clearTimeout(timer); reject(new Error('HTTP ' + res.statusCode + ': ' + errBody)); });
          return;
        }
        var fullText = '', buffer = '';
        res.setEncoding('utf8');
        res.on('data', function(chunk) {
          buffer += chunk;
          var idx;
          while ((idx = buffer.indexOf('\n')) !== -1) {
            var line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (line.indexOf('data:') !== 0) continue;
            var payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              var json = JSON.parse(payload);
              var delta = json && json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
              if (delta) { fullText += delta; if (typeof onDelta === 'function') onDelta(delta); }
            } catch (e) { /* partial JSON */ }
          }
        });
        res.on('end', function() { clearTimeout(timer); resolve(fullText.trim()); });
        res.on('error', function(err) { clearTimeout(timer); reject(new Error('Streaming response error: ' + err.message)); });
      });
      var timer = setTimeout(function() { req.destroy(); reject(new Error('OpenRouter streaming request timed out')); }, timeout);
      req.on('error', function(err) { clearTimeout(timer); reject(new Error('Streaming request failed: ' + err.message)); });
      req.on('close', function() { clearTimeout(timer); });
      req.write(body);
      req.end();
    });
  }

  _rawRequest(messages, extraParams) {
    if (!extraParams) extraParams = {};
    var timeout = config.get('llm.openrouter.timeout') || 60000;
    var genConfig = config.get('llm.openrouter.generation') || {};
    var apiKey = this.apiKey;
    var model = this.model;
    var bodyObj = {
      model: model,
      messages: messages,
      stream: false,
      temperature: genConfig.temperature != null ? genConfig.temperature : 0.7,
      max_tokens: extraParams.max_tokens || genConfig.max_tokens || 3000
    };
    var body = JSON.stringify(bodyObj);
    var options = {
      hostname: OPENROUTER_HOST, path: OPENROUTER_PATH, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'HTTP-Referer': HTTP_REFERER,
        'X-Title': X_TITLE,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    return new Promise(function(resolve, reject) {
      var req = https.request(options, function(res) {
        var data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
          clearTimeout(timer);
          try {
            if (res.statusCode !== 200) {
              var errMsg = 'HTTP ' + res.statusCode;
              try {
                var p = JSON.parse(data);
                errMsg = (p.error && p.error.message) ? 'HTTP ' + res.statusCode + ': ' + p.error.message : 'HTTP ' + res.statusCode + ': ' + data;
              } catch (e2) { errMsg = 'HTTP ' + res.statusCode + ': ' + data.substring(0, 300); }
              reject(new Error(errMsg)); return;
            }
            var parsed = JSON.parse(data);
            var content = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
            if (typeof content !== 'string' || content.trim().length === 0) { reject(new Error('Empty or missing content in OpenRouter response')); return; }
            resolve(content.trim());
          } catch (e) { reject(new Error('Failed to parse OpenRouter response: ' + e.message)); }
        });
        res.on('error', function(err) { clearTimeout(timer); reject(new Error('Response error: ' + err.message)); });
      });
      var timer = setTimeout(function() { req.destroy(); reject(new Error('OpenRouter request timed out')); }, timeout);
      req.on('error', function(err) { clearTimeout(timer); reject(new Error('Request failed: ' + err.message)); });
      req.on('close', function() { clearTimeout(timer); });
      req.write(body);
      req.end();
    });
  }

  // ── Utilities ────────────────────────────────────────────────────────

  enforceProgrammingLanguage(text, programmingLanguage) {
    try {
      if (!text || !programmingLanguage) return text;
      var norm = String(programmingLanguage).toLowerCase();
      var fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      var fenceTag = fenceTagMap[norm] || norm || 'text';
      var replacedBackticks = text.replace(/```([^\n]*)\n/g, function(match, info) {
        var current = (info || '').trim();
        if (current.split(/\s+/)[0].toLowerCase() === fenceTag) return match;
        return '```' + fenceTag + '\n';
      });
      return replacedBackticks.replace(/~~~([^\n]*)\n/g, function() { return '```' + fenceTag + '\n'; });
    } catch (e) { return text; }
  }

  generateFallbackResponse(text, activeSkill) {
    logger.info('Generating fallback response', { activeSkill: activeSkill });
    var fallbackResponses = {
      'dsa': 'This appears to be a data structures and algorithms problem. Consider breaking it down into smaller components and identifying the appropriate algorithm or data structure to use.',
      'system-design': 'For this system design question, consider scalability, reliability, and the trade-offs between different architectural approaches.',
      'programming': 'This looks like a programming challenge. Focus on understanding the requirements, edge cases, and optimal time/space complexity.',
      'code-explanation': 'This looks like code that needs explaining. Consider breaking down the syntax, logic, and overall functionality.',
      'aptitude': 'This appears to be an aptitude or reasoning question. Focus on logical steps to arrive at the solution.',
      'default': 'I can help analyze this content. Please ensure your OpenRouter API key is properly configured for detailed analysis.'
    };
    var response = fallbackResponses[activeSkill] || fallbackResponses.default;
    return { response: response, metadata: { skill: activeSkill, processingTime: 0, requestId: this.requestCount, usedFallback: true } };
  }

  analyzeError(error) {
    var msg = (error.message || '').toLowerCase();
    if (msg.indexOf('enotfound') !== -1 || msg.indexOf('econnrefused') !== -1 || msg.indexOf('network error') !== -1) return { type: 'NETWORK_ERROR', isNetworkError: true, suggestedAction: 'Check internet connection' };
    if (msg.indexOf('401') !== -1 || msg.indexOf('unauthorized') !== -1 || msg.indexOf('invalid api key') !== -1) return { type: 'AUTH_ERROR', isNetworkError: false, suggestedAction: 'Verify OpenRouter API key' };
    if (msg.indexOf('402') !== -1 || msg.indexOf('insufficient credits') !== -1 || msg.indexOf('payment') !== -1) return { type: 'CREDITS_ERROR', isNetworkError: false, suggestedAction: 'Add credits to your OpenRouter account' };
    if (msg.indexOf('429') !== -1 || msg.indexOf('rate limit') !== -1 || msg.indexOf('too many requests') !== -1) return { type: 'RATE_LIMIT_ERROR', isNetworkError: false, suggestedAction: 'Wait before retrying' };
    if (msg.indexOf('timeout') !== -1 || msg.indexOf('etimedout') !== -1) return { type: 'TIMEOUT_ERROR', isNetworkError: true, suggestedAction: 'Check network latency' };
    if (msg.indexOf('503') !== -1 || msg.indexOf('unavailable') !== -1 || msg.indexOf('overloaded') !== -1) return { type: 'RATE_LIMIT_ERROR', isNetworkError: false, suggestedAction: 'OpenRouter is experiencing high load, please retry' };
    return { type: 'UNKNOWN_ERROR', isNetworkError: false, suggestedAction: 'Check logs for more details' };
  }

  _friendlyTestError(error, analysis) {
    var type = analysis && analysis.type;
    var raw = ((error && error.message) || '').toLowerCase();
    if (type === 'NETWORK_ERROR' || raw.indexOf('enotfound') !== -1) return 'Cannot reach OpenRouter servers. Check your internet connection, firewall, or VPN settings.';
    if (type === 'AUTH_ERROR' || raw.indexOf('401') !== -1) return 'Invalid API key. Double-check your OpenRouter key at openrouter.ai/keys.';
    if (type === 'CREDITS_ERROR' || raw.indexOf('402') !== -1) return 'Insufficient credits. Add credits to your OpenRouter account at openrouter.ai/credits.';
    if (type === 'RATE_LIMIT_ERROR' || raw.indexOf('429') !== -1) return 'Rate limit exceeded. Wait a moment or check your OpenRouter usage limits.';
    if (type === 'TIMEOUT_ERROR') return 'Request timed out. The OpenRouter API may be slow or unreachable right now.';
    if (raw.indexOf('503') !== -1 || raw.indexOf('overloaded') !== -1) return 'OpenRouter is experiencing high demand. Please wait a moment and try again.';
    return (error && error.message) || 'Connection to OpenRouter failed.';
  }

  _delay(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); }
}

module.exports = new OpenRouterService();
