const logger = require('../core/logger').createServiceLogger('SESSION');
const config = require('../core/config');
const { promptLoader } = require('../../prompt-loader');

class SessionManager {
  constructor() {
    this.sessionMemory = [];
    this.compressionEnabled = true;
    this.maxSize = config.get('session.maxMemorySize');
    this.compressionThreshold = config.get('session.compressionThreshold');
    this.isInitialized = false;

    this.initializeSession();
  }

  async initializeSession() {
    if (this.isInitialized) return;

    try {
      // Keep coding.md loaded so screenshot coding answers can inject the selected language.
      promptLoader.loadPrompts();
      this.isInitialized = true;
      logger.info('Session memory initialized');
    } catch (error) {
      logger.error('Failed to initialize session memory', {
        error: error.message
      });
    }
  }

  /**
   * Add a conversation event with proper role classification
   */
  addConversationEvent({ role, content, action = null, metadata = {} }) {
    const event = this.createConversationEvent({
      role,
      content,
      action: action || this.inferActionFromRole(role),
      metadata
    });
    
    this.sessionMemory.push(event);
    
    logger.debug('Conversation event added', {
      role,
      action: event.action,
      contentLength: content?.length || 0,
      totalEvents: this.sessionMemory.length
    });

    this.performMaintenanceIfNeeded();
    return event.id;
  }

  /**
   * Add user transcription or chat input
   */
  addUserInput(text, source = 'chat') {
    return this.addConversationEvent({
      role: 'user',
      content: text,
      action: source === 'speech' ? 'speech_transcription' : 'chat_input',
      metadata: {
        source,
        textLength: text.length
      }
    });
  }

  /**
   * Add LLM/model response
   */
  addModelResponse(text, metadata = {}) {
    return this.addConversationEvent({
      role: 'model',
      content: text,
      action: 'llm_response',
      metadata: {
        ...metadata,
        responseLength: text.length
      }
    });
  }

  /**
   * Add OCR extracted text
   */
  addOCREvent(extractedText, metadata = {}) {
    return this.addConversationEvent({
      role: 'user',
      content: extractedText,
      action: 'ocr_extraction',
      metadata: {
        ...metadata,
        source: 'screenshot',
        textLength: extractedText.length
      }
    });
  }

  /**
   * Create a conversation event with consistent structure
   */
  createConversationEvent({ role, content, action, metadata = {} }) {
    return {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      role: role, // 'user', 'model', or 'system'
      content,
      action,
      category: this.categorizeAction(action),
      metadata: {
        ...metadata,
        contentLength: content?.length || 0
      },
      contextSummary: this.generateContextSummary(action, { 
        role, 
        content, 
        ...metadata 
      })
    };
  }

  /**
   * Infer action from role
   */
  inferActionFromRole(role) {
    switch (role) {
      case 'user': return 'user_message';
      case 'model': return 'model_response';
      case 'system': return 'system_message';
      default: return 'unknown';
    }
  }

  /**
   * Get conversation history for LLM context
   */
  getConversationHistory(maxEntries = 20) {
    // Get recent conversation events (excluding system initialization)
    const conversationEvents = this.sessionMemory
      .filter(event => event.role !== 'system' || !event.metadata?.isInitialization)
      .slice(-maxEntries);
    
    return conversationEvents.map(event => ({
      role: event.role,
      content: event.content,
      timestamp: event.timestamp,
      action: event.action
    }));
  }

  /**
   * Get the entire conversation history (excluding initialization system messages)
   * This is useful when the model needs complete context for each new message.
   */
  getFullConversationHistory() {
    const conversationEvents = this.sessionMemory
      .filter(event => event.role !== 'system' || !event.metadata?.isInitialization);

    return conversationEvents.map(event => ({
      role: event.role,
      content: event.content,
      timestamp: event.timestamp,
      action: event.action
    }));
  }

  /**
   * Coding-language context for screenshot/code answers.
   * coding.md is only used when the caller asks for a programming language.
   */
  getSkillContext(_skillName = null, programmingLanguage = null) {
    let skillPrompt = null;
    if (programmingLanguage) {
      skillPrompt = promptLoader.getSkillPrompt('coding', programmingLanguage);
    }

    return {
      skillPrompt,
      recentEvents: this.sessionMemory
        .filter(event => !event.metadata?.isInitialization)
        .slice(-10),
      programmingLanguage,
      requiresProgrammingLanguage: !!programmingLanguage
    };
  }

