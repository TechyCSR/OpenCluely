// Simple logger for renderer process
const logger = {
    info: (...args) => console.log('[MainWindowUI]', ...args),
    debug: (...args) => console.log('[MainWindowUI DEBUG]', ...args),
    error: (...args) => console.error('[MainWindowUI ERROR]', ...args),
    warn: (...args) => console.warn('[MainWindowUI WARN]', ...args)
};

class MainWindowUI {
    constructor() {
        this.isInteractive = false;
        this.isHidden = false;
        this.statusDot = null;
        this.micButton = null;
        this.isRecording = false;
        this.speechAvailable = false; // track availability
        // Renderer-side audio capture state (used for Whisper on Windows)
        this._audioContext = null;
        this._mediaStream = null;
        this._scriptNode = null;
        this._captureInterval = null;
        this._loopbackStream = null;
        this._loopbackAudioContext = null;
        this._loopbackScriptNode = null;
        this._loopbackSourceNode = null;

        this.init();
    }

    async init() {
        try {
            this.setupElements();
            this.setupEventListeners();

            await this.loadCurrentInteractionState();
            await this.loadSpeechAvailability();

            this.updateAllElementStates();
            this.resizeWindowToContent();

            logger.info('Main window UI initialized', {
                component: 'MainWindowUI',
                interactive: this.isInteractive
            });

            // Notify the main process that the overlay renderer is ready
            // so it can push the latest speech availability state.
            if (window.electronAPI && window.electronAPI.notifyMainWindowReady) {
                window.electronAPI.notifyMainWindowReady();
            }
            
        } catch (error) {
            logger.error('Failed to initialize main window UI', {
                component: 'MainWindowUI',
                error: error.message
            });
        }
    }

    async loadCurrentInteractionState() {
        try {
            // Request current interaction state from main process
            if (window.electronAPI && window.electronAPI.getWindowStats) {
                const stats = await window.electronAPI.getWindowStats();
                if (stats && typeof stats.isInteractive === 'boolean') {
                    this.isInteractive = stats.isInteractive;
                    logger.debug('Loaded current interaction state', {
                        component: 'MainWindowUI',
                        interactive: this.isInteractive
                    });
                }
            }
        } catch (error) {
            // If we can't get the state, assume non-interactive (safer default)
            this.isInteractive = false;
            logger.warn('Failed to load current interaction state, defaulting to non-interactive', {
                component: 'MainWindowUI',
                error: error.message
            });
        }
    }

    async loadSpeechAvailability() {
        try {
            if (window.electronAPI && window.electronAPI.getSpeechAvailability) {
                this.speechAvailable = await window.electronAPI.getSpeechAvailability();
                this.applyMicVisibility();
            }
        } catch (e) {
            this.speechAvailable = false;
            this.applyMicVisibility();
        }
    }

    applyMicVisibility() {
        if (this.micButton) {
            if (this.speechAvailable) {
                this.micButton.style.display = '';
            } else {
                this.micButton.style.display = 'none';
            }
            // Resize to reflect layout change
            setTimeout(() => this.resizeWindowToContent(), 50);
        }
    }

    updateAllElementStates() {
        this.updateStatusDot();
        this.updateMicButtonState();
        this.updateSettingsIndicatorState();
    }

    updateStatusDot() {
        if (this.statusDot) {
            logger.debug('Updating status dot', {
                component: 'MainWindowUI',
                isInteractive: this.isInteractive,
                currentClasses: this.statusDot.className
            });
            
            // Remove both classes first
            this.statusDot.classList.remove('interactive', 'non-interactive');
            
            // Add the appropriate class
            if (this.isInteractive) {
                this.statusDot.classList.add('interactive');
            } else {
                this.statusDot.classList.add('non-interactive');
            }
            
            logger.debug('Status dot updated', {
                component: 'MainWindowUI',
                interactive: this.isInteractive,
                newClasses: this.statusDot.className
            });
        } else {
            logger.error('Status dot element not found');
        }
    }

    updateMicButtonState() {
        if (this.micButton) {
            // Also hide when unavailable
            this.applyMicVisibility();
            // Remove both classes first
            this.micButton.classList.remove('interactive', 'non-interactive');
            
            // Add the appropriate class
            if (this.isInteractive) {
                this.micButton.classList.add('interactive');
            } else {
                this.micButton.classList.add('non-interactive');
            }
            
            // Update button state
            this.micButton.disabled = !this.isInteractive;
            
            logger.debug('Mic button state updated', {
                component: 'MainWindowUI',
                interactive: this.isInteractive,
                disabled: !this.isInteractive
            });
        }
    }

