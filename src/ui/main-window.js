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
        this.currentSkill = 'dsa'; // Default, will be updated from settings
        this.isMcqMode = false;
        this.isTyping = false;
        this.statusDot = null;
        this.skillIndicator = null;
        this.micButton = null;
        this.mcqToggle = null;
        this.autoHideToggle = null;
        this.autoTypeButton = null;
        this.isAutoHideMode = false;
        this.isRecording = false;
        this.speechAvailable = false; // track availability
        this._popoverHideTimeout = null;
        // Renderer-side audio capture state (used for Whisper on Windows)
        this._audioContext = null;
        this._mediaStream = null;
        this._scriptNode = null;
        this._captureInterval = null;
        
        // Define available skills for navigation
        this.availableSkills = [
            'dsa'
        ];
        
        this.init();
    }

    async init() {
        try {
            this.setupElements();
            this.setupEventListeners();
            
            // Load current skill from settings
            await this.loadCurrentSkill();
            
            // Load current interaction state
            await this.loadCurrentInteractionState();
            
            // Fetch speech availability
            await this.loadSpeechAvailability();
            
            // Load MCQ mode state
            await this.loadMcqMode();
            
            // Load Auto-Hide mode state
            await this.loadAutoHideMode();
            
            this.updateSkillIndicator();
            this.updateAllElementStates(); // Update all elements with current state
            this.resizeWindowToContent();
            
            logger.info('Main window UI initialized', {
                component: 'MainWindowUI',
                skill: this.currentSkill,
                interactive: this.isInteractive,
                isMcqMode: this.isMcqMode
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

    async loadCurrentSkill() {
        try {
            if (window.electronAPI && window.electronAPI.getSettings) {
                const settings = await window.electronAPI.getSettings();
                if (settings && settings.activeSkill) {
                    this.currentSkill = settings.activeSkill;
                    logger.debug('Loaded current skill from settings', {
                        component: 'MainWindowUI',
                        skill: this.currentSkill
                    });
                }
            }
        } catch (error) {
            logger.warn('Failed to load current skill from settings', {
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

    async loadMcqMode() {
        try {
            if (window.electronAPI && window.electronAPI.getMcqMode) {
                const res = await window.electronAPI.getMcqMode();
                this.isMcqMode = !!(res && res.isMcqMode);
                this.updateMcqToggleState();
            }
        } catch (e) {
            logger.warn('Failed to load MCQ mode state', { error: e.message });
        }
    }

    async loadAutoHideMode() {
        try {
            if (window.electronAPI && window.electronAPI.getAutoHideMode) {
                const res = await window.electronAPI.getAutoHideMode();
                this.isAutoHideMode = !!(res && res.isAutoHideMode);
                this.updateAutoHideToggleState();
            }
        } catch (e) {
            logger.warn('Failed to load Auto-Hide mode state', { error: e.message });
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
        // Update all interactive elements with current state
        this.updateStatusDot();
        this.updateSkillIndicatorState();
        this.updateMicButtonState();
        this.updateMcqToggleState();
        this.updateAutoHideToggleState();
        this.updateAutoTypeState();
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

    updateSkillIndicatorState() {
        if (this.skillIndicator) {
            // Remove both classes first
            this.skillIndicator.classList.remove('interactive', 'non-interactive');
            
            // Add the appropriate class
            if (this.isInteractive) {
                this.skillIndicator.classList.add('interactive');
            } else {
                this.skillIndicator.classList.add('non-interactive');
            }
            
            logger.debug('Skill indicator state updated', {
                component: 'MainWindowUI',
                interactive: this.isInteractive,
                classes: this.skillIndicator.className
            });
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

    updateMcqToggleState() {
        if (!this.mcqToggle) return;
        if (this.isMcqMode) {
            this.mcqToggle.classList.add('mcq-active');
            this.mcqToggle.title = 'MCQ Mode ON (⌥M to toggle)';
        } else {
            this.mcqToggle.classList.remove('mcq-active');
            this.mcqToggle.title = 'MCQ Mode OFF (⌥M to toggle)';
        }
        this.resizeWindowToContent();
    }

    updateAutoHideToggleState() {
        if (!this.autoHideToggle) return;
        if (this.isAutoHideMode) {
            this.autoHideToggle.classList.add('autohide-active');
            this.autoHideToggle.title = 'Auto-Hide ON (⌥H to toggle)';
        } else {
            this.autoHideToggle.classList.remove('autohide-active');
            this.autoHideToggle.title = 'Auto-Hide OFF (⌥H to toggle)';
        }
        this.resizeWindowToContent();
    }

    updateAutoTypeState() {
        if (!this.autoTypeButton) return;
        if (this.isTyping) {
            this.autoTypeButton.classList.add('typing-active');
            this.autoTypeButton.title = 'Typing clipboard content... (Click or press ⌥V to stop)';
        } else {
            this.autoTypeButton.classList.remove('typing-active');
            this.autoTypeButton.title = 'Smart Auto-Type Clipboard (90-120 WPM) (⌥V / Alt+V)';
            if (this.autoTypeProgressFill) {
                this.autoTypeProgressFill.style.width = '0%';
            }
            if (this.autoTypeLabel && !this._showingDoneStatus) {
                this.autoTypeLabel.textContent = 'Type ⌥V';
            }
            this._lastAutoTypeData = null;
        }
        this.resizeWindowToContent();
    }

    handleAutoTypeProgress(data) {
        this.isTyping = true;
        this._lastAutoTypeData = data;
        if (this.autoTypeButton && !this.autoTypeButton.classList.contains('typing-active')) {
            this.autoTypeButton.classList.add('typing-active');
            this.autoTypeButton.title = 'Typing clipboard content... (Click or press ⌥V to stop)';
        }

        const percent = data.percent !== undefined ? data.percent : (data.total ? Math.round((data.index / data.total) * 100) : 0);
        const etaText = data.eta_text || (data.eta_seconds !== undefined ? `${data.eta_seconds}s` : '');

        if (this.autoTypeLabel) {
            if (etaText && etaText !== '0s') {
                this.autoTypeLabel.textContent = `${percent}% · ${etaText}`;
            } else {
                this.autoTypeLabel.textContent = `${percent}%`;
            }
        }

        if (this.autoTypeProgressFill) {
            this.autoTypeProgressFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        }

        this.resizeWindowToContent();
    }

    handleAutoTypeCompleted(data) {
        this.isTyping = false;
        this._showingDoneStatus = true;
        if (this.autoTypeProgressFill) {
            this.autoTypeProgressFill.style.width = '100%';
        }
        if (this.autoTypeLabel) {
            this.autoTypeLabel.textContent = '✓ Done';
        }
        this.updateAutoTypeState();

        setTimeout(() => {
            this._showingDoneStatus = false;
            if (!this.isTyping && this.autoTypeLabel) {
                this.autoTypeLabel.textContent = 'Type ⌥V';
            }
            this.updateAutoTypeState();
        }, 1800);
    }

    resizeWindowToContent() {
        // Wait for DOM to fully render
        setTimeout(() => {
            const commandTab = document.querySelector('.command-tab');
            if (commandTab && window.electronAPI && window.electronAPI.resizeWindow) {
                const rect = commandTab.getBoundingClientRect();
                const scrollWidth = commandTab.scrollWidth || rect.width;
                let width = Math.ceil(Math.max(rect.width, scrollWidth)) + 4;
                let height = Math.ceil(rect.height) + 2;

                // If shortcuts popover is visible, extend height and width to fit it
                if (this.shortcutsPopover && this.shortcutsPopover.classList.contains('is-open')) {
                    const popRect = this.shortcutsPopover.getBoundingClientRect();
                    height = Math.max(height, Math.ceil(36 + popRect.height + 12));
                    width = Math.max(width, Math.ceil(popRect.right + 12));
                }

                // If clipboard popover is visible, extend height and width to fit it
                if (this.clipboardPopover && this.clipboardPopover.classList.contains('is-open')) {
                    const popRect = this.clipboardPopover.getBoundingClientRect();
                    height = Math.max(height, Math.ceil(36 + popRect.height + 12));
                    width = Math.max(width, Math.ceil(popRect.right + 12));
                }
                
                logger.debug('Resizing window to content', {
                    width,
                    height,
                    component: 'MainWindowUI'
                });
                
                window.electronAPI.resizeWindow(width, height);
            }
        }, 60);
    }

    setupElements() {
        this.statusDot = document.getElementById('statusDot');
        this.skillIndicator = document.getElementById('skillIndicator');
        this.settingsIndicator = document.getElementById('settingsIndicator'); // Optional
        this.micButton = document.getElementById('micButton');
        this.infoButton = document.getElementById('infoButton');
        this.shortcutsPopover = document.getElementById('shortcutsPopover');
        this.screenshotButton = document.getElementById('screenshotButton') || document.querySelector('.command-item');
        this.mcqToggle = document.getElementById('mcqToggle');
        this.autoHideToggle = document.getElementById('autoHideToggle');
        this.autoTypeButton = document.getElementById('autoTypeButton');
        this.autoTypeLabel = document.getElementById('autoTypeLabel');
        this.autoTypeProgressFill = document.getElementById('autoTypeProgressFill');
        this.opacitySlider = document.getElementById('opacitySlider');
        this.targetModeBtn = document.getElementById('targetModeBtn');
        this.clipboardHistoryBtn = document.getElementById('clipboardHistoryBtn');
        this.clipboardPopover = document.getElementById('clipboardPopover');

        if (!this.skillIndicator || !this.micButton || !this.screenshotButton) {
            throw new Error('Required UI elements not found');
        }

        // Screenshot click handler
        this.screenshotButton.addEventListener('click', () => {
            if (this.isInteractive && window.electronAPI && window.electronAPI.takeScreenshot) {
                window.electronAPI.takeScreenshot();
            }
        });

        if (this.targetModeBtn) {
            this.targetModeBtn.addEventListener('click', () => {
                if (this.isInteractive && window.electronAPI && window.electronAPI.showTargetBox) {
                    window.electronAPI.showTargetBox();
                }
            });
        }

        if (this.clipboardHistoryBtn) {
            this.clipboardHistoryBtn.addEventListener('click', (e) => {
                if (!this.isInteractive) return;
                e.stopPropagation();
                this.toggleClipboardPopover();
            });
        }

        const closeClipboardBtn = document.getElementById('closeClipboardPopoverBtn');
        if (closeClipboardBtn) {
            closeClipboardBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideClipboardPopover();
            });
        }

        // MCQ toggle click handler
        if (this.mcqToggle) {
            this.mcqToggle.addEventListener('click', async () => {
                if (!this.isInteractive) return;
                if (window.electronAPI && window.electronAPI.toggleMcqMode) {
                    try {
                        const res = await window.electronAPI.toggleMcqMode();
                        this.isMcqMode = res ? res.isMcqMode : !this.isMcqMode;
                        this.updateMcqToggleState();
                    } catch (e) {
                        logger.error('Failed to toggle MCQ mode', e);
                    }
                }
            });
        }

        // Auto-Hide toggle click handler
        if (this.autoHideToggle) {
            this.autoHideToggle.addEventListener('click', async () => {
                if (!this.isInteractive) return;
                if (window.electronAPI && window.electronAPI.toggleAutoHideMode) {
                    try {
                        const res = await window.electronAPI.toggleAutoHideMode();
                        this.isAutoHideMode = res ? res.isAutoHideMode : !this.isAutoHideMode;
                        this.updateAutoHideToggleState();
                    } catch (e) {
                        logger.error('Failed to toggle Auto-Hide mode', e);
                    }
                }
            });
        }

        // Auto-type clipboard click handler
        if (this.autoTypeButton) {
            this.autoTypeButton.addEventListener('click', async () => {
                if (!this.isInteractive) return;
                if (window.electronAPI && window.electronAPI.typeClipboard) {
                    try {
                        await window.electronAPI.typeClipboard();
                    } catch (e) {
                        logger.error('Failed to trigger auto-type', e);
                    }
                }
            });
        }

        // Opacity / Transparency slider handler
        if (this.opacitySlider) {
            // Apply initial opacity (default is max transparency = 15%)
            let val = parseInt(this.opacitySlider.value, 10);
            let opacity = Math.max(0.005, Math.pow(val / 100, 2));
            document.body.style.opacity = opacity.toString();

            this.opacitySlider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value, 10);
                const opacity = Math.max(0.005, Math.pow(val / 100, 2));
                document.body.style.opacity = opacity.toString();
                if (window.electronAPI && window.electronAPI.setOpacity) {
                    window.electronAPI.setOpacity(opacity);
                }
            });
            // Prevent drag region from stealing the slider interaction
            this.opacitySlider.addEventListener('mousedown', (e) => e.stopPropagation());
        }

        // Skill indicator click handler toggles DSA skill
        this.skillIndicator.addEventListener('click', () => {
            if (!this.isInteractive) return;
            const newSkill = 'dsa';
            if (window.electronAPI && window.electronAPI.updateActiveSkill) {
                window.electronAPI.updateActiveSkill(newSkill).then(() => {
                    this.handleSkillActivated(newSkill);
                });
            } else {
                this.handleSkillActivated(newSkill);
            }
        });

        // Check for required elements (settingsIndicator is optional)
        if (this.settingsIndicator) {
            this.settingsIndicator.addEventListener('click', () => {
                if (this.isInteractive) {
                    this.showSettingsMenu();
                }
            });
        }

        // Add click handler for microphone
        this.micButton.addEventListener('click', async () => {
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
            // Set default to C++ if no value is set
            this.languageSelect.value = 'cpp';
            
            // Initialize with current setting
            if (window.electronAPI && window.electronAPI.getSettings) {
                window.electronAPI.getSettings().then(settings => {
                    if (settings && settings.codingLanguage) {
                        this.languageSelect.value = settings.codingLanguage;
                    } else {
                        // Save C++ as default if no language is set
                        this.languageSelect.value = 'cpp';
                        window.electronAPI.saveSettings({ codingLanguage: 'cpp' });
                    }
                }).catch(() => {
                    // Fallback to C++ on error
                    this.languageSelect.value = 'cpp';
                });
            }

            this.languageSelect.addEventListener('change', (e) => {
                const lang = e.target.value;
                if (window.electronAPI && window.electronAPI.saveSettings) {
                    window.electronAPI.saveSettings({ codingLanguage: lang });
                }
                // Resize for any width change
                this.resizeWindowToContent();
            });
        }

        // Info button / shortcuts popover (Click only, no hover)
        if (this.infoButton && this.shortcutsPopover) {
            this.infoButton.addEventListener('click', (e) => {
                if (!this.isInteractive) return;
                e.stopPropagation();
                this.toggleShortcutsPopover();
            });

            // Close on outside click
            document.addEventListener('click', (e) => {
                if (this.shortcutsPopover) {
                    const isClickInsideShortcuts = this.shortcutsPopover.contains(e.target) || (this.infoButton && this.infoButton.contains(e.target));
                    if (!isClickInsideShortcuts && this.shortcutsPopover.classList.contains('is-open')) {
                        this.hideShortcutsPopover();
                    }
                }
                if (this.clipboardPopover) {
                    const isClickInsideClipboard = this.clipboardPopover.contains(e.target) || (this.clipboardHistoryBtn && this.clipboardHistoryBtn.contains(e.target));
                    if (!isClickInsideClipboard && this.clipboardPopover.classList.contains('is-open')) {
                        this.hideClipboardPopover();
                    }
                }
            });

            // Close on Escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    if (this.shortcutsPopover && this.shortcutsPopover.classList.contains('is-open')) {
                        this.hideShortcutsPopover();
                    }
                    if (this.clipboardPopover && this.clipboardPopover.classList.contains('is-open')) {
                        this.hideClipboardPopover();
                    }
                }
            });
        }
    }

    setupEventListeners() {
        if (window.electronAPI) {
            if (window.electronAPI.onOpacityUpdate) {
                window.electronAPI.onOpacityUpdate((event, opacity) => {
                    document.body.style.opacity = opacity.toString();
                });
            }
            if (window.electronAPI.onToggleClipboardPopover) {
                window.electronAPI.onToggleClipboardPopover(() => {
                    this.toggleClipboardPopover();
                });
            }
            // Fix interaction mode change listener
            window.electronAPI.onInteractionModeChanged((event, interactive) => {
                logger.debug('Interaction mode changed received:', interactive);
                this.handleInteractionModeChanged(interactive);
            });

            window.electronAPI.onRecordingStarted(() => {
                this.handleRecordingStarted();
            });

            window.electronAPI.onRecordingStopped(() => {
                this.handleRecordingStopped();
            });

            window.electronAPI.onSkillChanged((event, data) => {
                if (data && data.skill) {
                    this.handleSkillChanged(data);
                }
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

            // Listen for MCQ Mode changes
            window.electronAPI.onMcqModeChanged((event, data) => {
                if (data && typeof data.isMcqMode === 'boolean') {
                    this.isMcqMode = data.isMcqMode;
                    this.updateMcqToggleState();
                }
            });

            // Listen for Auto-Hide Mode changes
            window.electronAPI.onAutoHideModeChanged((event, data) => {
                if (data && typeof data.isAutoHideMode === 'boolean') {
                    this.isAutoHideMode = data.isAutoHideMode;
                    this.updateAutoHideToggleState();
                }
            });

            // Listen for Auto-Type events
            window.electronAPI.onAutotypeStarted((event, data) => {
                this.isTyping = true;
                if (this.autoTypeLabel) {
                    const etaText = data && data.eta_text ? ` · ${data.eta_text}` : '';
                    this.autoTypeLabel.textContent = `0%${etaText}`;
                }
                this.updateAutoTypeState();
                logger.info('Auto-type started in UI', data);
            });

            window.electronAPI.onAutotypeProgress((event, data) => {
                this.handleAutoTypeProgress(data);
            });

            window.electronAPI.onAutotypeCompleted((event, data) => {
                this.handleAutoTypeCompleted(data);
                logger.info('Auto-type completed in UI', data);
            });

            window.electronAPI.onAutotypeStopped((event, data) => {
                this.isTyping = false;
                this.updateAutoTypeState();
                logger.info('Auto-type stopped in UI', data);
            });
            
            // Global keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.altKey && (e.key === 'r' || e.key === '®') && this.isInteractive) {
                    e.preventDefault();
                    if (!this.speechAvailable) return; // guard when unavailable
                    if (this.isRecording) {
                        window.electronAPI.stopSpeechRecognition();
                    } else {
                        window.electronAPI.startSpeechRecognition();
                    }
                }
                if (e.altKey && (e.key === 'v' || e.key === '√') && this.isInteractive) {
                    e.preventDefault();
                    if (window.electronAPI && window.electronAPI.typeClipboard) {
                        window.electronAPI.typeClipboard();
                    }
                }
                if (e.altKey && (e.key === 'm' || e.key === 'µ') && this.isInteractive) {
                    e.preventDefault();
                    if (window.electronAPI && window.electronAPI.toggleMcqMode) {
                        window.electronAPI.toggleMcqMode();
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
            
            window.api.receive('skill-updated', (data) => {
                logger.info('Skill updated event received from main process:', data);
                if (data && data.skill) {
                    this.handleSkillChanged(data);
                } else if (typeof data === 'string') {
                    // Handle case where skill is passed directly as string
                    this.handleSkillChanged({ skill: data });
                } else {
                    logger.warn('Skill updated event received but no skill data found:', data);
                }
            });
            
            // Listen for skill updates from settings window  
            window.api.receive('update-skill', (skill) => {
                logger.info('Direct skill update received from settings:', skill);
                this.handleSkillChanged({ skill: skill });
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
        const skill = data.skill || data.metadata?.skill || 'General';
        const skillNames = {
            'dsa': 'DSA',
            'behavioral': 'Behavioral', 
            'sales': 'Sales',
            'presentation': 'Presentation',
            'data-science': 'Data Science',
            'programming': 'Programming',
            'devops': 'DevOps',
            'system-design': 'System Design',
            'negotiation': 'Negotiation'
        };
        
        const displaySkill = skillNames[skill] || skill.toUpperCase();
        
        logger.info('LLM response received', {
            component: 'MainWindowUI',
            skill: skill,
            displaySkill: displaySkill
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
            
            // Handle Cmd + Arrow keys based on interaction mode
            if (e.metaKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();

                if (this.isInteractive) {
                    // Interactive mode: Cmd + Up/Down for skill navigation
                    if (e.key === 'ArrowUp') {
                        this.navigateSkill(-1); // Previous skill
                    } else if (e.key === 'ArrowDown') {
                        this.navigateSkill(1); // Next skill
                    } else {
                    }
                    // Left/Right arrows do nothing in interactive mode
                } else {
                    // Non-interactive mode: Cmd + Arrow keys for window movement
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
        
        // Update all UI elements to reflect the new state
        this.updateAllElementStates();

        // Auto-hide popover when leaving interactive mode
        if (!this.isInteractive && this.shortcutsPopover && this.shortcutsPopover.style.display !== 'none') {
            this.hideShortcutsPopover();
        }
        
        // Update skill indicator tooltip
        this.updateSkillIndicator();
        
        logger.info('Interaction mode change completed', {
            component: 'MainWindowUI',
            interactive: this.isInteractive,
            statusDotClass: this.statusDot ? this.statusDot.className : 'not found',
            skillIndicatorClass: this.skillIndicator ? this.skillIndicator.className : 'not found'
        });
    }

    handleSkillChanged(data) {
        const oldSkill = this.currentSkill;
        this.currentSkill = data.skill;
        
        logger.info('Handling skill change', {
            component: 'MainWindowUI',
            oldSkill: oldSkill,
            newSkill: data.skill,
            skillIndicatorExists: !!this.skillIndicator
        });
        
        this.updateSkillIndicator();
        
        logger.info('Skill changed successfully', {
            component: 'MainWindowUI',
            skill: data.skill
        });
    }

    handleSkillActivated(skillName) {
        this.currentSkill = skillName;
        this.updateSkillIndicator();
        
        logger.info('Skill activated', {
            component: 'MainWindowUI',
            skill: skillName
        });
    }

    handleScreenshotRequest() {
        logger.debug('Screenshot request received', { component: 'MainWindowUI' });
    }

    handleRecordingStarted() {
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
        if (useRendererCapture) {
            this._startRendererAudioCapture();
        }
        logger.debug('Recording started', { component: 'MainWindowUI' });
    }

    handleRecordingStopped() {
        this.isRecording = false;
        if (this.micButton) {
            this.micButton.classList.remove('recording');
        }
        this._stopRendererAudioCapture();
        logger.debug('Recording stopped', { component: 'MainWindowUI' });
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

    updateSkillIndicator() {
        const skillNames = {
            'dsa': 'DSA',
            'behavioral': 'Behavioral', 
            'sales': 'Sales',
            'presentation': 'Presentation',
            'data-science': 'Data Science',
            'programming': 'Programming',
            'devops': 'DevOps',
            'system-design': 'System Design',
            'negotiation': 'Negotiation'
        };
        
        logger.info('Updating skill indicator', {
            component: 'MainWindowUI',
            currentSkill: this.currentSkill,
            skillIndicatorExists: !!this.skillIndicator
        });
        
        if (!this.skillIndicator) {
            logger.error('Skill indicator element not found!');
            return;
        }
        
        const skillName = skillNames[this.currentSkill] || this.currentSkill.toUpperCase();
        const skillSpan = this.skillIndicator.querySelector('span');
        
        logger.info('Looking for skill span element', {
            component: 'MainWindowUI',
            spanExists: !!skillSpan,
            skillName: skillName
        });
        
        if (skillSpan) {
            const oldText = skillSpan.textContent;
            skillSpan.textContent = skillName;
                        
            const tooltip = this.isInteractive ? 
                `${skillName} - Use ⌘↑/↓ to navigate skills` : 
                `${skillName} - Enable interactive mode (Alt+A) to navigate`;
            this.skillIndicator.title = tooltip;
            
            // Add visual feedback for skill change
            this.animateSkillChange();
            
            logger.info('Skill indicator updated successfully', {
                component: 'MainWindowUI',
                oldText: oldText,
                newText: skillName,
                interactive: this.isInteractive
            });
        } else {
            logger.error('Skill span element not found within skill indicator!');
        }
    }

    animateSkillChange() {
        if (this.skillIndicator) {
            this.skillIndicator.style.transform = 'scale(1.1)';
            this.skillIndicator.style.transition = 'transform 0.2s ease';
            
            setTimeout(() => {
                this.skillIndicator.style.transform = 'scale(1)';
            }, 200);
        }
    }

    navigateSkill(direction) {
        
        if (!this.isInteractive) {
            return;
        }
        
        const currentIndex = this.availableSkills.indexOf(this.currentSkill);
        if (currentIndex === -1) {
            logger.error('Current skill not found in available skills array');
            return;
        }
        
        // Calculate new index with wrapping
        let newIndex = currentIndex + direction;
        if (newIndex >= this.availableSkills.length) {
            newIndex = 0; // Wrap to beginning
        } else if (newIndex < 0) {
            newIndex = this.availableSkills.length - 1; // Wrap to end
        }
        
        const newSkill = this.availableSkills[newIndex];
        
        // Update skill locally and notify main process
        this.currentSkill = newSkill;
        this.updateSkillIndicator();
        
        // Save the skill change via IPC
        if (window.electronAPI && window.electronAPI.updateActiveSkill) {
            window.electronAPI.updateActiveSkill(newSkill).then(() => {
                logger.info('Skill navigation completed', {
                    component: 'MainWindowUI',
                    newSkill,
                    direction: direction > 0 ? 'down' : 'up'
                });
            }).catch(error => {
                logger.error('Failed to update skill via navigation', {
                    component: 'MainWindowUI',
                    error: error.message
                });
            });
        }
        
        // Show visual feedback
        this.showSkillChangeNotification(newSkill, direction);
    }

    showSkillChangeNotification(skill, direction) {
        const skillNames = {
            'dsa': 'DSA',
            'behavioral': 'Behavioral', 
            'sales': 'Sales',
            'presentation': 'Presentation',
            'data-science': 'Data Science',
            'programming': 'Programming',
            'devops': 'DevOps',
            'system-design': 'System Design',
            'negotiation': 'Negotiation'
        };
        
        const displayName = skillNames[skill] || skill.toUpperCase();
        const arrow = direction > 0 ? '↓' : '↑';
        
        // Create temporary notification
        const notification = document.createElement('div');
        notification.className = 'skill-change-notification';
        notification.innerHTML = `${arrow} ${displayName}`;
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.2s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
        }, 10);
        
        // Remove after 1 second
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 200);
        }, 1000);
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
        // Disabled: do not display any text popups or text alert banners on screen
        logger.debug('Notification (suppressed)', {
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

    toggleShortcutsPopover() {
        if (!this.shortcutsPopover) return;
    const isOpen = this.shortcutsPopover.classList.contains('is-open');
    if (!isOpen) {
            this.showShortcutsPopover();
        } else {
            this.hideShortcutsPopover();
        }
    }

    showShortcutsPopover() {
        if (!this.shortcutsPopover) return;
        if (this._popoverHideTimeout) {
            clearTimeout(this._popoverHideTimeout);
            this._popoverHideTimeout = null;
        }
    this.shortcutsPopover.classList.add('is-open');
        // Resize main window to fit popover
        setTimeout(() => this.resizeWindowToContent(), 50);
    }

    hideShortcutsPopover() {
        if (!this.shortcutsPopover) return;
    this.shortcutsPopover.classList.remove('is-open');
    // resize back to compact after transition
    setTimeout(() => this.resizeWindowToContent(), 130);
    }

    queueHideShortcutsPopover() {
        if (!this.shortcutsPopover) return;
        if (this._popoverHideTimeout) clearTimeout(this._popoverHideTimeout);
        this._popoverHideTimeout = setTimeout(() => this.hideShortcutsPopover(), 180);
    }

    toggleClipboardPopover() {
        if (!this.clipboardPopover) return;
        const isOpen = this.clipboardPopover.classList.contains('is-open');
        if (isOpen) {
            this.hideClipboardPopover();
        } else {
            this.showClipboardPopover();
        }
    }

    async showClipboardPopover() {
        if (!this.clipboardPopover) return;
        this.hideShortcutsPopover();
        this.clipboardPopover.classList.add('is-open');
        await this.loadAndRenderClipboardPopover();
        this.resizeWindowToContent();
        setTimeout(() => this.resizeWindowToContent(), 100);
    }

    hideClipboardPopover() {
        if (!this.clipboardPopover) return;
        this.clipboardPopover.classList.remove('is-open');
        setTimeout(() => this.resizeWindowToContent(), 130);
    }

    async loadAndRenderClipboardPopover() {
        const contentContainer = document.getElementById('clipboardPopoverContent');
        if (!contentContainer) return;
        try {
            if (!window.electronAPI || !window.electronAPI.getClipboardHistory) return;
            const history = await window.electronAPI.getClipboardHistory();
            contentContainer.innerHTML = '';
            const sessions = Object.keys(history || {}).sort().reverse();
            if (sessions.length === 0) {
                contentContainer.innerHTML = `<div style="text-align: center; color: rgba(255,255,255,0.5); padding: 20px 0; font-size: 11px;">No items in clipboard history</div>`;
                return;
            }
            sessions.forEach(sessionKey => {
                const items = history[sessionKey];
                if (!items || items.length === 0) return;
                const date = new Date(sessionKey);
                const title = `Session: ${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;

                const block = document.createElement('div');
                block.className = 'clipboard-session-block';

                const header = document.createElement('div');
                header.className = 'clipboard-session-header';
                header.innerHTML = `
                    <div class="clipboard-session-title">${title} (${items.length})</div>
                    <button class="clipboard-copy-all-btn" data-session="${sessionKey}"><i class="fas fa-copy"></i> Copy All</button>
                `;
                block.appendChild(header);

                const itemsContainer = document.createElement('div');
                const reversedItems = [...items].reverse();
                reversedItems.forEach(text => {
                    const card = document.createElement('div');
                    card.className = 'clipboard-card';

                    const textEl = document.createElement('div');
                    textEl.className = 'clipboard-text';
                    textEl.textContent = text;

                    const actions = document.createElement('div');
                    actions.className = 'clipboard-actions';

                    const copyBtn = document.createElement('button');
                    copyBtn.className = 'clipboard-copy-btn';
                    copyBtn.innerHTML = `<i class="fas fa-copy"></i> Copy`;
                    copyBtn.onclick = async (e) => {
                        e.stopPropagation();
                        if (window.electronAPI && window.electronAPI.copyToClipboard) {
                            await window.electronAPI.copyToClipboard(text);
                            copyBtn.innerHTML = `<i class="fas fa-check"></i> Copied`;
                            setTimeout(() => copyBtn.innerHTML = `<i class="fas fa-copy"></i> Copy`, 1500);
                        }
                    };

                    actions.appendChild(copyBtn);
                    card.appendChild(textEl);
                    card.appendChild(actions);
                    itemsContainer.appendChild(card);
                });

                block.appendChild(itemsContainer);
                contentContainer.appendChild(block);
            });

            contentContainer.querySelectorAll('.clipboard-copy-all-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const sessionKey = btn.getAttribute('data-session');
                    if (window.electronAPI && window.electronAPI.copyClipboardSession) {
                        const success = await window.electronAPI.copyClipboardSession(sessionKey);
                        if (success) {
                            const orig = btn.innerHTML;
                            btn.innerHTML = `<i class="fas fa-check"></i> Copied All`;
                            setTimeout(() => btn.innerHTML = orig, 1500);
                        }
                    }
                });
            });
        } catch (e) {
            console.error('Failed to load clipboard history in popover', e);
        }
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