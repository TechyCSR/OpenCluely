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
                    background-color: rgba(18, 20, 26, 0.82) !important;
                }
            `).catch(() => {});
        } catch (_) {}

        // Re-apply current opacity whenever a new page loads
        if (window.electronAPI && window.electronAPI.getOpacity) {
            window.electronAPI.getOpacity().then(op => applyWebsiteOpacity(op)).catch(() => {});
        }
    }

    webview.addEventListener('did-start-loading', () => {
        loadBar.style.width = '40%';
        loadBar.style.opacity = '1';
        statusText.textContent = 'Connecting…';
        statusDot.style.background = '#f59e0b';
    });

    webview.addEventListener('did-stop-loading', () => {
        loadBar.style.width = '100%';
        setTimeout(() => {
            loadBar.style.opacity = '0';
            loadBar.style.width = '0%';
        }, 300);
        statusText.textContent = 'Ready';
        statusDot.style.background = '#10b981';
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
    webview.addEventListener('console-message', (e) => {
        const msg = e.message || '';
        if (msg.includes('[CLUELY-ACTION] start-dictation') || msg.includes('[CLUELY-ACTION] start-system-audio')) {
            console.log('[WEB-MODULE] In-page dictation mic triggered from webview, activating system audio capture');
            setDictatingState(true);
            if (window.electronAPI && window.electronAPI.startSystemAudioForWeb) {
                window.electronAPI.startSystemAudioForWeb();
            }
            if (window.electronAPI && window.electronAPI.toggleRecording) {
                window.electronAPI.toggleRecording({ source: 'web-dictation' });
            }
        }
    });

    // Listen for requests originating from inside the webview via ipc-message if available
    webview.addEventListener('ipc-message', (e) => {
        if (e.channel === 'request-system-audio-start') {
            console.log('[WEB-MODULE] Webview requested system audio capture start via IPC');
            setDictatingState(true);
            if (window.electronAPI && window.electronAPI.startSystemAudioForWeb) {
                window.electronAPI.startSystemAudioForWeb();
            }
        } else if (e.channel === 'request-hide-web-module') {
            if (window.electronAPI && window.electronAPI.hideWebModule) {
                window.electronAPI.hideWebModule();
            }
        }
    });

    // Stream system audio PCM chunks directly into the webview for web dictation
    if (window.electronAPI && window.electronAPI.onSystemAudioStream) {
        window.electronAPI.onSystemAudioStream((chunk) => {
            if (webview && chunk) {
                try {
                    let base64 = '';
                    if (typeof chunk === 'string') {
                        base64 = chunk;
                    } else if (chunk.toString) {
                        base64 = chunk.toString('base64');
                    }
                    if (base64) {
                        webview.executeJavaScript(`if (window.ingestSystemAudioPCMBase64) window.ingestSystemAudioPCMBase64("${base64}");`).catch(() => {});
                    }
                } catch (_) {}
            }
        });
    }

    // ── Global Cursor Hover Forwarding (Works when other window is selected) ──
    if (window.electronAPI && window.electronAPI.onGlobalCursorHover) {
        window.electronAPI.onGlobalCursorHover((data) => {
            if (webview && data && data.webviewY >= 0) {
                try {
                    webview.executeJavaScript(`if (window.checkHoverAt) window.checkHoverAt(${data.webviewX}, ${data.webviewY});`).catch(() => {});
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

    // ── Dictation (Capture System Audio & Inject into Web Chat) ──
    function setDictatingState(active) {
        isDictating = active;
        if (active) {
            btnDictate.classList.add('recording');
            dictateLabel.textContent = 'Listening…';
            statusText.textContent = 'Capturing System Audio…';
            statusDot.style.background = '#ef4444';
        } else {
            btnDictate.classList.remove('recording');
            dictateLabel.textContent = 'Dictate';
            statusText.textContent = 'Ready';
            statusDot.style.background = '#10b981';
        }
    }

    btnDictate.addEventListener('click', () => {
        const nextState = !isDictating;
        setDictatingState(nextState);

        // Tell main process to toggle recording with system audio
        if (window.electronAPI && window.electronAPI.toggleRecording) {
            window.electronAPI.toggleRecording({ source: 'web-dictation' });
        } else if (window.electronAPI && window.electronAPI.toggleSpeechRecognition) {
            window.electronAPI.toggleSpeechRecognition();
        } else if (window.api) {
            window.api.send('toggle-recording', { source: 'web-dictation' });
        }
    });

    // Listen to global recording state changes
    if (window.electronAPI && window.electronAPI.receive) {
        window.electronAPI.receive('recording-started', () => setDictatingState(true));
        window.electronAPI.receive('recording-stopped', () => setDictatingState(false));
    }

    // Listen for live speech transcription from main process
    if (window.electronAPI && window.electronAPI.onTranscription) {
        window.electronAPI.onTranscription((_event, data) => {
            const text = (data && data.text) ? data.text : (typeof data === 'string' ? data : '');
            if (!text || !text.trim()) return;

            console.log('[WEB-MODULE] Received transcription from speech engine:', text);

            if (webview && isDictating) {
                statusText.textContent = 'Injecting question into chat…';
                webview.executeJavaScript(`if (window.injectPromptAndSend) window.injectPromptAndSend(${JSON.stringify(text)});`)
                    .then(() => {
                        console.log('[WEB-MODULE] Auto-injected question into web chat');
                        setTimeout(() => setDictatingState(false), 800);
                    })
                    .catch(err => {
                        console.error('[WEB-MODULE] Failed to inject prompt:', err);
                        setDictatingState(false);
                    });
            }
        });
    }

    // Direct IPC injection listener if sent via custom channel
    if (window.electronAPI && window.electronAPI.onWebModuleDictationText) {
        window.electronAPI.onWebModuleDictationText((data) => {
            const text = (data && data.text) ? data.text : (typeof data === 'string' ? data : '');
            if (webview && text) {
                statusText.textContent = 'Injecting question into chat…';
                webview.executeJavaScript(`if (window.injectPromptAndSend) window.injectPromptAndSend(${JSON.stringify(text)});`)
                    .then(() => {
                        setTimeout(() => setDictatingState(false), 800);
                    })
                    .catch(() => setDictatingState(false));
            }
        });
    }

    // Sync opacity with Cluely bar transparency setting
    function applyWebsiteOpacity(opacity) {
        if (opacity === undefined || opacity === null) return;
        const opVal = typeof opacity === 'number' ? opacity : parseFloat(opacity);
        if (isNaN(opVal)) return;

        const opStr = opVal.toString();
        document.body.style.opacity = opStr;
        if (webview) {
            webview.style.opacity = opStr;
            try {
                webview.insertCSS(`
                    html, body {
                        opacity: ${opVal} !important;
                    }
                `).catch(() => {});
                webview.executeJavaScript(`if (window.updateWebsiteTransparency) window.updateWebsiteTransparency(${opVal});`).catch(() => {});
            } catch (_) {}
        }
    }

    if (window.electronAPI && window.electronAPI.getOpacity) {
        window.electronAPI.getOpacity().then(op => applyWebsiteOpacity(op)).catch(() => {});
    }
    if (window.electronAPI && window.electronAPI.onOpacityUpdate) {
        window.electronAPI.onOpacityUpdate((_event, opacity) => {
            applyWebsiteOpacity(opacity);
        });
    }
});
