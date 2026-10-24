// Simple logger for renderer process
const logger = {
    info: (...args) => console.log('[MainWindowUI]', ...args),
    debug: (...args) => console.log('[MainWindowUI DEBUG]', ...args),
    error: (...args) => console.error('[MainWindowUI ERROR]', ...args),
    warn: (...args) => console.warn('[MainWindowUI WARN]', ...args)
};

class MainWindowUI {
    constructor() {
        this.isInteractive = true;
        this.isHidden = false;
        this.currentSkill = 'interview'; // Default to Interview (Jenil Soni resume mode)
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
        // Rubic stealth MCQ state
        this.rubicMode = false;
        this.rubicSingleSelect = true;
        this.rubicCapsLockLED = false;
        this.rubicMenuBarSymbol = true;
        this.rubicHoverDwell = false;
        this.rubicButton = null;
        this.aiStatusDot = null;
        this.rubicToggles = null;
        this.rubicAnswerBadge = null;
        this._aiStatusInterval = null;
        this._rubicAnswerTimeout = null;
        this._rubicProcessing = false;
        // Renderer-side audio capture state (used for Whisper on Windows)
        this._audioContext = null;
        this._mediaStream = null;
        this._scriptNode = null;
        this._captureInterval = null;
        
        // Define available skills for navigation
        this.availableSkills = [
            'interview',
            'dsa'
        ];
        this.audioSourceMode = 'system'; // 'system' (interviewer bot voice) or 'microphone'
        this.audioSourceToggle = null;
        this.audioSourceIcon = null;
        
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

            // Load Rubic state
            await this.loadRubicState();

            // Load Audio Source Mode (System Audio vs Mic)
            await this.loadAudioSourceMode();

            // Start AI status polling
            this.startAiStatusPolling();
            
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
            // Default to interactive mode so UI buttons are always responsive
            this.isInteractive = true;
            logger.warn('Failed to load current interaction state, defaulting to interactive', {
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
        this.updateRubicUI();
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
        } else {
            this.mcqToggle.classList.remove('mcq-active');
        }
        this.resizeWindowToContent();
    }

    updateAutoHideToggleState() {
        if (!this.autoHideToggle) return;
        if (this.isAutoHideMode) {
            this.autoHideToggle.classList.add('autohide-active');
            if (typeof this.closeLanguageDropdown === 'function') {
                this.closeLanguageDropdown();
            }
            if (this.shortcutsPopover) this.shortcutsPopover.classList.remove('is-open');
            if (this.clipboardPopover) this.clipboardPopover.classList.remove('is-open');
        } else {
            this.autoHideToggle.classList.remove('autohide-active');
        }
        this.resizeWindowToContent();
    }

    updateAutoTypeState() {
        if (!this.autoTypeButton) return;
        if (this.isTyping) {
            this.autoTypeButton.classList.add('typing-active');
        } else {
            this.autoTypeButton.classList.remove('typing-active');
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
                const savedScale = Math.min(1.0, Math.max(0.55, parseFloat(localStorage.getItem('userBarScale') || '1.0')));
                commandTab.style.zoom = savedScale;

                commandTab.style.width = 'max-content';
                commandTab.style.minWidth = 'max-content';

                const rect = commandTab.getBoundingClientRect();
                let width = Math.ceil(rect.width) + 4;
                let height = Math.ceil(rect.height) + 2;

                // If shortcuts popover is visible, extend height and width to fit it
                if (this.shortcutsPopover && this.shortcutsPopover.classList.contains('is-open')) {
                    const popRect = this.shortcutsPopover.getBoundingClientRect();
                    height = Math.max(height, Math.ceil(rect.height + popRect.height + 16));
                    width = Math.max(width, Math.ceil(popRect.right + 16));
                }

                // If clipboard popover is visible, extend height and width to fit it
                if (this.clipboardPopover && this.clipboardPopover.classList.contains('is-open')) {
                    const popRect = this.clipboardPopover.getBoundingClientRect();
                    height = Math.max(height, Math.ceil(rect.height + popRect.height + 16));
                    width = Math.max(width, Math.ceil(popRect.right + 16));
                }

                // If language dropdown is visible, extend height and width to fit it
                if (this.languageDropdownList && this.languageDropdownList.classList.contains('is-open')) {
                    const dropRect = this.languageDropdownList.getBoundingClientRect();
                    height = Math.max(height, Math.ceil(rect.height + dropRect.height + 16));
                    width = Math.max(width, Math.ceil(dropRect.right + 16));
                }
                
                logger.debug('Resizing window to content', {
                    width,
                    height,
                    scale: savedScale,
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
        this.languageSelector = document.getElementById('languageSelector');
        this.currentLanguageLabel = document.getElementById('currentLanguageLabel');
        this.languageDropdownList = document.getElementById('languageDropdownList');
        this.languageSelect = document.getElementById('codingLanguage');
        this.infoButton = document.getElementById('infoButton');
        this.shortcutsPopover = document.getElementById('shortcutsPopover');
        this.screenshotButton = document.getElementById('screenshotButton');
        this.snapshotCopyBtn = document.getElementById('snapshotCopyBtn');
        this.snapshotCopyIcon = document.getElementById('snapshotCopyIcon');
        this.snapshotCloseBtn = document.getElementById('snapshotCloseBtn');
        this.snapshotCloseIcon = document.getElementById('snapshotCloseIcon');
        this.snapshotExtractedCode = '';
        this.mcqToggle = document.getElementById('mcqToggle');
        this.autoHideToggle = document.getElementById('autoHideToggle');
        this.autoTypeButton = document.getElementById('autoTypeButton');
        this.autoTypeLabel = document.getElementById('autoTypeLabel');
        this.autoTypeProgressFill = document.getElementById('autoTypeProgressFill');
        this.opacitySlider = document.getElementById('opacitySlider');
        this.targetModeBtn = document.getElementById('targetModeBtn');
        this.clipboardHistoryBtn = document.getElementById('clipboardHistoryBtn');
        this.clipboardPopover = document.getElementById('clipboardPopover');
        this.hoverDragProgressBar = document.getElementById('hoverDragProgressBar');
        this.hoverDragProgressFill = document.getElementById('hoverDragProgressFill');
        this.hoverDragStatusBadge = document.getElementById('hoverDragStatusBadge');

        // Apply saved proportional scale on startup
        const initialScale = Math.min(1.0, Math.max(0.55, parseFloat(localStorage.getItem('userBarScale') || '1.0')));
        const initialCommandTab = document.querySelector('.command-tab');
        if (initialCommandTab) {
            initialCommandTab.style.zoom = initialScale;
        }

        // Ensure NO hover comments or tooltips exist anywhere on any button (defeats hidden feature)
        try {
            document.querySelectorAll('[title]').forEach(el => el.removeAttribute('title'));
            const titleObserver = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    if (m.type === 'attributes' && m.attributeName === 'title' && m.target && m.target.removeAttribute) {
                        m.target.removeAttribute('title');
                    }
                }
            });
            titleObserver.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['title'] });
        } catch (_) {}

