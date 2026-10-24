document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('historyContainer');
  const closeBtn = document.getElementById('closeBtn');

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

  async function loadHistory() {
    try {
      const history = await window.electronAPI.getClipboardHistory();
      renderHistory(history);
    } catch (error) {
      console.error('Failed to load clipboard history:', error);
      container.innerHTML = `<div class="empty-state">Failed to load history.</div>`;
    }
  }

  function renderHistory(history) {
    container.innerHTML = '';
    
    const sessions = Object.keys(history).sort().reverse();
    
    if (sessions.length === 0) {
      container.innerHTML = `<div class="empty-state">No clipboard history found.</div>`;
      return;
    }

    sessions.forEach(sessionKey => {
      const items = history[sessionKey];
      if (!items || items.length === 0) return;

      const date = new Date(sessionKey);
      const title = `Session: ${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;

      const block = document.createElement('div');
      block.className = 'session-block';
      
      const header = document.createElement('div');
      header.className = 'session-header';
      header.innerHTML = `
        <div class="session-title">${title} <span style="font-size: 0.8rem; color: #6b7280;">(${items.length} items)</span></div>
        <button class="copy-all-btn" data-session="${sessionKey}"><i class="fas fa-copy"></i> Copy All</button>
      `;
      block.appendChild(header);

      const itemsContainer = document.createElement('div');
      
      // Reverse items so newest are first
      const reversedItems = [...items].reverse();
      reversedItems.forEach((text, index) => {
        const card = document.createElement('div');
        card.className = 'clip-card';
        
        const textEl = document.createElement('div');
        textEl.className = 'clip-text';
        textEl.textContent = text;
        
        const actions = document.createElement('div');
        actions.className = 'clip-actions';
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.innerHTML = `<i class="fas fa-copy"></i> Copy`;
        copyBtn.onclick = async () => {
          await window.electronAPI.copyToClipboard(text);
          copyBtn.innerHTML = `<i class="fas fa-check"></i> Copied`;
          setTimeout(() => copyBtn.innerHTML = `<i class="fas fa-copy"></i> Copy`, 2000);
        };
        
        actions.appendChild(copyBtn);
        card.appendChild(textEl);
        card.appendChild(actions);
        itemsContainer.appendChild(card);
      });
      
      block.appendChild(itemsContainer);
      container.appendChild(block);
    });

    // Attach copy-all listeners
    document.querySelectorAll('.copy-all-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const sessionKey = e.currentTarget.getAttribute('data-session');
        const success = await window.electronAPI.copyClipboardSession(sessionKey);
        if (success) {
          const originalHTML = btn.innerHTML;
          btn.innerHTML = `<i class="fas fa-check"></i> Copied Session`;
          btn.style.background = '#10b981';
          setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.background = '';
          }, 2000);
        }
      });
    });
  }

  // Refresh every few seconds if kept open
  loadHistory();
  setInterval(loadHistory, 5000);
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
