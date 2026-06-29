document.addEventListener('DOMContentLoaded', () => {    
    const logger = {
        info: (...args) => console.log('[SettingsWindowUI]', ...args)
    };

    // Get DOM elements
    const closeButton = document.getElementById('closeButton');
    const quitButton = document.getElementById('quitButton');
    const speechProviderSelect = document.getElementById('speechProvider');
    const azureKeyInput = document.getElementById('azureKey');
    const azureRegionInput = document.getElementById('azureRegion');
    const whisperCommandInput = document.getElementById('whisperCommand');
    const whisperModelInput = document.getElementById('whisperModel');
    const whisperLanguageInput = document.getElementById('whisperLanguage');
    const whisperSegmentMsInput = document.getElementById('whisperSegmentMs');
    const groqSttModelInput = document.getElementById('groqSttModel');
    const ttsEnabledInput = document.getElementById('ttsEnabled');
    const ttsVoiceInput = document.getElementById('ttsVoice');
    const ttsSpeedInput = document.getElementById('ttsSpeed');
    const geminiKeyInput = document.getElementById('geminiKey');
    const windowGapInput = document.getElementById('windowGap');
    const codingLanguageSelect = document.getElementById('codingLanguage');
    const activeSkillSelect = document.getElementById('activeSkill');
    const iconGrid = document.getElementById('iconGrid');

    // LLM provider fields
    const llmProviderSelect = document.getElementById('llmProvider');
    const openrouterKeyInput = document.getElementById('openrouterKey');
    const openrouterModelInput = document.getElementById('openrouterModel');
    const groqKeyInput = document.getElementById('groqKey');
    const groqModelInput = document.getElementById('groqModel');

    // Check if window.api exists
    if (!window.api) {
        console.error('window.api not available');
        return;
    }

    // Request current settings when window opens
    const requestCurrentSettings = () => {
        if (window.electronAPI && window.electronAPI.getSettings) {
            window.electronAPI.getSettings().then(settings => {
                loadSettingsIntoUI(settings);
            }).catch(error => {
                console.error('Failed to get settings:', error);
            });
        }
    };

    // Close button handler
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            window.api.send('close-settings');
        });
    }

    // Quit button handler with multiple attempts
    if (quitButton) {
        quitButton.addEventListener('click', () => {
            try {
                // Try multiple ways to quit the app
                if (window.api && window.api.send) {
                    window.api.send('quit-app');
                }
                
                // Also try the electron API if available
                if (window.electronAPI && window.electronAPI.quit) {
                    window.electronAPI.quit();
                }
                
                // Fallback: close the window
                setTimeout(() => {
                    window.close();
                }, 500);
                
            } catch (error) {
                console.error('Error quitting app:', error);
                window.close();
            }
        });
    }

    // Function to load settings into UI
    const loadSettingsIntoUI = (settings) => {
        if (settings.speechProvider && speechProviderSelect) speechProviderSelect.value = settings.speechProvider;
        // Always set the input value, even if empty, so the user sees what's
        // currently configured (including env-derived defaults). Previously
        // empty strings were skipped which left stale UI values.
        if (azureKeyInput) azureKeyInput.value = settings.azureKey || '';
        if (azureRegionInput) azureRegionInput.value = settings.azureRegion || '';
        if (whisperCommandInput) whisperCommandInput.value = settings.whisperCommand || '';
        if (whisperModelInput) whisperModelInput.value = settings.whisperModel || '';
        if (whisperLanguageInput) whisperLanguageInput.value = settings.whisperLanguage || '';
        if (whisperSegmentMsInput) whisperSegmentMsInput.value = settings.whisperSegmentMs || '';
        if (groqSttModelInput) groqSttModelInput.value = settings.groqSttModel || 'whisper-large-v3-turbo';
        if (ttsEnabledInput) ttsEnabledInput.checked = settings.ttsEnabled !== false;
        if (ttsVoiceInput) ttsVoiceInput.value = settings.ttsVoice || 'tara';
        if (ttsSpeedInput) ttsSpeedInput.value = settings.ttsSpeed || '1.0';
        if (geminiKeyInput) geminiKeyInput.value = settings.geminiKey || '';
        if (windowGapInput) windowGapInput.value = settings.windowGap || '';
        if (llmProviderSelect) llmProviderSelect.value = settings.llmProvider || 'gemini';
        if (openrouterKeyInput) openrouterKeyInput.value = settings.openrouterKey || '';
        if (openrouterModelInput) openrouterModelInput.value = settings.openrouterModel || 'openrouter/free';
        if (groqKeyInput) groqKeyInput.value = settings.groqKey || '';
        if (groqModelInput) groqModelInput.value = settings.groqModel || 'llama-3.3-70b-versatile';
        updateLLMFieldStates();

        // Set C++ as default if no coding language is specified
        if (codingLanguageSelect) {
            codingLanguageSelect.value = settings.codingLanguage || 'cpp';
        }

        if (settings.activeSkill && activeSkillSelect) activeSkillSelect.value = settings.activeSkill;

        // Handle icon selection
        const selectedIcon = settings.selectedIcon || settings.appIcon;
        if (selectedIcon && iconGrid) {
            const iconOptions = iconGrid.querySelectorAll('.icon-option');
            iconOptions.forEach(option => {
                if (option.dataset.icon === selectedIcon) {
                    option.classList.add('selected');
                } else {
                    option.classList.remove('selected');
                }
            });
        }

        updateSpeechFieldStates();
    };

    // Load settings when window opens
    window.api.receive('load-settings', (settings) => {
        loadSettingsIntoUI(settings);
    });

    // Listen for settings window shown event
    if (window.electronAPI && window.electronAPI.receive) {
        window.electronAPI.receive('settings-window-shown', () => {
            requestCurrentSettings();
        });

    // Listen for coding language changes from other windows via helper
    window.electronAPI.onCodingLanguageChanged((event, data) => {
            if (data && data.language && codingLanguageSelect) {
                codingLanguageSelect.value = data.language;
                console.log('Language updated from overlay window:', data.language);
            }
    });
    }

    const updateLLMFieldStates = () => {
        const provider = llmProviderSelect ? llmProviderSelect.value : 'gemini';
        const geminiGroup = document.getElementById('geminiLlmFields');
        const openrouterGroup = document.getElementById('openrouterLlmFields');
        const openrouterNote = document.getElementById('openrouterNote');
        const groqGroup = document.getElementById('groqLlmFields');

        if (geminiGroup) geminiGroup.style.display = provider === 'gemini' ? '' : 'none';
        if (openrouterGroup) openrouterGroup.style.display = provider === 'openrouter' ? '' : 'none';
        if (openrouterNote) openrouterNote.style.display = provider === 'openrouter' ? '' : 'none';
        if (groqGroup) groqGroup.style.display = provider === 'groq' ? '' : 'none';

        if (geminiKeyInput) geminiKeyInput.disabled = provider !== 'gemini';
        if (openrouterKeyInput) openrouterKeyInput.disabled = provider !== 'openrouter';
        if (openrouterModelInput) openrouterModelInput.disabled = provider !== 'openrouter';
        if (groqKeyInput) groqKeyInput.disabled = provider !== 'groq';
        if (groqModelInput) groqModelInput.disabled = provider !== 'groq';
    };

    // Save settings helper function
    const saveSettings = () => {
        const settings = {};
        if (speechProviderSelect) settings.speechProvider = speechProviderSelect.value;
        if (azureKeyInput) settings.azureKey = azureKeyInput.value;
        if (azureRegionInput) settings.azureRegion = azureRegionInput.value;
        if (whisperCommandInput) settings.whisperCommand = whisperCommandInput.value;
        if (whisperModelInput) settings.whisperModel = whisperModelInput.value;
        if (whisperLanguageInput) settings.whisperLanguage = whisperLanguageInput.value;
        if (whisperSegmentMsInput) settings.whisperSegmentMs = whisperSegmentMsInput.value;
        if (groqSttModelInput) settings.groqSttModel = groqSttModelInput.value;
        if (ttsEnabledInput) settings.ttsEnabled = ttsEnabledInput.checked;
        if (ttsVoiceInput) settings.ttsVoice = ttsVoiceInput.value;
        if (ttsSpeedInput) settings.ttsSpeed = ttsSpeedInput.value;
        if (geminiKeyInput) settings.geminiKey = geminiKeyInput.value;
        if (windowGapInput) settings.windowGap = windowGapInput.value;
        if (codingLanguageSelect) settings.codingLanguage = codingLanguageSelect.value;
        if (activeSkillSelect) settings.activeSkill = activeSkillSelect.value;
        if (llmProviderSelect) settings.llmProvider = llmProviderSelect.value;
        if (openrouterKeyInput) settings.openrouterKey = openrouterKeyInput.value;
        if (openrouterModelInput) settings.openrouterModel = openrouterModelInput.value;
        if (groqKeyInput) settings.groqKey = groqKeyInput.value;
        if (groqModelInput) settings.groqModel = groqModelInput.value;
        
        window.api.send('save-settings', settings);
    };

    const updateSpeechFieldStates = () => {
        const provider = speechProviderSelect ? speechProviderSelect.value : 'azure';

        // Show/hide provider-specific field groups instead of just disabling
        // them. This keeps the settings UI clean — only the relevant fields
        // for the selected provider are visible.
        const azureGroup = document.getElementById('azureFields');
        const whisperGroup = document.getElementById('whisperFields');
        const azureNote = document.getElementById('azureFieldsNote');
        const groqSttGroup = document.getElementById('groqSttFields');

        if (azureGroup) {
            azureGroup.style.display = provider === 'azure' ? '' : 'none';
        }
        if (whisperGroup) {
            whisperGroup.style.display = provider === 'whisper' ? '' : 'none';
        }
        if (azureNote) {
            azureNote.style.display = provider === 'azure' ? '' : 'none';
        }
        if (groqSttGroup) {
            groqSttGroup.style.display = provider === 'groq' ? '' : 'none';
        }

        // Also toggle disabled attribute for any leftover direct field refs
        [azureKeyInput, azureRegionInput].forEach(input => {
            if (input) input.disabled = provider !== 'azure';
        });
        [whisperCommandInput, whisperModelInput, whisperLanguageInput, whisperSegmentMsInput].forEach(input => {
            if (input) input.disabled = provider !== 'whisper';
        });
        [groqSttModelInput].forEach(input => {
            if (input) input.disabled = provider !== 'groq';
        });
    };

    // Add event listeners for all inputs
    const inputs = [
        speechProviderSelect,
        azureKeyInput,
        azureRegionInput,
        whisperCommandInput,
        whisperModelInput,
        whisperLanguageInput,
        whisperSegmentMsInput,
        groqSttModelInput,
        ttsEnabledInput,
        ttsVoiceInput,
        ttsSpeedInput,
        geminiKeyInput,
        windowGapInput,
        llmProviderSelect,
        openrouterKeyInput,
        openrouterModelInput,
        groqKeyInput,
        groqModelInput
    ];

    inputs.forEach(input => {
        if (input) {
            input.addEventListener('change', saveSettings);
            input.addEventListener('blur', saveSettings);
        }
    });

    if (speechProviderSelect) {
        speechProviderSelect.addEventListener('change', () => {
            updateSpeechFieldStates();
            saveSettings();
        });
    }

    if (llmProviderSelect) {
        llmProviderSelect.addEventListener('change', () => {
            updateLLMFieldStates();
            saveSettings();
        });
    }

    // Language selection handler
    if (codingLanguageSelect) {
        codingLanguageSelect.addEventListener('change', (e) => {
            const lang = e.target.value;
            // use electronAPI so main broadcast is consistent
            if (window.electronAPI && window.electronAPI.saveSettings) {
                window.electronAPI.saveSettings({ codingLanguage: lang });
            } else {
                // fallback
                saveSettings();
            }
        });
    }

    // Skill selection handler
    if (activeSkillSelect) {
        activeSkillSelect.addEventListener('change', (e) => {
            saveSettings();
            // Also update the main window
            window.api.send('update-skill', e.target.value);
        });
    }

    updateSpeechFieldStates();

    // Initialize icon grid with correct paths
    const initializeIconGrid = () => {
        if (!iconGrid) return;

        const icons = [
            { key: 'terminal', name: 'Terminal', src: './assests/icons/terminal.png' },
            { key: 'activity', name: 'Activity', src: './assests/icons/activity.png' },
            { key: 'settings', name: 'Settings', src: './assests/icons/settings.png' }
        ];

        iconGrid.innerHTML = '';

        icons.forEach(icon => {
            const iconElement = document.createElement('div');
            iconElement.className = 'icon-option';
            iconElement.dataset.icon = icon.key;
            
            const img = document.createElement('img');
            img.src = icon.src;
            img.alt = icon.name;
            img.onload = () => {
                logger.info('Icon loaded successfully:', icon.src);
            };
            img.onerror = () => {
                console.error('Failed to load icon:', icon.src);
                // Try alternative paths
                const altPaths = [
                    `./assests/${icon.key}.png`,
                    `./assets/icons/${icon.key}.png`,
                    `./assets/${icon.key}.png`
                ];
                
                let pathIndex = 0;
                const tryNextPath = () => {
                    if (pathIndex < altPaths.length) {
                        img.src = altPaths[pathIndex];
                        pathIndex++;
                    } else {
                        img.style.display = 'none';
                        console.error('All icon paths failed for:', icon.key);
                    }
                };
                
                img.onload = () => {
                    logger.info('Icon loaded with alternative path:', img.src);
                };
                
                img.onerror = tryNextPath;
                tryNextPath();
            };
            
            const label = document.createElement('div');
            label.textContent = icon.name;
            
            iconElement.appendChild(img);
            iconElement.appendChild(label);
            
            // Click handler for icon selection
            iconElement.addEventListener('click', () => {                
                // Remove selection from all icons
                iconGrid.querySelectorAll('.icon-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                
                // Add selection to clicked icon
                iconElement.classList.add('selected');
                
                // Save the selection - this should trigger the app icon change
                window.api.send('save-settings', { selectedIcon: icon.key });
                
                // Show visual feedback
                iconElement.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    iconElement.style.transform = 'scale(1)';
                }, 100);
            });
            
            iconGrid.appendChild(iconElement);
        });
    };

    // Initialize icon grid
    initializeIconGrid();

    // Request settings on load
    setTimeout(() => {
        requestCurrentSettings();
    }, 200);

    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.api.send('close-settings');
        }
    });
}); 
