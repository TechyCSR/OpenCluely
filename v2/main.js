const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require("electron");
require("dotenv").config();

// ── Linux Workarounds for GPU & Wayland / X11 Compositor ──
if (process.platform === "linux") {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
  app.commandLine.appendSwitch("disable-software-rasterizer");
  app.commandLine.appendSwitch("disable-gpu-sandbox");
  app.commandLine.appendSwitch("in-process-gpu");
}
app.commandLine.appendSwitch("log-level", "3");
app.commandLine.appendSwitch("disable-background-networking");

// Single-instance lock: abort silently without stealing focus or revealing the window
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}
app.on("second-instance", () => {
  // Silent abort: do not pop up or focus to maintain stealth during interviews
});

// Import v2 Substrates
const { AIRouter } = require("./ai/router");
const { ContextManager } = require("./ai/context");
const { VisionCapture } = require("./vision/capture");
const { SpeechPipeline } = require("./audio/speech");
const { AutoTyper } = require("./autotyper/injector");
const { ClerkAuthManager } = require("./auth/clerk");

class OpenCluelyV2App {
  constructor() {
    this.hudWindow = null;
    this.isVisible = true;
    this.isClickthrough = false;

    // Services
    this.aiRouter = new AIRouter();
    this.contextManager = new ContextManager();
    this.speechPipeline = new SpeechPipeline();
    this.autoTyper = new AutoTyper();
    this.authManager = new ClerkAuthManager();
  }

