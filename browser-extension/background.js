const WS_URL = 'ws://127.0.0.1:17321/?token=oc_local_7f86c1d293b74b5eb8ae3fd4';
const ALLOWED_COMMANDS = new Set([
  'toggle-live-screen',
  'toggle-call-copilot',
  'send-chat-message',
  'get-status'
]);

const railTabs = new Set();
let socket;
let reconnectTimer;
let requestSequence = 0;

const broadcastToRails = message => {
  railTabs.forEach(tabId => {
    chrome.tabs.sendMessage(tabId, message).catch(() => railTabs.delete(tabId));
  });
};

const setConnection = connected => {
  broadcastToRails({ type: 'bridge-connection', connected });
};

const sendCommand = (command, payload = {}) => {
  if (!ALLOWED_COMMANDS.has(command) || socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify({
    type: 'command',
    command,
    payload,
    requestId: String(++requestSequence)
  }));
  return true;
};

const scheduleReconnect = () => {
  clearTimeout(reconnectTimer);
  if (railTabs.size) reconnectTimer = setTimeout(connect, 1500);
};

const connect = () => {
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  clearTimeout(reconnectTimer);
  try {
    socket = new WebSocket(WS_URL);
  } catch (_) {
    scheduleReconnect();
    return;
  }
  socket.addEventListener('open', () => {
    setConnection(true);
    sendCommand('get-status');
  });
  socket.addEventListener('message', event => {
    try {
      broadcastToRails({ type: 'bridge-message', message: JSON.parse(event.data) });
    } catch (_) {}
  });
  socket.addEventListener('close', () => {
    setConnection(false);
    scheduleReconnect();
  });
  socket.addEventListener('error', () => socket.close());
};

chrome.action.onClicked.addListener(async tab => {
  if (!tab.id) return;
  railTabs.add(tab.id);
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    connect();
  } catch (_) {
    railTabs.delete(tab.id);
    await chrome.action.setBadgeText({ tabId: tab.id, text: 'ERR' });
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#b42318' });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'rail-ready' && sender.tab?.id) {
    railTabs.add(sender.tab.id);
    connect();
    sendResponse({ connected: socket?.readyState === WebSocket.OPEN });
    return false;
  }
  if (message?.type === 'bridge-command') {
    sendResponse({ sent: sendCommand(message.command, message.payload || {}) });
    return false;
  }
  return false;
});

chrome.tabs.onRemoved.addListener(tabId => railTabs.delete(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') railTabs.delete(tabId);
});