  addEvent(action, details = {}) {
    const event = this.createEvent(action, details);
    this.sessionMemory.push(event);
    
    logger.debug('Session event added', {
      action,
      eventId: event.id,
      totalEvents: this.sessionMemory.length
    });

    this.performMaintenanceIfNeeded();
    return event.id;
  }

  createEvent(action, details) {
    return {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      action,
      category: this.categorizeAction(action),
      primaryContent: this.extractPrimaryContent(action, details),
      metadata: this.extractMetadata(action, details),
      contextSummary: this.generateContextSummary(action, details)
    };
  }

  generateEventId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  categorizeAction(action) {
    const actionLower = (action || '').toLowerCase();
    
    if (actionLower.includes('screenshot') || actionLower.includes('ocr')) {
      return 'capture';
    }
    if (actionLower.includes('speech') || actionLower.includes('transcription')) {
      return 'speech';
    }
    if (actionLower.includes('llm') || actionLower.includes('gemini')) {
      return 'llm';
    }
    if (actionLower.includes('skill') || actionLower.includes('switch')) {
      return 'navigation';
    }
    
    return 'system';
  }

  extractPrimaryContent(action, details) {
    if (details.text && typeof details.text === 'string') {
      return details.text.substring(0, 200);
    }
    if (details.response && typeof details.response === 'string') {
      return details.response.substring(0, 200);
    }
    if (details.preview && typeof details.preview === 'string') {
      return details.preview;
    }
    
    return null;
  }

  extractMetadata(action, details) {
    const metadata = {};
    
    const metadataFields = ['duration', 'size', 'textLength', 'processingTime'];
    metadataFields.forEach(field => {
      if (details[field] !== undefined) {
        metadata[field] = details[field];
      }
    });
    
    return Object.keys(metadata).length > 0 ? metadata : null;
  }

  generateContextSummary(action, details) {
    const role = details.role;

    switch (action) {
      case 'speech_transcription':
        return `User spoke: "${details.content?.substring(0, 50)}..."`;
      case 'chat_input':
        return `User typed: "${details.content?.substring(0, 50)}..."`;
      case 'llm_response':
        return `AI responded (${details.responseLength || details.contentLength} chars)`;
      case 'ocr_extraction':
        return `Screenshot text extracted: ${details.textLength || details.contentLength} characters`;
      case 'user_message':
        return `User: "${details.content?.substring(0, 50)}..."`;
      case 'model_response':
        return `Model: Response (${details.contentLength} chars)`;
      default:
        if (role === 'user') {
          return 'User input';
        } else if (role === 'model') {
          return 'Model response';
        }
        return action || 'Unknown action';
    }
  }

  performMaintenanceIfNeeded() {
    if (this.sessionMemory.length > this.maxSize) {
      this.performMaintenance();
    } else if (this.compressionEnabled && this.sessionMemory.length > this.compressionThreshold) {
      this.compressOldEvents();
    }
  }

  performMaintenance() {
    const beforeCount = this.sessionMemory.length;
    
    this.removeOldSystemEvents();
    this.consolidateSimilarEvents();
    
    const afterCount = this.sessionMemory.length;
    
    logger.info('Session memory maintenance completed', {
      beforeCount,
      afterCount,
      eventsRemoved: beforeCount - afterCount
    });
  }

  removeOldSystemEvents() {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    
    this.sessionMemory = this.sessionMemory.filter(event => {
      const eventTime = new Date(event.timestamp).getTime();
      const shouldKeep = event.category !== 'system' || eventTime > cutoffTime;
      return shouldKeep;
    });
  }

  consolidateSimilarEvents() {
    const groups = this.groupSimilarEvents();
    const consolidated = [];
    
    for (const group of groups) {
      if (group.length === 1) {
        consolidated.push(group[0]);
      } else {
        consolidated.push(this.createConsolidatedEvent(group));
      }
    }
    
    this.sessionMemory = consolidated;
  }