    updateSettingsIndicatorState() {
        if (this.settingsIndicator) {
            // Remove both classes first
            this.settingsIndicator.classList.remove('interactive', 'non-interactive');
            
            // Add the appropriate class
            if (this.isInteractive) {
                this.settingsIndicator.classList.add('interactive');
            } else {
                this.settingsIndicator.classList.add('non-interactive');
            }
            
            logger.debug('Settings indicator state updated', {
                component: 'MainWindowUI',
                interactive: this.isInteractive
            });
        } else {
            logger.debug('Settings indicator not found, skipping state update');
        }
    }

    resizeWindowToContent() {
        // Wait for DOM to fully render
        setTimeout(() => {
            const commandTab = document.querySelector('.command-tab');
            if (commandTab && window.electronAPI && window.electronAPI.resizeWindow) {
                const rect = commandTab.getBoundingClientRect();
                const width = Math.ceil(rect.width);
                const height = Math.ceil(rect.height);
                
                logger.debug('Resizing window to content', {
                    width,
                    height,
                    component: 'MainWindowUI'
                });
                
                window.electronAPI.resizeWindow(width, height);
            }
        }, 100);
    }

    setupElements() {
        this.statusDot = document.getElementById('statusDot');
        this.modeLabel = document.getElementById('modeLabel');
        this.interviewHint = document.getElementById('interviewHint');
        this.settingsIndicator = document.getElementById('settingsIndicator'); // Optional
        this.micButton = document.getElementById('micButton');
        this.interviewButton = document.getElementById('interviewButton');

        this.screenshotButton = document.getElementById('screenshotButton')
            || (document.querySelectorAll('.command-item') && document.querySelectorAll('.command-item')[0]);

        if (!this.statusDot || !this.screenshotButton || !this.interviewButton) {
            throw new Error('Required UI elements not found');
        }

        this.screenshotButton.addEventListener('click', () => {
            if (this.isInteractive && window.electronAPI && window.electronAPI.takeScreenshot) {
                window.electronAPI.takeScreenshot();
            }
        });

        if (this.settingsIndicator) {
            this.settingsIndicator.addEventListener('click', () => {
                if (this.isInteractive) {
                    this.showSettingsMenu();
                }
            });
        }

        if (this.interviewButton) {
            this.interviewButton.addEventListener('click', async () => {
                if (!this.isInteractive || !window.electronAPI || !window.electronAPI.toggleInterviewMode) {
                    return;
                }
                try {
                    const payload = await window.electronAPI.toggleInterviewMode();
                    this.updateInterviewButton(payload);
                } catch (error) {
                    logger.error('Interview Mode toggle failed', {
                        component: 'MainWindowUI',
                        error: error.message
                    });
                }
            });
        }

        if (this.micButton) this.micButton.addEventListener('click', async () => {
            if (this.isInteractive && this.speechAvailable) {
                try {
                    if (this.isRecording) {
                        await window.electronAPI.stopSpeechRecognition();
                    } else {
                        await window.electronAPI.startSpeechRecognition();
                    }
                } catch (error) {
                    logger.error('Speech recognition toggle failed', {
                        component: 'MainWindowUI',
                        error: error.message
                    });
                    this.isRecording = false;
                    this.updateMicButtonState();
                }
            } else if (this.isInteractive && !this.speechAvailable) {
                logger.warn('Mic clicked but speech recognition is not available', {
                    component: 'MainWindowUI'
                });
                this.loadSpeechAvailability();
            }
        });

        // Language dropdown
        this.languageSelect = document.getElementById('codingLanguage');
        if (this.languageSelect) {
            this.languageSelect.value = 'java';
            if (window.electronAPI && window.electronAPI.getSettings) {
                window.electronAPI.getSettings().then(settings => {
                    if (settings && settings.codingLanguage) {
                        this.languageSelect.value = settings.codingLanguage;
                    }
                }).catch(() => {});
            }

            const saveLanguage = () => {
                const lang = this.languageSelect.value;
                if (window.electronAPI && window.electronAPI.saveSettings) {
                    window.electronAPI.saveSettings({ codingLanguage: lang });
                }
                setTimeout(() => {
                    const commandTab = document.querySelector('.command-tab');
                    if (commandTab && window.electronAPI && window.electronAPI.resizeWindow) {
                        const rect = commandTab.getBoundingClientRect();
                        window.electronAPI.resizeWindow(Math.ceil(rect.width), Math.ceil(rect.height));
                    }
                }, 50);
            };
            this.languageSelect.addEventListener('change', saveLanguage);
            this.languageSelect.addEventListener('blur', saveLanguage);
        }
    }

