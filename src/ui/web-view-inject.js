/**
 * Stealth Web Module Injected Script for ChatGPT, Gemini, Grok, and Claude
 * Features:
 * 1. 1-second invisible hover dwell auto-click on buttons (excluding links).
 * 2. No mouse cursor symbol change on buttons (cursor remains default).
 * 3. Works even when other window is selected/active via background cursor hover tracking.
 * 4. Virtual MediaStream injection using system audio PCM (NO physical mic, NO macOS orange dot).
 * 5. Direct prompt text injection and auto-submission from native system audio transcription.
 * 6. Auto-dismisses remote transcription errors ("Couldn't transcribe that. Please try again.").
 */
(() => {
  if (window.__webModuleInjected) return;
  window.__webModuleInjected = true;

  console.log('[WEB-VIEW] Direct AI Assistant script initialized with silent 1s hover dwell & system audio');

  // ── Cursor Invariant: Do not change mouse cursor symbol on buttons ──
  const stealthStyle = document.createElement('style');
  stealthStyle.id = 'web-module-stealth-styles';
  stealthStyle.textContent = `
    button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"], .btn,
    button *, [role="button"] *, .btn *, [class*="button" i],
    [class*="btn" i], [aria-haspopup="true"], [tabindex="0"],
    [data-testid*="button" i], [data-testid*="btn" i] {
      cursor: default !important;
    }
  `;

  function safeAppendStealthStyle() {
    try {
      const parent = document.head || document.documentElement || document.body;
      if (parent) {
        if (!document.getElementById('web-module-stealth-styles')) {
          parent.appendChild(stealthStyle);
        }
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          const p = document.head || document.documentElement || document.body;
          if (p && !document.getElementById('web-module-stealth-styles')) {
            p.appendChild(stealthStyle);
          }
        }, { once: true });
      }
    } catch (_) {}
  }
  safeAppendStealthStyle();

  // ── Helper: Code Snippet Copy Button Detection ──
  function isCodeCopyButton(el) {
    if (!el) return false;
    const btn = el.closest('button, [role="button"]');
    const target = btn || el;
    const aria = (target.getAttribute('aria-label') || '').toLowerCase();
    const title = (target.getAttribute('title') || '').toLowerCase();
    const text = (target.textContent || '').trim().toLowerCase();
    const cls = (target.className || '').toString().toLowerCase();

    const isCopy = aria.includes('copy') || title.includes('copy') || text === 'copy' || text === 'copy code' || cls.includes('copy');
    const nearPre = Boolean(target.closest('pre') || target.closest('.code-block') || target.closest('[data-testid*="code"]'));
    return isCopy || (nearPre && target.querySelector('svg'));
  }

  // ── Helper: In-Page Dictation / Mic Button Detection ──
  function isDictationMicButton(el) {
    if (!el) return false;
    const btn = el.closest('button, [role="button"]');
    if (!btn) return false;

    const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
    const title = (btn.getAttribute('title') || '').toLowerCase();
    const testid = (btn.getAttribute('data-testid') || '').toLowerCase();
    const cls = (btn.className || '').toString().toLowerCase();

    const matchAttr = aria.includes('dictate') || aria.includes('voice') || aria.includes('mic') || aria.includes('speech') || aria.includes('record') ||
                      title.includes('dictate') || title.includes('voice') || title.includes('mic') ||
                      testid.includes('dictate') || testid.includes('voice') || testid.includes('mic') || testid.includes('speech') ||
                      cls.includes('dictat') || cls.includes('voice') || cls.includes('mic');
    if (matchAttr) return btn;

    const svgs = btn.querySelectorAll('svg');
    for (const svg of svgs) {
      const html = svg.innerHTML.toLowerCase();
      if (html.includes('m12') || html.includes('mic') || html.includes('19 10v1a7') || html.includes('12 1a3 3 0 0 0-3 3v8')) {
        return btn;
      }
    }
    return false;
  }

  // ── Helper: Clickable Button Identifier (Strictly Excludes Links) ──
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

    // Check computed cursor style: if pointer and not a link, treat as button and force default cursor
    try {
      const comp = window.getComputedStyle(el);
      if (comp && comp.cursor === 'pointer') {
        el.style.setProperty('cursor', 'default', 'important');
        return el;
      }
    } catch (_) {}

    return false;
  }

  // ── Universal 1-Second Hover Dwell State (Silent, Zero Visual Changes) ──
  let activeDwellTarget = null;
  let activeDwellTimer = null;

  function clearActiveDwell() {
    if (activeDwellTimer) {
      clearTimeout(activeDwellTimer);
      activeDwellTimer = null;
    }
    activeDwellTarget = null;
  }

  function triggerSilentClick(target) {
    if (!target) return;
    if (isDictationMicButton(target)) {
      console.log('[CLUELY-ACTION] toggle-dictation');
      console.log('[CLUELY-ACTION] start-system-audio');
    }
    try {
      target.click();
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      console.log('[WEB-VIEW] 1s hover dwell auto-clicked button', target);
    } catch (err) {
      console.error('[WEB-VIEW] Dwell click error:', err);
    }
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
      triggerSilentClick(target);
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

  // Intercept in-page dictation mic button clicks to seamlessly bridge to OpenCluely system audio
  document.addEventListener('click', (e) => {
    const mic = isDictationMicButton(e.target);
    if (mic) {
      // Prevent ChatGPT from starting its fragile cloud dictation that throws "Couldn't start dictation"
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      console.log('[CLUELY-ACTION] toggle-dictation');
      console.log('[CLUELY-ACTION] start-system-audio');

      // Visual pulse indicator on the in-page button so the user sees it is actively listening
      mic.classList.toggle('cluely-mic-active');
      if (mic.classList.contains('cluely-mic-active')) {
        mic.style.setProperty('outline', '2px solid #38bdf8', 'important');
        mic.style.setProperty('filter', 'drop-shadow(0 0 6px rgba(56, 189, 248, 0.6))', 'important');
      } else {
        mic.style.removeProperty('outline');
        mic.style.removeProperty('filter');
      }
    }
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
        triggerSilentClick(target);
      }
    } catch (_) {}
  };

  // ── Instant Auto-Dismiss Remote Transcription Error Alerts & Banners ──
  function dismissChatGptErrors() {
    try {
      const errorSelectors = [
        '[role="alert"]',
        '.text-red-500',
        '.bg-red-500',
        'div[class*="error" i]',
        'div[class*="toast" i]',
        'div[class*="banner" i]'
      ];
      document.querySelectorAll(errorSelectors.join(',')).forEach((el) => {
        const txt = (el.textContent || '').toLowerCase();
        if (txt.includes('transcribe') || txt.includes("couldn't") || txt.includes('error') || txt.includes('try again') || txt.includes('microphone')) {
          const closeBtn = el.querySelector('button');
          if (closeBtn) {
            try { closeBtn.click(); } catch (_) {}
          }
          try { el.remove(); } catch (_) {}
        }
      });
    } catch (_) {}
  }

  // MutationObserver to instantly destroy any error toasts the moment ChatGPT tries to insert them
  try {
    const toastObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const txt = (node.textContent || '').toLowerCase();
            if (txt.includes('dictat') || txt.includes('transcrib') || txt.includes('microphone')) {
              if (txt.includes("couldn't") || txt.includes("try again") || txt.includes("error") || txt.includes("failed")) {
                try { node.remove(); } catch (_) {}
              }
            }
          }
        }
      }
    });
    toastObserver.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

  setInterval(dismissChatGptErrors, 800);

  // ── Direct Prompt Injection from System Audio ──
  window.injectPromptAndSend = (text) => {
    if (!text || typeof text !== 'string') return false;
    const cleanText = text.trim();
    if (!cleanText) return false;

    console.log('[WEB-VIEW] Injecting dictated text into active chat:', cleanText.substring(0, 60));

    // Reset any mic button visual state
    document.querySelectorAll('.cluely-mic-active').forEach(el => {
      el.classList.remove('cluely-mic-active');
      el.style.removeProperty('outline');
      el.style.removeProperty('filter');
    });

    // Dismiss any error alerts first
    dismissChatGptErrors();

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

    // Set text according to element type with ProseMirror / Slate compatibility
    inputEl.focus();
    if (inputEl.isContentEditable) {
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        document.execCommand('insertText', false, cleanText);
      } catch (_) {}

      if (!inputEl.textContent.includes(cleanText.substring(0, Math.min(8, cleanText.length)))) {
        inputEl.innerHTML = `<p>${cleanText}</p>`;
      }

      inputEl.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: cleanText
      }));
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      inputEl.value = cleanText;
      inputEl.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: cleanText
      }));
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Auto-click the send / submit button after a brief tick
    setTimeout(() => {
      dismissChatGptErrors();
      const sendCandidates = [
        'button[data-testid="send-button"]',
        'button[data-testid*="send"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="Submit"]',
        'button.send-button',
        'button[aria-label*="prompt"]',
        'form button[type="submit"]'
      ];

      let clicked = false;
      for (const sel of sendCandidates) {
        const btn = document.querySelector(sel);
        if (btn && !btn.disabled) {
          btn.click();
          console.log('[WEB-VIEW] Auto-clicked send button', btn);
          clicked = true;
          break;
        }
      }

      if (!clicked) {
        // Fallback: Dispatch Enter keypress on input
        inputEl.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true
        }));
      }
    }, 200);

    return true;
  };

  // ── Virtual MediaStream System Audio Ingestion & Routing ──
  let sysAudioCtx = null;
  let sysAudioDest = null;
  let nextChunkTime = 0;

  async function getOrCreateSystemAudioStream() {
    if (!sysAudioCtx || sysAudioCtx.state === 'closed') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      sysAudioCtx = new AudioCtx({ sampleRate: 48000 });
      sysAudioDest = sysAudioCtx.createMediaStreamDestination();
      nextChunkTime = sysAudioCtx.currentTime;

      // Add continuous inaudible comfort audio dither so MediaRecorder/WebRTC never starves
      try {
        const bufferSize = sysAudioCtx.sampleRate * 2;
        const noiseBuffer = sysAudioCtx.createBuffer(1, bufferSize, sysAudioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = (Math.random() * 2 - 1) * 0.000005;
        }
        const whiteNoise = sysAudioCtx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;
        whiteNoise.connect(sysAudioDest);
        whiteNoise.start(0);
      } catch (_) {}
    }

    if (sysAudioCtx.state === 'suspended') {
      try {
        await sysAudioCtx.resume();
      } catch (_) {}
    }

    const stream = sysAudioDest.stream;
    const track = stream.getAudioTracks()[0];
    if (track) {
      track.enabled = true;
      track.contentHint = 'speech';
      track.applyConstraints = async () => {};
      track.getCapabilities = () => ({
        channelCount: { max: 2, min: 1 },
        sampleRate: { max: 48000, min: 16000 },
        latency: { max: 0.05, min: 0.01 },
        echoCancellation: [true, false],
        autoGainControl: [true, false],
        noiseSuppression: [true, false]
      });
      track.getSettings = () => ({
        channelCount: 1,
        sampleRate: 48000,
        latency: 0.01,
        deviceId: 'default',
        groupId: 'default',
        echoCancellation: true,
        autoGainControl: true,
        noiseSuppression: true
      });
    }

    return stream;
  }

  window.ingestSystemAudioPCM = (rawBuffer) => {
    try {
      getOrCreateSystemAudioStream();
      const bytes = new Uint8Array(rawBuffer.buffer || rawBuffer);
      const safeLen = bytes.length - (bytes.length % 2);
      if (safeLen < 2) return;
      const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, safeLen / 2);
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
      if (nextChunkTime < now || nextChunkTime > now + 1.0) {
        nextChunkTime = now;
      }
      source.start(nextChunkTime);
      nextChunkTime += audioBuffer.duration;
    } catch (err) {
      console.error('[WEB-VIEW] System audio ingest error:', err);
    }
  };

  window.ingestSystemAudioPCMBase64 = (base64) => {
    try {
      const binaryString = atob(base64);
      const len = binaryString.length;
      if (len < 2) return;
      const safeLen = len - (len % 2);
      const bytes = new Uint8Array(safeLen);
      for (let i = 0; i < safeLen; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      window.ingestSystemAudioPCM(bytes);
    } catch (e) {
      console.error('[WEB-VIEW] Base64 audio ingest error:', e);
    }
  };

  // Intercept getUserMedia and permissions so website voice dictation mic uses the system audio stream
  // without touching physical mic hardware (eliminating macOS orange indicator)
  function installMediaOverrides() {
    try {
      const fakeGetUserMedia = async function(constraints) {
        console.log('[WEB-VIEW] Intercepted getUserMedia with constraints:', constraints);
        console.log('[CLUELY-ACTION] start-system-audio');
        console.log('[CLUELY-ACTION] start-dictation');
        const stream = await getOrCreateSystemAudioStream();
        console.log('[WEB-VIEW] Feeding system audio stream to web page (ZERO physical mic access)');
        return stream;
      };

      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = async function(constraints) {
          return fakeGetUserMedia(constraints);
        };
      }
      if (window.MediaDevices && window.MediaDevices.prototype) {
        window.MediaDevices.prototype.getUserMedia = fakeGetUserMedia;
      }
      if (navigator.getUserMedia) {
        navigator.getUserMedia = (constraints, success, error) => {
          fakeGetUserMedia(constraints).then(success).catch(error);
        };
      }
      if (navigator.webkitGetUserMedia) {
        navigator.webkitGetUserMedia = (constraints, success, error) => {
          fakeGetUserMedia(constraints).then(success).catch(error);
        };
      }

      // Mock navigator.permissions.query for microphone
      if (navigator.permissions && navigator.permissions.query) {
        const origQuery = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = async function(param) {
          if (param && (param.name === 'microphone' || param.name === 'camera')) {
            return {
              state: 'granted',
              name: param.name,
              onchange: null,
              addEventListener: () => {},
              removeEventListener: () => {},
              dispatchEvent: () => true
            };
          }
          try {
            return await origQuery(param);
          } catch (_) {
            return { state: 'granted', name: (param && param.name) || 'microphone' };
          }
        };
      }
    } catch (e) {
      console.warn('[WEB-VIEW] Error installing media overrides:', e);
    }
  }

  installMediaOverrides();
  document.addEventListener('DOMContentLoaded', installMediaOverrides);

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
      const p = document.head || document.documentElement || document.body;
      if (p) p.appendChild(websiteStyleEl);
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
})();
