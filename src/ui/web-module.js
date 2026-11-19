/**
 * Direct Web AI Workspace Renderer
 * Manages tab switching, toolbar 1s hover dwell, webview userscript injection,
 * background hover-click tracking, and automatic system audio dictation into ChatGPT, Gemini, Grok, and Claude.
 */
document.addEventListener('DOMContentLoaded', () => {
    const webview = document.getElementById('chatWebview');
    const loadBar = document.getElementById('loadBar');
    const btnBack = document.getElementById('btnBack');
    const btnForward = document.getElementById('btnForward');
    const btnReload = document.getElementById('btnReload');
    const btnNewChat = document.getElementById('btnNewChat');
    const btnClose = document.getElementById('btnClose');
    const btnDictate = document.getElementById('btnDictate');
    const dictateLabel = document.getElementById('dictateLabel');
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');
    const tabButtons = document.querySelectorAll('.center-tabs .dwell-btn');

    let isDictating = false;
    let currentTab = 'chatgpt';
    let lastInPageTriggerTime = 0;

    // ── Status Note Management (Ready, Listening, Processing, Idle, Error) ──
    function getTabDisplayName() {
        const activeTab = document.querySelector('.center-tabs .dwell-btn.active');
        if (activeTab && activeTab.textContent) {
            return activeTab.textContent.trim();
        }
        return currentTab ? (currentTab.charAt(0).toUpperCase() + currentTab.slice(1)) : 'ChatGPT';
    }

    function updateStatus(state, note) {
        if (statusDot) {
            statusDot.className = 'status-dot ' + state.toLowerCase();
        }
        if (statusText && note) {
            statusText.textContent = note;
        }
    }
    updateStatus('READY', 'Ready');

    // ── Preload Configuration via electronAPI (No require calls in renderer) ──
    async function initPreload() {
        try {
            if (window.electronAPI && window.electronAPI.getWebviewPreloadUrl && webview) {
                const preloadUrl = await window.electronAPI.getWebviewPreloadUrl();
                if (preloadUrl) {
                    webview.preload = preloadUrl;
                    console.log('[WEB-MODULE] Configured webview preload file URL:', preloadUrl);
                }
            }
        } catch (e) {
            console.warn('[WEB-MODULE] Error setting webview preload URL:', e);
        }
        if (webview && !webview.src) {
            webview.src = "https://chatgpt.com";
        }
    }
    initPreload();

    // ── Universal 1-Second Hover Dwell on Toolbar Buttons ──
    function attachDwellAutoClick(btn) {
        let timer = null;

        btn.addEventListener('mouseenter', () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                btn.click();
            }, 1000);
        });

        btn.addEventListener('mouseleave', () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        });
    }

    // Attach dwell to all toolbar buttons
    document.querySelectorAll('.dwell-btn').forEach(btn => attachDwellAutoClick(btn));

    // ── Tab Switching ──
    tabButtons.forEach(tab => {
        tab.addEventListener('click', () => {
            tabButtons.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const url = tab.dataset.url;
            currentTab = tab.dataset.tab;
            if (webview && url) {
                statusText.textContent = `Loading ${tab.textContent.trim()}…`;
                statusDot.style.background = '#38bdf8';
                webview.loadURL(url);
            }
        });
    });

    // ── Navigation Controls ──
    if (btnBack) {
        btnBack.addEventListener('click', () => {
            if (webview && webview.canGoBack()) webview.goBack();
        });
    }

    if (btnForward) {
        btnForward.addEventListener('click', () => {
            if (webview && webview.canGoForward()) webview.goForward();
        });
    }

    if (btnReload) {
        btnReload.addEventListener('click', () => {
            if (webview) webview.reload();
        });
    }

    if (btnNewChat) {
        btnNewChat.addEventListener('click', () => {
            const activeTab = document.querySelector('.center-tabs .dwell-btn.active');
            if (activeTab && activeTab.dataset.url) {
                webview.loadURL(activeTab.dataset.url);
            }
        });
    }

    if (btnClose) {
        btnClose.addEventListener('click', () => {
            if (window.electronAPI && window.electronAPI.hideWebModule) {
                window.electronAPI.hideWebModule();
            } else if (window.api) {
                window.api.send('close-web-module');
            } else {
                window.close();
            }
        });
    }

    // ── Webview Lifecycle & Injected Userscript ──
    let injectScriptContent = '';
    async function ensureInjectScript() {
        if (!injectScriptContent && window.electronAPI && window.electronAPI.getWebModuleInjectScript) {
            try {
                injectScriptContent = await window.electronAPI.getWebModuleInjectScript();
                console.log('[WEB-MODULE] Loaded inject script, size:', injectScriptContent ? injectScriptContent.length : 0);
            } catch (e) {
                console.warn('[WEB-MODULE] Could not retrieve web-view-inject script:', e);
            }
        }
        return injectScriptContent;
    }
    ensureInjectScript();

    async function injectScriptIntoWebview() {
        if (!webview) return;
        const script = await ensureInjectScript();
        if (script) {
            webview.executeJavaScript(script)
                .then(() => console.log('[WEB-MODULE] Injected script active in webview'))
                .catch(err => console.error('[WEB-MODULE] Script injection error:', err));
        }
        try {
            webview.insertCSS(`
                html, body {
                    background-color: transparent !important;
                }
                #__next, main, [class*="bg-token-main-surface"], [class*="dark:bg-"] {
                    background-color: rgba(18, 20, 26, 0.88) !important;
                }
            `).catch(() => {});
        } catch (_) {}

        // Re-apply current opacity whenever a new page loads
        if (window.electronAPI && window.electronAPI.getOpacity) {
            window.electronAPI.getOpacity().then(op => applyWebsiteOpacity(op)).catch(() => {});
        }
    }

    webview.addEventListener('did-fail-load', (e) => {
        console.error('[WEB-MODULE did-fail-load]', e.errorCode, e.errorDescription, e.validatedURL, e.isMainFrame);
        if (e.errorCode === -3 || !e.isMainFrame) {
            return;
        }
        updateStatus('ERROR', `Unable to connect: ${e.errorDescription || e.errorCode}. Click to retry`);
        loadBar.style.opacity = '0';
        loadBar.style.width = '0%';
    });

    const statusPill = document.getElementById('statusPill');
    if (statusPill) {
        statusPill.addEventListener('click', () => {
            if (webview) webview.reload();
        });
    }

    webview.addEventListener('did-start-loading', () => {
        loadBar.style.width = '40%';
        loadBar.style.opacity = '1';
        updateStatus('PROCESSING', 'Connecting…');
    });

    webview.addEventListener('did-stop-loading', () => {
        loadBar.style.width = '100%';
        setTimeout(() => {
            loadBar.style.opacity = '0';
            loadBar.style.width = '0%';
        }, 300);
        if (isDictating) {
            updateStatus('IDLE', 'Idle: Waiting for speech…');
        } else {
            updateStatus('READY', 'Ready');
        }
        injectScriptIntoWebview();
    });

    webview.addEventListener('dom-ready', () => {
        injectScriptIntoWebview();
    });

    webview.addEventListener('did-navigate', () => {
        injectScriptIntoWebview();
    });

    webview.addEventListener('did-navigate-in-page', () => {
        injectScriptIntoWebview();
    });

    // Auto-approve media & microphone permission requests from webview
    webview.addEventListener('permission-request', (e) => {
        if (e.permission === 'media' || e.permission === 'microphone' || e.permission === 'audioCapture') {
            console.log('[WEB-MODULE] Auto-approved microphone access request for webview');
            e.request.allow();
        }
    });

    // Console message bridge: Listen for in-page actions emitted by web-view-inject.js
    webview.addEventListener('console-message', async (e) => {
        const msg = e.message || '';
        if (msg.includes('[CLUELY-ACTION] start-dictation') || msg.includes('[CLUELY-ACTION] start-system-audio')) {
            const now = Date.now();
            if (now - lastInPageTriggerTime < 1800) {
                return; // Debounce rapid consecutive logs from the same user click
            }
            lastInPageTriggerTime = now;

            console.log('[WEB-MODULE] In-page dictation mic triggered from webview, activating system audio capture');
            setDictatingState(true);
            if (window.electronAPI && window.electronAPI.startSystemAudioForWeb) {
                await window.electronAPI.startSystemAudioForWeb();
            }
        }
    });

    // Listen for requests originating from inside the webview via ipc-message if available
    webview.addEventListener('ipc-message', async (e) => {
        if (e.channel === 'request-system-audio-start') {
            console.log('[WEB-MODULE] Webview requested system audio capture start via IPC');
            setDictatingState(true);
            if (window.electronAPI && window.electronAPI.startSystemAudioForWeb) {
                await window.electronAPI.startSystemAudioForWeb();
            }
        } else if (e.channel === 'request-hide-web-module') {
            if (window.electronAPI && window.electronAPI.hideWebModule) {
                window.electronAPI.hideWebModule();
            }
        }
    });

    // Buffer audio chunks and flush in 120ms batches to prevent executeJavaScript IPC queue flooding
    let audioChunkQueue = [];
    let audioFlushTimer = null;

    function flushAudioChunks() {
        if (!webview || audioChunkQueue.length === 0) return;
        const chunks = audioChunkQueue;
        audioChunkQueue = [];

        try {
            let totalLen = 0;
            for (const c of chunks) totalLen += c.length;
            const combined = new Uint8Array(totalLen);
            let offset = 0;
            for (const c of chunks) {
                combined.set(new Uint8Array(c.buffer ? c.buffer : c), offset);
                offset += c.length;
            }

            let binary = '';
            const len = combined.byteLength;
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(combined[i]);
            }
            const b64 = btoa(binary);

            webview.executeJavaScript(`if (window.ingestSystemAudioPCMBase64) window.ingestSystemAudioPCMBase64("${b64}");`).catch(() => {});
        } catch (_) {}
    }

    if (window.electronAPI && window.electronAPI.onSystemAudioStream) {
        window.electronAPI.onSystemAudioStream((chunk) => {
            if (!chunk) return;
            audioChunkQueue.push(chunk);
            if (!audioFlushTimer) {
                audioFlushTimer = setTimeout(() => {
                    audioFlushTimer = null;
                    flushAudioChunks();
                }, 120);
            }
        });
    }

    // ── Global Cursor Hover Forwarding (Works when other window is selected) ──
    if (window.electronAPI && window.electronAPI.onGlobalCursorHover) {
        window.electronAPI.onGlobalCursorHover((data) => {
            if (!webview || !data) return;
            const x = data.webviewX !== undefined ? data.webviewX : (data.localX !== undefined ? data.localX : data.x);
            const y = data.webviewY !== undefined ? data.webviewY : (data.localY !== undefined ? data.localY - 44 : (data.y !== undefined ? data.y - 44 : -1));
            if (y >= 0 && x >= 0) {
                try {
                    webview.executeJavaScript(`if (window.checkHoverAt) window.checkHoverAt(${Math.round(x)}, ${Math.round(y)});`).catch(() => {});
                } catch (_) {}
            }
        });
    }

    // Escape key to hide web module instantly
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (window.electronAPI && window.electronAPI.hideWebModule) {
                window.electronAPI.hideWebModule();
            }
        }
    });

    // ── Continuous Speech Pipeline & Status Notes (Ready, Listening, Processing, Idle) ──
    let isQuestionInFlight = false;

    function setDictatingState(active) {
        isDictating = active;
        if (active) {
            btnDictate.classList.add('recording');
            dictateLabel.textContent = 'Active';
            updateStatus('LISTENING', 'Listening to system audio…');
        } else {
            btnDictate.classList.remove('recording');
            dictateLabel.textContent = 'Dictate';
            updateStatus('READY', 'Ready');
        }
    }

    btnDictate.addEventListener('click', async () => {
        const nextState = !isDictating;
        setDictatingState(nextState);

        if (nextState) {
            if (window.electronAPI && window.electronAPI.startSystemAudioForWeb) {
                await window.electronAPI.startSystemAudioForWeb();
            }
        } else {
            if (window.electronAPI && window.electronAPI.stopSystemAudioForWeb) {
                await window.electronAPI.stopSystemAudioForWeb();
            }
        }
    });

    // Listen to global recording state changes from interview pipeline
    if (window.electronAPI && window.electronAPI.onRecordingStarted) {
        window.electronAPI.onRecordingStarted(() => {
            if (!isDictating) setDictatingState(true);
        });
    }
    if (window.electronAPI && window.electronAPI.onRecordingStopped) {
        window.electronAPI.onRecordingStopped(() => {
            if (isDictating) setDictatingState(false);
        });
    }

    // 1. Live speech activity (Interviewer talking)
    if (window.electronAPI && window.electronAPI.onSpeechActive) {
        window.electronAPI.onSpeechActive(() => {
            if (isDictating && !isQuestionInFlight) {
                updateStatus('LISTENING', 'Hearing speech…');
            }
        });
    }

    // 2. Interim speech recognition (live hearing preview)
    if (window.electronAPI && window.electronAPI.onInterimTranscription) {
        window.electronAPI.onInterimTranscription((_event, data) => {
            if (!isDictating || isQuestionInFlight) return;
            const text = (data && data.text) ? data.text.trim() : (typeof data === 'string' ? data.trim() : '');
            if (text) {
                updateStatus('LISTENING', `Listening: "${text.substring(0, 24)}…"`);
            }
        });
    }

    // 3. Transcription fragment received from Whisper
    if (window.electronAPI && window.electronAPI.onTranscriptionReceived) {
        window.electronAPI.onTranscriptionReceived((_event, data) => {
            if (!isDictating || isQuestionInFlight) return;
            const text = (data && data.text) ? data.text.trim() : (typeof data === 'string' ? data.trim() : '');
            if (text) {
                updateStatus('PROCESSING', `Transcribing: "${text.substring(0, 24)}…"`);
            }
        });
    }

    // 4. Transcription finalized & LLM response starting (speaker paused, full question ready)
    if (window.electronAPI && window.electronAPI.onTranscriptionLlmResponseStart) {
        window.electronAPI.onTranscriptionLlmResponseStart((_event, data) => {
            if (!isDictating) return;
            const preview = (data && data.questionPreview) ? data.questionPreview.trim() : '';
            if (preview) {
                updateStatus('PROCESSING', `Sending: "${preview.substring(0, 24)}…"`);
            }
        });
    }

    // 5. Inject finalized question into active Web AI chat (ChatGPT, Gemini, Grok, Claude)
    function handleFinalQuestionInjection(questionText) {
        const text = (questionText || '').trim();
        if (!text || !webview) return;

        isQuestionInFlight = true;
        const targetName = getTabDisplayName();
        updateStatus('PROCESSING', `Sending to ${targetName}: "${text.substring(0, 24)}…"`);

        webview.executeJavaScript(`if (window.injectPromptAndSend) window.injectPromptAndSend(${JSON.stringify(text)});`)
            .then(() => {
                console.log(`[WEB-MODULE] Successfully sent question into ${targetName}:`, text);
                // DO NOT STOP DICTATION! Remain continuously listening for next question!
                setTimeout(() => {
                    isQuestionInFlight = false;
                    if (isDictating) {
                        updateStatus('IDLE', 'Idle: Waiting for next question…');
                    } else {
                        updateStatus('READY', 'Ready');
                    }
                }, 1800);
            })
            .catch((err) => {
                console.error('[WEB-MODULE] Error injecting prompt into chat:', err);
                isQuestionInFlight = false;
                if (isDictating) {
                    updateStatus('IDLE', 'Idle: Waiting for next question…');
                }
            });
    }

    // Listen for complete coalesced question from interview speech engine
    if (window.electronAPI && window.electronAPI.onWebModuleFinalQuestion) {
        window.electronAPI.onWebModuleFinalQuestion((data) => {
            const question = (data && (data.question || data.text)) ? (data.question || data.text) : '';
            if (question) {
                handleFinalQuestionInjection(question);
            }
        });
    }

    // Listen for web-module-dictation-text (broadcast compatibility)
    if (window.electronAPI && window.electronAPI.onWebModuleDictationText) {
        window.electronAPI.onWebModuleDictationText((data) => {
            if (data && data.isFinal && data.text) {
                handleFinalQuestionInjection(data.text);
            }
        });
    }

    // 6. Speech Status Watchdog (Transitions between Idle & Listening)
    if (window.electronAPI && window.electronAPI.onSpeechStatus) {
        window.electronAPI.onSpeechStatus((_event, data) => {
            if (!isDictating || isQuestionInFlight) return;
            const statusMsg = (data && data.status) ? data.status.toLowerCase() : '';
            if (statusMsg.includes('waiting') || statusMsg.includes('idle') || statusMsg.includes('silence')) {
                updateStatus('IDLE', 'Idle: Waiting for speech…');
            } else if (statusMsg.includes('listening')) {
                updateStatus('LISTENING', 'Listening to system audio…');
            }
        });
    }

    // Sync opacity with Cluely bar transparency setting 1:1
    function applyWebsiteOpacity(opacity) {
        if (opacity === undefined || opacity === null) return;
        let opVal = opacity;
        if (typeof opVal === 'object' && opVal !== null) {
            opVal = opVal.opacity !== undefined ? opVal.opacity : 0.38;
        }
        opVal = typeof opVal === 'number' ? opVal : parseFloat(opVal);
        if (isNaN(opVal)) return;

        // Apply exactly 1:1 to body so window and webview match the Cluely bar opacity exactly
        const opStr = opVal.toString();
        document.body.style.opacity = opStr;
        if (webview) {
            webview.style.opacity = '1';
            try {
                webview.executeJavaScript(`if (window.updateWebsiteTransparency) window.updateWebsiteTransparency(${opVal});`).catch(() => {});
            } catch (_) {}
        }
    }

    if (window.electronAPI && window.electronAPI.getOpacity) {
        window.electronAPI.getOpacity().then(op => applyWebsiteOpacity(op)).catch(() => {});
    }
    if (window.electronAPI && window.electronAPI.onOpacityUpdate) {
        window.electronAPI.onOpacityUpdate((_event, opacity) => {
            const val = opacity !== undefined ? opacity : _event;
            applyWebsiteOpacity(val);
        });
    }
});
