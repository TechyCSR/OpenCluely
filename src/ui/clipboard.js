document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('historyContainer');
  const closeBtn = document.getElementById('closeBtn');

  closeBtn.addEventListener('click', () => {
    window.close();
  });

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

if (window.electronAPI && window.electronAPI.onOpacityUpdate) { window.electronAPI.onOpacityUpdate((event, opacity) => { document.body.style.opacity = opacity; }); }