  init() {
    app.whenReady().then(() => {
      this.createHUD();
      this.registerShortcuts();
      this.setupIPCHandlers();
      this.setupSpeechEvents();
    });

    app.on("will-quit", () => {
      globalShortcut.unregisterAll();
    });

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    });
  }

  createHUD() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    const winWidth = 720;
    const winHeight = 540;
    const x = Math.round((screenWidth - winWidth) / 2);
    const y = 30; // Position near top for sleek copilot HUD

    this.hudWindow = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      x: x,
      y: y,
      transparent: true,
      frame: false,
      hasShadow: false,
      resizable: true,
      skipTaskbar: true, // Stealth: hide from OS taskbar/dock
      alwaysOnTop: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: false
      }
    });

    // Stealth level: keep above regular windows but allow pass-through
    this.hudWindow.setAlwaysOnTop(true, "screen-saver");
    this.hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Load v2 UI
    const uiPath = path.join(__dirname, "ui", "index.html");
    this.hudWindow.loadFile(uiPath);

    this.hudWindow.on("closed", () => {
      this.hudWindow = null;
    });
  }

  registerShortcuts() {
    // Ctrl+Shift+V: Toggle HUD Visibility (Ghost toggle)
    globalShortcut.register("CommandOrControl+Shift+V", () => {
      this.toggleVisibility();
    });

    // Alt+A: Toggle Click-Through mode
    globalShortcut.register("Alt+A", () => {
      this.toggleClickthrough();
    });

    // Ctrl+Shift+S: Fast Snip Screen & Solve
    globalShortcut.register("CommandOrControl+Shift+S", () => {
      if (this.hudWindow && !this.hudWindow.isDestroyed()) {
        this.hudWindow.webContents.send("v2:shortcut", "snip");
      }
    });

    // Alt+T: Auto-Type Solution into Editor
    globalShortcut.register("Alt+T", () => {
      if (this.hudWindow && !this.hudWindow.isDestroyed()) {
        this.hudWindow.webContents.send("v2:shortcut", "autotype");
      }
    });

    // Ctrl+Alt+Q: Emergency Panic Switch
    globalShortcut.register("CommandOrControl+Alt+Q", () => {
      this.panic();
    });
  }

  toggleVisibility() {
    if (!this.hudWindow || this.hudWindow.isDestroyed()) return;
    this.isVisible = !this.isVisible;
    if (this.isVisible) {
      this.hudWindow.show();
    } else {
      this.hudWindow.hide();
    }
  }

  toggleClickthrough() {
    if (!this.hudWindow || this.hudWindow.isDestroyed()) return;
    this.isClickthrough = !this.isClickthrough;
    this.hudWindow.setIgnoreMouseEvents(this.isClickthrough, { forward: true });
    this.hudWindow.webContents.send("v2:status", { clickthrough: this.isClickthrough });
    return { clickthrough: this.isClickthrough };
  }

  panic() {
    // 1. Instantly hide HUD window
    if (this.hudWindow && !this.hudWindow.isDestroyed()) {
      this.hudWindow.hide();
      this.isVisible = false;
    }
    // 2. Abort running AI streaming requests
    this.aiRouter.abortCurrentRequest();
    // 3. Stop audio capture and speech pipelines
    this.speechPipeline.stop();
    // 4. Abort auto-typer keystroke injection
    this.autoTyper.abort();
  }

  setupSpeechEvents() {
    this.speechPipeline.on("utteranceComplete", ({ text, channel }) => {
      if (this.hudWindow && !this.hudWindow.isDestroyed()) {
        this.hudWindow.webContents.send("v2:transcript", {
          text,
          channel,
          isFinal: true
        });
      }
    });
  }

  setupIPCHandlers() {
    // AI Stream Inference
    ipcMain.handle("v2:send-prompt", async (_, { prompt, skill, language, imageBase64 }) => {
      return new Promise((resolve, reject) => {
        this.aiRouter.stream(
          { prompt, skill, language, imageBase64 },
          (chunk) => {
            if (this.hudWindow && !this.hudWindow.isDestroyed()) {
              this.hudWindow.webContents.send("v2:chunk", chunk);
            }
          },
          (fullText) => {
            if (this.hudWindow && !this.hudWindow.isDestroyed()) {
              this.hudWindow.webContents.send("v2:done", fullText);
            }
            resolve({ success: true, text: fullText });
          },
          (err) => {
            if (this.hudWindow && !this.hudWindow.isDestroyed()) {
              this.hudWindow.webContents.send("v2:error", err.message);
            }
            reject(err);
          }
        );
      });
    });

    ipcMain.handle("v2:abort-inference", () => {
      this.aiRouter.abortCurrentRequest();
      return { success: true };
    });

    // Vision Capture & Solve
    ipcMain.handle("v2:take-snip", async (_, cropRect) => {
      return await VisionCapture.captureScreen(cropRect);
    });

    ipcMain.handle("v2:capture-and-solve", async (_, { skill, language, prompt }) => {
      const captureResult = await VisionCapture.captureScreen();
      return new Promise((resolve, reject) => {
        this.aiRouter.stream(
          {
            prompt: prompt || "Solve the coding question or problem shown in this screenshot.",
            skill,
            language,
            imageBase64: captureResult.base64
          },
          (chunk) => {
            if (this.hudWindow && !this.hudWindow.isDestroyed()) {
              this.hudWindow.webContents.send("v2:chunk", chunk);
            }
          },
          (fullText) => {
            if (this.hudWindow && !this.hudWindow.isDestroyed()) {
              this.hudWindow.webContents.send("v2:done", fullText);
            }
            resolve({ success: true, text: fullText });
          },
          (err) => {
            if (this.hudWindow && !this.hudWindow.isDestroyed()) {
              this.hudWindow.webContents.send("v2:error", err.message);
            }
            reject(err);
          }
        );
      });
    });

    // Window Controls
    ipcMain.handle("v2:toggle-clickthrough", () => {
      return this.toggleClickthrough();
    });

    ipcMain.handle("v2:toggle-visibility", () => {
      this.toggleVisibility();
      return { visible: this.isVisible };
    });

    ipcMain.handle("v2:panic", () => {
      this.panic();
      return { panic: true };
    });

    ipcMain.on("v2:set-ignore-mouse", (_, ignore) => {
      if (this.hudWindow && !this.hudWindow.isDestroyed()) {
        this.isClickthrough = ignore;
        this.hudWindow.setIgnoreMouseEvents(ignore, { forward: true });
      }
    });

    // Auto-Typer
    ipcMain.handle("v2:autotype", async (_, text) => {
      return await this.autoTyper.typeText(text);
    });

    ipcMain.handle("v2:abort-autotype", () => {
      this.autoTyper.abort();
      return { success: true };
    });

    // Audio Pipeline
    ipcMain.handle("v2:audio-start", () => {
      this.speechPipeline.start();
      return { success: true };
    });

    ipcMain.handle("v2:audio-stop", () => {
      this.speechPipeline.stop();
      return { success: true };
    });

    ipcMain.on("v2:audio-feed", (_, data) => {
      this.speechPipeline.feedTranscriptFragment(data);
    });

    // Personalization Profile
    ipcMain.handle("v2:get-profile", () => {
      return this.contextManager.loadProfile();
    });

    ipcMain.handle("v2:save-profile", (_, profile) => {
      return this.contextManager.saveProfile(profile);
    });

    // Clerk Pro Auth
    ipcMain.handle("v2:check-auth", () => {
      return {
        isAuthenticated: this.authManager.isAuthenticated(),
        session: this.authManager.getSession()
      };
    });

    ipcMain.handle("v2:clerk-login", async () => {
      return await this.authManager.startLoginFlow();
    });
  }
}

// Instantiate and start v2 application
const v2App = new OpenCluelyV2App();
v2App.init();
