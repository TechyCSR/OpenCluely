(() => {
  if (document.getElementById('opencluely-browser-rail-host')) return;

  const host = document.createElement('div');
  host.id = 'opencluely-browser-rail-host';
  host.style.cssText = 'all:initial;position:fixed;inset:0 0 auto auto;z-index:2147483647;pointer-events:none;';
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });

  root.innerHTML = `
    <style>
      :host {
        --rail-canvas: #111315;
        --rail-surface: #171a1d;
        --rail-surface-raised: #1c2024;
        --rail-ink: #f3f4f6;
        --rail-ink-2: #c3c8d0;
        --rail-ink-3: #858c96;
        --rail-line: rgba(255,255,255,.11);
        --rail-line-strong: rgba(255,255,255,.18);
        --rail-focus: #78a9ff;
        --rail-live: #6fcf97;
        --rail-error: #f08b8b;
        color-scheme: dark;
      }
      * { box-sizing: border-box; }
      button, textarea { font: inherit; }
      .rail {
        pointer-events: auto;
        position: fixed;
        top: 12px;
        right: 12px;
        width: min(380px, calc(100vw - 24px));
        max-height: calc(100vh - 24px);
        display: grid;
        grid-template-rows: auto auto minmax(120px, 1fr) auto;
        overflow: hidden;
        border: 1px solid var(--rail-line-strong);
        border-radius: 9px;
        background: var(--rail-canvas);
        color: var(--rail-ink);
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 10px 32px rgba(0,0,0,.28);
      }
      .rail.collapsed {
        width: 42px;
        grid-template-rows: auto;
      }
      .rail.collapsed .hide-when-collapsed { display: none; }
      .rail.collapsed .head {
        justify-content: center;
        padding: 0;
        border-bottom: 0;
      }
      .rail.collapsed .mark { display: none; }
      .head {
        min-height: 42px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 8px 0 12px;
        border-bottom: 1px solid var(--rail-line);
        background: var(--rail-surface);
      }
      .mark {
        width: 8px;
        height: 8px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: var(--rail-error);
      }
      .mark.connected { background: var(--rail-live); }
      .title { font-weight: 650; letter-spacing: -.01em; }
      .state { color: var(--rail-ink-3); font-size: 11px; margin-right: auto; }
      .icon-button, .action {
        border: 1px solid transparent;
        background: transparent;
        color: var(--rail-ink-2);
        cursor: pointer;
      }
      .icon-button {
        width: 28px;
        height: 28px;
        display: grid;
        place-items: center;
        border-radius: 5px;
        font-size: 16px;
      }
      .icon-button:hover, .icon-button:focus-visible {
        color: var(--rail-ink);
        border-color: var(--rail-line);
        background: var(--rail-surface-raised);
        outline: none;
      }
      .intent {
        padding: 10px 12px;
        border-bottom: 1px solid var(--rail-line);
        background: var(--rail-surface);
      }
      .eyebrow {
        margin-bottom: 3px;
        color: var(--rail-focus);
        font: 600 10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .intent-text { color: var(--rail-ink-2); font-size: 12px; }
      .answer {
        min-height: 140px;
        padding: 12px;
        overflow: auto;
        overscroll-behavior: contain;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        user-select: text;
      }
      .answer.empty { color: var(--rail-ink-3); }
      .answer code {
        font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .controls {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        padding: 8px;
        border-top: 1px solid var(--rail-line);
        background: var(--rail-surface);
      }
      .action {
        min-height: 32px;
        border-color: var(--rail-line);
        border-radius: 5px;
        font-size: 11px;
        font-weight: 600;
      }
      .action:hover, .action:focus-visible {
        border-color: var(--rail-line-strong);
        color: var(--rail-ink);
        background: var(--rail-surface-raised);
        outline: 2px solid rgba(120,169,255,.24);
      }
      .action.active { color: var(--rail-live); border-color: rgba(111,207,151,.35); }
      .composer { grid-column: 1 / -1; display: flex; gap: 6px; }
      textarea {
        width: 100%;
        min-height: 34px;
        max-height: 88px;
        resize: vertical;
        border: 1px solid var(--rail-line);
        border-radius: 5px;
        padding: 7px 8px;
        background: #0d0f11;
        color: var(--rail-ink);
        outline: none;
      }
      textarea:focus { border-color: var(--rail-focus); }
      .send { flex: 0 0 48px; }
    </style>
    <aside class="rail" aria-label="OpenCluely solution rail">
      <header class="head">
        <span class="mark" aria-hidden="true"></span>
        <strong class="title hide-when-collapsed">OpenCluely</strong>
        <span class="state hide-when-collapsed">offline</span>
        <button class="icon-button collapse" aria-label="Collapse OpenCluely" aria-expanded="true" title="Collapse">›</button>
      </header>
      <section class="intent hide-when-collapsed">
        <div class="eyebrow">Active intent</div>
        <div class="intent-text">Waiting for screen context…</div>
      </section>
      <main class="answer empty hide-when-collapsed" aria-live="polite">Start Live Screen to analyze the current problem.</main>
      <footer class="controls hide-when-collapsed">
        <button class="action live-screen">Live Screen</button>
        <button class="action live-audio">Live Audio</button>
        <div class="composer">
          <textarea aria-label="Ask OpenCluely" placeholder="Ask about the current problem…"></textarea>
          <button class="action send">Send</button>
        </div>
      </footer>
    </aside>`;

  const rail = root.querySelector('.rail');
  const mark = root.querySelector('.mark');
  const state = root.querySelector('.state');
  const answer = root.querySelector('.answer');
  const intent = root.querySelector('.intent-text');
  const collapse = root.querySelector('.collapse');
  const liveScreen = root.querySelector('.live-screen');
  const liveAudio = root.querySelector('.live-audio');
  const input = root.querySelector('textarea');
  const send = root.querySelector('.send');

  let currentText = '';

  const setConnection = connected => {
    mark.classList.toggle('connected', connected);
    state.textContent = connected ? 'connected' : 'offline';
  };

  const setAnswer = text => {
    currentText = String(text || '');
    answer.textContent = currentText || 'Waiting for an answer…';
    answer.classList.toggle('empty', !currentText);
  };

  const deriveIntent = text => {
    const clean = String(text || '').replace(/\*\*/g, '');
    const match = clean.match(/(?:^|\n)Intent\s*[—:-]\s*([^\n]+)/i);
    if (match) intent.textContent = match[1].trim();
  };

  const command = (name, payload = {}) => {
    chrome.runtime.sendMessage({ type: 'bridge-command', command: name, payload });
  };

  const handleEvent = ({ channel, data = {} }) => {
    if (channel === 'transcription-llm-response-start') {
      setAnswer('');
      rail.classList.remove('collapsed');
      collapse.textContent = '›';
    } else if (channel === 'transcription-llm-response-chunk') {
      setAnswer(currentText + String(data.delta || ''));
      deriveIntent(currentText);
      answer.scrollTop = answer.scrollHeight;
    } else if (channel === 'transcription-llm-response') {
      setAnswer(data.response || data.content || currentText);
      deriveIntent(currentText);
    } else if (channel === 'llm-response') {
      setAnswer(data.response || data.content || '');
      deriveIntent(currentText);
    } else if (channel === 'live-screen-status') {
      liveScreen.classList.toggle('active', !!data.active);
      liveScreen.textContent = data.active ? 'Screen active' : 'Live Screen';
    } else if (channel === 'call-copilot-status') {
      const active = !!(data.isCapturing || data.liveConnected);
      liveAudio.classList.toggle('active', active);
      liveAudio.textContent = active ? 'Audio active' : 'Live Audio';
    } else if (channel === 'llm-error' || channel === 'ocr-error') {
      setAnswer(`OpenCluely error: ${data.error || 'Unknown error'}`);
    } else if (channel === 'session-cleared') {
      intent.textContent = 'Waiting for screen context…';
      setAnswer('');
    }
  };

  const handleBridgeMessage = message => {
    if (message.type === 'event') handleEvent(message);
    if (message.type === 'command-result' && message.result?.status) {
      const statusResult = message.result.status;
      handleEvent({ channel: 'live-screen-status', data: statusResult.liveScreen || {} });
      handleEvent({ channel: 'call-copilot-status', data: statusResult.callCopilot || {} });
    }
  };

  const setCollapsed = collapsed => {
    rail.classList.toggle('collapsed', collapsed);
    collapse.textContent = collapsed ? '‹' : '›';
    collapse.setAttribute('aria-expanded', String(!collapsed));
    collapse.setAttribute('aria-label', collapsed ? 'Expand OpenCluely' : 'Collapse OpenCluely');
    collapse.title = collapsed ? 'Expand' : 'Collapse';
  };
  collapse.addEventListener('click', () => setCollapsed(!rail.classList.contains('collapsed')));
  liveScreen.addEventListener('click', () => command('toggle-live-screen'));
  liveAudio.addEventListener('click', () => command('toggle-call-copilot'));
  const sendMessage = () => {
    const text = input.value.trim();
    if (!text) return;
    command('send-chat-message', { text });
    input.value = '';
  };
  send.addEventListener('click', sendMessage);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  root.addEventListener('click', event => event.stopPropagation());
  root.addEventListener('keydown', event => event.stopPropagation());
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'bridge-connection') setConnection(!!message.connected);
    if (message?.type === 'bridge-message' && message.message) handleBridgeMessage(message.message);
  });
  chrome.runtime.sendMessage({ type: 'rail-ready' }, response => {
    setConnection(!!response?.connected);
  });
})();