        // Rubic elements
        this.rubicButton = document.getElementById('rubicButton');
        this.rubicButtonLabel = document.getElementById('rubicButtonLabel') || (this.rubicButton ? this.rubicButton.querySelector('span') : null);
        this.aiStatusDot = document.getElementById('aiStatusDot');
        this.rubicAnswerBox = document.getElementById('rubicAnswerBox');
        this.rubicAnswerVal = document.getElementById('rubicAnswerVal');
        this.rubicToggles = document.getElementById('rubicToggles');
        this.rubicToggleSingle = document.getElementById('rubicToggleSingle');
        this.rubicSingleLabel = document.getElementById('rubicSingleLabel');
        this.rubicToggleLED = document.getElementById('rubicToggleLED');
        this.rubicToggleMenuBar = document.getElementById('rubicToggleMenuBar');

        // Expand/Collapse bar mode (Minimal MCQ vs Full Options)
        this.expandBarBtn = document.getElementById('expandBarBtn');
        this.expandBarIcon = document.getElementById('expandBarIcon');
        this.extendedToolsGroup = document.getElementById('extendedToolsGroup');
        this.extendedPrefixGroup = document.getElementById('extendedPrefixGroup');
        this.isBarExpanded = localStorage.getItem('barExpanded') === 'true'; // default false (minimal MCQ mode)

        this.applyBarMode = () => {
            const commandTab = document.querySelector('.command-tab');
            if (!commandTab || !this.expandBarBtn || !this.expandBarIcon) return;

            const savedScale = Math.min(1.0, Math.max(0.55, parseFloat(localStorage.getItem('userBarScale') || '1.0')));
            commandTab.style.zoom = savedScale;

            if (this.isBarExpanded) {
                commandTab.classList.remove('is-minimal');
                this.expandBarBtn.classList.add('is-expanded');
                this.expandBarIcon.className = 'fas fa-chevron-left';
            } else {
                commandTab.classList.add('is-minimal');
                this.expandBarBtn.classList.remove('is-expanded');
                this.expandBarIcon.className = 'fas fa-chevron-right';
            }

            commandTab.style.width = 'max-content';
            commandTab.style.minWidth = 'max-content';

            this.resizeWindowToContent();
        };

        const toggleExpandAction = () => {
            this.isBarExpanded = !this.isBarExpanded;
            localStorage.setItem('barExpanded', this.isBarExpanded ? 'true' : 'false');
            this.applyBarMode();
        };

        if (this.expandBarBtn) {
            this.expandBarBtn.addEventListener('click', toggleExpandAction);
            if (window.RubicHoverDwell) {
                window.RubicHoverDwell.attach(this.expandBarBtn, toggleExpandAction);
            }
        }

        // Apply initial bar mode
        this.applyBarMode();

        // Restore last detected answer if stored in localStorage
        try {
            const savedAnswer = localStorage.getItem('rubicLastAnswer');
            if (savedAnswer && this.rubicAnswerVal && this.rubicAnswerBox) {
                this.rubicAnswerVal.textContent = savedAnswer;
                this.rubicAnswerBox.style.display = 'inline-flex';
            }
        } catch (_) {}

        if (!this.skillIndicator || !this.micButton || !this.screenshotButton) {
            throw new Error('Required UI elements not found');
        }

        // 1. Screenshot click & hover-dwell handler (1 second forward hover or instant click)
        const triggerScreenshotAction = () => {
            if (window.electronAPI && window.electronAPI.takeScreenshot) {
                window.electronAPI.takeScreenshot();
            }
        };
        if (this.screenshotButton) {
            this.screenshotButton.addEventListener('click', triggerScreenshotAction);
            if (window.RubicHoverDwell) {
                window.RubicHoverDwell.attach(this.screenshotButton, triggerScreenshotAction, { dwellMs: 1000 });
            }
        }

