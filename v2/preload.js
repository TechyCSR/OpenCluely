const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("v2Api", {
  // AI Inference & Streaming
  sendPrompt: (params) => ipcRenderer.invoke("v2:send-prompt", params),
  abortInference: () => ipcRenderer.invoke("v2:abort-inference"),

  // Vision & Snip
  takeSnip: (rect) => ipcRenderer.invoke("v2:take-snip", rect),
  captureAndSolve: (params) => ipcRenderer.invoke("v2:capture-and-solve", params),

  // Window & Overlay Stealth Controls
  toggleClickthrough: () => ipcRenderer.invoke("v2:toggle-clickthrough"),
  toggleVisibility: () => ipcRenderer.invoke("v2:toggle-visibility"),
  panic: () => ipcRenderer.invoke("v2:panic"),
  setIgnoreMouse: (ignore) => ipcRenderer.send("v2:set-ignore-mouse", ignore),

  // Auto-Typer
  autoType: (text) => ipcRenderer.invoke("v2:autotype", text),
  abortAutoType: () => ipcRenderer.invoke("v2:abort-autotype"),

  // Audio Pipeline
  startAudio: () => ipcRenderer.invoke("v2:audio-start"),
  stopAudio: () => ipcRenderer.invoke("v2:audio-stop"),
  feedAudioTranscript: (data) => ipcRenderer.send("v2:audio-feed", data),

  // Local Profile & Auth
  getProfile: () => ipcRenderer.invoke("v2:get-profile"),
  saveProfile: (profile) => ipcRenderer.invoke("v2:save-profile", profile),
  checkAuth: () => ipcRenderer.invoke("v2:check-auth"),
  startClerkLogin: () => ipcRenderer.invoke("v2:clerk-login"),

  // Event Subscriptions
  onChunk: (callback) => {
    const handler = (_, text) => callback(text);
    ipcRenderer.on("v2:chunk", handler);
    return () => ipcRenderer.removeListener("v2:chunk", handler);
  },
  onDone: (callback) => {
    const handler = (_, fullText) => callback(fullText);
    ipcRenderer.on("v2:done", handler);
    return () => ipcRenderer.removeListener("v2:done", handler);
  },
  onError: (callback) => {
    const handler = (_, err) => callback(err);
    ipcRenderer.on("v2:error", handler);
    return () => ipcRenderer.removeListener("v2:error", handler);
  },
  onAudioTranscript: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("v2:transcript", handler);
    return () => ipcRenderer.removeListener("v2:transcript", handler);
  },
  onStatusChange: (callback) => {
    const handler = (_, status) => callback(status);
    ipcRenderer.on("v2:status", handler);
    return () => ipcRenderer.removeListener("v2:status", handler);
  },
  onShortcutTrigger: (callback) => {
    const handler = (_, action) => callback(action);
    ipcRenderer.on("v2:shortcut", handler);
    return () => ipcRenderer.removeListener("v2:shortcut", handler);
  }
});
