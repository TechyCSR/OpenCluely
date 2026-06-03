const Groq = require('groq-sdk');
const logger = require('../core/logger').createServiceLogger('LLM');
const config = require('../core/config');
const { promptLoader } = require('../../prompt-loader');

class LLMService {
  constructor() {
    this.clients = [];
    this.currentClientIndex = 0;
    this.isInitialized = false;
    this.requestCount = 0;
    this.errorCount = 0;
    
    this.initializeClient();
  }

  initializeClient() {
    const apiKeyString = config.getApiKey('GROQ') || '';
    const apiKeys = apiKeyString.split(',').map(k => k.trim()).filter(k => k && k !== 'your-api-key-here' && k !== 'your_groq_api_key_here');
    
    if (apiKeys.length === 0) {
      logger.warn('Groq API key not configured', { 
        keyExists: false
      });
      return;
    }

    try {
      this.clients = apiKeys.map(apiKey => new Groq({ apiKey }));
      this.currentClientIndex = 0;
      this.isInitialized = true;
      
      logger.info('Groq AI clients initialized successfully', {
        keyCount: apiKeys.length,
        model: config.get('llm.groq.model')
      });
    } catch (error) {
      logger.error('Failed to initialize Groq clients', { 
        error: error.message 
      });
    }
  }

  getGenerationConfig(overrides = {}) {
    const defaults = config.get('llm.groq.generation') || {};
    const fallback = {
      temperature: 0.4,
      max_tokens: 200,
      top_p: 0.95,
      stop: ["\n\n", "\n-", "\n*", "\n1."]
    };

    const merged = { ...fallback, ...defaults, ...overrides };
    return Object.fromEntries(
      Object.entries(merged).filter(([, value]) => value !== undefined && value !== null)
    );
  }

