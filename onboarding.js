/* eslint-disable no-undef */
/**
 * Onboarding wizard controller.
 *
 * Drives the 4-step flow rendered in onboarding.html and persists
 * everything via the electronAPI bridge exposed by preload.js:
 *
 *   1. Welcome
 *   2. Gemini API key entry + live connection test
 *   3. Speech provider choice (Whisper / Azure / Skip)
 *   4. Whisper detect + (optional) install — only shown when whisper
 *   5. Star-the-repo prompt + summary
 */

(function () {
  'use strict';

  // ── DOM refs ──────────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const screens = $$('.screen');
  const stepperDots = $$('.step-dot');
  const stepBadge = $('#stepBadge');
  const backBtn = $('#backBtn');
  const nextBtn = $('#nextBtn');
  const skipBtn = $('#skipBtn');

  // ── State ─────────────────────────────────────────────────────────
  const state = {
    step: 0,
    geminiKey: '',
    speechProvider: null, // 'whisper' | 'azure' | 'skip'
    azureKey: '',
    azureRegion: '',
    whisperCmd: null,
    whisperDetected: false,
    skippingWhisper: false,
    finished: false,
  };

  // Screens are: welcome → apikey → speech → whisper? → finish
  // The whisper screen is only visited if state.speechProvider === 'whisper'
  const stepScreens = ['welcome', 'apikey', 'speech'];

  // ── Step rendering ────────────────────────────────────────────────
  function totalSteps() {
    return stepScreens.length + (state.speechProvider === 'whisper' ? 1 : 0) + 1;
  }

  function refreshStepper() {
    const total = totalSteps();
    const current = state.step + 1;
    stepBadge.textContent = `Step ${current} of ${total}`;
    stepperDots.forEach((dot, i) => {
      dot.classList.remove('active', 'done');
      if (i < state.step) dot.classList.add('done');
      else if (i === state.step) dot.classList.add('active');
    });
  }

  function showScreen(name) {
    screens.forEach((s) => {
      s.classList.toggle('active', s.dataset.screen === name);
    });
    refreshStepper();
    backBtn.style.visibility = state.step === 0 ? 'hidden' : 'visible';
    // The primary action label changes by step
    if (name === 'welcome') nextBtn.innerHTML = 'Get started <i class="fas fa-arrow-right"></i>';
    else if (name === 'finish') nextBtn.innerHTML = 'Finish <i class="fas fa-check"></i>';
    else if (name === 'whisper') nextBtn.innerHTML = 'Continue <i class="fas fa-arrow-right"></i>';
    else nextBtn.innerHTML = 'Continue <i class="fas fa-arrow-right"></i>';
  }

  function navigate(direction) {
    const order = computeScreenOrder();
    const idx = order.indexOf(currentScreenName());
    const next = direction === 'next' ? idx + 1 : idx - 1;
    if (next < 0 || next >= order.length) return;
    state.step = orderScreenToStep(order[next]);
    showScreen(order[next]);
  }

  function currentScreenName() {
    const active = Array.from(screens).find((s) => s.classList.contains('active'));
    return active ? active.dataset.screen : 'welcome';
  }

  // Order depends on choices — e.g. whisper path inserts the install screen.
  function computeScreenOrder() {
    const out = ['welcome', 'apikey', 'speech'];
    if (state.speechProvider === 'whisper') out.push('whisper');
    out.push('finish');
    return out;
  }

  // Map a screen name to its position in the stepper (0..n).
  function orderScreenToStep(name) {
    return computeScreenOrder().indexOf(name);
  }

  // ── Validation gates before "Continue" ───────────────────────────
  function canAdvance() {
    const name = currentScreenName();
    switch (name) {
      case 'welcome':
        return true;
      case 'apikey':
        return !!state.geminiKey.trim();
      case 'speech':
        if (state.speechProvider === 'azure') {
          return !!state.azureKey.trim() && !!state.azureRegion.trim();
        }
        return !!state.speechProvider;
      case 'whisper':
        // Allow advancing whether whisper is detected OR user skipped
        return state.whisperDetected || state.skippingWhisper;
      case 'finish':
        return true;
      default:
        return true;
    }
  }

  // ── Wire up: API key ──────────────────────────────────────────────
  const geminiInput = $('#geminiKey');
  const toggleVis = $('#toggleVis');
  const keyStatus = $('#keyStatus');
  const testKeyBtn = $('#testKeyBtn');

  function setKeyStatus(state_, text) {
    keyStatus.className = `status-pill ${state_}`;
    keyStatus.style.display = 'inline-flex';
    const icon = keyStatus.querySelector('i');
    const txt = keyStatus.querySelector('.text');
    if (state_ === 'testing') {
      icon.className = 'fas fa-circle-notch fa-spin';
    } else if (state_ === 'success') {
      icon.className = 'fas fa-check-circle';
    } else if (state_ === 'error') {
      icon.className = 'fas fa-circle-xmark';
    } else {
      icon.className = 'fas fa-circle-info';
    }
    txt.textContent = text;
  }

  geminiInput.addEventListener('input', () => {
    state.geminiKey = geminiInput.value.trim();
    if (!state.geminiKey) {
      keyStatus.style.display = 'none';
    } else if (keyStatus.classList.contains('success')) {
      // Keep success state — they had a valid key, may be editing
    } else {
      setKeyStatus('idle', 'Key entered — click Test connection');
    }
  });

  toggleVis.addEventListener('click', () => {
    const showing = geminiInput.type === 'text';
    geminiInput.type = showing ? 'password' : 'text';
    toggleVis.innerHTML = showing
      ? '<i class="fas fa-eye"></i>'
      : '<i class="fas fa-eye-slash"></i>';
  });

  testKeyBtn.addEventListener('click', async () => {
    const key = geminiInput.value.trim();
    if (!key) {
      setKeyStatus('error', 'Enter a key first');
      return;
    }
    if (!window.electronAPI) {
      setKeyStatus('error', 'Bridge unavailable');
      return;
    }
    testKeyBtn.disabled = true;
    testKeyBtn.innerHTML = '<span class="spinner"></span> Testing…';
    setKeyStatus('testing', 'Testing connection to Google Gemini…');
    try {
      // saveSettings writes the key into .env (atomic via persistEnvUpdates).
      await window.electronAPI.saveSettings({ geminiKey: key });
      const result = await window.electronAPI.testGeminiConnection();
      if (result && result.ok) {
        state.geminiKey = key;
        setKeyStatus('success', `Connected — ${result.model || 'Gemini ready'}`);
      } else {
        setKeyStatus('error', (result && result.error) || 'Connection failed');
      }
    } catch (e) {
      setKeyStatus('error', `Error: ${e.message || e}`);
    } finally {
      testKeyBtn.disabled = false;
      testKeyBtn.innerHTML = '<i class="fas fa-plug"></i> Test connection';
    }
  });

  // ── Wire up: Speech choices ───────────────────────────────────────
  $$('#speechChoices .choice-card').forEach((card) => {
    card.addEventListener('click', () => {
      const value = card.dataset.value;
      state.speechProvider = value;
      $$('#speechChoices .choice-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      const azurePanel = $('#azurePanel');
      azurePanel.style.display = value === 'azure' ? 'block' : 'none';
      if (value !== 'azure') {
        state.azureKey = '';
        state.azureRegion = '';
      }
    });
  });

  $('#azureKey').addEventListener('input', (e) => { state.azureKey = e.target.value.trim(); });
  $('#azureRegion').addEventListener('input', (e) => { state.azureRegion = e.target.value.trim(); });

  // ── Wire up: Whisper screen ───────────────────────────────────────
  const installLog = $('#installLog');
  const detectCmd = $('#detectCmd');
  const detectStatus = $('#detectStatus');
  const installList = $('#installList');
  const installCardTitle = $('#installCardTitle');

  function appendLog(line) {
    installLog.textContent += (installLog.textContent ? '\n' : '') + line;
    installLog.scrollTop = installLog.scrollHeight;
  }

  function setDetectStatus(state_, text) {
    detectStatus.className = `status-pill ${state_}`;
    const icon = detectStatus.querySelector('i');
    if (state_ === 'success') icon.className = 'fas fa-check-circle';
    else if (state_ === 'error') icon.className = 'fas fa-circle-xmark';
    else if (state_ === 'idle') icon.className = 'fas fa-circle-info';
    else icon.className = 'fas fa-circle-notch fa-spin';
    detectStatus.querySelector('.text').textContent = text;
  }

  async function runWhisperDetect() {
    detectCmd.textContent = 'scanning…';
    setDetectStatus('testing', 'Probing');
    try {
      const r = await window.electronAPI.detectWhisper();
      if (r.found) {
        state.whisperDetected = true;
        state.whisperCmd = r.command;
        detectCmd.textContent = r.command;
        setDetectStatus('success', `Found v${r.version || '?'}`);
        appendLog(`✓ Detected Whisper CLI: ${r.command}`);
      } else {
        detectCmd.textContent = 'not found';
        setDetectStatus('error', 'Not installed');
        appendLog('✗ No Whisper CLI detected on PATH or in known venvs');
      }
    } catch (e) {
      setDetectStatus('error', 'Probe failed');
      appendLog(`! Detection error: ${e.message || e}`);
    }
  }

  async function runWhisperInstall() {
    installLog.textContent = '';
    setDetectStatus('testing', 'Installing');
    appendLog('Starting install…');

    // Subscribe to streamed progress lines from the main process.
    // `installWhisper()` only returns once install completes; live
    // output comes through `onInstallProgress` events.
    let progressHandler = null;
    if (window.electronAPI && window.electronAPI.onInstallProgress) {
      progressHandler = (line) => appendLog(line);
      window.electronAPI.onInstallProgress(progressHandler);
    }

    try {
      const r = await window.electronAPI.installWhisper();
      if (r.ok) {
        state.whisperDetected = true;
        state.whisperCmd = r.command;
        detectCmd.textContent = r.command;
        setDetectStatus('success', 'Installed');
        appendLog(`\n✓ ${r.message}`);
      } else {
        setDetectStatus('error', 'Install failed');
        appendLog(`\n✗ ${r.message}`);
      }
    } catch (e) {
      setDetectStatus('error', 'Install error');
      appendLog(`\n! ${e.message || e}`);
    } finally {
      if (progressHandler && window.electronAPI.removeAllListeners) {
        try { window.electronAPI.removeAllListeners('install-progress'); } catch (_) { /* ignore */ }
      }
    }
  }

  // Whisper screen logic
  let whisperInitialized = false;
  function enterWhisperScreen() {
    if (whisperInitialized) return;
    whisperInitialized = true;
    const hints = {
      win32: {
        title: "We'll create a project-local venv and install openai-whisper",
        steps: [
          'Python 3.10+ must be on PATH (download from python.org if missing).',
          'A new <code>.venv-whisper\\</code> folder will be created in the app directory.',
          'Whisper will be installed into that venv (pip download, no admin rights needed).',
          'First transcription downloads the <code>turbo</code> model (~150 MB).',
        ],
      },
      darwin: {
        title: "We'll install openai-whisper via pip3 --user",
        steps: [
          'Uses your existing Python 3 (install via Homebrew if missing).',
          'Installs into your user site-packages — no <code>sudo</code> required.',
          'FFmpeg may also be installed automatically if missing.',
          'First transcription downloads the <code>turbo</code> model (~150 MB).',
        ],
      },
      other: {
        title: "We'll install openai-whisper via pip3 --user",
        steps: [
          'Uses your system Python 3.',
          'Installs into your user site-packages — no <code>sudo</code> required.',
          'FFmpeg may need to be installed separately (<code>sudo apt install ffmpeg</code>).',
          'First transcription downloads the <code>turbo</code> model (~150 MB).',
        ],
      },
    };
    const plat = navigator.platform.toLowerCase().includes('win')
      ? 'win32'
      : navigator.platform.toLowerCase().includes('mac')
        ? 'darwin'
        : 'other';
    const h = hints[plat];
    installCardTitle.textContent = h.title;
    installList.innerHTML = h.steps.map((s) => `<li>${s}</li>`).join('');
    runWhisperDetect();
  }

  // ── Wire up: Finish screen ────────────────────────────────────────
  function populateSummary() {
    const rows = [];
    rows.push({
      label: '<i class="fas fa-key"></i> Gemini API',
      value: state.geminiKey ? 'Configured' : 'Missing',
      cls: state.geminiKey ? 'ok' : 'skip',
    });
    if (state.speechProvider === 'whisper') {
      rows.push({
        label: '<i class="fas fa-microphone"></i> Speech',
        value: state.whisperDetected ? `Whisper (${state.whisperCmd || 'cli'})` : 'Whisper (not installed)',
        cls: state.whisperDetected ? 'ok' : 'skip',
      });
    } else if (state.speechProvider === 'azure') {
      rows.push({
        label: '<i class="fas fa-cloud"></i> Speech',
        value: 'Azure',
        cls: 'ok',
      });
    } else {
      rows.push({
        label: '<i class="fas fa-microphone"></i> Speech',
        value: 'Skipped (configure later)',
        cls: 'skip',
      });
    }
    rows.push({
      label: '<i class="fas fa-file-lines"></i> Config saved to',
      value: '.env',
      cls: 'ok',
    });
    $('#summaryList').innerHTML = rows
      .map((r) => `
        <div class="summary-row">
          <div class="label">${r.label}</div>
          <div class="value ${r.cls}">${r.value}</div>
        </div>
      `)
      .join('');
  }

  $('#starBtn').addEventListener('click', () => {
    if (window.electronAPI && window.electronAPI.openExternal) {
      window.electronAPI.openExternal('https://github.com/TechyCSR/OpenCluely');
    } else {
      window.open('https://github.com/TechyCSR/OpenCluely', '_blank');
    }
  });
  $('#skipStarBtn').addEventListener('click', () => {
    // No-op — just visual closure
  });

  // ── Wire up: nav buttons ──────────────────────────────────────────
  nextBtn.addEventListener('click', async () => {
    const name = currentScreenName();
    if (!canAdvance()) {
      // Lightly nudge the user
      if (name === 'apikey') setKeyStatus('error', 'Enter a Gemini API key');
      return;
    }

    // Persist settings on speech selection (Azure path), since we
    // already saved geminiKey on test; do it here too if user skipped
    // testing.
    if (name === 'apikey' && state.geminiKey && window.electronAPI) {
      try {
        await window.electronAPI.saveSettings({ geminiKey: state.geminiKey });
      } catch (_) { /* surfaced elsewhere */ }
    }
    if (name === 'speech' && window.electronAPI) {
      try {
        const payload = {
          speechProvider:
            state.speechProvider === 'skip' ? 'whisper' : state.speechProvider,
        };
        if (state.speechProvider === 'azure') {
          payload.azureKey = state.azureKey;
          payload.azureRegion = state.azureRegion;
        }
        if (state.speechProvider === 'whisper' && state.whisperCmd) {
          payload.whisperCommand = state.whisperCmd;
        }
        await window.electronAPI.saveSettings(payload);
      } catch (_) { /* surfaced elsewhere */ }
    }

    // Whisper screen: kick off detection on entry
    if (name === 'speech' && state.speechProvider === 'whisper') {
      // (deferred: will run via enterWhisperScreen)
    }

    // Whisper screen "Continue" — if user wants to skip install, mark and proceed
    if (name === 'whisper') {
      // Persist whatever whisper command we found (could be empty if skipped)
      if (window.electronAPI && state.whisperCmd) {
        try {
          await window.electronAPI.saveSettings({ whisperCommand: state.whisperCmd });
        } catch (_) { /* ignore */ }
      }
    }

    // Finish: close onboarding
    if (name === 'finish') {
      try {
        await window.electronAPI.completeFirstRun();
      } catch (_) { /* ignore */ }
      try {
        await window.electronAPI.closeOnboarding();
      } catch (_) { /* ignore */ }
      state.finished = true;
      return;
    }

    // Move forward, with whisper-screen insertion handled by order logic
    const order = computeScreenOrder();
    const idx = order.indexOf(name);
    const nextName = order[idx + 1];
    if (!nextName) return;

    // Compute new step index
    state.step = orderScreenToStep(nextName);
    showScreen(nextName);
    if (nextName === 'whisper') enterWhisperScreen();
    if (nextName === 'finish') populateSummary();

    // Re-render stepper with new total
    refreshStepper();
  });

  backBtn.addEventListener('click', () => {
    const name = currentScreenName();
    const order = computeScreenOrder();
    const idx = order.indexOf(name);
    const prevName = order[idx - 1];
    if (!prevName) return;
    state.step = orderScreenToStep(prevName);
    showScreen(prevName);
  });

  // Skip button: only shown on the whisper screen, lets user skip install
  // even if the CLI isn't present (they can configure later).
  function refreshSkipVisibility() {
    skipBtn.style.display = currentScreenName() === 'whisper' && !state.whisperDetected
      ? 'inline-flex'
      : 'none';
  }

  // Hook into showScreen to keep skip visibility in sync
  const _origShowScreen = showScreen;
  showScreen = function (name) {
    _origShowScreen(name);
    refreshSkipVisibility();
    refreshStepper();
  };

  skipBtn.addEventListener('click', () => {
    state.skippingWhisper = true;
    // Jump to finish without installing
    const order = computeScreenOrder();
    const finishName = order[order.length - 1];
    state.step = orderScreenToStep(finishName);
    showScreen(finishName);
    populateSummary();
  });

  // ── Manual install button (added dynamically) ─────────────────────
  function addManualInstallButton() {
    if (document.getElementById('installWhisperBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'installWhisperBtn';
    btn.type = 'button';
    btn.className = 'btn primary';
    btn.style.marginTop = '12px';
    btn.innerHTML = '<i class="fas fa-download"></i> Install Whisper now';
    btn.addEventListener('click', runWhisperInstall);
    document.querySelector('[data-screen="whisper"]').appendChild(btn);
  }

  // Show install button after detection runs and finds nothing
  const _origDetect = runWhisperDetect;
  runWhisperDetect = async function () {
    await _origDetect();
    if (!state.whisperDetected) addManualInstallButton();
  };

  // ── Boot ──────────────────────────────────────────────────────────
  showScreen('welcome');

  // Pre-populate Gemini key from existing .env (if any) so users with
  // a partial config don't have to retype.
  if (window.electronAPI && window.electronAPI.getFirstRunStatus) {
    window.electronAPI.getFirstRunStatus().then((s) => {
      if (s && s.geminiConfigured) {
        // We can't read the key back (settings returns empty for keys),
        // but we can mark status as success if the env file already has one.
        setKeyStatus('success', 'Already configured — click Continue');
        geminiInput.placeholder = '•••••••••••••••• (already set)';
      }
    }).catch(() => {});
  }
})();
