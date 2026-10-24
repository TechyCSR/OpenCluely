const EventEmitter = require('events');
const { GoogleGenAI } = require('@google/genai');
const logger = require('../core/logger').createServiceLogger('LLM');
const config = require('../core/config');
const { promptLoader } = require('../../prompt-loader');

class LLMService extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.model = null;
    this.isInitialized = false;
    this.isMcqMode = false;
    this.requestCount = 0;
    this.errorCount = 0;
    
    // Dynamic Health & Diagnostic tracking
    this.keyHealth = {}; // keyIndex -> { consecutiveErrors, lastError, lastSuccess, latencyMs, ttftMs, successfulModel, isHealthy }
    this.preferredKeyIndex = 0;
    this.diagnosticEvents = []; // rolling 50 items
    this.lastLatency = null;
    this.lastTtft = null;
    
    this.initializeClient();
  }

  /**
   * Set MCQ-only mode
   * @param {boolean} enabled
   */
  setMcqMode(enabled) {
    this.isMcqMode = Boolean(enabled);
    logger.info('LLMService MCQ mode updated', { isMcqMode: this.isMcqMode });
  }

  /**
   * Get current MCQ-only mode status
   * @returns {boolean}
   */
  getMcqMode() {
    return this.isMcqMode;
  }

  initializeClient() {
    const apiKeys = config.getApiKeys('GEMINI');
    const primaryKey = apiKeys[0];
    const secondaryKey = apiKeys[1];
    
    if (!primaryKey || primaryKey === 'your-api-key-here' || primaryKey === 'your_gemini_api_key_here') {
      logger.warn('Gemini API key not configured', { 
        keyExists: !!primaryKey,
        isPlaceholder: primaryKey === 'your-api-key-here'
      });
      return;
    }

    try {
      this.client = new GoogleGenAI({ apiKey: primaryKey });
      if (secondaryKey) {
        this.secondaryClient = new GoogleGenAI({ apiKey: secondaryKey });
        logger.info('Gemini secondary failover AI client initialized');
      } else {
        this.secondaryClient = null;
      }
      
      // Use the configured model name (default: gemini-3.5-flash)
      this.model = config.get('llm.gemini.model');
      this.isInitialized = true;
      
      logger.info('Gemini AI client initialized successfully', {
        model: this.model,
        hasSecondaryBackup: !!this.secondaryClient
      });
    } catch (error) {
      logger.error('Failed to initialize Gemini client', { 
        error: error.message 
      });
    }
  }

  /**
   * Warm up LLM connection, HTTPS keep-alive socket, and verify API keys
   * as soon as the mic is enabled. Eliminates cold-start TLS handshake latency.
   */
  async warmup() {
    if (!this.isInitialized) {
      this.initializeClient();
    }
    const apiKeys = config.getApiKeys('GEMINI');
    if (!apiKeys || apiKeys.length === 0) {
      return { ok: false, reason: 'No Gemini API keys configured' };
    }
    const model = config.get('llm.gemini.model') || this.model || 'gemini-3.5-flash-lite';
    const primaryKey = apiKeys[this.preferredKeyIndex] || apiKeys[0];

    this.emitDebugStatus({
      phase: 'ready',
      keyIndex: this.preferredKeyIndex + 1,
      model,
      status: 'Priming LLM connection & sockets...'
    });

    try {
      const https = require('https');
      const req = https.request({
        hostname: 'generativelanguage.googleapis.com',
        port: 443,
        path: `/v1beta/models?pageSize=1&key=${primaryKey}`,
        method: 'GET',
        headers: {
          'Connection': 'keep-alive',
          'User-Agent': 'Cluely-Prewarm/1.0'
        },
        timeout: 3000
      }, (res) => {
        res.resume();
        logger.info('LLM API connection primed & warmed up', {
          statusCode: res.statusCode,
          model,
          keyIndex: this.preferredKeyIndex + 1
        });
        this.emitDebugStatus({
          phase: 'ready',
          keyIndex: this.preferredKeyIndex + 1,
          model,
          status: 'LLM APIs primed & ready'
        });
      });
      req.on('error', (err) => {
        logger.debug('LLM warmup ping notice (non-fatal)', { error: err.message });
      });
      req.on('timeout', () => req.destroy());
      req.end();
      return { ok: true, model };
    } catch (err) {
      logger.debug('LLM warmup error (non-fatal)', { error: err.message });
      return { ok: false, error: err.message };
    }
  }

  /**
   * Emit real-time debug telemetry to all listeners (and store rolling history)
   * @param {Object} data 
   */
  emitDebugStatus(data) {
    const event = {
      ...data,
      timestamp: Date.now()
    };
    this.diagnosticEvents.unshift(event);
    if (this.diagnosticEvents.length > 50) {
      this.diagnosticEvents.pop();
    }
    this.emit('debug-status', event);
  }

  /**
   * Return key indices ordered by recent health and success
   * @param {number} totalKeys 
   * @returns {number[]}
   */
  getOrderedKeyIndices(totalKeys) {
    if (totalKeys <= 1) return [0];
    const now = Date.now();
    const indices = [];
    for (let i = 0; i < totalKeys; i++) {
      const kh = this.keyHealth[i];
      const isRateLimited = kh && kh.rateLimitedUntil && kh.rateLimitedUntil > now;
      indices.push({ index: i, isRateLimited: !!isRateLimited, isPref: i === this.preferredKeyIndex });
    }
    indices.sort((a, b) => {
      if (a.isRateLimited !== b.isRateLimited) return a.isRateLimited ? 1 : -1;
      if (a.isPref !== b.isPref) return a.isPref ? -1 : 1;
      return a.index - b.index;
    });
    return indices.map(item => item.index);
  }

  /**
   * Mark a key and model as currently healthy and successful
   */
  markKeySuccess(keyIndex, modelName, latencyMs, ttftMs) {
    this.keyHealth[keyIndex] = {
      consecutiveErrors: 0,
      lastSuccess: Date.now(),
      lastError: null,
      successfulModel: modelName,
      latencyMs: latencyMs || null,
      ttftMs: ttftMs || null,
      isHealthy: true,
      rateLimitedUntil: null
    };
    this.preferredKeyIndex = keyIndex;
    if (latencyMs) this.lastLatency = latencyMs;
    if (ttftMs) this.lastTtft = ttftMs;
  }

  /**
   * Record error on a key and model, and rotate preferred key if needed
   */
  markKeyError(keyIndex, modelName, errorMessage, totalKeys) {
    const kh = this.keyHealth[keyIndex] || { consecutiveErrors: 0 };
    kh.consecutiveErrors = (kh.consecutiveErrors || 0) + 1;
    kh.lastError = errorMessage;
    kh.lastErrorTime = Date.now();
    kh.isHealthy = false;

    const isQuotaOrRateLimit = errorMessage && (
      errorMessage.includes('429') ||
      errorMessage.includes('RESOURCE_EXHAUSTED') ||
      errorMessage.includes('quota') ||
      errorMessage.includes('rate limit')
    );
    if (isQuotaOrRateLimit) {
      kh.rateLimitedUntil = Date.now() + 180000; // 3 min backoff
    }

    this.keyHealth[keyIndex] = kh;

    if (totalKeys && totalKeys > 1 && this.preferredKeyIndex === keyIndex) {
      this.preferredKeyIndex = (keyIndex + 1) % totalKeys;
    }
  }

  /**
   * Get complete dynamic diagnostic snapshot of LLM engine
   */
  getDiagnostics() {
    const apiKeys = config.getApiKeys('GEMINI');
    const primaryModel = config.get('llm.gemini.model') || this.model;
    const fallbackModels = config.get('llm.gemini.fallbackModels') || [];

    const keysStatus = apiKeys.map((k, idx) => {
      const h = this.keyHealth[idx] || {};
      return {
        keyIndex: idx + 1,
        prefix: k ? `${k.substring(0, 6)}...${k.substring(k.length - 4)}` : 'missing',
        isPreferred: idx === this.preferredKeyIndex,
        isHealthy: h.isHealthy !== false,
        consecutiveErrors: h.consecutiveErrors || 0,
        lastError: h.lastError || null,
        lastSuccess: h.lastSuccess || null,
        latencyMs: h.latencyMs || null,
        ttftMs: h.ttftMs || null,
        successfulModel: h.successfulModel || null
      };
    });

    return {
      activeModel: primaryModel,
      fallbackModels,
      preferredKeyIndex: this.preferredKeyIndex + 1,
      keys: keysStatus,
      lastLatency: this.lastLatency,
      lastTtft: this.lastTtft,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      recentEvents: this.diagnosticEvents.slice(0, 20)
    };
  }

  /**
   * Run an active live probe across all configured keys and models
   */
  async runLiveDiagnosticsProbe() {
    const https = require('https');
    const apiKeys = config.getApiKeys('GEMINI');
    const primaryModel = config.get('llm.gemini.model') || 'gemini-3.5-flash-lite';
    const fallbackModels = config.get('llm.gemini.fallbackModels') || [];
    const modelsToTest = [primaryModel, ...fallbackModels.filter(m => m !== primaryModel)];

    const results = [];
    const probeStartTime = Date.now();

    for (let kIdx = 0; kIdx < apiKeys.length; kIdx++) {
      const key = apiKeys[kIdx];
      for (const model of modelsToTest) {
        const t0 = Date.now();
        const probeResult = await new Promise((resolve) => {
          const postData = JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Ping' }] }],
            generationConfig: { maxOutputTokens: 5 }
          });
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
          const req = https.request(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': key,
              'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 4000
          }, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
              const latency = Date.now() - t0;
              resolve({
                keyIndex: kIdx + 1,
                model,
                status: res.statusCode,
                latencyMs: latency,
                ok: res.statusCode === 200,
                error: res.statusCode === 200 ? null : `HTTP ${res.statusCode}`
              });
            });
          });
          req.on('error', (err) => resolve({
            keyIndex: kIdx + 1,
            model,
            status: null,
            latencyMs: Date.now() - t0,
            ok: false,
            error: err.message
          }));
          req.on('timeout', () => {
            req.destroy();
            resolve({
              keyIndex: kIdx + 1,
              model,
              status: null,
              latencyMs: Date.now() - t0,
              ok: false,
              error: 'TIMEOUT (4s)'
            });
          });
          req.write(postData);
          req.end();
        });
        results.push(probeResult);
      }
    }

    return {
      timestamp: Date.now(),
      totalProbeDurationMs: Date.now() - probeStartTime,
      matrix: results,
      preferredKeyIndex: this.preferredKeyIndex + 1,
      recommendation: results.find(r => r.ok && r.latencyMs < 2500) 
        ? `Fastest responsive model: ${results.find(r => r.ok && r.latencyMs < 2500).model} on Key #${results.find(r => r.ok && r.latencyMs < 2500).keyIndex} (${results.find(r => r.ok && r.latencyMs < 2500).latencyMs}ms)`
        : 'All tested models are experiencing latency or rate limits.'
    };
  }

  getGenerationConfig(overrides = {}) {
    const defaults = config.get('llm.gemini.generation') || {};
    const fallback = {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 4096
    };

    const merged = { ...fallback, ...defaults, ...overrides };
    return Object.fromEntries(
      Object.entries(merged).filter(([, value]) => value !== undefined && value !== null)
    );
  }

  applyGenerationDefaults(request, overrides = {}) {
    request.generationConfig = this.getGenerationConfig({ ...(request.generationConfig || {}), ...overrides });
    return request;
  }

  extractTextFromCandidates(response) {
    // New @google/genai SDK exposes response.text as a convenience getter.
    if (response && typeof response.text === 'string' && response.text.trim().length > 0) {
      return {
        text: response.text.trim(),
        candidate: response.candidates?.[0] || null,
        finishReason: response.candidates?.[0]?.finishReason || null
      };
    }

    const candidates = Array.isArray(response?.candidates)
      ? response.candidates
      : Array.isArray(response)
        ? response
        : [];

    if (!candidates.length) {
      throw new Error('No candidates in Gemini response');
    }

    const candidateWithText = candidates.find(candidate => {
      const parts = candidate?.content?.parts;
      return Array.isArray(parts) && parts.some(part => typeof part.text === 'string' && part.text.trim().length > 0);
    });

    if (!candidateWithText) {
      const finishReasons = candidates.map(c => c.finishReason || 'unknown').join(', ');
      throw new Error(`No text parts in candidates. Finish reasons: ${finishReasons}`);
    }

    const textParts = candidateWithText.content.parts
      .filter(part => typeof part.text === 'string' && part.text.trim().length > 0)
      .map(part => part.text.trim());

    if (!textParts.length) {
      throw new Error(`Candidate parts missing text after filtering: ${JSON.stringify(candidateWithText)}`);
    }

    const text = textParts.join('\n');

    return {
      text,
      candidate: candidateWithText,
      finishReason: candidateWithText.finishReason || null
    };
  }

  /**
   * Process an image directly with Gemini using the active skill prompt.
   * The image buffer is sent as inlineData alongside a concise instruction.
   * For image-based queries, we include the skill prompt (e.g., DSA) as systemInstruction.
   * @param {Buffer} imageBuffer - PNG/JPEG image bytes
   * @param {string} mimeType - e.g., 'image/png' or 'image/jpeg'
   * @param {string} activeSkill - current skill (e.g. 'dsa')
   * @param {Array} sessionMemory - optional (not required for image)
   * @param {string|null} programmingLanguage - optional language context for skills that need it
   * @returns {Promise<{response: string, metadata: object}>}
   */
  async processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    }

    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
      throw new Error('Invalid image buffer provided to processImageWithSkill');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      // Build system instruction using the skill prompt (for snapshot/image analysis, default to dsa skill if interview or unspecified)
      const effectiveSkill = (activeSkill === 'interview' || !activeSkill) ? 'dsa' : activeSkill;
      const { promptLoader } = require('../../prompt-loader');
      let skillPrompt = promptLoader.getSkillPrompt(effectiveSkill, programmingLanguage, this.isMcqMode) || '';

      // Build request with text + image parts
      const base64 = imageBuffer.toString('base64');

      const request = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: this.formatImageInstruction(activeSkill, programmingLanguage) },
              { inlineData: { data: base64, mimeType } }
            ]
          }
        ]
      };

      this.applyGenerationDefaults(request);

      if (skillPrompt && skillPrompt.trim().length > 0) {
        request.systemInstruction = { parts: [{ text: skillPrompt }] };
      }

      // Execute with retries/timeout - try alternative method first for network reliability
      let responseText;
      const preferAlternative = !!config.get('llm.gemini.enableFallbackMethod');
      try {
        if (preferAlternative) {
          logger.debug('Attempting alternative HTTPS method first for reliability');
          responseText = await this.executeAlternativeRequest(request);
        } else {
          responseText = await this.executeRequest(request);
        }
      } catch (error) {
        const secondaryLabel = preferAlternative ? 'primary SDK method' : 'alternative HTTPS method';
        logger.warn(`${preferAlternative ? 'Alternative' : 'Primary'} method failed, trying ${secondaryLabel}`, { error: error.message });
        const secondaryFn = preferAlternative ? this.executeRequest.bind(this) : this.executeAlternativeRequest.bind(this);

        try {
          responseText = await secondaryFn(request);
        } catch (secondaryError) {
          logger.error('Both Gemini request methods failed', {
            firstError: error.message,
            secondError: secondaryError.message
          });
          throw secondaryError;
        }
      }

      // Enforce language in code fences if provided
      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(responseText, programmingLanguage)
        : responseText;

      logger.logPerformance('LLM image processing', startTime, {
        activeSkill,
        imageSize: imageBuffer.length,
        responseLength: finalResponse.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
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
          mimeType
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM image processing failed', {
        error: error.message,
        activeSkill,
        requestId: this.requestCount
      });

      if (config.get('llm.gemini.fallbackEnabled')) {
        return this.generateFallbackResponse('[image]', activeSkill);
      }
      throw error;
    }
  }

  /**
   * Process an image with a raw custom prompt — used by Rubic MCQ mode.
   * No skill context, no session memory. Just image + prompt → text answer.
   * @param {Buffer} imageBuffer
   * @param {string} mimeType
   * @param {string} prompt - The custom instruction text
   * @returns {Promise<{response: string, metadata: object}>}
   */
  async processImageDirect(imageBuffer, mimeType, prompt) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    }
    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
      throw new Error('Invalid image buffer provided to processImageDirect');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const base64 = imageBuffer.toString('base64');

      const request = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { data: base64, mimeType } }
            ]
          }
        ]
      };

      this.applyGenerationDefaults(request, {
        temperature: 0.1, // Very low temp for deterministic answer extraction
        maxOutputTokens: 64, // We only need a letter or two
      });

      let responseText;
      try {
        // Try native HTTPS request first for instantaneous response without undici socket issues
        responseText = await this.executeAlternativeRequest(request);
      } catch (error) {
        logger.warn('Alternative method failed for processImageDirect, trying primary', { error: error.message });
        responseText = await this.executeRequest(request);
      }

      return {
        response: responseText,
        metadata: {
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          isRubicMCQ: true,
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('processImageDirect failed', { error: error.message });
      throw error;
    }
  }

  async processImageWithSkillStream(imageBuffer, mimeType, activeSkill, sessionMemory = [], programmingLanguage = null, onDelta = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    }

    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
      throw new Error('Invalid image buffer provided to processImageWithSkillStream');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      // For snapshot/image analysis, default to dsa skill if interview or unspecified
      const effectiveSkill = (activeSkill === 'interview' || !activeSkill) ? 'dsa' : activeSkill;
      const { promptLoader } = require('../../prompt-loader');
      let skillPrompt = promptLoader.getSkillPrompt(effectiveSkill, programmingLanguage, this.isMcqMode) || '';
      const base64 = imageBuffer.toString('base64');

      const geminiRequest = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: this.formatImageInstruction(activeSkill, programmingLanguage) },
              { inlineData: { data: base64, mimeType } }
            ]
          }
        ]
      };
      this.applyGenerationDefaults(geminiRequest);
      if (skillPrompt && skillPrompt.trim().length > 0) {
        geminiRequest.systemInstruction = { parts: [{ text: skillPrompt }] };
      }

      const fullText = await this.executeStreamingRequest(geminiRequest, (delta) => {
        if (typeof onDelta === 'function' && delta) {
          onDelta(delta);
        }
      });

      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(fullText, programmingLanguage)
        : fullText;

      logger.logPerformance('LLM image streaming', startTime, {
        activeSkill,
        imageSize: imageBuffer.length,
        responseLength: finalResponse.length,
        requestId: this.requestCount
      });

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
          mimeType
        }
      };
    } catch (error) {
      logger.warn('Streaming image analysis failed, falling back to non-streaming', {
        error: error.message,
        requestId: this.requestCount
      });
      return this.processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory, programmingLanguage);
    }
  }

  formatImageInstruction(activeSkill, programmingLanguage) {
    if (this.isMcqMode) {
      const langNote = programmingLanguage ? ` Use only ${programmingLanguage.toUpperCase()} if code is required.` : '';
      return `MANDATORY MCQ MODE ACTIVE: Analyze this screen/image for ALL Multiple Choice Questions (MCQs) visible. There may be one or multiple questions. For EACH question found: identify all options (A, B, C, D, etc.), select the single BEST correct answer, and format your response as "**Q[N] Correct Option: [Letter] - [Option Text]**" followed by concise reasoning. If only one MCQ is visible, omit the Q[N] prefix. Answer every question you can see.${langNote}`;
    }
    const lang = programmingLanguage ? programmingLanguage.toUpperCase() : 'CPP';
    return `Analyze this screen for the coding/technical problem.
CRITICAL CODE GENERATION RULES (STRICT COMPLIANCE REQUIRED):
1. SIMPLEST & MOST BASIC APPROACH:
   - Solve the problem in the most simple, basic, and direct way possible.
   - Use straightforward, intuitive logic: standard loops (for/while), basic conditions, and standard collections (dict, set, list, vector, unordered_map).
   - DO NOT OVER-ENGINEER: Avoid complex abstractions, convoluted nested lambdas, obscure one-liners, or unnecessary helper classes. Write clean, readable code that any engineer can immediately understand and trust.

2. PASS 100% OF ALL TEST CASES (ZERO ERRORS):
   - The solution MUST be 100% bug-free and pass ALL hidden test cases, edge cases, and performance limits.
   - Explicitly handle edge cases: empty/null inputs, single element (N=1), negative numbers, zeros, all-duplicate values, and extreme boundary limits.
   - In C++/Java: Always use 64-bit integers ('long long' / 'long') for sums, counts, and products to prevent integer overflow.
   - Optimal Time Complexity: Ensure the algorithm fits the problem constraints (e.g. O(N) or O(N log N) for N <= 10^5) so it never causes Time Limit Exceeded (TLE).

3. MINIMUM IMPORTS ONLY IF NEEDED:
   - Include ONLY the absolute bare minimum imports strictly required for the code to compile and run.
   - NEVER add unused imports. If built-in functions or types are sufficient, use ZERO imports.
   - Do NOT include boilerplate laundry lists of imports (no unused math, os, sys, re, random, itertools, collections, heapq). Only import a package if a specific function from it is actually invoked in the solution.

4. PLATFORM-AWARE FORMATTING:
   - Detect the platform (HackerRank, LeetCode, Codeforces, etc.), exact problem title, constraints, and visible editor template.
   - If on HackerRank or an Online Assessment with driver code: Provide the COMPLETE, self-contained drop-in replacement file with exact function signature and minimal runner reading stdin and writing to os.environ.get('OUTPUT_PATH') or stdout.
   - If on LeetCode: Provide the exact 'class Solution' with the required method signature and ZERO unnecessary imports.
   - Output clean, comment-free code strictly in ${lang}.`;
  }

  async processTextWithSkill(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    }

    const startTime = Date.now();
    this.requestCount++;
    
    try {
      logger.info('Processing text with LLM', {
        activeSkill,
        textLength: text.length,
        hasSessionMemory: sessionMemory.length > 0,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      const geminiRequest = this.buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage);

      const preferAlternative = !!config.get('llm.gemini.enableFallbackMethod');
      let response;
      try {
        if (preferAlternative) {
          logger.debug('Attempting alternative HTTPS method first for text processing');
          response = await this.executeAlternativeRequest(geminiRequest);
        } else {
          response = await this.executeRequest(geminiRequest);
        }
      } catch (error) {
        const secondaryLabel = preferAlternative ? 'primary SDK method' : 'alternative HTTPS method';
        logger.warn(`${preferAlternative ? 'Alternative' : 'Primary'} method failed, trying ${secondaryLabel}`, {
          error: error.message,
          requestId: this.requestCount
        });
        const secondaryFn = preferAlternative ? this.executeRequest.bind(this) : this.executeAlternativeRequest.bind(this);
        try {
          response = await secondaryFn(geminiRequest);
        } catch (secondaryError) {
          logger.error('Both Gemini request methods failed for text processing', {
            firstError: error.message,
            secondError: secondaryError.message,
            requestId: this.requestCount
          });
          throw secondaryError;
        }
      }
      
      // Enforce language in code fences if programmingLanguage specified
      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(response, programmingLanguage)
        : response;

      logger.logPerformance('LLM text processing', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: finalResponse.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM processing failed', {
        error: error.message,
        activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      if (config.get('llm.gemini.fallbackEnabled')) {
        return this.generateFallbackResponse(text, activeSkill);
      }

      throw error;
    }
  }

  async processTextWithSkillStream(text, activeSkill, sessionMemory = [], programmingLanguage = null, onDelta = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const geminiRequest = this.buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage);

      const fullText = await this.executeStreamingRequest(geminiRequest, (delta) => {
        if (typeof onDelta === 'function' && delta) {
          onDelta(delta);
        }
      });

      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(fullText, programmingLanguage)
        : fullText;

      logger.logPerformance('LLM text streaming', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: finalResponse.length,
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          streamed: true
        }
      };
    } catch (error) {
      logger.warn('Streaming text failed, falling back to non-streaming', {
        error: error.message,
        requestId: this.requestCount
      });
      return this.processTextWithSkill(text, activeSkill, sessionMemory, programmingLanguage);
    }
  }

  async processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    }

    const startTime = Date.now();
    this.requestCount++;
    
    try {
      logger.info('Processing transcription with intelligent response', {
        activeSkill,
        textLength: text.length,
        hasSessionMemory: sessionMemory.length > 0,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      const geminiRequest = this.buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage);

      const preferAlternative = !!config.get('llm.gemini.enableFallbackMethod');
      let response;
      try {
        if (preferAlternative) {
          logger.debug('Attempting alternative HTTPS method first for transcription processing');
          response = await this.executeAlternativeRequest(geminiRequest);
        } else {
          response = await this.executeRequest(geminiRequest);
        }
      } catch (error) {
        const secondaryLabel = preferAlternative ? 'primary SDK method' : 'alternative HTTPS method';
        logger.warn(`${preferAlternative ? 'Alternative' : 'Primary'} method failed, trying ${secondaryLabel}`, {
          error: error.message,
          requestId: this.requestCount
        });
        const secondaryFn = preferAlternative ? this.executeRequest.bind(this) : this.executeAlternativeRequest.bind(this);
        try {
          response = await secondaryFn(geminiRequest);
        } catch (secondaryError) {
          logger.error('Both Gemini request methods failed for transcription processing', {
            firstError: error.message,
            secondError: secondaryError.message,
            requestId: this.requestCount
          });
          throw secondaryError;
        }
      }
      
      // Enforce language in code fences if programmingLanguage specified
      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(response, programmingLanguage)
        : response;

      logger.logPerformance('LLM transcription processing', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: finalResponse.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isTranscriptionResponse: true
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM transcription processing failed', {
        error: error.message,
        activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      if (config.get('llm.gemini.fallbackEnabled')) {
        return this.generateIntelligentFallbackResponse(text, activeSkill);
      }
      
      throw error;
    }
  }

  /**
   * Normalize all triple-backtick code fences to the selected programming language tag.
   * Does not alter the inner code; only ensures fence language tags are correct.
   */
  enforceProgrammingLanguage(text, programmingLanguage) {
    try {
      if (!text || !programmingLanguage) return text;
      const norm = String(programmingLanguage).toLowerCase();
      const fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      const fenceTag = fenceTagMap[norm] || norm || 'text';

      // Replace all triple-backtick fences' language token with the selected tag
      const replacedBackticks = text.replace(/```([^\n]*)\n/g, (match, info) => {
        const current = (info || '').trim();
        // If already the desired fenceTag as the first token, keep as is
        if (current.split(/\s+/)[0].toLowerCase() === fenceTag) return match;
        return '```' + fenceTag + '\n';
      });

      // Optionally normalize tildes fences to backticks with correct tag
      const normalizedTildes = replacedBackticks.replace(/~~~([^\n]*)\n/g, () => '```' + fenceTag + '\n');

      return normalizedTildes;
    } catch (_) {
      return text;
    }
  }

  buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage) {
    // Check if we have the new conversation history format
    const sessionManager = require('../managers/session.manager');
    
    if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
      const conversationHistory = sessionManager.getConversationHistory(15);
      const skillContext = sessionManager.getSkillContext(activeSkill, programmingLanguage);
      return this.buildGeminiRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage);
    }

    // Fallback to old method for compatibility - now with programming language & MCQ support
    const requestComponents = promptLoader.getRequestComponents(
      activeSkill, 
      text, 
      sessionMemory,
      programmingLanguage,
      this.isMcqMode
    );

    const request = {
      contents: []
    };

    this.applyGenerationDefaults(request);

    // Use the skill prompt that already has programming language & MCQ injected
    if (requestComponents.shouldUseModelMemory && requestComponents.skillPrompt) {
      request.systemInstruction = {
        parts: [{ text: requestComponents.skillPrompt }]
      };
      
      logger.debug('Using language-enhanced system instruction for skill', {
        skill: activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        isMcqMode: this.isMcqMode,
        promptLength: requestComponents.skillPrompt.length,
        requiresProgrammingLanguage: requestComponents.requiresProgrammingLanguage
      });
    }

    request.contents.push({
      role: 'user',
      parts: [{ text: this.formatUserMessage(text, activeSkill) }]
    });

    return request;
  }

  buildGeminiRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage) {
    const request = {
      contents: []
    };

    this.applyGenerationDefaults(request);

    // Use the skill prompt from context
    let promptText = skillContext.skillPrompt;

    // If activeSkill is interview OR query is an interview/resume/conceptual question,
    // use the Jenil Soni master interview prompt so typed messages get authoritative resume answers!
    const isInterview = (activeSkill === 'interview' || this.isInterviewOrConceptualQuery(text, activeSkill));
    if (isInterview) {
      const interviewPrompt = promptLoader.getSkillPrompt('interview', programmingLanguage, this.isMcqMode);
      if (interviewPrompt) {
        promptText = interviewPrompt;
      }
    }

    if (this.isMcqMode && promptText && !promptText.includes('MANDATORY MCQ MODE ACTIVE')) {
      const { promptLoader } = require('../../prompt-loader');
      promptText = promptLoader.injectMcqInstructions(promptText);
    }

    if (promptText) {
      request.systemInstruction = {
        parts: [{ text: promptText }]
      };
      
      logger.debug('Using skill context prompt as system instruction', {
        skill: activeSkill,
        isInterview,
        programmingLanguage: programmingLanguage || 'not specified',
        isMcqMode: this.isMcqMode,
        promptLength: promptText.length,
        requiresProgrammingLanguage: skillContext.requiresProgrammingLanguage || false,
        hasLanguageInjection: programmingLanguage && skillContext.requiresProgrammingLanguage
      });
    }

    // Add conversation history (excluding system messages) with validation
    const conversationContents = conversationHistory
      .filter(event => {
        return event.role !== 'system' && 
               event.content && 
               typeof event.content === 'string' && 
               event.content.trim().length > 0;
      })
      .map(event => {
        const content = event.content.trim();
        return {
          role: event.role === 'model' ? 'model' : 'user',
          parts: [{ text: content }]
        };
      });

    // Add the conversation history
    request.contents.push(...conversationContents);

    // Format and validate the current user input
    const formattedMessage = this.formatUserMessage(text, activeSkill);
    if (!formattedMessage || formattedMessage.trim().length === 0) {
      throw new Error('Failed to format user message or message is empty');
    }

    // Add the current user input
    request.contents.push({
      role: 'user',
      parts: [{ text: formattedMessage }]
    });

    logger.debug('Built Gemini request with conversation history', {
      skill: activeSkill,
      programmingLanguage: programmingLanguage || 'not specified',
      historyLength: conversationHistory.length,
      totalContents: request.contents.length,
      hasSystemInstruction: !!request.systemInstruction,
      requiresProgrammingLanguage: skillContext.requiresProgrammingLanguage || false
    });

    return request;
  }

  buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage) {
    // Validate input text first
    const cleanText = text && typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      throw new Error('Empty or invalid transcription text provided to buildIntelligentTranscriptionRequest');
    }

    // Check if we have the new conversation history format
    const sessionManager = require('../managers/session.manager');
    
    if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
      const conversationHistory = sessionManager.getConversationHistory(10);
      const skillContext = sessionManager.getSkillContext(activeSkill, programmingLanguage);
      return this.buildIntelligentTranscriptionRequestWithHistory(cleanText, activeSkill, conversationHistory, skillContext, programmingLanguage);
    }

    // Fallback to basic intelligent request
    const request = {
      contents: []
    };

    this.applyGenerationDefaults(request);

    // Add intelligent filtering system instruction
    const intelligentPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage, cleanText);
    if (!intelligentPrompt) {
      throw new Error('Failed to generate intelligent transcription prompt');
    }

    request.systemInstruction = {
      parts: [{ text: intelligentPrompt }]
    };

    request.contents.push({
      role: 'user',
      parts: [{ text: cleanText }]
    });

    logger.debug('Built basic intelligent transcription request', {
      skill: activeSkill,
      programmingLanguage: programmingLanguage || 'not specified',
      textLength: cleanText.length,
      hasSystemInstruction: !!request.systemInstruction
    });

    return request;
  }

  buildIntelligentTranscriptionRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage) {
    const request = {
      contents: []
    };

    // Validate and clean text first
    const cleanText = text && typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      throw new Error('Empty or invalid transcription text provided');
    }

    const isInterview = (activeSkill === 'interview' || this.isInterviewOrConceptualQuery(cleanText, activeSkill));
    this.applyGenerationDefaults(request, isInterview 
      ? { 
          maxOutputTokens: 1200, 
          temperature: 0.15,
          thinkingConfig: { thinkingBudget: 0 }
        } 
      : {}
    );

    // For chat/transcription messages, use the intelligent prompt tuned with question text
    const intelligentPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage, cleanText);
    request.systemInstruction = { parts: [{ text: intelligentPrompt }] };

    // Add recent conversation history (excluding system messages) with validation
    const conversationContents = conversationHistory
      .filter(event => {
        // Filter out system messages and ensure content exists and is valid
        return event.role !== 'system' && 
               event.content && 
               typeof event.content === 'string' && 
               event.content.trim().length > 0;
      })
      .slice(-4) // Keep recent 2 exchanges (4 turns) for ultra-fast TTFT and prompt prefill
      .map(event => {
        const content = event.content.trim();
        if (!content) {
          logger.warn('Empty content found in conversation history', { event });
          return null;
        }
        return {
          role: event.role === 'model' ? 'model' : 'user',
          parts: [{ text: content }]
        };
      })
      .filter(content => content !== null); // Remove any null entries

    // Strict multi-turn alternation enforcement for Gemini v1beta API:
    // 1. Alternation must be strict: user -> model -> user -> model
    // 2. Consecutive entries of the same role must be merged into a single turn
    // 3. Since cleanText is appended as the new 'user' turn, the history MUST end in 'model'
    const sanitizedHistory = [];
    for (const item of conversationContents) {
      if (sanitizedHistory.length === 0) {
        sanitizedHistory.push({ role: item.role, parts: [{ text: item.parts[0].text }] });
      } else {
        const lastEntry = sanitizedHistory[sanitizedHistory.length - 1];
        if (lastEntry.role === item.role) {
          lastEntry.parts[0].text += `\n${item.parts[0].text}`;
        } else {
          sanitizedHistory.push({ role: item.role, parts: [{ text: item.parts[0].text }] });
        }
      }
    }

    // Never let history end on 'user' right before we push our new user prompt
    while (sanitizedHistory.length > 0 && sanitizedHistory[sanitizedHistory.length - 1].role === 'user') {
      sanitizedHistory.pop();
    }

    // Add the sanitized conversation history
    request.contents.push(...sanitizedHistory);

    // Add the current transcription as the active user turn
    request.contents.push({
      role: 'user',
      parts: [{ text: cleanText }]
    });

    // Ensure we have at least one content item
    if (request.contents.length === 0) {
      throw new Error('No valid content to send to Gemini API');
    }

    logger.debug('Built intelligent transcription request with conversation history', {
      skill: activeSkill,
      programmingLanguage: programmingLanguage || 'not specified',
      historyLength: conversationHistory.length,
      totalContents: request.contents.length,
      hasSkillPrompt: !!skillContext.skillPrompt,
      cleanTextLength: cleanText.length,
      requiresProgrammingLanguage: skillContext.requiresProgrammingLanguage || false
    });

    return request;
  }

  isInterviewOrConceptualQuery(text, activeSkill) {
    if (activeSkill === 'interview') return true;
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();

    // High-confidence interview / resume / architectural intent keywords
    const interviewKeywords = [
      'yourself', 'introduce', 'resume', 'experience', 'background', 'project',
      'vedprada', 'clinicos', 'airsight', 'cctv', 'surveillance', 'rec', 'manjushri',
      'brainy', 'why should', 'hire you', 'tell me about', 'strength', 'weakness',
      'conflict', 'challenge', 'situation', 'achieve', 'achievement', 'role',
      'education', 'college', 'degree', 'indus', 'b.tech', 'polytechnic', 'certification',
      'who are you', 'what is your name', 'your stack', 'work with', 'tell us',
      'difference between', 'what is', 'how does', 'explain', 'architecture',
      'system design', 'rest api', 'fastapi', 'express', 'postgres', 'postgresql',
      'redis', 'docker', 'onnx', 'yolo', 'opencv', 'mediapipe', 'rbac', 'abac',
      'database', 'indexing', 'acid', 'microservices', 'embeddings', 'similarity',
      'walk me through', 'portfolio', 'interview'
    ];

    return interviewKeywords.some(kw => lower.includes(kw));
  }

  getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage, text = '') {
    const isInterview = (activeSkill === 'interview' || this.isInterviewOrConceptualQuery(text, activeSkill));
    if (isInterview) {
      const interviewPrompt = promptLoader.getSkillPrompt('interview', programmingLanguage, this.isMcqMode);
      if (interviewPrompt) {
        return interviewPrompt;
      }
    }

    let prompt = `# Intelligent Technical Co-Pilot Response System

Assume you are asked a question in ${activeSkill.toUpperCase()} mode. Your job is to intelligently respond to the question/message with appropriate brevity.
Assume you are in an interview and you need to perform at the highest professional level.
Always respond directly to the point. Do not repeat the question or produce unnecessary filler.`;

    // Add programming language context if provided
    if (programmingLanguage) {
      const lang = String(programmingLanguage).toLowerCase();
      const languageMap = { cpp: 'C++', c: 'C', python: 'Python', java: 'Java', javascript: 'JavaScript', js: 'JavaScript' };
      const fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      const languageTitle = languageMap[lang] || (lang.charAt(0).toUpperCase() + lang.slice(1));
      const fenceTag = fenceTagMap[lang] || lang || 'text';
      prompt += `\n\nCODING CONTEXT: When producing code, respond ONLY in ${languageTitle}. All code blocks must use triple backticks with language tag \`\`\`${fenceTag}\`\`\`. Do not include other languages unless explicitly asked.`;
    }

    prompt += `

## Response Rules:

### If the question is conversational, conceptual, architectural, or about experience:
- Use clear, natural 8th to 10th grade spoken English with essential technical accuracy.
- EXACT TEMPLATE:
❓ Question: [3 to 6 words summary of question]
🗣️ Start with: [1 natural opening definition or sentence in 8th-10th grade English that the user can immediately say out loud]
⚡ Talking Points:
• [1 simple sentence with crucial anchor phrases in brackets like [B-Tree structure] or [O(log N) lookups]]
• [1 simple sentence explaining benefit or trade-off with [key phrases]]
• [1 simple sentence explaining practical implementation with [key phrases]]
🎯 Key-Value Insights:
• Advantages: [Specific speed or throughput benefit statement]
• Trade-offs: [Specific write overhead or memory trade-off statement]
• Real-Life Example: [Concrete metric from ClinicOS / Vedprada / REC / AI CCTV]
• Our Approach: [Specific engineering approach or pitfall to avoid]
- Do NOT output code snippets or templates for conceptual, behavioral, or general questions!
- Single-view fit: keep compact under 180 words so it fits in the overlay window without scrolling.

### If the question is explicitly a coding problem, algorithmic challenge, or DSA statement:
- State optimal time and space complexity.
- Produce the SIMPLEST and MOST BASIC implementation in the selected programming language in a properly tagged code block without comments.
- MINIMUM IMPORTS: Include only the absolute bare minimum imports strictly required for the code to run. Never include unused imports.
- PASS 100% OF TEST CASES: Ensure the code explicitly handles edge cases (empty inputs, single elements, negative numbers, extreme constraints, and 64-bit integer overflow).

### If casual greeting:
- Respond briefly and professionally: "Hello! I am ready to answer your technical and interview questions."`;

    if (this.isMcqMode) {
      prompt += `\n\n## MANDATORY MCQ MODE ACTIVE:
Treat any user query or question as a Multiple Choice Question (MCQ).
Select the single BEST choice answer option immediately and start with:
**Correct Option: [Option Letter] - [Option Text]**
Follow with a crisp 2-3 bullet point justification.`;
    }

    return prompt;
  }

  formatUserMessage(text, activeSkill) {
    if (this.isMcqMode) {
      return `Context: MCQ ONLY analysis request for ${activeSkill.toUpperCase()}.\nTreat this strictly as a Multiple Choice Question, identify all choices, choose the single best answer, and output the correct option with concise justification.\n\nText to analyze:\n${text}`;
    }
    return `Context: ${activeSkill.toUpperCase()} analysis request\n\nText to analyze:\n${text}`;
  }

  async executeRequest(geminiRequest) {
    const maxRetries = config.get('llm.gemini.maxRetries');
    const timeout = config.get('llm.gemini.timeout');
    const primaryModel = this.model;
    const fallbackModels = config.get('llm.gemini.fallbackModels') || [];
    const modelsToTry = [primaryModel, ...fallbackModels];

    logger.debug('Executing Gemini request', {
      hasModel: !!this.model,
      hasClient: !!this.client,
      requestKeys: Object.keys(geminiRequest),
      timeout,
      maxRetries,
      modelsToTry,
      nodeVersion: process.version,
      platform: process.platform
    });

    let lastError = null;

    for (const modelName of modelsToTry) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeout)
          );

          logger.debug(`Gemini API attempt ${attempt} starting with model ${modelName}`, {
            timestamp: new Date().toISOString(),
            timeout,
            model: modelName
          });

          const requestPromise = this.client.models.generateContent({
            model: modelName,
            contents: geminiRequest.contents,
            config: geminiRequest.generationConfig,
            systemInstruction: geminiRequest.systemInstruction
          });
          const result = await Promise.race([requestPromise, timeoutPromise]);

          if (!result) {
            throw new Error('Empty response from Gemini API');
          }

          const { text, finishReason } = this.extractTextFromCandidates(result);

          if (finishReason === 'MAX_TOKENS') {
            logger.warn('Gemini response reached max tokens limit', {
              attempt,
              finishReason,
              model: modelName
            });
          }

          logger.debug('Gemini API request successful', {
            attempt,
            model: modelName,
            responseLength: text.length,
            finishReason
          });

          return text;
        } catch (error) {
          const errorInfo = this.analyzeError(error);
          lastError = error;

          // Enhanced error logging for fetch failures
          if (errorInfo.type === 'NETWORK_ERROR') {
            logger.error('Network error details', {
              attempt,
              model: modelName,
              errorMessage: error.message,
              errorStack: error.stack,
              errorName: error.name,
              nodeEnv: process.env.NODE_ENV,
              electronVersion: process.versions.electron,
              chromeVersion: process.versions.chrome,
              nodeVersion: process.versions.node,
              userAgent: this.getUserAgent()
            });
          }

          logger.warn(`Gemini API attempt ${attempt} failed for model ${modelName}`, {
            error: error.message,
            errorType: errorInfo.type,
            isNetworkError: errorInfo.isNetworkError,
            suggestedAction: errorInfo.suggestedAction,
            remainingAttempts: maxRetries - attempt,
            model: modelName
          });

          // For model-unavailable / overloaded / rate-limit errors, move to
          // the next fallback model immediately instead of burning all retries.
          const isModelUnavailable = errorInfo.type === 'RATE_LIMIT_ERROR' ||
            error.message.includes('503') ||
            error.message.includes('UNAVAILABLE') ||
            error.message.includes('high demand');

          if (isModelUnavailable && modelName !== modelsToTry[modelsToTry.length - 1]) {
            logger.info(`Switching to fallback model after ${modelName} unavailable`, {
              model: modelName,
              error: error.message
            });
            break; // exit retry loop for this model and try next model
          }

          if (attempt === maxRetries) {
            break; // exit retry loop for this model and try next model
          }

          // Use exponential backoff with jitter for network errors
          const baseDelay = errorInfo.isNetworkError ? 2500 : 1500;
          const delay = baseDelay * attempt + Math.random() * 1000;

          logger.debug(`Waiting ${delay}ms before retry ${attempt + 1}`, {
            baseDelay,
            isNetworkError: errorInfo.isNetworkError,
            model: modelName
          });

          await this.delay(delay);
        }
      }
    }

    const finalErrorInfo = this.analyzeError(lastError);
    const finalError = new Error(`Gemini API failed after trying ${modelsToTry.join(', ')}: ${lastError?.message}`);
    finalError.errorAnalysis = finalErrorInfo;
    finalError.originalError = lastError;
    throw finalError;
  }

  /**
   * Streaming sibling of processTranscriptionWithIntelligentResponse. Emits
   * incremental text via onDelta so the UI can render the answer as it is
   * generated (much faster perceived latency). Returns the same
   * {response, metadata} shape. Falls back to the non-streaming path on any
   * streaming failure so reliability is never worse than before.
   */
  async processTranscriptionWithIntelligentResponseStream(text, activeSkill, sessionMemory = [], programmingLanguage = null, onDelta = null, abortSignal = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    }

    if (abortSignal && abortSignal.aborted) {
      const abortErr = new Error('ABORTED');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const geminiRequest = this.buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage);

      const fullText = await this.executeStreamingRequest(geminiRequest, (delta) => {
        if (typeof onDelta === 'function' && delta) {
          onDelta(delta);
        }
      }, abortSignal);

      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(fullText, programmingLanguage)
        : fullText;

      logger.logPerformance('LLM transcription streaming', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: finalResponse.length,
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          streamed: true,
          isTranscriptionResponse: true
        }
      };
    } catch (error) {
      if (abortSignal && (abortSignal.aborted || error.message === 'ABORTED' || error.name === 'AbortError')) {
        logger.info('Streaming transcription was aborted/preempted by new question', {
          requestId: this.requestCount
        });
        throw error;
      }

      logger.warn('Streaming transcription failed, falling back to non-streaming', {
        error: error.message,
        requestId: this.requestCount
      });
      // Non-streaming path returns the same shape; the caller renders it as a
      // single final response.
      return this.processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory, programmingLanguage);
    }
  }

  /** Safely pull the text delta out of a streamed Gemini chunk. */
  _extractChunkText(chunk) {
    try {
      const t = chunk && chunk.text;
      if (typeof t === 'string') {
        return t;
      }
    } catch (_) {
      // `.text` getter can throw on non-text parts; fall through to manual read.
    }
    try {
      const parts = (chunk && chunk.candidates && chunk.candidates[0] &&
        chunk.candidates[0].content && chunk.candidates[0].content.parts) || [];
      return parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('');
    } catch (_) {
      return '';
    }
  }

  /**
   * Run a streaming Gemini request with the same model-fallback + retry policy
   * as executeRequest. Accumulates and returns the full text; invokes onDelta
   * for each chunk. Supports abortSignal for instantaneous question preemption.
   */
  async executeStreamingRequest(geminiRequest, onDelta, abortSignal = null) {
    const apiKeys = config.getApiKeys('GEMINI');
    if (!apiKeys || apiKeys.length === 0) {
      throw new Error('No Gemini API keys configured in .env');
    }

    if (abortSignal && abortSignal.aborted) {
      const abortErr = new Error('ABORTED');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    const maxRetries = config.get('llm.gemini.maxRetries') || 1;
    const primaryModel = config.get('llm.gemini.model') || this.model || 'gemini-3.5-flash-lite';
    const fallbackModels = config.get('llm.gemini.fallbackModels') || [];
    const modelsToTry = [primaryModel, ...fallbackModels.filter(m => m !== primaryModel)];

    const orderedKeyIndices = this.getOrderedKeyIndices(apiKeys.length);
    let lastError = null;

    for (const keyIndex of orderedKeyIndices) {
      const apiKey = apiKeys[keyIndex];
      const keyLabel = `Key #${keyIndex + 1}`;

      for (const modelName of modelsToTry) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          if (abortSignal && abortSignal.aborted) {
            const abortErr = new Error('ABORTED');
            abortErr.name = 'AbortError';
            throw abortErr;
          }

          const reqStartTime = Date.now();
          let ttftRecorded = null;

          try {
            this.emitDebugStatus({
              phase: 'connecting',
              keyIndex: keyIndex + 1,
              model: modelName,
              attempt,
              status: `Connecting to ${modelName} via ${keyLabel}...`
            });

            const fullText = await this._streamRequestForModel(
              geminiRequest,
              modelName,
              apiKey,
              (delta) => {
                if (ttftRecorded === null) {
                  ttftRecorded = Date.now() - reqStartTime;
                  this.emitDebugStatus({
                    phase: 'streaming',
                    keyIndex: keyIndex + 1,
                    model: modelName,
                    ttftMs: ttftRecorded,
                    status: `Streaming ${modelName} (TTFT: ${ttftRecorded}ms)`
                  });
                }
                if (typeof onDelta === 'function') {
                  onDelta(delta);
                }
              },
              abortSignal
            );

            if (fullText && fullText.trim().length > 0) {
              const totalLatency = Date.now() - reqStartTime;
              this.markKeySuccess(keyIndex, modelName, totalLatency, ttftRecorded);
              this.emitDebugStatus({
                phase: 'completed',
                keyIndex: keyIndex + 1,
                model: modelName,
                totalLatencyMs: totalLatency,
                ttftMs: ttftRecorded,
                status: `Completed ${modelName} in ${totalLatency}ms`
              });
              return fullText;
            }
          } catch (error) {
            lastError = error;

            // If request was preempted/aborted by user/newer question, immediately rethrow without failover
            if (abortSignal && (abortSignal.aborted || error.message === 'ABORTED' || error.name === 'AbortError')) {
              throw error;
            }

            this.errorCount++;
            this.markKeyError(keyIndex, modelName, error.message, apiKeys.length);

            this.emitDebugStatus({
              phase: 'failover',
              keyIndex: keyIndex + 1,
              model: modelName,
              error: error.message,
              status: `${keyLabel} (${modelName}) failed: ${error.message}. Switching...`
            });

            logger.warn(`Streaming attempt failed (${keyLabel}, model ${modelName})`, {
              error: error.message,
              keyIndex: keyIndex + 1,
              model: modelName
            });

            const isAuthError = error.message.includes('403') ||
              error.message.includes('401') ||
              error.message.includes('API_KEY_INVALID');

            // If the key is permanently unauthorized or invalid, skip remaining models on this key and jump to next key!
            if (isAuthError && apiKeys.length > 1) {
              break;
            }
          }
        }
      }
    }

    throw lastError || new Error('Gemini streaming request failed across all available keys and models');
  }

  _streamRequestForModel(geminiRequest, modelName, apiKey, onDelta, abortSignal = null) {
    const https = require('https');
    const timeout = Math.max(16000, config.get('llm.gemini.timeout') || 16000);
    const ttftTimeout = 5000; // Fast watchdog: allow up to 5s for initial stream chunk, then fast-failover
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`;
    // Strip thinkingConfig from generationConfig — the v1beta REST endpoint does NOT support it
    // and returns an empty response (no text, no tool calls) when it is present, causing the
    // "model output must contain either output text or tool calls" error.
    const safeRequest = geminiRequest.generationConfig && geminiRequest.generationConfig.thinkingConfig
      ? { ...geminiRequest, generationConfig: (({ thinkingConfig, ...rest }) => rest)(geminiRequest.generationConfig) }
      : geminiRequest;
    const postData = JSON.stringify(safeRequest);
    this._sharedHttpsAgent = this._sharedHttpsAgent || new https.Agent({ keepAlive: true, maxSockets: 10, keepAliveMsecs: 60000 });
    const agent = this._sharedHttpsAgent;

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': this.getUserAgent()
      },
      timeout,
      agent
    };

    return new Promise((resolve, reject) => {
      if (abortSignal && abortSignal.aborted) {
        const abortErr = new Error('ABORTED');
        abortErr.name = 'AbortError';
        return reject(abortErr);
      }

      let isDone = false;
      let hasReceivedFirstByte = false;

      const safeReject = (err) => {
        if (isDone) return;
        isDone = true;
        clearTimeout(watchdogTimer);
        reject(err);
      };

      const safeResolve = (val) => {
        if (isDone) return;
        isDone = true;
        clearTimeout(watchdogTimer);
        resolve(val);
      };

      const watchdogTimer = setTimeout(() => {
        if (!hasReceivedFirstByte) {
          try { req.destroy(); } catch (_) {}
          safeReject(new Error(`TTFT watchdog timeout (${ttftTimeout}ms) for ${modelName}`));
        }
      }, ttftTimeout);

      let abortHandler = null;
      if (abortSignal) {
        abortHandler = () => {
          try { req.destroy(); } catch (_) {}
          const abortErr = new Error('ABORTED');
          abortErr.name = 'AbortError';
          safeReject(abortErr);
        };
        abortSignal.addEventListener('abort', abortHandler, { once: true });
      }

      const req = https.request(url, options, (res) => {
        clearTimeout(watchdogTimer);
        hasReceivedFirstByte = true;
        if (res.statusCode !== 200) {
          let errBody = '';
          res.on('data', (c) => { errBody += c; });
          res.on('end', () => safeReject(new Error(`HTTP ${res.statusCode}: ${errBody}`)));
          return;
        }

        let fullText = '';
        let buffer = '';

        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          hasReceivedFirstByte = true;
          clearTimeout(watchdogTimer);
          // Refresh socket timeout on each incoming chunk so active generation never times out
          try { req.setTimeout(timeout); } catch (_) {}

          buffer += chunk;
          let idx;
          while ((idx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line.startsWith('data:')) {
              continue;
            }
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') {
              continue;
            }
            try {
              const json = JSON.parse(payload);
              const piece = this._extractChunkText(json);
              if (piece) {
                fullText += piece;
                if (typeof onDelta === 'function') {
                  onDelta(piece);
                }
              }
            } catch (_) {
            }
          }
        });

        res.on('end', () => {
          if (abortHandler && abortSignal) {
            abortSignal.removeEventListener('abort', abortHandler);
          }
          safeResolve(fullText.trim());
        });
        res.on('error', (error) => safeReject(new Error(`Streaming response error: ${error.message}`)));
      });

      req.on('error', (error) => safeReject(new Error(`Streaming request failed: ${error.message}`)));
      req.on('timeout', () => {
        try { req.destroy(); } catch (_) {}
        safeReject(new Error('Streaming request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  async performPreflightCheck() {
    // Quick connectivity check
    try {
      const startTime = Date.now();
      await this.testNetworkConnection({ 
        host: 'generativelanguage.googleapis.com', 
        port: 443, 
        name: 'Gemini API Endpoint' 
      });
      const latency = Date.now() - startTime;
      
      logger.debug('Preflight check passed', { latency });
    } catch (error) {
      logger.warn('Preflight check failed', { 
        error: error.message,
        suggestion: 'Network connectivity issue detected before API call'
      });
      // Don't throw here - let the actual API call fail with more detail
    }
  }

  getUserAgent() {
    // Always return a realistic browser UA to avoid network fingerprinting
    // by proctoring tools that inspect outgoing HTTP headers.
    if (process.platform === 'darwin') {
      return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.156 Safari/537.36';
    }
    if (process.platform === 'win32') {
      return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.156 Safari/537.36';
    }
    return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.156 Safari/537.36';
  }

  analyzeError(error) {
    const errorMessage = error.message.toLowerCase();
    
    // Network connectivity errors
    if (errorMessage.includes('fetch failed') || 
        errorMessage.includes('network error') ||
        errorMessage.includes('enotfound') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('timeout')) {
      return {
        type: 'NETWORK_ERROR',
        isNetworkError: true,
        suggestedAction: 'Check internet connection and firewall settings'
      };
    }
    
    // API key errors
    if (errorMessage.includes('unauthorized') || 
        errorMessage.includes('invalid api key') ||
        errorMessage.includes('forbidden')) {
      return {
        type: 'AUTH_ERROR',
        isNetworkError: false,
        suggestedAction: 'Verify Gemini API key configuration'
      };
    }
    
    // Rate limiting
    if (errorMessage.includes('quota') || 
        errorMessage.includes('rate limit') ||
        errorMessage.includes('too many requests')) {
      return {
        type: 'RATE_LIMIT_ERROR',
        isNetworkError: false,
        suggestedAction: 'Wait before retrying or check API quota'
      };
    }
    
    // Timeout errors
    if (errorMessage.includes('request timeout') || errorMessage.includes('etimedout')) {
      return {
        type: 'TIMEOUT_ERROR',
        isNetworkError: true,
        suggestedAction: 'Check network latency or increase timeout'
      };
    }
    
    return {
      type: 'UNKNOWN_ERROR',
      isNetworkError: false,
      suggestedAction: 'Check logs for more details'
    };
  }

  async checkNetworkConnectivity() {
    const connectivityTests = [
      { host: 'google.com', port: 443, name: 'Google (HTTPS)' },
      { host: 'generativelanguage.googleapis.com', port: 443, name: 'Gemini API Endpoint' }
    ];

    const results = await Promise.allSettled(
      connectivityTests.map(test => this.testNetworkConnection(test))
    );

    const connectivity = {
      timestamp: new Date().toISOString(),
      tests: results.map((result, index) => ({
        ...connectivityTests[index],
        success: result.status === 'fulfilled' && result.value,
        error: result.status === 'rejected' ? result.reason.message : null
      }))
    };

    logger.info('Network connectivity check completed', connectivity);
    return connectivity;
  }

  async testNetworkConnection({ host, port, name }) {
    return new Promise((resolve, reject) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connection timeout to ${host}:${port}`));
      }, 5000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Connection failed to ${host}:${port}: ${error.message}`));
      });

      socket.connect(port, host);
    });
  }

  generateFallbackResponse(text, activeSkill) {
    logger.info('Generating fallback response', { activeSkill });

    const fallbackResponses = {
      'dsa': 'This appears to be a data structures and algorithms problem. Consider breaking it down into smaller components and identifying the appropriate algorithm or data structure to use.',
      'interview': 'Focus on providing a crisp 1-line definition, key terminology, 3 core technical facts, and a concrete production example.',
      'system-design': 'For this system design question, consider scalability, reliability, and the trade-offs between different architectural approaches.',
      'programming': 'This looks like a programming challenge. Focus on understanding the requirements, edge cases, and optimal time/space complexity.',
      'default': 'I can help analyze this content. Please ensure your Gemini API key is properly configured for detailed analysis.'
    };

    const response = fallbackResponses[activeSkill] || fallbackResponses.default;
    
    return {
      response,
      metadata: {
        skill: activeSkill,
        processingTime: 0,
        requestId: this.requestCount,
        usedFallback: true
      }
    };
  }

  generateIntelligentFallbackResponse(text, activeSkill) {
    logger.info('Generating intelligent fallback response for transcription', { activeSkill });

    try {
      const localKnowledgeService = require('./local-knowledge.service');
      const instant = localKnowledgeService.synthesizeInstantResponse(text, activeSkill);
      return {
        response: instant.fullResponse,
        metadata: {
          skill: activeSkill,
          processingTime: 5,
          requestId: this.requestCount,
          usedFallback: true,
          isInstant: true,
          isTranscriptionResponse: true
        }
      };
    } catch (e) {
      logger.error('Failed to generate local knowledge response, using basic fallback', { error: e.message });
      return {
        response: `❓ Question: ${text.substring(0, 30)}\n🗣️ Start with: "I approach this by analyzing the architecture requirements first and evaluating performance trade-offs."\n⚡ Talking Points:\n• Focus on [modular design] and data integrity.\n• Benchmark [latency and throughput] trade-offs.\n🎯 Key-Value Insights:\n• Advantages: High stability and clean code.\n• Real-Life Example: Applied in ClinicOS and Vedprada delivering 99.9% uptime.`,
        metadata: {
          skill: activeSkill,
          processingTime: 1,
          requestId: this.requestCount,
          usedFallback: true,
          isTranscriptionResponse: true
        }
      };
    }
  }

  async testConnection() {
    if (!this.isInitialized) {
      return { success: false, error: 'Service not initialized' };
    }

    try {
      // First check network connectivity
      const networkCheck = await this.checkNetworkConnectivity();
      const hasNetworkIssues = networkCheck.tests.some(test => !test.success);
      
      if (hasNetworkIssues) {
        logger.warn('Network connectivity issues detected', networkCheck);
      }

      const generationConfig = this.getGenerationConfig({ temperature: 0, maxOutputTokens: 64 });
      const fallbackModels = config.get('llm.gemini.fallbackModels') || [];
      const modelsToTry = [this.model, ...fallbackModels];

      let lastError = null;
      let result = null;
      let usedModel = null;

      for (const modelName of modelsToTry) {
        try {
          const startTime = Date.now();
          result = await this.client.models.generateContent({
            model: modelName,
            contents: 'Test connection. Please respond with "OK".',
            config: generationConfig
          });
          usedModel = modelName;
          const latency = Date.now() - startTime;
          const { text } = this.extractTextFromCandidates(result);

          logger.info('Connection test successful', {
            response: text,
            latency,
            model: usedModel,
            networkCheck: hasNetworkIssues ? 'issues_detected' : 'healthy'
          });

          return {
            success: true,
            response: text,
            latency,
            model: usedModel,
            networkConnectivity: networkCheck
          };
        } catch (error) {
          lastError = error;
          logger.warn(`Connection test failed for model ${modelName}`, {
            error: error.message,
            model: modelName
          });

          const isModelUnavailable = error.message.includes('503') ||
            error.message.includes('UNAVAILABLE') ||
            error.message.includes('high demand') ||
            error.message.includes('quota') ||
            error.message.includes('rate limit');

          if (!isModelUnavailable && modelName === this.model) {
            // Primary model failed for a non-availability reason; don't hide it
            break;
          }
        }
      }

      throw lastError || new Error('Connection test failed on all models');
    } catch (error) {
      const errorAnalysis = this.analyzeError(error);
      logger.error('Connection test failed', {
        error: error.message,
        errorAnalysis
      });

      // Map raw SDK errors to user-friendly messages. The wizard only
      // surfaces `error`, so any raw SDK error string would land in the
      // UI verbatim.
      const friendlyError = this._friendlyTestError(error, errorAnalysis);

      return {
        success: false,
        error: friendlyError,
        errorType: errorAnalysis?.type || 'UNKNOWN',
        errorAnalysis,
        networkConnectivity: await this.checkNetworkConnectivity().catch(() => null)
      };
    }
  }

  /**
   * Translate raw SDK / network errors into something a user can act on.
   */
  _friendlyTestError(error, analysis) {
    const type = analysis?.type;
    const raw = (error?.message || '').toLowerCase();

    if (type === 'NETWORK_ERROR' || raw.includes('fetch failed') || raw.includes('enotfound')) {
      return 'Cannot reach Google servers. Check your internet connection, firewall, or VPN settings.';
    }
    if (type === 'AUTH_ERROR' || raw.includes('api key') || raw.includes('401') || raw.includes('403')) {
      return 'Invalid API key or insufficient permissions. Double-check the key at aistudio.google.com/apikey.';
    }
    if (type === 'RATE_LIMIT_ERROR' || raw.includes('429') || raw.includes('quota')) {
      return 'Rate limit or quota exceeded. Wait a moment or check your Google Cloud billing.';
    }
    if (type === 'TIMEOUT_ERROR') {
      return 'Request timed out. The Google API may be slow or unreachable right now.';
    }
    if (type === 'MODEL_ERROR' || raw.includes('model') || raw.includes('404')) {
      return 'The configured Gemini model is unavailable. Try a different model in Settings.';
    }
    if (raw.includes('503') || raw.includes('unavailable') || raw.includes('high demand')) {
      return 'Gemini is experiencing high demand. Please wait a moment and try again.';
    }
    // Fall back to a stripped-down raw message (no SDK prefix noise)
    return (error?.message || 'Connection failed').replace(/^\[(GoogleGenerativeAI|GoogleGenAI) Error\]:\s*/i, '');
  }

  updateApiKey(newApiKey) {
    process.env.GEMINI_API_KEY = newApiKey;
    this.isInitialized = false;
    this.initializeClient();
    
    logger.info('API key updated and client reinitialized');
  }

  getStats() {
    return {
      isInitialized: this.isInitialized,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 0,
      config: config.get('llm.gemini')
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async executeAlternativeRequest(geminiRequest) {
    const apiKeys = config.getApiKeys('GEMINI');
    const primaryModel = config.get('llm.gemini.model') || this.model || 'gemini-3.5-flash-lite';
    const fallbackModels = config.get('llm.gemini.fallbackModels') || [];
    const modelsToTry = [primaryModel, ...fallbackModels.filter(m => m !== primaryModel)];

    logger.info('Using alternative HTTPS request method with failover', {
      modelsToTry,
      configuredKeysCount: apiKeys.length
    });

    const orderedKeyIndices = this.getOrderedKeyIndices(apiKeys.length);
    let lastError = null;

    for (const keyIndex of orderedKeyIndices) {
      const apiKey = apiKeys[keyIndex];
      const isBackupKey = keyIndex !== orderedKeyIndices[0];

      if (isBackupKey) {
        logger.info(`Failing over to secondary backup Gemini API key (Key #${keyIndex + 1})...`);
      }

      for (const modelName of modelsToTry) {
        const t0 = Date.now();
        try {
          const result = await this._executeAlternativeRequestForModel(geminiRequest, modelName, apiKey);
          const latency = Date.now() - t0;
          this.markKeySuccess(keyIndex, modelName, latency, null);
          if (isBackupKey) {
            logger.info('Successfully completed AI request using secondary backup API key!');
          }
          return result;
        } catch (error) {
          lastError = error;
          this.markKeyError(keyIndex, modelName, error.message, apiKeys.length);
          logger.warn(`Alternative HTTPS request failed (Key #${keyIndex + 1}, model ${modelName})`, {
            error: error.message,
            model: modelName
          });

          const isAuthError = error.message.includes('403') ||
            error.message.includes('401') ||
            error.message.includes('API_KEY_INVALID');

          // If current key has auth error, switch immediately to next available key!
          if (isAuthError && apiKeys.length > 1) {
            logger.warn(`Key #${keyIndex + 1} has auth error; switching immediately to next available backup API key.`);
            break;
          }

          continue;
        }
      }
    }

    throw lastError || new Error('Alternative HTTPS request failed for all available API keys and models');
  }

  async _executeAlternativeRequestForModel(geminiRequest, modelName, apiKey) {
    const https = require('https');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

    // Strip thinkingConfig from generationConfig — the v1beta REST endpoint does NOT support it
    // and returns an empty response (no text, no tool calls) when it is present.
    const safeRequest = geminiRequest.generationConfig && geminiRequest.generationConfig.thinkingConfig
      ? { ...geminiRequest, generationConfig: (({ thinkingConfig, ...rest }) => rest)(geminiRequest.generationConfig) }
      : geminiRequest;
    const postData = JSON.stringify(safeRequest);

    const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': this.getUserAgent()
      },
      timeout: config.get('llm.gemini.timeout'),
      agent
    };

    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              return;
            }
            
            const response = JSON.parse(data);
            
            logger.debug('Alternative request response structure', {
              hasResponse: !!response,
              hasCandidates: !!response.candidates,
              candidatesLength: response.candidates?.length,
              responseKeys: Object.keys(response || {}),
              firstCandidateKeys: response.candidates?.[0] ? Object.keys(response.candidates[0]) : []
            });

            const { text, finishReason } = this.extractTextFromCandidates(response);

            if (finishReason === 'MAX_TOKENS') {
              logger.warn('Gemini alternative response reached max tokens limit', {
                finishReason
              });
            }
            
            logger.info('Alternative request successful', {
              responseLength: text.length,
              statusCode: res.statusCode,
              finishReason
            });
            
            resolve(text.trim());
          } catch (parseError) {
            logger.error('Failed to parse alternative response', {
              error: parseError.message,
              rawResponse: data.substring(0, 500),
              statusCode: res.statusCode
            });
            reject(new Error(`Failed to parse response: ${parseError.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`Alternative request failed: ${error.message}`));
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Alternative request timeout'));
      });
      
      req.write(postData);
      req.end();
    });
  }

  async executeLocalOfflineRequest(prompt, imageBase64) {
    const http = require('http');
    const localUrl = process.env.LOCAL_LLM_URL || 'http://127.0.0.1:11434';
    const localModel = process.env.LOCAL_LLM_MODEL || 'llama3.2-vision';

    logger.info('Attempting local offline AI model request', { localUrl, localModel });

    const postData = JSON.stringify({
      model: localModel,
      prompt: prompt,
      images: imageBase64 ? [imageBase64] : [],
      stream: false,
      options: {
        temperature: 0.1
      }
    });

    const parsed = new URL(localUrl.replace(/\/$/, '') + '/api/generate');
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 11434,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 15000
    };

    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              reject(new Error(`Local LLM HTTP ${res.statusCode}: ${data}`));
              return;
            }
            const json = JSON.parse(data);
            resolve(json.response || '');
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Local LLM request timeout'));
      });
      req.write(postData);
      req.end();
    });
  }
}

module.exports = new LLMService();