    setupEventListeners() {
        if (window.electronAPI) {
            // Fix interaction mode change listener
            window.electronAPI.onInteractionModeChanged((event, interactive) => {
                logger.debug('Interaction mode changed received:', interactive);
                this.handleInteractionModeChanged(interactive);
            });

            window.electronAPI.onRecordingStarted((_event, payload) => {
                this.handleRecordingStarted(payload);
            });

            if (window.electronAPI.onInterviewUpdate) {
                window.electronAPI.onInterviewUpdate((_event, payload) => {
                    this.updateInterviewButton(payload);
                });
            }

            window.electronAPI.onRecordingStopped(() => {
                this.handleRecordingStopped();
            });

            window.electronAPI.onSpeechAvailability((event, data) => {
                this.speechAvailable = !!(data && data.available);
                this.applyMicVisibility();
            });

            // Listen for coding language changes from other windows
            window.electronAPI.onCodingLanguageChanged((event, data) => {
                if (data && data.language && this.languageSelect) {
                    // avoid clobbering if same value
                    if (this.languageSelect.value !== data.language) {
                        this.languageSelect.value = data.language;
                    }
                    logger.debug('Language updated from other window', {
                        component: 'MainWindowUI',
                        language: data.language
                    });
                }
            });

            // Listen for main window shown event to refresh speech availability
            window.electronAPI.onMainWindowShown(() => {
                logger.debug('Main window shown - refreshing speech availability', {
                    component: 'MainWindowUI'
                });
                this.loadSpeechAvailability();
            });
            
            // Global keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.altKey && e.key === 'r' && this.isInteractive) {
                    e.preventDefault();
                    if (!this.speechAvailable) return; // guard when unavailable
                    if (this.isRecording) {
                        window.electronAPI.stopSpeechRecognition();
                    } else {
                        window.electronAPI.startSpeechRecognition();
                    }
                }
            });
        }
        
        // Also listen via the api interface for backup
        if (window.api) {
            
            window.api.receive('interaction-mode-changed', (interactive) => {
                logger.debug('Interaction mode changed via api:', interactive);
                this.handleInteractionModeChanged(interactive);
            });
        } else {
            logger.error('window.api not available - event listeners not set up!');
        }
        
        // Keyboard shortcuts
        this.setupKeyboardShortcuts();
        
        // Settings shortcut
        this.setupSettingsShortcut();
    }

    handleLLMResponse(data) {
        logger.info('LLM response received', {
            component: 'MainWindowUI',
            intentMode: data && data.metadata && data.metadata.intentMode
        });
    }

    handleLLMError(data) {
        logger.error('LLM error received', {
            component: 'MainWindowUI',
            error: data.error
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.metaKey && e.key === '\\') {
                this.isHidden = !this.isHidden;
                if (this.isHidden) {
                    this.showHiddenIndicator();
                }
            }
            
            if (e.metaKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                if (!this.isInteractive) {
                    this.moveWindow(e.key);
                }
            }
            
            // Alt+A is handled globally by the main process
            // No need to handle it here since it needs to work even when windows are non-interactive
        });
    }

    handleInteractionModeChanged(interactive) {
        logger.info('Handling interaction mode change', {
            component: 'MainWindowUI',
            newState: interactive,
            previousState: this.isInteractive
        });
        
        // Update the internal state
        this.isInteractive = interactive;
        
        this.updateAllElementStates();

        logger.info('Interaction mode change completed', {
            component: 'MainWindowUI',
            interactive: this.isInteractive,
            statusDotClass: this.statusDot ? this.statusDot.className : 'not found'
        });
    }

    handleScreenshotRequest() {
        logger.debug('Screenshot request received', { component: 'MainWindowUI' });
    }

    updateInterviewButton(payload) {
        if (!this.interviewButton) {
            return;
        }
        const on = !!(payload && payload.enabled);
        this.interviewButton.classList.toggle('interview-on', on);
        document.body.classList.toggle('interview-hud', on);
        const state = payload && payload.state ? payload.state : 'off';
        const labels = {
            listening: 'Listening',
            thinking: 'Thinking',
            answering: 'Answering',
            speaking: 'Answering'
        };
        if (this.modeLabel) {
            this.modeLabel.textContent = on ? (labels[state] || 'Listening') : 'Idle';
        }
        if (this.interviewHint) {
            this.interviewHint.textContent = on ? 'Space' : 'F8';
        }
        this.interviewButton.title = on
            ? `Interview Mode ${state} (F8 to exit)`
            : 'Interview Mode (F8)';
        this.resizeWindowToContent();
    }

    handleRecordingStarted(payload) {
        this.isRecording = true;
        if (this.micButton) {
            this.micButton.classList.add('recording');
        }
        // On Windows and macOS, Whisper audio is captured here in the renderer
        // (Web Audio API) rather than the main process: Windows lacks sox/rec/
        // arecord, and macOS avoids an unbundled Homebrew `sox`. Must match the
        // main process's useRendererCapture gate (speech.service.js). Linux uses
        // the native recorder. navigator.userAgentData is preferred when present
        // since navigator.platform is deprecated.
        const platform = (typeof navigator !== 'undefined' &&
          ((navigator.userAgentData && navigator.userAgentData.platform) ||
            navigator.platform || '')).toLowerCase();
        const useRendererCapture = platform.includes('win') || platform.includes('mac');
        const source = payload && payload.source;
        // Interview loopback runs in a dedicated hidden window so it is not
        // killed when F8 hides this overlay (content protection + throttling).
        if (source === 'loopback') {
            logger.debug('Recording started (loopback owned by capture window)', { component: 'MainWindowUI' });
            return;
        }
        if (useRendererCapture) {
            this._startRendererAudioCapture();
        }
        logger.debug('Recording started', { component: 'MainWindowUI', source: source || 'mic' });
    }

    handleRecordingStopped() {
        this.isRecording = false;
        if (this.micButton) {
            this.micButton.classList.remove('recording');
        }
        this._stopRendererAudioCapture();
        logger.debug('Recording stopped', { component: 'MainWindowUI' });
    }

    _resampleFloatToPcm16(inputFloat, inputRate, outRate) {
        const inLen = inputFloat.length;
        if (!inLen) return new Int16Array(0);
        const toInt16 = (sample) => {
            const s = Math.max(-1, Math.min(1, sample));
            return s < 0 ? s * 0x8000 : s * 0x7FFF;
        };
        if (inputRate === outRate) {
            const out = new Int16Array(inLen);
            for (let i = 0; i < inLen; i++) {
                out[i] = toInt16(inputFloat[i]);
            }
            return out;
        }
        const outCount = Math.max(1, Math.round(inLen * outRate / inputRate));
        const out = new Int16Array(outCount);
        const ratio = inputRate / outRate;
        for (let i = 0; i < outCount; i++) {
            const src = i * ratio;
            const i0 = Math.min(inLen - 1, Math.floor(src));
            const i1 = Math.min(inLen - 1, i0 + 1);
            const frac = src - i0;
            out[i] = toInt16(inputFloat[i0] * (1 - frac) + inputFloat[i1] * frac);
        }
        return out;
    }

    async _startInterviewLoopbackCapture() {
        this._stopRendererAudioCapture();
        try {
            const micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            this._mediaStream = micStream;
        } catch (error) {
            logger.warn('Interview mic keep-alive failed', {
                component: 'MainWindowUI',
                error: error.message
            });
        }

        try {
            const loopback = await this._openLoopbackStream();
            this._loopbackStream = loopback;
            this._pipeStreamToPcm(loopback, 'loopback');
            logger.info('Loopback capture started', { component: 'MainWindowUI' });
        } catch (error) {
            logger.error('Loopback capture failed; not sending mic to STT', {
                component: 'MainWindowUI',
                error: error.message
            });
        }
    }

    async _openLoopbackStream() {
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: { width: 16, height: 16, frameRate: 1 },
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false,
                        channelCount: 1
                    }
                });
                if (stream.getAudioTracks().length) {
                    stream.getVideoTracks().forEach((track) => { track.enabled = false; });
                    return stream;
                }
                stream.getTracks().forEach((track) => track.stop());
            } catch (error) {
                logger.warn('getDisplayMedia loopback failed, trying desktop capture', {
                    component: 'MainWindowUI',
                    error: error.message
                });
            }
        }

        const sourceId = window.electronAPI.getLoopbackSourceId
            ? await window.electronAPI.getLoopbackSourceId()
            : null;
        if (!sourceId) {
            throw new Error('no desktop source for loopback');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId
                }
            },
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId,
                    maxWidth: 16,
                    maxHeight: 16
                }
            }
        });
        stream.getVideoTracks().forEach((track) => { track.enabled = false; });
        if (!stream.getAudioTracks().length) {
            stream.getTracks().forEach((track) => track.stop());
            throw new Error('desktop capture had no audio track');
        }
        return stream;
    }

    _pipeStreamToPcm(stream, source) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const audioContext = new AudioCtx({ sampleRate: 16000 });
        this._loopbackAudioContext = audioContext;
        const nativeRate = audioContext.sampleRate || 16000;
        const sourceNode = audioContext.createMediaStreamSource(stream);
        const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
        this._loopbackScriptNode = scriptNode;
        this._loopbackSourceNode = sourceNode;

        scriptNode.onaudioprocess = (event) => {
            if (!this.isRecording || !window.electronAPI || !window.electronAPI.sendAudioChunk) {
                return;
            }
            const inputData = event.inputBuffer.getChannelData(0);
            const pcm16 = this._resampleFloatToPcm16(inputData, nativeRate, 16000);
            if (pcm16 && pcm16.byteLength) {
                window.electronAPI.sendAudioChunk(pcm16.buffer, source);
            }
        };

        const mute = audioContext.createGain();
        mute.gain.value = 0;
        sourceNode.connect(scriptNode);
        scriptNode.connect(mute);
        mute.connect(audioContext.destination);
    }

    /**
     * Capture microphone audio in the renderer using the Web Audio API.
     * This is used for Whisper on Windows where node-record-lpcm16's sox/rec
     * dependencies are unavailable.
     */
    async _startRendererAudioCapture() {
        try {
            this._stopRendererAudioCapture();

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: { ideal: 16000 }
                }
            });
            this._mediaStream = stream;

            const audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });
            this._audioContext = audioContext;

            const source = audioContext.createMediaStreamSource(stream);
            const bufferSize = 4096;
            const scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
            this._scriptNode = scriptNode;

            scriptNode.onaudioprocess = (event) => {
                if (!this.isRecording || !window.electronAPI || !window.electronAPI.sendAudioChunk) {
                    return;
                }
                const inputData = event.inputBuffer.getChannelData(0);
                const pcm16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                window.electronAPI.sendAudioChunk(pcm16.buffer);
            };

            source.connect(scriptNode);
            scriptNode.connect(audioContext.destination);

            logger.info('Renderer audio capture started', { component: 'MainWindowUI' });
        } catch (error) {
            logger.error('Failed to start renderer audio capture', {
                component: 'MainWindowUI',
                error: error.message
            });
            // Notify main process so it can stop the recording state
            try {
                await window.electronAPI.stopSpeechRecognition();
            } catch (_) { /* ignore */ }
        }
    }

    _stopRendererAudioCapture() {
        try {
            if (this._scriptNode) {
                this._scriptNode.disconnect();
                this._scriptNode.onaudioprocess = null;
                this._scriptNode = null;
            }
            if (this._loopbackScriptNode) {
                this._loopbackScriptNode.disconnect();
                this._loopbackScriptNode.onaudioprocess = null;
                this._loopbackScriptNode = null;
            }
            if (this._loopbackSourceNode) {
                try { this._loopbackSourceNode.disconnect(); } catch (_) {}
                this._loopbackSourceNode = null;
            }
            if (this._loopbackStream) {
                this._loopbackStream.getTracks().forEach((track) => track.stop());
                this._loopbackStream = null;
            }
            if (this._loopbackAudioContext) {
                this._loopbackAudioContext.close().catch(() => {});
                this._loopbackAudioContext = null;
            }
            if (this._mediaStream) {
                this._mediaStream.getTracks().forEach((track) => track.stop());
                this._mediaStream = null;
            }
            if (this._audioContext) {
                this._audioContext.close().catch(() => {});
                this._audioContext = null;
            }
            if (this._captureInterval) {
                clearInterval(this._captureInterval);
                this._captureInterval = null;
            }
        } catch (error) {
            logger.error('Error stopping renderer audio capture', {
                component: 'MainWindowUI',
                error: error.message
            });
        }
    }

    showHiddenIndicator() {
        const indicator = document.querySelector('.hidden-indicator');
        if (indicator) {
            indicator.classList.add('show');
            setTimeout(() => {
                indicator.classList.remove('show');
            }, 3000);
        }
    }

    toggleInteractiveMode() {
        this.isInteractive = !this.isInteractive;
        this.updateAllElementStates();
        
        logger.debug('Interactive mode toggled', {
            component: 'MainWindowUI',
            interactive: this.isInteractive
        });
    }

    moveWindow(direction) {
        const moveDistance = 20; // pixels
        
        if (window.electronAPI && window.electronAPI.moveWindow) {
            let deltaX = 0, deltaY = 0;
            
            switch(direction) {
                case 'ArrowUp':
                    deltaY = -moveDistance;
                    break;
                case 'ArrowDown':
                    deltaY = moveDistance;
                    break;
                case 'ArrowLeft':
                    deltaX = -moveDistance;
                    break;
                case 'ArrowRight':
                    deltaX = moveDistance;
                    break;
            }
            
            window.electronAPI.moveWindow(deltaX, deltaY);
            logger.debug('Moving window', {
                component: 'MainWindowUI',
                direction: direction,
                deltaX: deltaX,
                deltaY: deltaY,
                interactive: this.isInteractive
            });
        } else {
            logger.warn('moveWindow API not available', { component: 'MainWindowUI' });
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 p-4 rounded-lg text-white z-50 ${
            type === 'error' ? 'bg-red-600' : 
            type === 'success' ? 'bg-green-600' :
            'bg-blue-600'
        }`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
        
        logger.debug('Notification shown', {
            component: 'MainWindowUI',
            message,
            type
        });
    }

    async showGeminiConfig() {
        try {
            const status = await window.electronAPI.getGeminiStatus();
            
            const modal = this.createGeminiConfigModal(status);
            document.body.appendChild(modal);
            
            logger.debug('Gemini config modal shown', { component: 'MainWindowUI' });
        } catch (error) {
            logger.error('Failed to show Gemini config', {
                component: 'MainWindowUI',
                error: error.message
            });
            this.showNotification('Failed to load Gemini configuration', 'error');
        }
    }

    createGeminiConfigModal(status) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-gray-900 text-white p-6 rounded-lg max-w-md w-full">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold">🤖 Gemini Flash 1.5 Configuration</h2>
                    <button class="text-gray-400 hover:text-white" onclick="this.closest('.fixed').remove()">✕</button>
                </div>
                
                <div class="mb-4 p-3 rounded ${status.hasApiKey ? 'bg-green-900' : 'bg-red-900'}">
                    <p><strong>Status:</strong> ${status.hasApiKey ? 'Configured' : 'Not Configured'}</p>
                    <p><strong>Model:</strong> ${status.model}</p>
                </div>
                
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">API Key:</label>
                    <input type="password" id="geminiApiKey" placeholder="Enter your Gemini API key" 
                           class="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white">
                    <p class="text-xs text-gray-400 mt-1">
                        Get your API key from: <a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-blue-400">Google AI Studio</a>
                    </p>
                </div>
                
                <div class="flex space-x-2">
                    <button onclick="mainWindowUI.configureGemini()" class="flex-1 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">
                        Configure
                    </button>
                    <button onclick="mainWindowUI.testGeminiConnection()" class="flex-1 bg-green-600 hover:bg-green-700 px-4 py-2 rounded">
                        Test Connection
                    </button>
                </div>
                
                <div class="mt-4 text-center">
                    <button class="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded" onclick="this.closest('.fixed').remove()">
                        Close
                    </button>
                </div>
            </div>
        `;
        return modal;
    }

    async configureGemini() {
        const apiKey = document.getElementById('geminiApiKey').value.trim();
        if (!apiKey) {
            this.showNotification('Please enter an API key', 'error');
            return;
        }
        
        try {
            const result = await window.electronAPI.setGeminiApiKey(apiKey);
            if (result.success) {
                this.showNotification('Gemini API key configured successfully!', 'success');
                document.querySelector('.fixed').remove();
                
                logger.info('Gemini API key configured', { component: 'MainWindowUI' });
            } else {
                this.showNotification(`Configuration failed: ${result.error}`, 'error');
                logger.error('Gemini configuration failed', {
                    component: 'MainWindowUI',
                    error: result.error
                });
            }
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
            logger.error('Gemini configuration error', {
                component: 'MainWindowUI',
                error: error.message
            });
        }
    }

    async testGeminiConnection() {
        try {
            const result = await window.electronAPI.testGeminiConnection();
            if (result.success) {
                this.showNotification('Gemini connection test successful!', 'success');
                logger.info('Gemini connection test successful', { component: 'MainWindowUI' });
            } else {
                this.showNotification(`Connection test failed: ${result.error}`, 'error');
                logger.error('Gemini connection test failed', {
                    component: 'MainWindowUI',
                    error: result.error
                });
            }
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
            logger.error('Gemini connection test error', {
                component: 'MainWindowUI',
                error: error.message
            });
        }
    }

    setupSettingsShortcut() {
        document.addEventListener('keydown', (e) => {
            // Cmd+, or Ctrl+, for settings
            if ((e.metaKey || e.ctrlKey) && e.key === ',') {
                logger.debug('Settings keyboard shortcut pressed');
                e.preventDefault();
                this.openSettings();
            }
        });
    }

    openSettings() {
        try {
            if (window.electronAPI && window.electronAPI.showSettings) {
                window.electronAPI.showSettings();
            } else {
                logger.error('electronAPI or showSettings not available');
                return;
            }
            
            // Add visual feedback
            if (this.settingsIndicator) {
                this.settingsIndicator.style.transform = 'scale(1.1)';
                this.settingsIndicator.style.transition = 'transform 0.2s ease';
                
                setTimeout(() => {
                    this.settingsIndicator.style.transform = 'scale(1)';
                }, 200);
            }
            
            logger.info('Settings window opened', { component: 'MainWindowUI' });
        } catch (error) {
            logger.error('Failed to open settings', {
                component: 'MainWindowUI',
                error: error.message
            });
            this.showNotification('Failed to open settings', 'error');
        }
    }

    showSettingsMenu() {
        const menu = document.createElement('div');
        menu.className = 'settings-menu';
        menu.style.cssText = `
            position: absolute;
            right: 10px;
            top: 35px;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(20px);
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.15);
            padding: 8px 0;
            min-width: 150px;
            z-index: 1000;
        `;

        const settingsOption = this.createMenuItem('Settings', 'fa-cog', () => {
            this.openSettings();
            document.body.removeChild(menu);
        });

        const quitOption = this.createMenuItem('Quit OpenCluely', 'fa-power-off', () => {
            if (window.electronAPI && window.electronAPI.quit) {
                window.electronAPI.quit();
            }
        });

        menu.appendChild(settingsOption);
        menu.appendChild(this.createMenuSeparator());
        menu.appendChild(quitOption);

        // Add click outside listener to close menu
        const closeMenu = (e) => {
            if (!menu.contains(e.target) && !this.settingsIndicator.contains(e.target)) {
                document.body.removeChild(menu);
                document.removeEventListener('click', closeMenu);
            }
        };
        document.addEventListener('click', closeMenu);

        document.body.appendChild(menu);
    }

    createMenuItem(text, iconClass, onClick) {
        const item = document.createElement('div');
        item.style.cssText = `
            padding: 8px 16px;
            color: rgba(255, 255, 255, 0.9);
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s ease;
        `;
        item.innerHTML = `<i class="fas ${iconClass}"></i>${text}`;
        item.addEventListener('mouseover', () => {
            item.style.background = 'rgba(255, 255, 255, 0.1)';
        });
        item.addEventListener('mouseout', () => {
            item.style.background = 'transparent';
        });
        item.addEventListener('click', onClick);
        return item;
    }

    createMenuSeparator() {
        const separator = document.createElement('div');
        separator.style.cssText = `
            height: 1px;
            background: rgba(255, 255, 255, 0.1);
            margin: 8px 0;
        `;
        return separator;
    }
}

// Initialize when DOM is ready
let mainWindowUI;
if (typeof document !== 'undefined') {
    // Add immediate visual indicator that script is loading
    const style = document.createElement('style');
    document.head.appendChild(style);
    
    document.addEventListener('DOMContentLoaded', () => {
                
        mainWindowUI = new MainWindowUI();
        // Make it globally accessible for debugging
        window.mainWindowUI = mainWindowUI;
        logger.info('MainWindowUI initialized and available as window.mainWindowUI');
    });
}

// module.exports = MainWindowUI; // Not needed in browser context