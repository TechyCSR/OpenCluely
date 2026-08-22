(() => {
  const bar = document.getElementById('interviewBar');
  const transcript = document.getElementById('transcript');
  const stableText = document.getElementById('stableText');
  const tailText = document.getElementById('tailText');

  function render(payload) {
    if (!payload || !bar) return;
    const state = payload.state || 'idle';
    bar.className = `strip ${state}`;

    const committed = String(payload.committed || '').trim();
    const interim = String(payload.interim || '').trim();
    const fallback = String(payload.text || '').trim();

    if (stableText && tailText) {
      if (committed || interim) {
        stableText.textContent = committed;
        tailText.textContent = committed && interim ? ` ${interim}` : interim;
      } else {
        stableText.textContent = fallback;
        tailText.textContent = '';
      }
      return;
    }
    if (transcript) {
      transcript.textContent = fallback;
    }
  }

  if (window.electronAPI && window.electronAPI.onInterviewUpdate) {
    window.electronAPI.onInterviewUpdate((_event, payload) => render(payload));
  }
  if (window.electronAPI && window.electronAPI.getInterviewState) {
    window.electronAPI.getInterviewState().then(render).catch(() => {});
  }
})();
