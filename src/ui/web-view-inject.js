/**
 * Stealth Web Module Injected Script for ChatGPT, Gemini, Grok, and Claude
 * Features:
 * 1. 1-second invisible hover dwell auto-click on buttons (excluding links).
 * 2. No mouse cursor symbol change on buttons (cursor remains default).
 * 3. Works even when other window is selected/active via background cursor hover tracking.
 * 4. Virtual MediaStream injection using system audio PCM (NO physical mic, NO macOS orange dot).
 * 5. Direct prompt text injection and auto-submission from native system audio transcription.
 */
(() => {
  if (window.__webModuleInjected) return;
  window.__webModuleInjected = true;

  console.log('[WEB-VIEW] Direct AI Assistant script initialized with silent 1s hover dwell & system audio');

  // ── Cursor Invariant: Do not change mouse cursor symbol on buttons ──
  const stealthStyle = document.createElement('style');
  stealthStyle.id = 'web-module-stealth-styles';
  stealthStyle.textContent = `
    button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"], .btn {
      cursor: default !important;
    }
  `;
  document.head.appendChild(stealthStyle);

  // ── Universal 1-Second Hover Dwell State (Silent, Zero Visual Changes) ──
  let activeDwellTarget = null;
  let activeDwellTimer = null;

  function isCodeCopyButton(el) {
    if (!el) return false;
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const title = (el.getAttribute('title') || '').toLowerCase();
    const text = (el.textContent || '').trim().toLowerCase();
    const cls = (el.className || '').toString().toLowerCase();

    const isCopy = aria.includes('copy') || title.includes('copy') || text === 'copy' || text === 'copy code' || cls.includes('copy');
    const nearPre = Boolean(el.closest('pre') || el.closest('.code-block') || el.closest('[data-testid*="code"]'));
    return isCopy || (nearPre && el.querySelector('svg'));
  }

  function isClickableButton(el) {
    if (!el || el === document.body || el === document.documentElement) return false;

    // STRICT REQUIREMENT: EXCLUDE LINKS completely!
    if (el.closest('a, [role="link"], [href]')) {
      return false;
    }

    // Match button elements
    const buttonEl = el.closest('button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]');
    if (buttonEl) {
      if (buttonEl.closest('a, [role="link"], [href]')) return false;
      return buttonEl;
    }

    if (isCodeCopyButton(el) || el.classList.contains('btn') || (el.getAttribute('data-testid') && el.getAttribute('data-testid').toLowerCase().includes('button'))) {
      return el;
    }

    return false;
  }

  function clearActiveDwell() {
    if (activeDwellTimer) {
      clearTimeout(activeDwellTimer);
      activeDwellTimer = null;
    }
    activeDwellTarget = null;
  }

  document.addEventListener('mouseover', (e) => {
    const rawTarget = e.target;
    let target = isClickableButton(rawTarget);
    if (!target) {
      clearActiveDwell();
      return;
    }
    if (typeof target === 'boolean') target = rawTarget;

    if (activeDwellTarget === target) return;
    clearActiveDwell();

    activeDwellTarget = target;

    // Arm 1-second auto-click timer (silent, no visible ring or cursor change)
    activeDwellTimer = setTimeout(() => {
      activeDwellTimer = null;
      try {
        target.click();
        console.log('[WEB-VIEW] 1s hover dwell auto-clicked button', target);
      } catch (err) {
        console.error('[WEB-VIEW] Dwell click error:', err);
      }
      clearActiveDwell();
    }, 1000);
  }, true);

  document.addEventListener('mouseout', (e) => {
    if (!activeDwellTarget) return;
    const related = e.relatedTarget;
    if (related && activeDwellTarget.contains(related)) {
      return;
    }
    clearActiveDwell();
  }, true);

  // ── Background Cursor Hover Tracking (Works when other window is selected) ──
  let bgHoverTarget = null;
  let bgHoverStartTime = null;

  window.checkHoverAt = (x, y) => {
    try {
      const el = document.elementFromPoint(x, y);
      const target = isClickableButton(el);
      if (!target) {
        bgHoverTarget = null;
        bgHoverStartTime = null;
        return;
      }

      if (bgHoverTarget !== target) {
        bgHoverTarget = target;
        bgHoverStartTime = Date.now();
      } else if (bgHoverStartTime && (Date.now() - bgHoverStartTime >= 1000)) {
        // 1-second hover completed! Click the button touchlessly
        bgHoverStartTime = Date.now() + 999999; // lock until cursor leaves
        try {
          target.click();
          console.log('[WEB-VIEW] Background hover auto-clicked button at', x, y, target);
        } catch (err) {
          console.error('[WEB-VIEW] Background click failed:', err);
        }
      }
    } catch (_) {}
  };

  // ── Direct Prompt Injection from System Audio ──
  window.injectPromptAndSend = (text) => {
    if (!text || typeof text !== 'string') return false;
    const cleanText = text.trim();
    if (!cleanText) return false;

    console.log('[WEB-VIEW] Injecting dictated text into active chat:', cleanText.substring(0, 60));

    // Find input element across ChatGPT, Gemini, Grok, Claude
    const inputCandidates = [
      '#prompt-textarea',
      'div[contenteditable="true"]#prompt-textarea',
      'rich-textarea div[contenteditable="true"]',
      'div[contenteditable="true"]',
      'textarea[data-id]',
      'textarea',
      'input[type="text"]'
    ];

    let inputEl = null;
    for (const sel of inputCandidates) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) {
        inputEl = el;
        break;
      }
    }

    if (!inputEl) {
      console.warn('[WEB-VIEW] Could not find chat prompt input field');
      return false;
    }

    // Set text according to element type
    inputEl.focus();
    if (inputEl.isContentEditable) {
      inputEl.textContent = cleanText;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      inputEl.value = cleanText;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Auto-click the send / submit button after a brief tick
    setTimeout(() => {
      const sendCandidates = [
        'button[data-testid*="send"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="Submit"]',
        'button.send-button',
        'button[aria-label*="prompt"]',
        'form button[type="submit"]'
      ];

      for (const sel of sendCandidates) {
        const btn = document.querySelector(sel);
        if (btn && !btn.disabled) {
          btn.click();
          console.log('[WEB-VIEW] Clicked send button', btn);
          return;
        }
      }

      // Fallback: Dispatch Enter keypress on input
      inputEl.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true
      }));
    }, 180);

    return true;
  };

  // ── Virtual MediaStream System Audio Ingestion & Routing ──
  let sysAudioCtx = null;
  let sysAudioDest = null;
  let nextChunkTime = 0;

  function getOrCreateSystemAudioStream() {
    if (!sysAudioCtx || sysAudioCtx.state === 'closed') {
      sysAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      sysAudioDest = sysAudioCtx.createMediaStreamDestination();
      nextChunkTime = sysAudioCtx.currentTime;
    }
    if (sysAudioCtx.state === 'suspended') {
      sysAudioCtx.resume();
    }
    return sysAudioDest.stream;
  }

  window.ingestSystemAudioPCM = (rawBuffer) => {
    try {
      getOrCreateSystemAudioStream();
      const int16 = new Int16Array(rawBuffer.buffer || rawBuffer);
      if (!int16.length) return;
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }
      const audioBuffer = sysAudioCtx.createBuffer(1, float32.length, 16000);
      audioBuffer.copyToChannel(float32, 0);

      const source = sysAudioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(sysAudioDest);

      const now = sysAudioCtx.currentTime;
      if (nextChunkTime < now) {
        nextChunkTime = now;
      }
      source.start(nextChunkTime);
      nextChunkTime += audioBuffer.duration;
    } catch (err) {
      console.error('[WEB-VIEW] System audio ingest error:', err);
    }
  };

  // Intercept getUserMedia so website voice dictation mic uses the system audio stream
  // without touching physical mic hardware (eliminating macOS orange indicator)
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function(constraints) {
      console.log('[WEB-VIEW] Intercepted getUserMedia with constraints:', constraints);
      if (constraints && (constraints.audio || constraints === true)) {
        try {
          if (typeof require !== 'undefined') {
            try {
              const { ipcRenderer } = require('electron');
              ipcRenderer.sendToHost('request-system-audio-start');
            } catch (_) {}
          }
          const stream = getOrCreateSystemAudioStream();
          console.log('[WEB-VIEW] Feeding system audio stream to web page');
          return stream;
        } catch (e) {
          console.warn('[WEB-VIEW] Fallback to original getUserMedia:', e);
        }
      }
      return origGetUserMedia(constraints);
    };
  }

  // Intercept enumerateDevices to advertise system audio device
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    const origEnumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = async function() {
      const devices = await origEnumerate();
      const hasVirtual = devices.some(d => d.label && d.label.includes('System Audio'));
      if (!hasVirtual) {
        devices.unshift({
          deviceId: 'system-audio-default',
          kind: 'audioinput',
          label: 'System Audio (Interviewer)',
          groupId: 'system-audio-group'
        });
      }
      return devices;
    };
  }

  // ── Website Transparency Linked to Cluely Bar Setting ──
  let websiteStyleEl = null;
  window.updateWebsiteTransparency = (opacity) => {
    const op = typeof opacity === 'number' ? opacity : parseFloat(opacity);
    if (isNaN(op)) return;

    if (!websiteStyleEl) {
      websiteStyleEl = document.createElement('style');
      websiteStyleEl.id = 'web-module-transparency-override';
      document.head.appendChild(websiteStyleEl);
    }

    if (op >= 0.98) {
      websiteStyleEl.textContent = '';
      return;
    }

    // Inject subtle glass-morphism onto website background surfaces
    websiteStyleEl.textContent = `
      html, body, #__next, main, [class*="bg-token-main-surface"], [class*="dark:bg-"] {
        background-color: rgba(18, 20, 26, ${Math.max(0.18, op * 0.85)}) !important;
      }
    `;
  };

  // IPC listeners if available in webview context
  try {
    const { ipcRenderer } = require('electron');
    ipcRenderer.on('check-hover-at', (_e, { x, y }) => {
      window.checkHoverAt(x, y);
    });
    ipcRenderer.on('system-audio-chunk', (_e, chunk) => {
      window.ingestSystemAudioPCM(chunk);
    });
    ipcRenderer.on('update-website-opacity', (_e, op) => {
      window.updateWebsiteTransparency(op);
    });
  } catch (_) {}
})();