        // 1b. Snapshot code copy button (Click OR 1s forward hover dwell to copy)
        const triggerCopySnapshotCode = async () => {
            if (!this.snapshotExtractedCode) return;
            let ok = false;
            try {
                if (window.electronAPI && typeof window.electronAPI.copyToClipboard === 'function') {
                    ok = await window.electronAPI.copyToClipboard(this.snapshotExtractedCode);
                }
                if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(this.snapshotExtractedCode);
                    ok = true;
                }
            } catch (err) {
                logger.warn('Failed to copy snapshot code to clipboard', err);
            }
            if (ok && this.snapshotCopyIcon) {
                this.snapshotCopyIcon.className = 'fas fa-check';
                setTimeout(() => {
                    if (this.snapshotCopyIcon) {
                        this.snapshotCopyIcon.className = 'fas fa-copy';
                    }
                }, 1500);
            }
        };

        if (this.snapshotCopyBtn) {
            this.snapshotCopyBtn.addEventListener('click', triggerCopySnapshotCode);
            if (window.RubicHoverDwell) {
                window.RubicHoverDwell.attach(this.snapshotCopyBtn, triggerCopySnapshotCode, { dwellMs: 1000 });
            }
        }

        const triggerCloseSnapshotWindow = async () => {
            if (window.electronAPI && window.electronAPI.hideLLMResponse) {
                await window.electronAPI.hideLLMResponse();
            } else if (window.electronAPI && window.electronAPI.closeWindow) {
                await window.electronAPI.closeWindow();
            }
            if (this.snapshotCloseBtn) {
                this.snapshotCloseBtn.style.display = 'none';
            }
            if (this.snapshotCopyBtn) {
                this.snapshotCopyBtn.style.display = 'none';
            }
            this.resizeWindowToContent();
        };

        if (this.snapshotCloseBtn) {
            this.snapshotCloseBtn.addEventListener('click', triggerCloseSnapshotWindow);
            if (window.RubicHoverDwell) {
                window.RubicHoverDwell.attach(this.snapshotCloseBtn, triggerCloseSnapshotWindow, { dwellMs: 1000 });
            }
        }

        if (this.targetModeBtn) {
            this.targetModeBtn.addEventListener('click', () => {
                if (window.electronAPI && window.electronAPI.showTargetBox) {
                    window.electronAPI.showTargetBox();
                }
            });
        }

        if (this.clipboardHistoryBtn) {
            this.clipboardHistoryBtn.addEventListener('click', (e) => {
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

        // 2. MCQ toggle click & hover-dwell handler
        const toggleMcqAction = async () => {
            if (window.electronAPI && window.electronAPI.toggleMcqMode) {
                try {
                    const res = await window.electronAPI.toggleMcqMode();
                    this.isMcqMode = res ? res.isMcqMode : !this.isMcqMode;
                    this.updateMcqToggleState();
                } catch (e) {
                    logger.error('Failed to toggle MCQ mode', e);
                }
            }
        };
        if (this.mcqToggle) {
            this.mcqToggle.addEventListener('click', toggleMcqAction);
            if (window.RubicHoverDwell) {
                window.RubicHoverDwell.attach(this.mcqToggle, toggleMcqAction);
            }
        }

        // 3. Rubic Universal Button (Instant MCQ scan: Click OR Hover 3s)
        const triggerRubicAction = async () => {
            if (this._rubicProcessing) return;
            this._rubicProcessing = true;

            // Safety timeout: automatically reset thinking state after 12s if not already resolved
            if (this._rubicWatchdog) clearTimeout(this._rubicWatchdog);
            this._rubicWatchdog = setTimeout(() => {
                this._rubicProcessing = false;
                if (this.rubicButton) {
                    this.rubicButton.classList.remove('rubic-processing');
                    this.rubicButton.classList.remove('rubic-active');
                }
                if (this.rubicButtonLabel) {
                    this.rubicButtonLabel.textContent = 'Rubic';
                }
            }, 12000);

            if (window.electronAPI && window.electronAPI.triggerRubicMCQ) {
                try {
                    if (this.rubicButton) {
                        this.rubicButton.classList.add('rubic-processing');
                        this.rubicButton.classList.remove('rubic-active');
                    }
                    if (this.rubicButtonLabel) {
                        this.rubicButtonLabel.textContent = 'Thinking...';
                    }
                    await window.electronAPI.triggerRubicMCQ();
                } catch (e) {
                    logger.error('Rubic MCQ trigger failed', e);
                    if (this.rubicButton) {
                        this.rubicButton.classList.remove('rubic-processing');
                    }
                    if (this.rubicButtonLabel) {
                        this.rubicButtonLabel.textContent = 'Rubic';
                    }
                } finally {
                    this._rubicProcessing = false;
                    if (this._rubicWatchdog) {
                        clearTimeout(this._rubicWatchdog);
                        this._rubicWatchdog = null;
                    }
                }
            } else {
                this._rubicProcessing = false;
                if (this._rubicWatchdog) {
                    clearTimeout(this._rubicWatchdog);
                    this._rubicWatchdog = null;
                }
            }
        };
        if (this.rubicButton) {
            this.rubicButton.addEventListener('click', triggerRubicAction);
            if (window.RubicHoverDwell) {
                window.RubicHoverDwell.attach(this.rubicButton, triggerRubicAction, { dwellMs: 1000 });
            }
        }

        // 4. Rubic sub-toggle: Single/Multi select (1 / M)
        if (this.rubicToggleSingle) {
            const toggleSingleAction = async () => {
                this.rubicSingleSelect = !this.rubicSingleSelect;
                if (window.electronAPI && window.electronAPI.setRubicOption) {
                    await window.electronAPI.setRubicOption('singleSelect', this.rubicSingleSelect);
                }
                this.updateRubicToggles();
                this.resizeWindowToContent();
            };
            this.rubicToggleSingle.addEventListener('click', toggleSingleAction);
            if (window.RubicHoverDwell) {
                window.RubicHoverDwell.attach(this.rubicToggleSingle, toggleSingleAction);
            }
        }

        // 5. Rubic sub-toggle: Caps Lock LED
        if (this.rubicToggleLED) {
            const toggleLEDAction = async () => {
                this.rubicCapsLockLED = !this.rubicCapsLockLED;
                if (window.electronAPI && window.electronAPI.setRubicOption) {
                    await window.electronAPI.setRubicOption('capsLockLED', this.rubicCapsLockLED);
                }
                this.updateRubicToggles();
            };
            this.rubicToggleLED.addEventListener('click', toggleLEDAction);
            if (window.RubicHoverDwell) {
                window.RubicHoverDwell.attach(this.rubicToggleLED, toggleLEDAction);
            }
        }

        // 6. Rubic sub-toggle: Menu Bar Symbol
        if (this.rubicToggleMenuBar) {
            const toggleMenuBarAction = async () => {
                this.rubicMenuBarSymbol = !this.rubicMenuBarSymbol;
                if (window.electronAPI && window.electronAPI.setRubicOption) {
                    await window.electronAPI.setRubicOption('menuBarSymbol', this.rubicMenuBarSymbol);
                }
                this.updateRubicToggles();
            };
            this.rubicToggleMenuBar.addEventListener('click', toggleMenuBarAction);
            if (window.RubicHoverDwell) {
                window.RubicHoverDwell.attach(this.rubicToggleMenuBar, toggleMenuBarAction);
            }
        }

        // 7. Auto-Hide toggle click & hover-dwell handler
        const toggleAutoHideAction = async () => {
            if (window.electronAPI && window.electronAPI.toggleAutoHideMode) {
                try {
                    const res = await window.electronAPI.toggleAutoHideMode();
                    this.isAutoHideMode = res ? res.isAutoHideMode : !this.isAutoHideMode;
                    this.updateAutoHideToggleState();
                } catch (e) {
                    logger.error('Failed to toggle Auto-Hide mode', e);
                }
            }
        };
        if (this.autoHideToggle) {
            this.autoHideToggle.addEventListener('click', toggleAutoHideAction);
            if (window.RubicHoverDwell) {
                window.RubicHoverDwell.attach(this.autoHideToggle, toggleAutoHideAction);
            }
        }

        // 8. Auto-type clipboard click & hover-dwell handler
        const triggerAutoTypeAction = async () => {
            if (window.electronAPI && window.electronAPI.typeClipboard) {
                try {
                    await window.electronAPI.typeClipboard();
                } catch (e) {
                    logger.error('Failed to trigger auto-type', e);
                }
            }
        };
        if (this.autoTypeButton) {
            this.autoTypeButton.addEventListener('click', triggerAutoTypeAction);
            if (window.RubicHoverDwell) {
                window.RubicHoverDwell.attach(this.autoTypeButton, triggerAutoTypeAction);
            }
        }

        // Opacity / Transparency slider handler
        if (this.opacitySlider) {
            const savedOpacityVal = localStorage.getItem('userOpacityVal');
            if (savedOpacityVal !== null) {
                this.opacitySlider.value = savedOpacityVal;
            }
            let val = parseInt(this.opacitySlider.value, 10);
            let opacity = Math.max(0.20, Math.min(1.0, val / 100));
            document.body.style.opacity = opacity.toString();
            // Broadcast initial opacity so all auxiliary windows are synced immediately
            if (window.electronAPI && window.electronAPI.setOpacity) {
                window.electronAPI.setOpacity(opacity);
            }

            this.opacitySlider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value, 10);
                localStorage.setItem('userOpacityVal', val.toString());
                const opacity = Math.max(0.20, Math.min(1.0, val / 100));
                document.body.style.opacity = opacity.toString();
                if (window.electronAPI && window.electronAPI.setOpacity) {
                    window.electronAPI.setOpacity(opacity);
                }
            });
            // Prevent drag region from stealing the slider interaction
            this.opacitySlider.addEventListener('mousedown', (e) => e.stopPropagation());
        }

        // Double-clicking on the bar (empty spaces, separators, in between buttons) quits the app cleanly
        const commandTab = document.querySelector('.command-tab');
        if (commandTab) {
            commandTab.addEventListener('dblclick', (e) => {
                // If clicked on an interactive control, ignore
                const isControl = e.target.closest('.command-item, input, select, button, #barResizeHandle, .language-dropdown-list, .rubic-toggles, .opacity-control');
                if (!isControl) {
                    logger.info('Double-click on bar background detected -> Quitting app');
                    if (window.electronAPI && window.electronAPI.quitApp) {
                        window.electronAPI.quitApp();
                    } else if (window.electronAPI && window.electronAPI.quit) {
                        window.electronAPI.quit();
                    } else if (window.api && window.api.send) {
                        window.api.send('quit-app');
                    }
                }
            });
        }

        // Corner resize handle (bottom-right) - Supports proportional scale on mousedown AND 3s hover-dwell cursor drag
        this.barResizeHandle = document.getElementById('barResizeHandle');
        if (this.barResizeHandle) {
            let isResizing = false;
            let startX = 0;
            let startY = 0;
            let startScale = 1.0;

            const onMouseMove = (moveEvent) => {
                if (!isResizing) return;
                moveEvent.preventDefault();
                const deltaX = moveEvent.screenX - startX;
                const deltaY = moveEvent.screenY - startY;
                const delta = (deltaX * 0.7) + (deltaY * 0.3);
                const deltaScale = delta / 260;
                let newScale = startScale + deltaScale;
                newScale = Math.min(1.0, Math.max(0.55, Math.round(newScale * 100) / 100));

                const cmdTab = document.querySelector('.command-tab');
                if (cmdTab) {
                    cmdTab.style.zoom = newScale;
                    const rect = cmdTab.getBoundingClientRect();
                    const w = Math.ceil(rect.width) + 4;
                    const h = Math.ceil(rect.height) + 2;
                    if (window.electronAPI && window.electronAPI.resizeWindow) {
                        window.electronAPI.resizeWindow(w, h);
                    }
                }
            };

            const onMouseUp = () => {
                if (!isResizing) return;
                isResizing = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                const cmdTab = document.querySelector('.command-tab');
                if (cmdTab) {
                    const currentScale = parseFloat(cmdTab.style.zoom) || 1.0;
                    localStorage.setItem('userBarScale', currentScale.toString());
                }
                this.resizeWindowToContent();
            };

            // --- Stealth Hover-Dwell Drag & Drop (Zero-click, 3s hover to pick up, 3s dwell to drop) ---
            let isHooked = false;
            let hoverStartTime = null;
            let hoverAnimFrame = null;
            const dwellDuration = 3000;

            const cancelHoverHook = () => {
                if (isHooked) return;
                if (hoverAnimFrame) {
                    cancelAnimationFrame(hoverAnimFrame);
                    hoverAnimFrame = null;
                }
                hoverStartTime = null;
                if (this.hoverDragProgressBar) this.hoverDragProgressBar.classList.remove('is-visible');
                if (this.hoverDragStatusBadge) this.hoverDragStatusBadge.classList.remove('is-visible');
                if (this.hoverDragProgressFill) this.hoverDragProgressFill.style.width = '0%';
            };

            const startHoverHook = () => {
                if (isHooked || isResizing) return;
                hoverStartTime = performance.now();
                if (this.hoverDragProgressBar) this.hoverDragProgressBar.classList.add('is-visible');
                if (this.hoverDragStatusBadge) {
                    this.hoverDragStatusBadge.textContent = 'Hold 3s to pick up...';
                    this.hoverDragStatusBadge.classList.add('is-visible');
                }

                const animate = () => {
                    if (isHooked || isResizing || !hoverStartTime) return;
                    const elapsed = performance.now() - hoverStartTime;
                    const progress = Math.min(elapsed / dwellDuration, 1.0);

                    if (this.hoverDragProgressFill) {
                        this.hoverDragProgressFill.style.width = `${progress * 100}%`;
                    }

                    if (progress >= 1.0) {
                        isHooked = true;
                        hoverStartTime = null;
                        const commandTab = document.querySelector('.command-tab');
                        if (commandTab) commandTab.classList.add('is-hooked-dragging');

                        if (this.hoverDragProgressFill) {
                            this.hoverDragProgressFill.style.width = '0%';
                        }
                        if (this.hoverDragStatusBadge) {
                            this.hoverDragStatusBadge.textContent = 'Moving with cursor... hold still 3s to place';
                        }

                        if (window.electronAPI && window.electronAPI.startHoverDrag) {
                            window.electronAPI.startHoverDrag();
                        }
                        return;
                    }

                    hoverAnimFrame = requestAnimationFrame(animate);
                };

                hoverAnimFrame = requestAnimationFrame(animate);
            };

            this.barResizeHandle.addEventListener('mouseenter', startHoverHook);
            this.barResizeHandle.addEventListener('mouseleave', cancelHoverHook);

            this.barResizeHandle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                cancelHoverHook();
                isResizing = true;
                startX = e.screenX;
                startY = e.screenY;
                const cmdTab = document.querySelector('.command-tab');
                const saved = parseFloat(localStorage.getItem('userBarScale') || '1.0');
                startScale = (cmdTab && cmdTab.style.zoom) ? parseFloat(cmdTab.style.zoom) : (isNaN(saved) ? 1.0 : saved);
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            // Listen to main process cursor tracking status during drag
            if (window.electronAPI && window.electronAPI.onHoverDragStatus) {
                window.electronAPI.onHoverDragStatus((status) => {
                    if (!isHooked) return;
                    if (status.isStationary) {
                        if (this.hoverDragProgressFill) {
                            this.hoverDragProgressFill.style.width = `${status.progress * 100}%`;
                        }
                        if (this.hoverDragStatusBadge) {
                            const remaining = Math.max(1, Math.ceil(3 * (1 - status.progress)));
                            this.hoverDragStatusBadge.textContent = `Placing in ${remaining}s...`;
                        }
                    } else {
                        if (this.hoverDragProgressFill) {
                            this.hoverDragProgressFill.style.width = '0%';
                        }
                        if (this.hoverDragStatusBadge) {
                            this.hoverDragStatusBadge.textContent = 'Moving with cursor... hold still 3s to place';
                        }
                    }
                });
            }

            // Listen to unhook event when 3s dwell at new location completes
            if (window.electronAPI && window.electronAPI.onHoverDragUnhooked) {
                window.electronAPI.onHoverDragUnhooked((pos) => {
                    isHooked = false;
                    const commandTab = document.querySelector('.command-tab');
                    if (commandTab) commandTab.classList.remove('is-hooked-dragging');

                    if (this.hoverDragProgressFill) {
                        this.hoverDragProgressFill.style.width = '100%';
                    }
                    if (this.hoverDragStatusBadge) {
                        this.hoverDragStatusBadge.textContent = '✓ Locked & Saved';
                    }

                    setTimeout(() => {
                        if (!isHooked) {
                            if (this.hoverDragProgressBar) this.hoverDragProgressBar.classList.remove('is-visible');
                            if (this.hoverDragStatusBadge) this.hoverDragStatusBadge.classList.remove('is-visible');
                            if (this.hoverDragProgressFill) this.hoverDragProgressFill.style.width = '0%';
                        }
                    }, 800);
                });
            }
        }

        // Instant mouse leave listener for auto-hide and context menu
        const mainBarTab = document.querySelector('.command-tab');
        if (mainBarTab) {
            mainBarTab.addEventListener('mouseleave', () => {
                if (this.isAutoHideActive && window.electronAPI && window.electronAPI.checkAutoHide) {
                    window.electronAPI.checkAutoHide();
                }
            });

            // Right-click on command tab toggles shortcuts/help/quit popover
            mainBarTab.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (this.shortcutsPopover) {
                    this.toggleShortcutsPopover();
                }
            });

        }

        // Quit Cluely button handler in shortcuts popover
        const quitAppBtn = document.getElementById('quitAppBtn');
        if (quitAppBtn) {
            quitAppBtn.addEventListener('click', () => {
                if (window.electronAPI && window.electronAPI.quitApp) {
                    window.electronAPI.quitApp();
                } else if (window.electronAPI && window.electronAPI.quit) {
                    window.electronAPI.quit();
                }
            });
        }

        // Skill indicator click & hover handler cycles DSA and Interview skills
        const toggleSkillAction = () => {
            const nextSkill = this.currentSkill === 'dsa' ? 'interview' : 'dsa';
            if (window.electronAPI && window.electronAPI.updateActiveSkill) {
                window.electronAPI.updateActiveSkill(nextSkill).then(() => {
                    this.handleSkillActivated(nextSkill);
                });
            } else {
                this.handleSkillActivated(nextSkill);
            }
        };
        this.skillIndicator.addEventListener('click', toggleSkillAction);
        if (window.RubicHoverDwell) {
            window.RubicHoverDwell.attach(this.skillIndicator, toggleSkillAction);
        }

        // Check for required elements (settingsIndicator is optional)
        if (this.settingsIndicator) {
            this.settingsIndicator.addEventListener('click', () => {
                this.showSettingsMenu();
            });
        }

        // 9. Microphone click & hover-dwell handler
        const toggleMicAction = async () => {
            if (this.speechAvailable) {
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
            } else {
                logger.warn('Mic clicked but speech recognition is not available', {
                    component: 'MainWindowUI'
                });
                this.loadSpeechAvailability();
            }
        };
        this.micButton.addEventListener('click', toggleMicAction);
        if (window.RubicHoverDwell) {
            window.RubicHoverDwell.attach(this.micButton, toggleMicAction);
        }

        // Language custom dropdown with 3-second hover dwell selection
        this.setupLanguageSelector();

        // Theme toggle (Dark / Light) with click and 3s hover dwell
        this.setupThemeToggle();

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
                    const num = typeof opacity === 'number' ? opacity : parseFloat(opacity);
                    if (!isNaN(num)) {
                        document.body.style.opacity = num.toString();
                        if (this.opacitySlider) {
                            this.opacitySlider.value = Math.round(num * 100).toString();
                            localStorage.setItem('userOpacityVal', this.opacitySlider.value);
                        }
                    }
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

            if (window.electronAPI.onAudioSourceModeChanged) {
                window.electronAPI.onAudioSourceModeChanged(({ mode }) => {
                    this.setAudioSourceModeUI(mode);
                });
            }

            // Listen for coding language changes from other windows
            window.electronAPI.onCodingLanguageChanged((event, data) => {
                if (data && data.language) {
                    this.updateLanguageUI(data.language);
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

            // Listen for Rubic Mode changes
            if (window.electronAPI.onRubicModeChanged) {
                window.electronAPI.onRubicModeChanged((event, data) => {
                    if (data) this.applyRubicState(data);
                });
            }

            // Listen for Rubic answer results
            if (window.electronAPI.onRubicAnswer) {
                window.electronAPI.onRubicAnswer((event, data) => {
                    this.handleRubicAnswer(data);
                });
            }

            // Listen for Rubic status updates (processing yellow glow/blink vs idle)
            if (window.electronAPI.onRubicStatus) {
                window.electronAPI.onRubicStatus((event, data) => {
                    if (!data) return;
                    if (data.state === 'processing') {
                        if (this.rubicButton) {
                            this.rubicButton.classList.add('rubic-processing');
                            this.rubicButton.classList.remove('rubic-active');
                        }
                        if (this.rubicButtonLabel) {
                            this.rubicButtonLabel.textContent = 'Thinking...';
                        }
                    } else if (data.state === 'idle') {
                        this._rubicProcessing = false;
                        if (this.rubicButton) {
                            this.rubicButton.classList.remove('rubic-processing');
                        }
                        if (this.rubicButtonLabel) {
                            this.rubicButtonLabel.textContent = 'Rubic';
                        }
                    }
                });
            }

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

            // Listen for snapshot code availability to show/hide copy button
            const handleSnapshotCode = (event, data) => {
                const info = (data !== undefined && data !== null && typeof data === 'object') ? data : event;
                if (info && info.hasCode && info.code) {
                    this.snapshotExtractedCode = info.code;
                    if (this.snapshotCopyBtn) {
                        this.snapshotCopyBtn.style.display = 'inline-flex';
                        this.resizeWindowToContent();
                    }
                } else {
                    this.snapshotExtractedCode = '';
                    if (this.snapshotCopyBtn) {
                        this.snapshotCopyBtn.style.display = 'none';
                        this.resizeWindowToContent();
                    }
                }
            };
            if (window.electronAPI && window.electronAPI.onSnapshotCodeAvailable) {
                window.electronAPI.onSnapshotCodeAvailable(handleSnapshotCode);
            }
            if (window.electronAPI && window.electronAPI.receive) {
                window.electronAPI.receive('snapshot-code-available', handleSnapshotCode);
            }

            // Listen for AI response window open/close state to show/hide close button
            const handleLLMWindowState = (event, data) => {
                const info = (data !== undefined && data !== null && typeof data === 'object') ? data : event;
                const isOpen = !!(info && info.isOpen);
                if (this.snapshotCloseBtn) {
                    this.snapshotCloseBtn.style.display = isOpen ? 'inline-flex' : 'none';
                }
                if (!isOpen && this.snapshotCopyBtn) {
                    this.snapshotCopyBtn.style.display = 'none';
                }
                this.resizeWindowToContent();
            };

            if (window.electronAPI && window.electronAPI.onLLMWindowState) {
                window.electronAPI.onLLMWindowState(handleLLMWindowState);
            }
            if (window.electronAPI && window.electronAPI.receive) {
                window.electronAPI.receive('llm-window-state', handleLLMWindowState);
            }

            // Sync initial LLM window state
            if (window.electronAPI && window.electronAPI.isLLMResponseOpen) {
                window.electronAPI.isLLMResponseOpen().then((isOpen) => {
                    if (this.snapshotCloseBtn) {
                        this.snapshotCloseBtn.style.display = isOpen ? 'inline-flex' : 'none';
                    }
                    if (!isOpen && this.snapshotCopyBtn) {
                        this.snapshotCopyBtn.style.display = 'none';
                    }
                    this.resizeWindowToContent();
                }).catch(() => {});
            }


            
            // Global keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                // Rubic MCQ shortcut (Alt+S or Alt+R if not recording)
                if (e.altKey && (e.key === 's' || e.key === 'ß')) {
                    e.preventDefault();
                    triggerRubicAction();
                }
                if (e.altKey && (e.key === 'r' || e.key === '®')) {
                    e.preventDefault();
                    if (!this.speechAvailable) return;
                    if (this.isRecording) {
                        window.electronAPI.stopSpeechRecognition();
                    } else {
                        window.electronAPI.startSpeechRecognition();
                    }
                }
                if (e.altKey && (e.key === 'v' || e.key === '√')) {
                    e.preventDefault();
                    if (window.electronAPI && window.electronAPI.typeClipboard) {
                        window.electronAPI.typeClipboard();
                    }
                }
                if (e.altKey && (e.key === 'm' || e.key === 'µ')) {
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
        if (skillName === 'interview') {
            this.setAudioSourceModeUI('system');
            if (window.electronAPI && window.electronAPI.setAudioSourceMode) {
                window.electronAPI.setAudioSourceMode('system').catch(() => {});
            }
        }
        
        logger.info('Skill activated', {
            component: 'MainWindowUI',
            skill: skillName
        });
    }

    setAudioSourceModeUI(mode) {
        this.audioSourceMode = mode === 'microphone' ? 'microphone' : 'system';
        if (this.audioSourceToggle) {
            if (this.audioSourceMode === 'system') {
                this.audioSourceToggle.classList.add('active');
                this.audioSourceToggle.title = 'Audio Source: System Audio (Interviewer Bot Speech) - Click for Mic';
                if (this.audioSourceIcon) {
                    this.audioSourceIcon.className = 'fas fa-volume-high';
                }
            } else {
                this.audioSourceToggle.classList.remove('active');
                this.audioSourceToggle.title = 'Audio Source: Microphone (Candidate Voice) - Click for System Audio';
                if (this.audioSourceIcon) {
                    this.audioSourceIcon.className = 'fas fa-microphone-lines';
                }
            }
        }
    }

    async loadAudioSourceMode() {
        if (window.electronAPI && window.electronAPI.getAudioSourceMode) {
            try {
                const mode = await window.electronAPI.getAudioSourceMode();
                if (mode) {
                    this.setAudioSourceModeUI(mode);
                }
            } catch (_) {}
        }
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

    setupLanguageSelector() {
        if (!this.languageSelector || !this.languageDropdownList) return;

        // Initialize with saved settings
        if (window.electronAPI && window.electronAPI.getSettings) {
            window.electronAPI.getSettings().then(settings => {
                const lang = (settings && settings.codingLanguage) ? settings.codingLanguage : 'cpp';
                this.updateLanguageUI(lang);
            }).catch(() => {
                this.updateLanguageUI('cpp');
            });
        } else {
            this.updateLanguageUI('cpp');
        }

        // Toggle dropdown open/closed
        const toggleDropdown = () => {
            if (!this.isInteractive) return;
            const isOpen = this.languageDropdownList.classList.contains('is-open');
            if (isOpen) {
                this.closeLanguageDropdown();
            } else {
                this.openLanguageDropdown();
            }
        };

        this.languageSelector.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown();
        });

        if (window.RubicHoverDwell) {
            // Hover-dwell on selector header ONLY opens the menu, never closes it while user is deciding!
            window.RubicHoverDwell.attach(this.languageSelector, () => {
                if (!this.isInteractive) return;
                if (!this.languageDropdownList.classList.contains('is-open')) {
                    this.openLanguageDropdown();
                }
            });
        }

        // Wire each language option with both click AND 3-second hover dwell selection!
        const options = this.languageDropdownList.querySelectorAll('.language-option');
        options.forEach(opt => {
            const langVal = opt.getAttribute('data-value');
            let dwellAnimId = null;
            let dwellStartTime = null;
            const dwellDuration = 3000; // 3 seconds hover to select

            const cancelDwell = () => {
                if (dwellAnimId) {
                    cancelAnimationFrame(dwellAnimId);
                    dwellAnimId = null;
                }
                dwellStartTime = null;
                opt.classList.remove('dwelling');
                const fill = opt.querySelector('.lang-dwell-fill');
                if (fill) fill.style.width = '0%';
            };

            const startDwell = () => {
                cancelDwell();
                if (window.RubicHoverDwell) {
                    window.RubicHoverDwell.cancelAll();
                }
                options.forEach(other => {
                    if (other !== opt) {
                        other.classList.remove('dwelling');
                        const f = other.querySelector('.lang-dwell-fill');
                        if (f) f.style.width = '0%';
                    }
                });

                dwellStartTime = performance.now();
                opt.classList.add('dwelling');
                const fill = opt.querySelector('.lang-dwell-fill');

                const step = (now) => {
                    if (!dwellStartTime) return;
                    const elapsed = now - dwellStartTime;
                    const progress = Math.min(elapsed / dwellDuration, 1);
                    if (fill) {
                        fill.style.width = `${progress * 100}%`;
                    }
                    if (progress >= 1) {
                        cancelDwell();
                        logger.info('Language selected via 3-second hover dwell:', langVal);
                        this.selectLanguage(langVal);
                        return;
                    }
                    dwellAnimId = requestAnimationFrame(step);
                };
                dwellAnimId = requestAnimationFrame(step);
            };

            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                cancelDwell();
                this.selectLanguage(langVal);
            });

            opt.addEventListener('mouseenter', (e) => {
                e.stopPropagation();
                startDwell();
            });

            opt.addEventListener('mouseleave', (e) => {
                e.stopPropagation();
                cancelDwell();
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.languageDropdownList && this.languageDropdownList.classList.contains('is-open')) {
                const isClickInside = this.languageSelector.contains(e.target) || this.languageDropdownList.contains(e.target);
                if (!isClickInside) {
                    this.closeLanguageDropdown();
                }
            }
        });
    }

    getLanguageDisplayName(lang) {
        const langDisplayNames = {
            cpp: 'C++',
            c: 'C',
            python: 'Python',
            java: 'Java',
            javascript: 'JavaScript'
        };
        return langDisplayNames[lang] || 'C++';
    }

    updateLanguageUI(lang) {
        const displayName = this.getLanguageDisplayName(lang);
        if (this.currentLanguageLabel) {
            this.currentLanguageLabel.textContent = displayName;
        }
        if (this.languageSelect) {
            this.languageSelect.value = lang;
        }
        if (this.languageDropdownList) {
            const options = this.languageDropdownList.querySelectorAll('.language-option');
            options.forEach(opt => {
                if (opt.getAttribute('data-value') === lang) {
                    opt.classList.add('active');
                } else {
                    opt.classList.remove('active');
                }
            });
        }
        this.resizeWindowToContent();
    }

    selectLanguage(lang) {
        this.updateLanguageUI(lang);
        if (window.electronAPI && window.electronAPI.saveSettings) {
            window.electronAPI.saveSettings({ codingLanguage: lang });
        }
        this.closeLanguageDropdown();
    }

    openLanguageDropdown() {
        if (!this.languageDropdownList) return;
        if (window.RubicHoverDwell) window.RubicHoverDwell.cancelAll();
        this.languageDropdownList.classList.add('is-open');
        if (this.languageSelector) this.languageSelector.classList.add('is-open');
        this.resizeWindowToContent();
    }

    closeLanguageDropdown() {
        if (!this.languageDropdownList) return;
        this.languageDropdownList.classList.remove('is-open');
        if (this.languageSelector) this.languageSelector.classList.remove('is-open');
        // Reset dwell animation state on all options
        const fills = this.languageDropdownList.querySelectorAll('.lang-dwell-fill');
        fills.forEach(f => { f.style.width = '0%'; });
        const options = this.languageDropdownList.querySelectorAll('.language-option');
        options.forEach(opt => opt.classList.remove('dwelling'));
        this.resizeWindowToContent();
    }

    setupThemeToggle() {
        this.themeToggleBtn = document.getElementById('themeToggleBtn');
        this.themeToggleIcon = document.getElementById('themeToggleIcon');
        if (!this.themeToggleBtn) return;

        const applyTheme = (theme) => {
            const isLight = theme === 'light';
            const commandTab = document.querySelector('.command-tab');
            if (isLight) {
                document.body.classList.add('theme-light');
                if (commandTab) commandTab.classList.add('theme-light');
                if (this.themeToggleIcon) {
                    this.themeToggleIcon.className = 'fas fa-moon';
                }
            } else {
                document.body.classList.remove('theme-light');
                if (commandTab) commandTab.classList.remove('theme-light');
                if (this.themeToggleIcon) {
                    this.themeToggleIcon.className = 'fas fa-sun';
                }
            }
        };

        const toggleTheme = () => {
            if (!this.isInteractive) return;
            const currentTheme = document.body.classList.contains('theme-light') ? 'light' : 'dark';
            const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
            applyTheme(nextTheme);
            localStorage.setItem('userTheme', nextTheme);
            if (window.electronAPI && window.electronAPI.setTheme) {
                window.electronAPI.setTheme(nextTheme);
            }
        };

        // Initialize from localStorage or electron
        const savedTheme = localStorage.getItem('userTheme') || 'dark';
        applyTheme(savedTheme);
        if (window.electronAPI && window.electronAPI.setTheme) {
            window.electronAPI.setTheme(savedTheme);
        }

        this.themeToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTheme();
        });

        if (window.RubicHoverDwell) {
            window.RubicHoverDwell.attach(this.themeToggleBtn, toggleTheme);
        }

        if (window.electronAPI && window.electronAPI.onThemeChanged) {
            window.electronAPI.onThemeChanged((event, theme) => {
                applyTheme(theme);
            });
        }
    }

    /**
     * Capture microphone audio in the renderer using the Web Audio API.
     * This is used for Whisper on Windows and macOS where renderer getUserMedia
     * handles TCC audio intake cleanly.
     */
    async _startRendererAudioCapture() {
        try {
            this._stopRendererAudioCapture();

            let stream = null;
            const platform = (typeof navigator !== 'undefined' &&
              ((navigator.userAgentData && navigator.userAgentData.platform) ||
                navigator.platform || '')).toLowerCase();
            const isWindows = platform.includes('win');

            // In system mode (interviewer bot speech), attempt direct internal desktop audio capture
            if (this.audioSourceMode === 'system') {
                try {
                    if (window.electronAPI && window.electronAPI.getDesktopSources) {
                        const sources = await window.electronAPI.getDesktopSources();
                        if (sources && sources.length > 0) {
                            const screenSource = sources[0];
                            const desktopStream = await navigator.mediaDevices.getUserMedia({
                                audio: {
                                    mandatory: {
                                        chromeMediaSource: 'desktop',
                                        chromeMediaSourceId: screenSource.id
                                    }
                                },
                                video: {
                                    mandatory: {
                                        chromeMediaSource: 'desktop',
                                        chromeMediaSourceId: screenSource.id
                                    }
                                }
                            });
                            if (desktopStream && desktopStream.getAudioTracks().length > 0) {
                                desktopStream.getVideoTracks().forEach(track => track.stop());
                                stream = desktopStream;
                                logger.info('Direct internal desktop system audio captured successfully (undetected)', {
                                    component: 'MainWindowUI'
                                });
                            } else if (desktopStream) {
                                desktopStream.getTracks().forEach(t => t.stop());
                            }
                        }
                    }
                } catch (desktopErr) {
                    logger.warn('Direct desktop audio stream unavailable, falling back to speaker intake', {
                        component: 'MainWindowUI',
                        error: desktopErr.message
                    });
                }
            }

            // Capture speaker/voice via microphone without AEC & noise suppression
            // so interviewer voice coming from speakers is cleanly captured!
            if (!stream || stream.getAudioTracks().length === 0) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: false,
                            noiseSuppression: false,
                            autoGainControl: true
                        }
                    });
                } catch (e1) {
                    logger.warn('AEC-free audio intake failed, falling back to default mic', { error: e1.message });
                    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                }
            }

            this._mediaStream = stream;

            const audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });
            this._audioContext = audioContext;

            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            const source = audioContext.createMediaStreamSource(stream);
            this._audioSource = source;
            const bufferSize = 4096;
            const scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
            this._scriptNode = scriptNode;

            let chunkCount = 0;
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
                chunkCount++;
                if (chunkCount === 1) {
                    logger.info('Live audio stream active: first chunk transmitted to Whisper engine');
                }
                window.electronAPI.sendAudioChunk(pcm16.buffer);
            };

            // Connect scriptNode through a zero-gain node to audioContext.destination
            // so the Web Audio pipeline runs continuously without feedback to the speakers
            const muteGain = audioContext.createGain();
            muteGain.gain.value = 0;
            this._muteGain = muteGain;

            source.connect(scriptNode);
            scriptNode.connect(muteGain);
            muteGain.connect(audioContext.destination);

            logger.info('Renderer audio capture started successfully', {
                component: 'MainWindowUI',
                mode: this.audioSourceMode,
                audioState: audioContext.state
            });
        } catch (error) {
            logger.error('Failed to start renderer audio capture', {
                component: 'MainWindowUI',
                error: error.message
            });
            // Try resilient fallback to basic microphone before giving up
            try {
                const fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this._mediaStream = fallbackStream;
                const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
                this._audioContext = audioContext;
                if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                }
                const source = audioContext.createMediaStreamSource(fallbackStream);
                this._audioSource = source;
                const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
                this._scriptNode = scriptNode;
                scriptNode.onaudioprocess = (event) => {
                    if (!this.isRecording || !window.electronAPI || !window.electronAPI.sendAudioChunk) return;
                    const inputData = event.inputBuffer.getChannelData(0);
                    const pcm16 = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        const s = Math.max(-1, Math.min(1, inputData[i]));
                        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    }
                    window.electronAPI.sendAudioChunk(pcm16.buffer);
                };
                const muteGain = audioContext.createGain();
                muteGain.gain.value = 0;
                this._muteGain = muteGain;
                source.connect(scriptNode);
                scriptNode.connect(muteGain);
                muteGain.connect(audioContext.destination);
                logger.info('Resilient basic audio capture connected', { component: 'MainWindowUI', audioState: audioContext.state });
            } catch (fallbackErr) {
                logger.error('Fallback audio capture also failed', { component: 'MainWindowUI', error: fallbackErr.message });
            }
        }
    }

    _stopRendererAudioCapture() {
        try {
            if (this._scriptNode) {
                this._scriptNode.disconnect();
                this._scriptNode.onaudioprocess = null;
                this._scriptNode = null;
            }
            if (this._muteGain) {
                this._muteGain.disconnect();
                this._muteGain = null;
            }
            if (this._audioSource) {
                this._audioSource.disconnect();
                this._audioSource = null;
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
            'interview': 'Interview',
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
            const skillIcon = this.skillIndicator.querySelector('i');
            if (skillIcon) {
                skillIcon.className = this.currentSkill === 'interview' ? 'fas fa-user-tie' : 'fas fa-brain';
            }
                        
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

        const quitOption = this.createMenuItem('Quit', 'fa-power-off', () => {
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
            cursor: default !important;
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

    // ── Rubic Mode Methods ──

    async loadRubicState() {
        try {
            if (window.electronAPI && window.electronAPI.getRubicState) {
                const state = await window.electronAPI.getRubicState();
                if (state) this.applyRubicState(state);
            }
        } catch (e) {
            logger.warn('Failed to load Rubic state', { error: e.message });
        }
    }

    startAiStatusPolling() {
        // Poll AI status every 5 seconds to update the dot
        this.updateAiStatusDot();
        this._aiStatusInterval = setInterval(() => this.updateAiStatusDot(), 5000);
    }

    async updateAiStatusDot() {
        if (!this.aiStatusDot) return;
        try {
            if (window.electronAPI && window.electronAPI.getAiStatus) {
                const status = await window.electronAPI.getAiStatus();
                if (status && status.connected) {
                    this.aiStatusDot.classList.remove('disconnected');
                    this.aiStatusDot.classList.add('connected');
                } else {
                    this.aiStatusDot.classList.remove('connected');
                    this.aiStatusDot.classList.add('disconnected');
                }
            }
        } catch (_) {
            // Silently fail — dot stays in current state
        }
    }

    applyRubicState(state) {
        if (!state) return;
        this.rubicMode = state.rubicMode !== undefined ? !!state.rubicMode : !!state.enabled;
        this.rubicSingleSelect = state.singleSelect !== false;
        this.rubicCapsLockLED = !!state.capsLockLED;
        this.rubicMenuBarSymbol = !!state.menuBarSymbol;
        this.rubicHoverDwell = !!state.hoverDwell;

        this.updateRubicUI();

        // Resize to accommodate toggle buttons and answer box
        setTimeout(() => this.resizeWindowToContent(), 50);
    }

    updateRubicUI() {
        // Update Rubic button state
        if (this.rubicButton) {
            // Never overwrite or strip processing/thinking state while in-flight
            if (!this.rubicButton.classList.contains('rubic-processing')) {
                if (this.rubicMode) {
                    this.rubicButton.classList.add('rubic-active');
                } else {
                    this.rubicButton.classList.remove('rubic-active');
                }
            }
        }

        // Sub-toggles stay always visible and directly clickable
        if (this.rubicToggles) {
            this.rubicToggles.style.display = 'inline-flex';
        }

        this.updateRubicToggles();
    }

    updateRubicToggles() {
        // Single/Multi toggle (1 / M)
        if (this.rubicSingleLabel) {
            this.rubicSingleLabel.textContent = this.rubicSingleSelect ? '1' : 'M';
        } else if (this.rubicToggleSingle) {
            const lbl = this.rubicToggleSingle.querySelector('#rubicSingleLabel') || this.rubicToggleSingle;
            lbl.textContent = this.rubicSingleSelect ? '1' : 'M';
        }
        if (this.rubicToggleSingle) {
            if (this.rubicSingleSelect) {
                this.rubicToggleSingle.classList.add('active');
            } else {
                this.rubicToggleSingle.classList.remove('active');
            }
        }

        // Caps Lock LED toggle
        if (this.rubicToggleLED) {
            if (this.rubicCapsLockLED) {
                this.rubicToggleLED.classList.add('active');
            } else {
                this.rubicToggleLED.classList.remove('active');
            }
        }

        // Menu Bar Symbol toggle
        if (this.rubicToggleMenuBar) {
            if (this.rubicMenuBarSymbol) {
                this.rubicToggleMenuBar.classList.add('active');
            } else {
                this.rubicToggleMenuBar.classList.remove('active');
            }
        }
    }

    handleRubicAnswer(data) {
        this._rubicProcessing = false;
        if (this._rubicWatchdog) {
            clearTimeout(this._rubicWatchdog);
            this._rubicWatchdog = null;
        }
        if (!data) return;

        // Reset processing state on the Rubic button
        if (this.rubicButton) {
            this.rubicButton.classList.remove('rubic-processing');
            this.rubicButton.classList.remove('rubic-active');
        }
        if (this.rubicButtonLabel) {
            this.rubicButtonLabel.textContent = 'Rubic';
        }

        if (data.success && data.answer) {
            logger.info('Rubic answer received', { answer: data.answer });

            // Display answer right next to the Rubic button
            if (this.rubicAnswerVal) {
                this.rubicAnswerVal.textContent = data.answer;
            }
            if (this.rubicAnswerBox) {
                this.rubicAnswerBox.style.display = 'inline-flex';
                this.rubicAnswerBox.classList.add('rubic-answer-flash');
                setTimeout(() => {
                    if (this.rubicAnswerBox) {
                        this.rubicAnswerBox.classList.remove('rubic-answer-flash');
                    }
                }, 1500);
            }

            // Persist the answer permanently so it stays visible
            try {
                localStorage.setItem('rubicLastAnswer', data.answer);
            } catch (_) {}

            // Ensure window width fits the newly displayed answer box
            this.resizeWindowToContent();
        } else {
            logger.warn('Rubic MCQ failed or returned no answer', { error: data.error });
            if (this.rubicAnswerVal && this.rubicAnswerBox) {
                this.rubicAnswerVal.textContent = '!';
                this.rubicAnswerBox.style.display = 'inline-flex';
                setTimeout(() => {
                    if (this.rubicAnswerVal && this.rubicAnswerVal.textContent === '!') {
                        const savedAnswer = localStorage.getItem('rubicLastAnswer');
                        this.rubicAnswerVal.textContent = savedAnswer || '-';
                    }
                }, 2000);
            }
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