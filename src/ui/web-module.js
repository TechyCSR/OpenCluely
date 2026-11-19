/**
 * Direct Web AI Workspace Renderer
 * Manages tab switching, toolbar 1s hover dwell, webview userscript injection,
 * and automatic system audio dictation into ChatGPT, Gemini, Grok, and Claude.
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

    // ── Universal 1-Second Hover Dwell on Toolbar Buttons ──
    function attachDwellAutoClick(btn) {
        let timer = null;
        let ringWrapper = null;

        btn.addEventListener('mouseenter', () => {
            if (timer) clearTimeout(timer);
            if (ringWrapper) try { ringWrapper.remove(); } catch (_) {}

            const rect = btn.getBoundingClientRect();
            if (rect.width < 10 || rect.height < 10) return;

            ringWrapper = document.createElement('div');
            ringWrapper.className = 'btn-dwell-ring';
            const rx = 8;
            ringWrapper.innerHTML = `
                <svg class="btn-dwell-svg">
                    <rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="${rx}" class="btn-dwell-rect" />
                </svg>
            `;
            btn.appendChild(ringWrapper);

            const rectShape = ringWrapper.querySelector('.btn-dwell-rect');
            const perim = 2 * (rect.width + rect.height);
            if (rectShape) {
                rectShape.style.strokeDasharray = `${perim}`;
                rectShape.style.strokeDashoffset = `${perim}`;
                requestAnimationFrame(() => {
                    rectShape.style.strokeDashoffset = '0';
                });
            }

            timer = setTimeout(() => {
                timer = null;
                btn.click();
                if (ringWrapper) {
                    try { ringWrapper.remove(); } catch (_) {}
                    ringWrapper = null;
                }
            }, 1000);
        });

        btn.addEventListener('mouseleave', () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            if (ringWrapper) {
                try { ringWrapper.remove(); } catch (_) {}
                ringWrapper = null;
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
    const fs = require('fs');
    const path = require('path');
    let injectScriptContent = '';
    try {
        const injectPath = path.join(__dirname, 'web-view-inject.js');
        if (fs.existsSync(injectPath)) {
            injectScriptContent = fs.readFileSync(injectPath, 'utf8');
        }
    } catch (e) {
        console.warn('Could not read web-view-inject.js file:', e);
    }

    function injectScriptIntoWebview() {
        if (!webview) return;
        if (injectScriptContent) {
            webview.executeJavaScript(injectScriptContent)
                .then(() => console.log('[WEB-MODULE] Successfully injected 1s hover dwell script'))
                .catch(err => console.error('[WEB-MODULE] Script injection error:', err));
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
        } else if (window.api) {
            window.api.send('toggle-recording', { source: 'web-dictation' });
        }
    });

    // Listen for live speech transcription from main process
    if (window.electronAPI && window.electronAPI.onTranscription) {
        window.electronAPI.onTranscription((_event, data) => {
            const text = (data && data.text) ? data.text : (typeof data === 'string' ? data : '');
            if (!text || !text.trim()) return;

            console.log('[WEB-MODULE] Received transcription from speech engine:', text);

            // If dictation mode was triggered or web module is visible, auto-inject into active webview chat!
            if (webview && isDictating) {
                statusText.textContent = 'Injecting question into chat…';
                webview.executeJavaScript(`window.injectPromptAndSend(${JSON.stringify(text)})`)
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
                webview.executeJavaScript(`window.injectPromptAndSend(${JSON.stringify(text)})`);
            }
        });
    }

    // Sync opacity
    if (window.electronAPI && window.electronAPI.getOpacity) {
        window.electronAPI.getOpacity().then(op => {
            if (op !== undefined && op !== null) document.body.style.opacity = op.toString();
        }).catch(() => {});
    }
    if (window.electronAPI && window.electronAPI.onOpacityUpdate) {
        window.electronAPI.onOpacityUpdate((event, opacity) => {
            document.body.style.opacity = opacity.toString();
        });
    }
});
