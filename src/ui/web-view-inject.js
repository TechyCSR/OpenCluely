/**
 * Stealth Web Module Injected Script for ChatGPT, Gemini, Grok, and Claude
 * Features:
 * 1. 1-second universal hover dwell auto-click for all buttons.
 * 2. Dedicated 1-second hover dwell for code snippet copy buttons with emerald glow and copy toast.
 * 3. Direct prompt text injection and auto-submission from native system audio transcription.
 */
(() => {
  if (window.__webModuleInjected) return;
  window.__webModuleInjected = true;

  console.log('[WEB-VIEW] Direct AI Assistant script initialized with 1s hover dwell');

  // ── Inject Sleek Dwell Animation Styles ──
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .dwell-ring-wrapper {
      position: absolute !important;
      inset: -3px !important;
      pointer-events: none !important;
      z-index: 999999 !important;
      border-radius: inherit !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      overflow: visible !important;
    }
    .dwell-ring-svg {
      position: absolute !important;
      width: 100% !important;
      height: 100% !important;
      overflow: visible !important;
    }
    .dwell-ring-circle {
      fill: none !important;
      stroke: #38bdf8 !important;
      stroke-width: 2.5px !important;
      stroke-linecap: round !important;
      stroke-dasharray: 200 !important;
      stroke-dashoffset: 200 !important;
      transition: stroke-dashoffset 1000ms linear !important;
      filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.8)) !important;
    }
    .dwell-code-copy {
      outline: 2px solid #10b981 !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.45) !important;
    }
    .dwell-code-copy .dwell-ring-circle {
      stroke: #10b981 !important;
      filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.9)) !important;
    }
    .dwell-toast {
      position: fixed !important;
      top: 18px !important;
      left: 50% !important;
      transform: translateX(-50%) translateY(-20px) !important;
      background: rgba(15, 23, 42, 0.94) !important;
      border: 1px solid rgba(16, 185, 129, 0.4) !important;
      color: #34d399 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      padding: 6px 14px !important;
      border-radius: 20px !important;
      backdrop-filter: blur(12px) !important;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important;
      z-index: 10000000 !important;
      opacity: 0 !important;
      pointer-events: none !important;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
    }
    .dwell-toast.is-visible {
      opacity: 1 !important;
      transform: translateX(-50%) translateY(0) !important;
    }
  `;
  document.head.appendChild(styleEl);

  // ── Floating HUD Toast ──
  const toast = document.createElement('div');
  toast.className = 'dwell-toast';
  toast.innerHTML = '<span>✓</span> <span id="dwellToastMsg">Action completed (1s dwell)</span>';
  document.body.appendChild(toast);

  let toastTimer = null;
  function showToast(msg, isCode = false) {
    const label = document.getElementById('dwellToastMsg');
    if (label) label.textContent = msg;
    toast.style.borderColor = isCode ? 'rgba(16, 185, 129, 0.6)' : 'rgba(56, 189, 248, 0.6)';
    toast.style.color = isCode ? '#34d399' : '#38bdf8';
    toast.classList.add('is-visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 2200);
  }

  // ── Universal 1-Second Hover Dwell State ──
  let activeDwellTarget = null;
  let activeDwellTimer = null;
  let activeRingElement = null;

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
    const tag = el.tagName.toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (tag === 'button' || role === 'button') return true;
    if (el.classList.contains('btn') || isCodeCopyButton(el)) return true;
    // Check parent up to 2 levels
    const p = el.parentElement;
    if (p && (p.tagName.toLowerCase() === 'button' || (p.getAttribute('role') || '').toLowerCase() === 'button')) {
      return p;
    }
    return false;
  }

  function clearActiveDwell() {
    if (activeDwellTimer) {
      clearTimeout(activeDwellTimer);
      activeDwellTimer = null;
    }
    if (activeRingElement) {
      try { activeRingElement.remove(); } catch (_) {}
      activeRingElement = null;
    }
    if (activeDwellTarget) {
      activeDwellTarget.classList.remove('dwell-code-copy');
      activeDwellTarget = null;
    }
  }

  document.addEventListener('mouseover', (e) => {
    const rawTarget = e.target;
    let target = isClickableButton(rawTarget);
    if (!target) return;
    if (typeof target === 'boolean') target = rawTarget;

    if (activeDwellTarget === target) return;
    clearActiveDwell();

    activeDwellTarget = target;
    const isCode = isCodeCopyButton(target);

    // Create Dwell Progress Ring
    const rect = target.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    const ringWrapper = document.createElement('div');
    ringWrapper.className = 'dwell-ring-wrapper';
    if (isCode) target.classList.add('dwell-code-copy');

    const rx = Math.max(4, parseInt(window.getComputedStyle(target).borderRadius) || 6);
    ringWrapper.innerHTML = `
      <svg class="dwell-ring-svg">
        <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" rx="${rx}" class="dwell-ring-circle" />
      </svg>
    `;

    // Ensure relative positioning on target so absolute ring fits cleanly
    const pos = window.getComputedStyle(target).position;
    if (pos === 'static') {
      target.style.position = 'relative';
    }
    target.appendChild(ringWrapper);
    activeRingElement = ringWrapper;

    const circle = ringWrapper.querySelector('.dwell-ring-circle');
    // Compute exact perimeter for stroke-dashoffset animation
    const perim = 2 * (rect.width + rect.height);
    if (circle) {
      circle.style.strokeDasharray = `${perim}`;
      circle.style.strokeDashoffset = `${perim}`;
      // Trigger smooth 1000ms transition
      requestAnimationFrame(() => {
        circle.style.strokeDashoffset = '0';
      });
    }

    // Arm 1-second auto-click timer
    activeDwellTimer = setTimeout(() => {
      activeDwellTimer = null;
      try {
        target.click();
        console.log('[WEB-VIEW] 1s hover dwell auto-clicked button', target);
        if (isCode) {
          showToast('✓ Code Copied to Clipboard (1s dwell)', true);
        }
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
      if (el && el.offsetParent !== null) { // must be visible
        inputEl = el;
        break;
      }
    }

    if (!inputEl) {
      console.warn('[WEB-VIEW] Could not find chat prompt input field');
      showToast('⚠️ Could not locate chat input field', false);
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

    showToast('✓ Question dictated & submitted (System Audio)', true);

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
})();
