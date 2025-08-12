const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Screenshot and OCR
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  
  // Speech recognition
  startSpeechRecognition: () => ipcRenderer.invoke('start-speech-recognition'),
  stopSpeechRecognition: () => ipcRenderer.invoke('stop-speech-recognition'),
  getSpeechAvailability: () => ipcRenderer.invoke('get-speech-availability'),
  
  // Window management
  showAllWindows: () => ipcRenderer.invoke('show-all-windows'),
  hideAllWindows: () => ipcRenderer.invoke('hide-all-windows'),
  enableWindowInteraction: () => ipcRenderer.invoke('enable-window-interaction'),
  disableWindowInteraction: () => ipcRenderer.invoke('disable-window-interaction'),
  switchToChat: () => ipcRenderer.invoke('switch-to-chat'),
  switchToSkills: () => ipcRenderer.invoke('switch-to-skills'),
  resizeWindow: (width, height) => ipcRenderer.invoke('resize-window', { width, height }),
  moveWindow: (deltaX, deltaY) => ipcRenderer.invoke('move-window', { deltaX, deltaY }),
  getWindowStats: () => ipcRenderer.invoke('get-window-stats'),
  
  // Session memory
  getSessionHistory: () => ipcRenderer.invoke('get-session-history'),
  getLLMSessionHistory: () => ipcRenderer.invoke('get-llm-session-history'),
  clearSessionMemory: () => ipcRenderer.invoke('clear-session-memory'),
  formatSessionHistory: () => ipcRenderer.invoke('format-session-history'),
  sendChatMessage: (text) => ipcRenderer.invoke('send-chat-message', text),
  getSkillPrompt: (skillName) => ipcRenderer.invoke('get-skill-prompt', skillName),
  
  // Gemini LLM configuration
  setGeminiApiKey: (apiKey) => ipcRenderer.invoke('set-gemini-api-key', apiKey),
  getGeminiStatus: () => ipcRenderer.invoke('get-gemini-status'),
  testGeminiConnection: () => ipcRenderer.invoke('test-gemini-connection'),
  
  // Settings
  showSettings: () => ipcRenderer.invoke('show-settings'),
  hideSettings: () => ipcRenderer.invoke('hide-settings'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  updateAppIcon: (iconKey) => ipcRenderer.invoke('update-app-icon', iconKey),
  updateActiveSkill: (skill) => ipcRenderer.invoke('update-active-skill', skill),
  restartAppForStealth: () => ipcRenderer.invoke('restart-app-for-stealth'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  quit: () => {
    try {
      ipcRenderer.send('quit-app');
      // Also try the app quit method
      setTimeout(() => {
        require('electron').app.quit();
      }, 100);
    } catch (error) {
      console.error('Error in quit:', error);
    }
  },
  
  // LLM window specific methods
  expandLlmWindow: (contentMetrics) => ipcRenderer.invoke('expand-llm-window', contentMetrics),
  resizeLlmWindowForContent: (contentMetrics) => ipcRenderer.invoke('resize-llm-window-for-content', contentMetrics),

  // Clipboard helper for reliable copy actions
  copyToClipboard: (text) => {
    try {
      return ipcRenderer.invoke('copy-to-clipboard', String(text ?? ''));
    } catch (e) {
      console.error('copyToClipboard failed:', e);
      return false;
    }
  },
  
  // Display management
  listDisplays: () => ipcRenderer.invoke('list-displays'),
  captureArea: (options) => ipcRenderer.invoke('capture-area', options),
  
  // Event listeners
  onTranscriptionReceived: (callback) => ipcRenderer.on('transcription-received', callback),
  onInterimTranscription: (callback) => ipcRenderer.on('interim-transcription', callback),
  onSpeechStatus: (callback) => ipcRenderer.on('speech-status', callback),
  onSpeechError: (callback) => ipcRenderer.on('speech-error', callback),
  onSpeechAvailability: (callback) => ipcRenderer.on('speech-availability', callback),
  onSessionEvent: (callback) => ipcRenderer.on('session-event', callback),
  onSessionCleared: (callback) => ipcRenderer.on('session-cleared', callback),
  onOcrCompleted: (callback) => ipcRenderer.on('ocr-completed', callback),
  onOcrError: (callback) => ipcRenderer.on('ocr-error', callback),
  onLlmResponse: (callback) => ipcRenderer.on('llm-response', callback),
  onLlmError: (callback) => ipcRenderer.on('llm-error', callback),
  onTranscriptionLlmResponse: (callback) => ipcRenderer.on('transcription-llm-response', callback),
  onOpenGeminiConfig: (callback) => ipcRenderer.on('open-gemini-config', callback),
  onDisplayLlmResponse: (callback) => ipcRenderer.on('display-llm-response', callback),
  onShowLoading: (callback) => ipcRenderer.on('show-loading', callback),
  onSkillChanged: (callback) => ipcRenderer.on('skill-changed', callback),
  onInteractionModeChanged: (callback) => ipcRenderer.on('interaction-mode-changed', callback),
  onRecordingStarted: (callback) => ipcRenderer.on('recording-started', callback),
  onRecordingStopped: (callback) => ipcRenderer.on('recording-stopped', callback),
  onCodingLanguageChanged: (callback) => ipcRenderer.on('coding-language-changed', callback),
  
  // Generic receive method
  receive: (channel, callback) => ipcRenderer.on(channel, callback),
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
})

contextBridge.exposeInMainWorld('api', {
    send: (channel, data) => {
        let validChannels = [
            'close-settings',
            'quit-app',
            'save-settings',
            'toggle-recording',
            'toggle-interaction-mode',
            'update-skill',
            'window-loaded'
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        } else {
            console.warn('Invalid IPC channel:', channel);
        }
    },
    receive: (channel, func) => {
        let validChannels = [
            'load-settings',
            'recording-state-changed',
            'interaction-mode-changed',
            'skill-updated',
            'update-skill',
            'recording-started',
            'recording-stopped'
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    }
});