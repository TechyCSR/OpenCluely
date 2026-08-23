document.addEventListener('DOMContentLoaded', () => {
  const extractBtn = document.getElementById('extractBtn');
  const ocrModeBtn = document.getElementById('ocrModeBtn');
  const axModeBtn = document.getElementById('axModeBtn');
  const closeBtn = document.getElementById('closeBtn');

  let mode = 'ocr'; // 'ocr' or 'ax'

  ocrModeBtn.addEventListener('click', () => {
    mode = 'ocr';
    ocrModeBtn.classList.add('active');
    axModeBtn.classList.remove('active');
  });

  axModeBtn.addEventListener('click', () => {
    mode = 'ax';
    axModeBtn.classList.add('active');
    ocrModeBtn.classList.remove('active');
  });

  closeBtn.addEventListener('click', () => {
    window.close();
  });

  extractBtn.addEventListener('click', async () => {
    extractBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Extracting...`;
    extractBtn.disabled = true;

    try {
      const result = await window.electronAPI.extractTargetBox(mode);
      if (result && result.success) {
        extractBtn.innerHTML = `<i class="fas fa-check"></i> Copied!`;
      } else {
        extractBtn.innerHTML = `<i class="fas fa-times"></i> Failed`;
      }
    } catch (e) {
      console.error(e);
      extractBtn.innerHTML = `<i class="fas fa-times"></i> Error`;
    }

    setTimeout(() => {
      extractBtn.innerHTML = `<i class="fas fa-bolt"></i> Extract`;
      extractBtn.disabled = false;
    }, 2000);
  });
});

if (window.electronAPI && window.electronAPI.onOpacityUpdate) {
  window.electronAPI.onOpacityUpdate((event, opacity) => {
    document.body.style.opacity = opacity;
  });
}