  /**
   * Process an image directly with Groq (using vision model)
   */
  async processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Groq API key configuration.');
    }

    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
      throw new Error('Invalid image buffer provided to processImageWithSkill');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const { promptLoader } = require('../../prompt-loader');
      const skillPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';
      
      const base64Image = imageBuffer.toString('base64');
      const imageUrl = `data:${mimeType};base64,${base64Image}`;

      const messages = [];

      if (skillPrompt && skillPrompt.trim().length > 0) {
        messages.push({ role: 'system', content: skillPrompt });
      }

      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: this.formatImageInstruction(activeSkill, programmingLanguage) },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      });

      const responseText = await this.executeRequest(messages, true);

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

      if (config.get('llm.groq.fallbackEnabled')) {
        return this.generateFallbackResponse('[image]', activeSkill);
      }
      throw error;
    }
  }

  formatImageInstruction(activeSkill, programmingLanguage) {
    const langNote = programmingLanguage ? ` Use only ${programmingLanguage.toUpperCase()} for any code.` : '';
    return `Analyze this image for a ${activeSkill.toUpperCase()} question. Extract the problem concisely and provide the best possible solution with explanation and final code.${langNote}`;
  }

  async processTextWithSkill(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Groq API key configuration.');
    }

    const startTime = Date.now();
    this.requestCount++;
    
    try {
      logger.info('Processing text with LLM', {
        activeSkill,
        textLength: text.length,
        hasSessionMemory: sessionMemory.length > 0,
        requestId: this.requestCount
      });

      const messages = this.buildGroqRequest(text, activeSkill, sessionMemory, programmingLanguage);
      const responseText = await this.executeRequest(messages);
      
      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(responseText, programmingLanguage)
        : responseText;

      logger.logPerformance('LLM text processing', startTime, {
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
          usedFallback: false
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM processing failed', {
        error: error.message,
        activeSkill,
        requestId: this.requestCount
      });

      if (config.get('llm.groq.fallbackEnabled')) {
        return this.generateFallbackResponse(text, activeSkill);
      }
      
      throw error;
    }
  }

  async processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Groq API key configuration.');
    }

    const startTime = Date.now();
    this.requestCount++;
    
    try {
      logger.info('Processing transcription with intelligent response', {
        activeSkill,
        textLength: text.length,
        requestId: this.requestCount
      });

      const messages = this.buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage);
      const responseText = await this.executeRequest(messages);
      
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
          isTranscriptionResponse: true
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM transcription processing failed', {
        error: error.message,
        activeSkill,
        requestId: this.requestCount
      });

      if (config.get('llm.groq.fallbackEnabled')) {
        return this.generateIntelligentFallbackResponse(text, activeSkill);
      }
      
      throw error;
    }
  }

  enforceProgrammingLanguage(text, programmingLanguage) {
    try {
      if (!text || !programmingLanguage) return text;
      const norm = String(programmingLanguage).toLowerCase();
      const fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      const fenceTag = fenceTagMap[norm] || norm || 'text';

      const replacedBackticks = text.replace(/```([^\n]*)\n/g, (match, info) => {
        const current = (info || '').trim();
        if (current.split(/\s+/)[0].toLowerCase() === fenceTag) return match;
        return '```' + fenceTag + '\n';
      });

      const normalizedTildes = replacedBackticks.replace(/~~~([^\n]*)\n/g, () => '```' + fenceTag + '\n');
      return normalizedTildes;
    } catch (_) {
      return text;
    }
  }

  buildGroqRequest(text, activeSkill, sessionMemory, programmingLanguage) {
    const sessionManager = require('../managers/session.manager');
    
    if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
      const conversationHistory = sessionManager.getConversationHistory(4);
      const skillContext = sessionManager.getSkillContext(activeSkill, programmingLanguage);
      return this.buildGroqRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage);
    }

    const requestComponents = promptLoader.getRequestComponents(
      activeSkill, 
      text, 
      sessionMemory,
      programmingLanguage
    );

    const messages = [];

    if (requestComponents.shouldUseModelMemory && requestComponents.skillPrompt) {
      messages.push({ role: 'system', content: requestComponents.skillPrompt });
    }

    messages.push({ role: 'user', content: this.formatUserMessage(text, activeSkill) });
    return messages;
  }

  buildGroqRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage) {
    const messages = [];
    const sessionManager = require('../managers/session.manager');
    const documentContext = sessionManager.getDocumentContext();

    if (documentContext) {
      messages.push({ role: 'system', content: `## Reference Document Context\n${documentContext}\n\n## FIRST-PERSON RULE\nYou must adopt a first-person persona based on the reference document context provided above. When answering questions, speak directly from the perspective of the document's subject or author. Use "I", "me", "my". Keep your answers extremely concise (not too long, not too short). Do not break character.` });
    }

    if (skillContext.skillPrompt) {
      messages.push({ role: 'system', content: skillContext.skillPrompt });
    }

    const conversationContents = conversationHistory
      .filter(event => event.role !== 'system' && event.content && typeof event.content === 'string' && event.content.trim().length > 0)
      .map(event => ({
        role: event.role === 'model' ? 'assistant' : 'user',
        content: event.content.trim()
      }));

    messages.push(...conversationContents);

    const formattedMessage = this.formatUserMessage(text, activeSkill);
    if (!formattedMessage || formattedMessage.trim().length === 0) {
      throw new Error('Failed to format user message or message is empty');
    }

    messages.push({ role: 'user', content: formattedMessage });
    return messages;
  }

  buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage) {
    const cleanText = text && typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      throw new Error('Empty or invalid transcription text provided');
    }

    const sessionManager = require('../managers/session.manager');
    
    if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
      const conversationHistory = sessionManager.getConversationHistory(4);
      const skillContext = sessionManager.getSkillContext(activeSkill, programmingLanguage);
      return this.buildIntelligentTranscriptionRequestWithHistory(cleanText, activeSkill, conversationHistory, skillContext, programmingLanguage);
    }

    const messages = [];
    const documentContext = sessionManager ? sessionManager.getDocumentContext() : null;
    const intelligentPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage, documentContext);
    
    if (intelligentPrompt) {
      messages.push({ role: 'system', content: intelligentPrompt });
    }

    messages.push({ role: 'user', content: cleanText });
    return messages;
  }

  buildIntelligentTranscriptionRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage) {
    const messages = [];
    const sessionManager = require('../managers/session.manager');
    const documentContext = sessionManager.getDocumentContext();
    const intelligentPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage, documentContext);
    
    if (intelligentPrompt) {
      messages.push({ role: 'system', content: intelligentPrompt });
    }

    const conversationContents = conversationHistory
      .filter(event => event.role !== 'system' && event.content && typeof event.content === 'string' && event.content.trim().length > 0)
      .slice(-4)
      .map(event => ({
        role: event.role === 'model' ? 'assistant' : 'user',
        content: event.content.trim()
      }));

    messages.push(...conversationContents);

    const cleanText = text && typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      throw new Error('Empty or invalid transcription text provided');
    }

    messages.push({ role: 'user', content: cleanText });
    return messages;
  }

  getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage, documentContext = null) {
    let prompt = `# Intelligent Transcription Response System

You are acting as an AI assistant for an interviewee during a live interview. 
The transcription you receive will contain BOTH the interviewer's questions AND the interviewee's (my) voice.
CRITICAL INSTRUCTION: You must ONLY respond to the interviewer's questions. If the transcription contains the interviewee (me) answering a question or making a statement, IGNORE IT and do not reply. Do not try to answer my own answers!

## Brevity & Speed Rule
You MUST keep your answers extremely concise. Respond with exactly 1 to 3 short sentences. DO NOT provide long explanations, lists, or pleasantries unless specifically asked. Short answers ensure the response is generated instantly, which is crucial for a live interview.`;

    if (documentContext) {
      prompt += `\n\n## Reference Document Context\n${documentContext}\n\n## FIRST-PERSON RULE\nYou must adopt a first-person persona based on the reference document context provided above. Speak directly from the perspective of the document's subject or author. Use "I", "me", "my". Do not break character.`;
    }

    if (programmingLanguage) {
      const lang = String(programmingLanguage).toLowerCase();
      const languageMap = { cpp: 'C++', c: 'C', python: 'Python', java: 'Java', javascript: 'JavaScript', js: 'JavaScript' };
      const fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      const languageTitle = languageMap[lang] || (lang.charAt(0).toUpperCase() + lang.slice(1));
      const fenceTag = fenceTagMap[lang] || lang || 'text';
      prompt += `\n\nCODING CONTEXT: If writing code, respond ONLY in ${languageTitle}. All code blocks must use triple backticks with language tag \`\`\`${fenceTag}\`\`\`.`;
    }

    prompt += `

## Final Response Rules:
1. Always be conversational, casual, and direct. You MUST use natural human filler words (e.g., 'so', 'just', 'like', 'you know', 'actually', 'well') so it sounds like an unscripted, off-the-cuff verbal response. Do NOT sound like you are reading a textbook.
2. NEVER provide long, detailed responses. Keep it to 1-3 short sentences.
3. If the user asks a coding question, provide a very concise explanation or a brief snippet, but do not write an essay.
4. Remember: DO NOT answer statements made by the interviewee (me). Only answer the interviewer's questions.`;

    return prompt;
  }

  formatUserMessage(text, activeSkill) {
    return `Context: ${activeSkill.toUpperCase()} analysis request\n\nText to analyze:\n${text}`;
  }

  async executeRequest(messages, isVision = false) {
    // Fast model rotation pool — each model has independent rate limits on Groq free tier
    const modelPool = isVision
      ? ['llama-3.2-11b-vision-preview']
      : ['llama-3.1-8b-instant', 'llama3-8b-8192', 'gemma2-9b-it', 'llama-3.3-70b-versatile'];

    const payload = {
      messages,
      model: modelPool[0],
      ...this.getGenerationConfig()
    };

    let lastError = null;

    // Try each model instantly on rate limit — zero delay rotation
    for (let i = 0; i < modelPool.length; i++) {
      payload.model = modelPool[i];
      
      // Try each API key for the current model
      for (let j = 0; j < this.clients.length; j++) {
        const clientIndex = (this.currentClientIndex + j) % this.clients.length;
        const currentClient = this.clients[clientIndex];
        
        try {
          const response = await currentClient.chat.completions.create(payload);
          
          if (!response.choices || response.choices.length === 0) {
            throw new Error('Empty response from Groq API');
          }

          // Advance the starting index for the next global request to distribute load, or stay. We'll stay to maximize usage till rate limit.
          this.currentClientIndex = clientIndex;
          
          return response.choices[0].message.content;
        } catch (error) {
          lastError = error;
          const errorInfo = this.analyzeError(error);
          
          logger.warn(`Groq model ${payload.model} failed on API key index ${clientIndex}`, {
            error: error.message,
            errorType: errorInfo.type,
            model: payload.model,
            keyIndex: clientIndex
          });

          // If rate limited, instantly try next key for the SAME model
          if (errorInfo.type === 'RATE_LIMIT_ERROR') {
            continue; 
          }
          
          // If auth error (e.g. invalid key), instantly try next key
          if (errorInfo.type === 'AUTH_ERROR') {
            continue;
          }
          
          // For other errors (like model decommissioned), break inner loop to move to next model
          break; 
        }
      }
      
      // If we got here, all keys for this model failed. 
      if (lastError) {
        const errorInfo = this.analyzeError(lastError);
        
        // If rate limited across all keys, switch model instantly
        if (errorInfo.type === 'RATE_LIMIT_ERROR' && i < modelPool.length - 1) {
          logger.info(`Rate limited across all keys for ${payload.model}, instantly switching to ${modelPool[i + 1]}`);
          continue;
        }

        // If it's the last model, we throw
        if (i === modelPool.length - 1) {
          throw new Error(`All Groq models and keys exhausted: ${lastError.message}`);
        }

        // Small delay for network errors etc
        if (errorInfo.type !== 'RATE_LIMIT_ERROR') {
          const delay = 1000 + Math.random() * 500;
          await this.delay(delay);
        }
      }
    }
    
    throw new Error(`All Groq models and keys exhausted. Last error: ${lastError ? lastError.message : 'Unknown'}`);
  }

  async performPreflightCheck() {
    try {
      await this.testNetworkConnection({ 
        host: 'api.groq.com', 
        port: 443, 
        name: 'Groq API Endpoint' 
      });
    } catch (error) {
      logger.warn('Preflight check failed', { error: error.message });
    }
  }

  analyzeError(error) {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('fetch failed') || errorMessage.includes('network error') || errorMessage.includes('timeout')) {
      return { type: 'NETWORK_ERROR', isNetworkError: true };
    }
    
    if (errorMessage.includes('unauthorized') || errorMessage.includes('invalid api key')) {
      return { type: 'AUTH_ERROR', isNetworkError: false };
    }
    
    if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
      return { type: 'RATE_LIMIT_ERROR', isNetworkError: false };
    }
    
    return { type: 'UNKNOWN_ERROR', isNetworkError: false };
  }

  async checkNetworkConnectivity() {
    const connectivityTests = [
      { host: 'google.com', port: 443, name: 'Google (HTTPS)' },
      { host: 'api.groq.com', port: 443, name: 'Groq API Endpoint' }
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
    const fallbackResponses = {
      'dsa': 'This appears to be a data structures and algorithms problem. Consider breaking it down into smaller components and identifying the appropriate algorithm or data structure to use.',
      'system-design': 'For this system design question, consider scalability, reliability, and the trade-offs between different architectural approaches.',
      'programming': 'This looks like a programming challenge. Focus on understanding the requirements, edge cases, and optimal time/space complexity.',
      'default': 'I can help analyze this content. Please ensure your Groq API key is properly configured for detailed analysis.'
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
    const response = `Yeah, I'm listening. Ask your question relevant to ${activeSkill}.`;
    return {
      response,
      metadata: {
        skill: activeSkill,
        processingTime: 0,
        requestId: this.requestCount,
        usedFallback: true,
        isTranscriptionResponse: true
      }
    };
  }

  async testConnection() {
    if (!this.isInitialized || !this.clients || this.clients.length === 0) {
      return { success: false, error: 'Service not initialized' };
    }

    try {
      const startTime = Date.now();
      const currentClient = this.clients[this.currentClientIndex];
      const response = await currentClient.chat.completions.create({
        messages: [{ role: 'user', content: 'Test connection. Please respond with "OK".' }],
        model: config.get('llm.groq.model') || 'llama-3.3-70b-versatile',
        max_tokens: 10
      });
      const latency = Date.now() - startTime;
      
      return { 
        success: true, 
        response: response.choices[0].message.content,
        latency
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message
      };
    }
  }

  updateApiKey(newApiKey) {
    process.env.GROQ_API_KEY = newApiKey;
    this.isInitialized = false;
    this.initializeClient();
  }

  getStats() {
    return {
      isInitialized: this.isInitialized,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 0,
      config: config.get('llm.groq')
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new LLMService();