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

  if (closeBtn) {
    closeBtn.style.position = 'relative';

    const ring = document.createElement('div');
    ring.className = 'close-dwell-ring';
    ring.innerHTML = `
      <svg viewBox="0 0 100 100" class="close-dwell-svg">
        <circle cx="50" cy="50" r="42" class="close-dwell-bg" />
        <circle cx="50" cy="50" r="42" class="close-dwell-bar" stroke-dasharray="264" stroke-dashoffset="264" />
      </svg>
    `;
    closeBtn.appendChild(ring);
    const bar = ring.querySelector('.close-dwell-bar');

    let dwellAnimId = null;
    let dwellStartTime = null;
    const dwellDuration = 3000;

    const cancelDwell = () => {
      if (dwellAnimId) {
        cancelAnimationFrame(dwellAnimId);
        dwellAnimId = null;
      }
      dwellStartTime = null;
      closeBtn.classList.remove('dwelling');
      if (bar) bar.style.strokeDashoffset = '264';
    };

    const startDwell = () => {
      cancelDwell();
      dwellStartTime = performance.now();
      closeBtn.classList.add('dwelling');

      const step = (now) => {
        if (!dwellStartTime) return;
        const elapsed = now - dwellStartTime;
        const progress = Math.min(elapsed / dwellDuration, 1);
        if (bar) {
          bar.style.strokeDashoffset = (264 * (1 - progress)).toString();
        }
        if (progress >= 1) {
          cancelDwell();
          closeBtn.classList.add('dwell-fired');
          window.close();
          return;
        }
        dwellAnimId = requestAnimationFrame(step);
      };
      dwellAnimId = requestAnimationFrame(step);
    };

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelDwell();
      window.close();
    });

    closeBtn.addEventListener('mouseenter', startDwell);
    closeBtn.addEventListener('mouseleave', cancelDwell);
    window.addEventListener('mousedown', cancelDwell, true);
  }

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

if (window.electronAPI) {
  if (window.electronAPI.getOpacity) {
    window.electronAPI.getOpacity().then(op => {
      if (op !== undefined && op !== null) document.body.style.opacity = op.toString();
    }).catch(() => {});
  }
  if (window.electronAPI.onOpacityUpdate) {
    window.electronAPI.onOpacityUpdate((event, opacity) => {
      document.body.style.opacity = opacity.toString();
    });
  }

  const applyTheme = (theme) => {
    if (theme === 'light') {
      document.body.classList.add('theme-light');
    } else {
      document.body.classList.remove('theme-light');
    }
  };

  if (window.electronAPI.getTheme) {
    window.electronAPI.getTheme().then(applyTheme).catch(() => {});
  }
  if (window.electronAPI.onThemeChanged) {
    window.electronAPI.onThemeChanged((event, theme) => {
      applyTheme(theme);
    });
  }
}