  groupSimilarEvents() {
    const groups = [];
    const processed = new Set();
    
    for (let i = 0; i < this.sessionMemory.length; i++) {
      if (processed.has(i)) continue;
      
      const group = [this.sessionMemory[i]];
      processed.add(i);
      
      for (let j = i + 1; j < this.sessionMemory.length; j++) {
        if (processed.has(j)) continue;
        
        if (this.areEventsSimilar(this.sessionMemory[i], this.sessionMemory[j])) {
          group.push(this.sessionMemory[j]);
          processed.add(j);
        }
      }
      
      groups.push(group);
    }
    
    return groups;
  }

  areEventsSimilar(event1, event2) {
    const timeDiff = Math.abs(
      new Date(event1.timestamp).getTime() - new Date(event2.timestamp).getTime()
    );
    
    return event1.category === event2.category && 
           event1.action === event2.action && 
           timeDiff < 60000; // Within 1 minute
  }

  createConsolidatedEvent(events) {
    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];
    
    return {
      ...firstEvent,
      id: this.generateEventId(),
      timestamp: lastEvent.timestamp,
      contextSummary: `${firstEvent.contextSummary} (${events.length} similar events)`,
      metadata: {
        ...firstEvent.metadata,
        consolidatedCount: events.length,
        timeSpan: {
          start: firstEvent.timestamp,
          end: lastEvent.timestamp
        }
      }
    };
  }

  compressOldEvents() {
    const cutoffTime = Date.now() - (2 * 60 * 60 * 1000); // 2 hours
    
    this.sessionMemory = this.sessionMemory.map(event => {
      const eventTime = new Date(event.timestamp).getTime();
      
      if (eventTime < cutoffTime && event.primaryContent && event.primaryContent.length > 100) {
        return {
          ...event,
          primaryContent: event.primaryContent.substring(0, 100) + '...[compressed]',
          compressed: true
        };
      }
      
      return event;
    });
  }

  getOptimizedHistory() {
    const recent = this.getRecentEvents(10);
    const important = this.getImportantEvents(5);
    const summary = this.generateSessionSummary();
    
    return {
      recent,
      important,
      summary,
      totalEvents: this.sessionMemory.length
    };
  }

  getRecentEvents(count = 10) {
    return this.sessionMemory
      .slice(-count)
      .map(event => ({
        timestamp: event.timestamp,
        action: event.action,
        category: event.category,
        summary: event.contextSummary,
        metadata: event.metadata
      }));
  }

  getImportantEvents(count = 5) {
    return this.sessionMemory
      .filter(event => ['capture', 'llm'].includes(event.category))
      .slice(-count)
      .map(event => ({
        timestamp: event.timestamp,
        category: event.category,
        summary: event.contextSummary,
        content: event.primaryContent?.substring(0, 150) || null
      }));
  }

  generateSessionSummary() {
    const categoryStats = this.getCategoryStatistics();
    const timeSpan = this.getSessionTimeSpan();
    const primaryActivities = this.getPrimaryActivities();
    
    return {
      duration: timeSpan,
      activities: categoryStats,
      focus: primaryActivities,
      eventCount: this.sessionMemory.length
    };
  }

  getCategoryStatistics() {
    const stats = {};
    
    this.sessionMemory.forEach(event => {
      stats[event.category] = (stats[event.category] || 0) + 1;
    });
    
    return stats;
  }

  getSessionTimeSpan() {
    if (this.sessionMemory.length === 0) return null;
    
    const timestamps = this.sessionMemory.map(e => new Date(e.timestamp).getTime());
    const start = Math.min(...timestamps);
    const end = Math.max(...timestamps);
    
    return {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      durationMs: end - start
    };
  }

  getPrimaryActivities() {
    const activities = {};

    this.sessionMemory.forEach(event => {
      const key = event.action || event.category || 'unknown';
      activities[key] = (activities[key] || 0) + 1;
    });

    return Object.entries(activities)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([action, count]) => ({ action, count }));
  }

  clear() {
    const eventCount = this.sessionMemory.length;
    this.sessionMemory = [];
    this.isInitialized = false;

    logger.info('Session memory cleared', { eventCount });

    this.initializeSession();
  }

  getMemoryUsage() {
    const totalSize = JSON.stringify(this.sessionMemory).length;
    
    return {
      eventCount: this.sessionMemory.length,
      approximateSize: `${(totalSize / 1024).toFixed(2)} KB`,
      utilizationPercent: Math.round((this.sessionMemory.length / this.maxSize) * 100)
    };
  }
}

module.exports = new SessionManager();