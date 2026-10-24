const path = require("path");
const fs = require("fs");
const { fileURLToPath } = require("url");
const { app, BrowserWindow, globalShortcut, session, ipcMain, nativeImage, Menu } = require("electron");

// Ensure process runs with OpenCluely root as working directory
try {
  process.chdir(__dirname);
} catch (_) {}

// Augment macOS PATH so Homebrew and local tools are available when launched from Dock/Finder
if (process.platform === "darwin") {
  const brewPaths = ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", "/usr/local/sbin"];
  const currentPath = process.env.PATH || "";
  process.env.PATH = `${brewPaths.join(":")}:${currentPath}`;
}

// Set early stealth identity for macOS Dock and process before ready or locks
app.name = "Setting";
if (typeof app.setName === "function") {
  app.setName("Setting");
}
process.title = "Setting";

// Prevent SSL certificate verification failures in Node/Electron network requests
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ── Resolve a stable .env location ──
// Ensure the active project .env is always synchronized so Gemini API key and settings
// are immediately ready on launch without manual setup.
function resolveEnvPath() {
  try {
    const projectEnv = path.join("/Users/jenilrevaliya/Desktop/Projects/cluely/OpenCluely", ".env");
    const userDataEnv = path.join(app.getPath("userData"), ".env");

    if (fs.existsSync(projectEnv)) {
      try {
        const projectContent = fs.readFileSync(projectEnv, "utf8");
        if (projectContent && projectContent.includes("GEMINI_API_KEY")) {
          // Keep userDataEnv in sync with the project's current active API keys
          fs.writeFileSync(userDataEnv, projectContent, "utf8");
        }
      } catch (_) {}
      return projectEnv;
    }

    if (fs.existsSync(userDataEnv)) {
      return userDataEnv;
    }
    return projectEnv;
  } catch (_) {
    try {
      return path.join(app.getPath("userData"), ".env");
    } catch (e2) {
      return path.join(__dirname, ".env");
    }
  }
}
const ENV_PATH = resolveEnvPath();
require("dotenv").config({ path: ENV_PATH });

// Format a value for a single .env line. Newlines are collapsed to spaces and
// backslashes are kept verbatim (doubling them corrupts Windows paths on the
// next load). Values containing whitespace, a double-quote, or a leading '#'
// are wrapped in single quotes so dotenv parses them as one token — essential
// for Whisper commands like:  "C:\Users\Jane Doe\...\python.exe" -m whisper
function formatEnvValue(raw) {
  const v = String(raw).replace(/[\r\n]+/g, " ").trim();
  if (!/[\s"#]/.test(v)) return v;
  if (!v.includes("'")) return `'${v}'`;
  // Rare: value already contains a single quote — fall back to double quotes.
  return `"${v.replace(/"/g, '\\"')}"`;
}

// ── Linux GPU process crash workaround ──
// On many Linux setups (Wayland, X11 without GPU drivers, Docker, headless,
// or systems with broken Mesa/NVIDIA stacks), Chromium's GPU process crashes
// on startup with:
//   FATAL:gpu_data_manager_impl_private.cc(448)] GPU process isn't usable.
// This kills the entire app and can leave orphan helper processes that
// exhaust the X11 client limit, producing "Maximum number of clients reached".
//
// Disabling hardware acceleration and the GPU subprocess forces Chromium to
// render via the CPU (SwiftShader). OpenCluely's UI is light enough that
// this is imperceptible, and it eliminates the GPU crash entirely.
if (process.platform === "linux") {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
  app.commandLine.appendSwitch("disable-software-rasterizer");
  app.commandLine.appendSwitch("disable-gpu-sandbox");
  // On X11 only; harmless on Wayland. Prevents Chromium from spawning a
  // compositor process that adds another X11 client.
  app.commandLine.appendSwitch("in-process-gpu");
}

// Keep Chromium network noise out of the terminal; app-level logs still go through Winston.
app.commandLine.appendSwitch("log-level", "3");
app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-component-update");
app.commandLine.appendSwitch("disable-domain-reliability");
app.commandLine.appendSwitch("no-pings");
app.commandLine.appendSwitch("ignore-certificate-errors");
app.commandLine.appendSwitch("ignore-ssl-errors");
app.commandLine.appendSwitch("allow-insecure-localhost");

const logger = require("./src/core/logger").createServiceLogger("MAIN");
const config = require("./src/core/config");
const FirstRunManager = require("./src/core/first-run");

// ── Global crash guard ──
// The speech path spawns external processes (Whisper CLI, and on macOS/Linux
// the sox/rec/arecord recorders via node-record-lpcm16). A missing recorder
// binary makes that library emit an 'error' on its child process with no
// listener, which would otherwise become an uncaughtException and quit the
// entire app the moment the user clicks the mic. We log and stay alive — the
// speech service surfaces a friendly status to the UI instead.
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception (kept alive)", {
    error: err && err.message,
    stack: err && err.stack,
  });
});
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection (kept alive)", {
    reason: String((reason && reason.message) || reason),
  });
});

// Services
// Screen capture (image-based)
const captureService = require("./src/services/capture.service");
const speechService = require("./src/services/speech.service");
const llmService = require("./src/services/llm.service");
const localKnowledgeService = require("./src/services/local-knowledge.service");
const autoTypeService = require("./src/services/autotype.service");

// Rubic services (stealth MCQ answer delivery)
const capsLockLEDService = require("./src/services/capslock-led.service");
const menuBarIndicator = require("./src/services/menubar-indicator.service");

// Managers
const windowManager = require("./src/managers/window.manager");
const sessionManager = require("./src/managers/session.manager");
const clipboardTrackerManager = require("./src/managers/clipboard-tracker.manager");

class ApplicationController {
  constructor() {
    this.isReady = false;
    this.starting = false;
    this.activeSkill = "interview"; // Default to Interview (Jenil Soni resume co-pilot)
    // Default to C++ so language is enforced from first run
    this.codingLanguage = "cpp";
    this.speechAvailable = false;
    this.isMcqMode = false;
    this.isAutoHideMode = false;
    this.audioSourceMode = "system"; // "system" (Interviewer bot speech) or "microphone" (candidate)
    if (typeof speechService.updateSettings === 'function') {
      speechService.updateSettings({ audioSourceMode: this.audioSourceMode });
    }

    // Rubic mode state (stealth MCQ assessment features)
    this.rubicMode = false;
    this.rubicSingleSelect = true; // true = single answer, false = multi-select
    this.rubicCapsLockLED = false; // toggle: Caps Lock LED answer indicator
    this.rubicMenuBarSymbol = true; // toggle: menu bar symbol answer indicator (enabled by default)
    this.rubicHoverDwell = false; // toggle: 3-second hover-to-activate

    // Utterance coalescing: VAD emits a transcript per natural pause, but a
    // single spoken question can still arrive as a few fragments (mid-thought
    // pauses). We buffer fragments and debounce so one question yields one LLM
    // call instead of several slow, half-answered ones.
    this._utteranceBuffer = "";
    this._utteranceTimer = null;
    this._utteranceDispatchInFlight = false;
    this._utteranceCoalesceMs = 700;

    // Track the last non-Electron frontmost app so we can activate it before typing
    this.lastExternalFrontApp = null;
    this._frontAppTracker = null;
    this._activeLlmAbortController = null;
    this._currentLlmRequestId = 0;
    this._hasActiveAnswer = false;

    // First-run onboarding: detects missing .env / API key and triggers
    // a settings-window prompt on first launch so users don't have to
    // dig through docs to figure out they need a Gemini API key.
    this.firstRunManager = new FirstRunManager({
      logger: logger,
      // .env and the sentinel both live in userData so they survive cwd
      // changes and read-only install dirs (the app may be launched from
      // any directory). ENV_PATH is the same file dotenv loaded at startup
      // and that persistEnvUpdates() writes to.
      envPath: ENV_PATH,
      sentinelPath: path.join(app.getPath("userData"), ".setting-init-done"),
    });
    // Lazily-initialised in getWhisperInstaller() so tests can mock
    // the constructor without polluting main-process startup.
    this._whisperInstaller = null;
    this.isFirstRun = false;

    // Window configurations for reference
    this.windowConfigs = {
      main: { title: "Preferences" },
      chat: { title: "Input" },
      llmResponse: { title: "Output" },
      settings: { title: "General" },
    };

    this.setupStealth();
    this.setupEventHandlers();
  }

  setupStealth() {
    if (config.get("stealth.disguiseProcess")) {
      process.title = config.get("app.processTitle");
    }

    // Set default stealth app name early
    if (app && typeof app.setName === 'function') {
      app.setName("Setting");
      app.name = "Setting";
    }
    process.title = "Setting";

    if (
      process.platform === "darwin" &&
      config.get("stealth.noAttachConsole")
    ) {
      process.env.ELECTRON_NO_ATTACH_CONSOLE = "1";
      process.env.ELECTRON_NO_ASAR = "1";
    }
  }

  setupEventHandlers() {
    app.whenReady().then(() => this.onAppReady());
    app.on("window-all-closed", () => this.onWindowAllClosed());
    app.on("activate", () => this.onActivate());
    app.on("before-quit", () => {
      logger.info("before-quit event received from Dock or system");
      this.quitApp();
    });
    app.on("will-quit", () => this.onWillQuit());

    // Clean exit handlers for terminal interrupts (Ctrl+C / SIGINT / SIGTERM)
    const handleTermination = (signal) => {
      logger.info(`Received ${signal}, terminating application cleanly...`);
      this.quitApp();
    };
    process.on("SIGINT", () => handleTermination("SIGINT"));
    process.on("SIGTERM", () => handleTermination("SIGTERM"));
    process.on("SIGHUP", () => handleTermination("SIGHUP"));

    this.setupIPCHandlers();
    this.setupServiceEventHandlers();
  }

  handleSecondInstance() {
    logger.info("Second instance launch detected; focusing main window");

    const focusExistingWindows = () => {
      try {
        const mainWindow = windowManager.getWindow("main");
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized && mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          windowManager.showOnCurrentDesktop(mainWindow);
          mainWindow.show();
          mainWindow.focus();
          return;
        }

        if (this.isReady) {
          windowManager.showMainWindow();
        }
      } catch (error) {
        logger.error("Failed to focus existing instance", {
          error: error.message,
        });
      }
    };

    if (app.isReady()) {
      focusExistingWindows();
    } else {
      app.whenReady().then(focusExistingWindows);
    }
  }

  async onAppReady() {
    if (this.starting || this.isReady) {
      logger.debug("onAppReady skipped: already starting or ready");
      return;
    }
    this.starting = true;

    // Force stealth mode IMMEDIATELY when app is ready
    app.setName("Setting");
    app.name = "Setting";
    process.title = "Setting";

    // macOS: Configure Dock menu and ensure stealth title while preserving native bundle icon
    if (process.platform === 'darwin' && app.dock) {
      try {
        // macOS Dock: Ensure Dock is shown and title is configured
        if (typeof app.dock.show === 'function') {
          app.dock.show();
        }

        // Provide custom Dock context menu with instant Quit option
        const dockMenu = Menu.buildFromTemplate([
          {
            label: 'Quit Setting',
            click: () => {
              logger.info('Quit triggered from Dock context menu');
              this.quitApp();
            }
          }
        ]);
        app.dock.setMenu(dockMenu);
      } catch (e) {
        logger.warn('Failed to configure dock menu', { error: e.message });
      }
    }

    logger.info("Application starting", {
      version: config.get("app.version"),
      environment: config.get("app.isDevelopment")
        ? "development"
        : "production",
      platform: process.platform,
    });

    try {
      this.setupPermissions();
      this.setupNetworkConfiguration();

      // Small delay to ensure desktop/space detection is accurate
      await new Promise((resolve) => setTimeout(resolve, 200));

      // First-run onboarding: ensure .env exists and read status once
      // so we can decide whether to defer showing the main overlay.
      let status;
      try {
        this.firstRunManager.ensureEnv();
        status = this.firstRunManager.getStatus();
        this.isFirstRun = status.needsOnboarding;
        logger.info("First-run status", status);
      } catch (e) {
        logger.warn("First-run check failed", { error: e.message });
        status = { needsOnboarding: false };
        this.isFirstRun = false;
      }
      const isFirstRun = status.needsOnboarding;

      // Reset session memory and question counts on every fresh startup
      sessionManager.clear();
      this._utteranceBuffer = "";

      await windowManager.initializeWindows({ showMainWindow: !isFirstRun });
      this.setupGlobalShortcuts();

      this.starting = false;
      this.isReady = true;

      // Launch the onboarding wizard if this is the first run.
      if (this.isFirstRun) {
        // Defer slightly so all windows finish loading before we pop
        // the wizard on top of them.
        setTimeout(() => {
          try {
            windowManager.showOnboarding();
            windowManager.broadcastToAllWindows("first-run", status);
            logger.info("First-run onboarding: wizard opened");
          } catch (e) {
            logger.warn("Could not open first-run onboarding window", {
              error: e.message
            });
            // Fallback to legacy settings prompt
            try { this.showSettings(); } catch (_) { /* ignore */ }
          }
        }, 800);
      } else {
        // Already configured — mark completed so we never nag again.
        this.firstRunManager.markCompleted();
      }

      windowManager.setupScreenTracking();

      // Start tracking clipboard history across sessions
      clipboardTrackerManager.start();

      // ── Frontmost-app tracker ──────────────────────────────────────────────
      // We need to know which app was active before the user clicks our bar.
      // Poll every 500 ms via osascript; skip our own process so we always
      // have the correct target ready when auto-type is triggered.
      if (process.platform === 'darwin') {
        const { exec } = require('child_process');
        this._frontAppTracker = setInterval(() => {
          exec(
            `osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`,
            (err, stdout) => {
              if (err || !stdout) return;
              const name = stdout.trim();
              if (name && !name.toLowerCase().includes('setting') && !name.toLowerCase().includes('electron')) {
                this.lastExternalFrontApp = name;
              }
            }
          );
        }, 500);
      }

      logger.info("All windows initialized successfully", {
        windowCount: Object.keys(windowManager.getWindowStats().windows).length,
        currentDesktop: "detected",
      });

      sessionManager.addEvent("Application started");
    } catch (error) {
      this.starting = false;
      logger.error("Application initialization failed", {
        error: error.message,
      });
      app.quit();
    }
  }

  setupNetworkConfiguration() {
    // Configure session to handle network requests better
    const ses = session.defaultSession;
    
    // Allow HTTPS requests to Google APIs
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      if (details.url.includes('generativelanguage.googleapis.com')) {
        const platformUA = process.platform === 'darwin'
          ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.156 Safari/537.36'
          : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.156 Safari/537.36';
        details.requestHeaders['User-Agent'] = platformUA;
      }
      callback({ requestHeaders: details.requestHeaders });
    });
    
    // Handle certificate verification globally for all requests
    ses.setCertificateVerifyProc((request, callback) => {
      callback(0); // Trust certificates to prevent CERTIFICATE_VERIFY_FAILED errors
    });
    
    // Catch webContents certificate errors
    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
      event.preventDefault();
      callback(true);
    });

    logger.debug('Network configuration & SSL bypass applied');
  }

  setupPermissions() {
    const appSession = session.defaultSession;
    const isTrustedAppContents = (webContents) => {
      if (!webContents || webContents.isDestroyed()) {
        return false;
      }
      try {
        const pagePath = path.resolve(fileURLToPath(webContents.getURL()));
        const appRoot = path.resolve(__dirname);
        const normalizeForComparison = (value) => process.platform === "win32"
          ? value.toLowerCase()
          : value;
        const page = normalizeForComparison(pagePath);
        const root = normalizeForComparison(appRoot + path.sep);
        return page.startsWith(root);
      } catch (_) {
        return false;
      }
    };

    // Electron exposes camera/microphone access as the single `media`
    // permission. The requested device type is provided separately in details.
    appSession.setPermissionCheckHandler(
      (webContents, permission, _requestingOrigin, details = {}) => {
        if (!isTrustedAppContents(webContents)) {
          return false;
        }
        if (permission === "media") {
          return !details.mediaType || details.mediaType === "audio";
        }
        return permission === "display-capture";
      }
    );

    appSession.setPermissionRequestHandler(
      (webContents, permission, callback, details = {}) => {
        let granted = false;
        if (isTrustedAppContents(webContents)) {
          if (permission === "media") {
            const mediaTypes = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
            granted = mediaTypes.length === 0 || mediaTypes.includes("audio");
          } else {
            granted = permission === "display-capture";
          }
        }

        logger.debug("Permission request", {
          permission,
          mediaTypes: details.mediaTypes || [],
          granted
        });
        callback(granted);
      }
    );

  }

  setupGlobalShortcuts() {
    const shortcuts = {
      "CommandOrControl+Shift+S": () => this.triggerScreenshotOCR(),
      "CommandOrControl+Shift+V": () => windowManager.toggleVisibility(),
      "CommandOrControl+Shift+I": () => windowManager.toggleInteraction(),
      "CommandOrControl+Shift+C": () => windowManager.switchToWindow("chat"),
      "CommandOrControl+Shift+\\": () => this.clearSessionMemory(),
      "CommandOrControl+,": () => windowManager.showSettings(),
      "Alt+A": () => windowManager.toggleInteraction(),
      "Alt+R": () => this.toggleSpeechRecognition(),
      // Rubic Stealth MCQ trigger (Alt+S or Cmd+Shift+R or Cmd+Alt+R)
      "CommandOrControl+Shift+R": () => this.triggerRubicMCQ(),
      "Alt+S": () => this.triggerRubicMCQ(),
      "CommandOrControl+Alt+R": () => this.triggerRubicMCQ(),
      // Smart Auto-Type clipboard content at 90-120 WPM (Alt+V or Cmd+Alt+V)
      "Alt+V": () => this.autoTypeClipboard(),
      "CommandOrControl+Alt+V": () => this.autoTypeClipboard(),
      // Toggle MCQ-only mode (Alt+M or Cmd+Alt+M)
      "Alt+M": () => this.toggleMcqMode(),
      "CommandOrControl+Alt+M": () => this.toggleMcqMode(),
      // Toggle Auto-Hide mode (Alt+H or Cmd+Alt+H)
      "Alt+H": () => this.toggleAutoHideMode(),
      "CommandOrControl+Alt+H": () => this.toggleAutoHideMode(),
      // Toggle Target Box (Alt+X or Cmd+Alt+X)
      "Alt+X": () => windowManager.showTargetBox(),
      "CommandOrControl+Alt+X": () => windowManager.showTargetBox(),
      // Toggle Clipboard History (Alt+C or Cmd+Alt+C)
      "Alt+C": () => windowManager.showClipboardWindow(),
      "CommandOrControl+Alt+C": () => windowManager.showClipboardWindow(),
      "CommandOrControl+Shift+T": () => windowManager.forceAlwaysOnTopForAllWindows(),
      "CommandOrControl+Shift+Alt+T": () => {
        const results = windowManager.testAlwaysOnTopForAllWindows();
        logger.info('Always-on-top test triggered via shortcut', results);
      },
      // Context-sensitive shortcuts based on interaction mode
      "CommandOrControl+Up": () => this.handleUpArrow(),
      "CommandOrControl+Down": () => this.handleDownArrow(),
      "CommandOrControl+Left": () => this.handleLeftArrow(),
      "CommandOrControl+Right": () => this.handleRightArrow(),
      // Answer backtracking shortcuts (Alt+Left/Right)
      "Alt+Left": () => this.backtrackAnswer(-1),
      "Alt+Right": () => this.backtrackAnswer(1),
      // Clean Quit application (Alt+Q or Cmd+Alt+Q or Cmd+Shift+Q)
      "Alt+Q": () => this.quitApp(),
      "CommandOrControl+Alt+Q": () => this.quitApp(),
      "CommandOrControl+Shift+Q": () => this.quitApp(),
    };

    Object.entries(shortcuts).forEach(([accelerator, handler]) => {
      const success = globalShortcut.register(accelerator, handler);
      logger.debug("Global shortcut registered", { accelerator, success });
    });
  }

  setupServiceEventHandlers() {
    speechService.on("recording-started", () => {
      const target = this.getVoiceResponseTarget();
      if (target === 'overlay') {
        windowManager.hideChatWindow();
        windowManager.showLLMReady();
      }
      windowManager.handleRecordingStarted({ target });
      if (typeof llmService.warmup === 'function') {
        llmService.warmup();
      }
    });

    speechService.on("speech-active", () => {
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send("speech-active");
        }
      });
    });

    speechService.on("recording-stopped", () => {
      windowManager.handleRecordingStopped();
    });

    speechService.on("transcription", (text) => {
      this.handleTranscriptionFragment(text);
    });

    speechService.on("interim-transcription", (text) => {
      // If user/interviewer is actively speaking, postpone any pending utterance dispatch
      if (this._utteranceTimer) {
        clearTimeout(this._utteranceTimer);
        this._utteranceTimer = setTimeout(() => {
          this._utteranceTimer = null;
          this.dispatchCoalescedUtterance();
        }, 260);
      }
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("interim-transcription", { text });
      });
    });

    speechService.on("status", (status) => {
      this.speechAvailable = speechService.isAvailable ? speechService.isAvailable() : false;
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("speech-status", { status, available: this.speechAvailable });
      });
      // Also broadcast availability specifically
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("speech-availability", { available: this.speechAvailable });
      });
    });

    speechService.on("error", (error) => {
      // In error, still compute availability
      this.speechAvailable = speechService.isAvailable ? speechService.isAvailable() : false;
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("speech-error", { error, available: this.speechAvailable });
      });
    });

    // Auto-Type events broadcasting
    autoTypeService.on("autotype-started", (data) => {
      windowManager.broadcastToAllWindows("autotype-started", data);
    });

    // LLM Real-time Debug Telemetry broadcasting
    llmService.on("debug-status", (statusData) => {
      windowManager.broadcastToAllWindows("llm-debug-status", statusData);
    });

    autoTypeService.on("autotype-progress", (data) => {
      windowManager.broadcastToAllWindows("autotype-progress", data);
    });

    autoTypeService.on("autotype-completed", (data) => {
      windowManager.broadcastToAllWindows("autotype-completed", data);
    });

    autoTypeService.on("autotype-stopped", (data) => {
      windowManager.broadcastToAllWindows("autotype-stopped", data);
    });
  }

  setupIPCHandlers() {
  ipcMain.handle("take-screenshot", () => this.triggerScreenshotOCR());
  ipcMain.handle("list-displays", () => captureService.listDisplays());
  ipcMain.handle("capture-area", (event, options) => captureService.captureAndProcess(options));
    
    // Provide reliable clipboard write via main process
    ipcMain.handle("copy-to-clipboard", (event, text) => {
      try {
        const { clipboard } = require("electron");
        clipboard.writeText(String(text ?? ""));
        return true;
      } catch (e) {
        logger.error("Failed to write to clipboard", { error: e.message });
        return false;
      }
    });

    ipcMain.on("report-code-available", (event, data) => {
      const code = (data && data.code) ? data.code : (typeof data === 'string' ? data : '');
      if (code && code.trim()) {
        autoTypeService.setLastCode(code.trim());
        windowManager.broadcastToAllWindows("snapshot-code-available", {
          hasCode: true,
          code: code.trim()
        });
      }
    });

    ipcMain.handle("get-clipboard-history", () => {
      return clipboardTrackerManager.getHistory();
    });

    ipcMain.handle("copy-clipboard-session", (event, sessionKey) => {
      const history = clipboardTrackerManager.getHistory();
      if (history[sessionKey]) {
        const textToCopy = history[sessionKey].join("\n\n");
        const { clipboard } = require("electron");
        clipboard.writeText(textToCopy);
        return true;
      }
      return false;
    });

    ipcMain.handle("show-clipboard", () => windowManager.showClipboardWindow());

    ipcMain.on("set-opacity", (event, opacity) => {
      windowManager.setOpacity(opacity);
    });
    ipcMain.handle("get-opacity", () => {
      return windowManager.currentOpacity !== undefined ? windowManager.currentOpacity : 0.38;
    });
    ipcMain.on("set-theme", (event, theme) => {
      windowManager.setTheme(theme);
    });
    ipcMain.handle("get-theme", () => {
      return windowManager.currentTheme || 'dark';
    });
    ipcMain.handle("show-target-box", () => windowManager.showTargetBox());

    ipcMain.handle("extract-target-box", async (event, mode) => {
      try {
        const win = windowManager.windows.get('targetBox');
        if (!win) return { success: false, error: 'Window not found' };
        
        const bounds = win.getBounds();
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);
        
        let command = '';
        if (mode === 'ocr') {
          // We need to hide the target box momentarily so the dashed border isn't captured
          win.setOpacity(0);
          command = `./scripts/vision_extract ${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`;
        } else {
          const centerX = bounds.x + bounds.width / 2;
          const centerY = bounds.y + bounds.height / 2;
          command = `./scripts/ax_extract ${centerX} ${centerY}`;
        }
        
        const { stdout } = await execAsync(command);
        
        if (mode === 'ocr') {
          win.setOpacity(1); // restore opacity
        }

        const text = stdout.trim();
        if (text && !text.startsWith('Error:')) {
          const { clipboard } = require("electron");
          clipboard.writeText(text);
          return { success: true, text };
        }
        return { success: false, error: text || 'No text extracted' };
      } catch (e) {
        const win = windowManager.windows.get('targetBox');
        if (win) win.setOpacity(1);
        logger.error('Target box extraction failed', { error: e.message });
        return { success: false, error: e.message };
      }
    });
    
    ipcMain.handle("get-speech-availability", () => {
      return speechService.isAvailable ? speechService.isAvailable() : false;
    });

    ipcMain.handle("start-speech-recognition", () => {
      speechService.startRecording();
      if (this.getVoiceResponseTarget() === 'chat') {
        windowManager.showChatWindow();
      } else {
        windowManager.hideChatWindow();
        windowManager.showLLMReady();
      }
      if (typeof llmService.warmup === 'function') {
        llmService.warmup();
      }
      return speechService.getStatus();
    });

    ipcMain.handle("stop-speech-recognition", () => {
      speechService.stopRecording();
      // Keep chat window and LLM response visible so user can see transcription and response
      return speechService.getStatus();
    });

    ipcMain.handle("get-desktop-sources", async () => {
      try {
        const { desktopCapturer } = require("electron");
        const sources = await desktopCapturer.getSources({ types: ["screen"] });
        return sources.map((s) => ({ id: s.id, name: s.name }));
      } catch (err) {
        logger.error("Failed to get desktop sources for audio capture", { error: err.message });
        return [];
      }
    });

    ipcMain.handle("set-audio-source-mode", (_event, mode) => {
      this.audioSourceMode = mode === "microphone" ? "microphone" : "system";
      if (typeof speechService.updateSettings === 'function') {
        speechService.updateSettings({ audioSourceMode: this.audioSourceMode });
      }
      windowManager.broadcastToAllWindows("audio-source-mode-changed", {
        mode: this.audioSourceMode,
      });
      return { success: true, mode: this.audioSourceMode };
    });

    ipcMain.handle("get-audio-source-mode", () => {
      return this.audioSourceMode || "system";
    });

    ipcMain.handle("toggle-audio-source-mode", () => {
      this.audioSourceMode = this.audioSourceMode === "system" ? "microphone" : "system";
      if (typeof speechService.updateSettings === 'function') {
        speechService.updateSettings({ audioSourceMode: this.audioSourceMode });
      }
      windowManager.broadcastToAllWindows("audio-source-mode-changed", {
        mode: this.audioSourceMode,
      });
      return { success: true, mode: this.audioSourceMode };
    });

    // Raw PCM audio captured by the renderer's Web Audio API (Windows Whisper path)
    ipcMain.on("audio-chunk", (_event, data) => {
      if (data && data.buffer) {
        speechService.handleAudioChunkFromRenderer(Buffer.from(data.buffer));
      }
    });

    // Also handle direct send events for fallback
    ipcMain.on("start-speech-recognition", () => {
      speechService.startRecording();
      if (this.getVoiceResponseTarget() === 'chat') {
        windowManager.showChatWindow();
      } else {
        windowManager.hideChatWindow();
        windowManager.showLLMReady();
      }
      if (typeof llmService.warmup === 'function') {
        llmService.warmup();
      }
    });

    ipcMain.on("stop-speech-recognition", () => {
      speechService.stopRecording();
      // Keep chat window and LLM response visible so user can see transcription and response
    });
    ipcMain.on("hide-chat-window", () => {
      windowManager.hideChatWindow();
    });
    ipcMain.on("chat-window-ready", () => {
      // Send a test message to confirm communication
      setTimeout(() => {
        windowManager.broadcastToAllWindows("transcription-received", {
          text: "Test message from main process - chat window communication is working!",
        });
      }, 1000);
    });

    ipcMain.on("main-window-ready", () => {
      // Re-check availability whenever the main overlay finishes loading;
      // this covers first-run where the window was hidden during onboarding.
      this.speechAvailable = speechService.isAvailable
        ? speechService.isAvailable()
        : false;
      const { BrowserWindow } = require("electron");
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send("speech-availability", { available: this.speechAvailable });
        }
      });
    });

    ipcMain.on("test-chat-window", () => {
      windowManager.broadcastToAllWindows("transcription-received", {
        text: "🧪 IMMEDIATE TEST: Chat window IPC communication test successful!",
      });
    });

    ipcMain.handle("show-all-windows", () => {
      windowManager.showAllWindows();
      return windowManager.getWindowStats();
    });

    ipcMain.handle("hide-all-windows", () => {
      windowManager.hideAllWindows();
      return windowManager.getWindowStats();
    });

    ipcMain.handle("enable-window-interaction", () => {
      windowManager.setInteractive(true);
      return windowManager.getWindowStats();
    });

    ipcMain.handle("disable-window-interaction", () => {
      windowManager.setInteractive(false);
      return windowManager.getWindowStats();
    });

    ipcMain.handle("switch-to-chat", () => {
      windowManager.switchToWindow("chat");
      return windowManager.getWindowStats();
    });

    ipcMain.handle("switch-to-skills", () => {
      windowManager.switchToWindow("skills");
      return windowManager.getWindowStats();
    });

    ipcMain.handle("resize-window", (event, { width, height }) => {
      const mainWindow = windowManager.getWindow("main");
      if (mainWindow) {
        // Enforce horizontal constraints: min ~one icon, max configured width
        const minW = 60;
        const maxW = 2200;
        const clampedWidth = Math.max(minW, Math.min(maxW, Math.round(width || minW)));
        const clampedHeight = Math.max(1, Math.round(height || 36));
        try {
          // Match content size to the DOM so no extra transparent area remains
          mainWindow.setContentSize(clampedWidth, clampedHeight);
        } catch (e) {
          // Fallback in case setContentSize isn’t available on some platform
          mainWindow.setSize(clampedWidth, clampedHeight);
        }
        logger.debug("Main window resized (content)", { width: clampedWidth, height: clampedHeight });
      }
      return { success: true };
    });

    ipcMain.handle("move-window", (event, { deltaX, deltaY }) => {
      windowManager.moveBoundWindows(deltaX, deltaY);
      return { success: true };
    });

    ipcMain.handle("start-hover-drag", (event, targetWindowName) => {
      let target = targetWindowName;
      if (!target) {
        for (const [name, win] of windowManager.windows.entries()) {
          if (win && !win.isDestroyed() && win.webContents === event.sender) {
            target = name;
            break;
          }
        }
      }
      return windowManager.startHoverDrag(target || 'main');
    });

    ipcMain.handle("stop-hover-drag", () => {
      return windowManager.stopHoverDrag();
    });

    ipcMain.handle("hide-llm-response", () => {
      windowManager.hideLLMResponse();
      return { success: true };
    });

    ipcMain.handle("is-llm-response-open", () => {
      const llmWindow = windowManager.windows.get('llmResponse');
      return !!(llmWindow && !llmWindow.isDestroyed() && llmWindow.isVisible());
    });

    ipcMain.handle("get-session-history", () => {
      return sessionManager.getOptimizedHistory();
    });

    ipcMain.handle("clear-session-memory", () => {
      sessionManager.clear();
      this._hasActiveAnswer = false;
      windowManager.broadcastToAllWindows("session-cleared");
      return { success: true };
    });

    ipcMain.handle("force-always-on-top", () => {
      windowManager.forceAlwaysOnTopForAllWindows();
      return { success: true };
    });

    ipcMain.handle("test-always-on-top", () => {
      const results = windowManager.testAlwaysOnTopForAllWindows();
      return { success: true, results };
    });

    ipcMain.handle("send-chat-message", async (event, text) => {
      // Add chat message to session memory
      sessionManager.addUserInput(text, 'chat');
      logger.debug('Chat message added to session memory', { textLength: text.length });

      // Typed messages need the full skill pipeline (with history context),
      // NOT the voice "intelligent filter" pipeline. Voice keeps its filter
      // behaviour; typed chat goes through processWithLLM so it gets real
      // answers using the active skill prompt and recent conversation history.
      (async () => {
        try {
          const sessionHistory = sessionManager.getOptimizedHistory();
          await this.processWithLLM(text, sessionHistory, 'chat');
        } catch (error) {
          logger.error("Failed to process chat message with LLM", {
            error: error.message,
            text: text.substring(0, 100)
          });
        }
      })();

      return { success: true };
    });

    ipcMain.handle("get-skill-prompt", (event, skillName) => {
      try {
        const { promptLoader } = require('./prompt-loader');
        const skillPrompt = promptLoader.getSkillPrompt(skillName);
        return skillPrompt;
      } catch (error) {
        logger.error('Failed to get skill prompt', { skillName, error: error.message });
        return null;
      }
    });

    ipcMain.handle("set-gemini-api-key", (event, apiKey) => {
      llmService.updateApiKey(apiKey);
      return llmService.getStats();
    });

    ipcMain.handle("get-gemini-status", () => {
      return llmService.getStats();
    });

    // Window binding IPC handlers
    ipcMain.handle("set-window-binding", (event, enabled) => {
      return windowManager.setWindowBinding(enabled);
    });

    ipcMain.handle("toggle-window-binding", () => {
      return windowManager.toggleWindowBinding();
    });

    ipcMain.handle("get-window-binding-status", () => {
      return windowManager.getWindowBindingStatus();
    });

    ipcMain.handle("get-window-stats", () => {
      return windowManager.getWindowStats();
    });

    ipcMain.handle("set-window-gap", (event, gap) => {
      return windowManager.setWindowGap(gap);
    });

    ipcMain.handle("move-bound-windows", (event, { deltaX, deltaY }) => {
      windowManager.moveBoundWindows(deltaX, deltaY);
      return windowManager.getWindowBindingStatus();
    });

    ipcMain.handle("test-gemini-connection", async () => {
      return await llmService.testConnection();
    });

    ipcMain.handle("run-gemini-diagnostics", async () => {
      try {
        const connectivity = await llmService.checkNetworkConnectivity();
        const apiTest = await llmService.testConnection();
        
        return {
          success: true,
          connectivity,
          apiTest,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    });

    ipcMain.handle("get-system-diagnostics", async () => {
      return {
        timestamp: Date.now(),
        llm: typeof llmService.getDiagnostics === 'function' ? llmService.getDiagnostics() : {},
        speech: {
          provider: speechService ? speechService.provider : 'unknown',
          isRecording: speechService ? speechService.isRecording : false,
          available: speechService && speechService.isAvailable ? speechService.isAvailable() : false,
          audioSourceMode: this.audioSourceMode || 'system'
        },
        windows: windowManager ? windowManager.getWindowStats() : {},
        app: {
          activeSkill: this.activeSkill,
          codingLanguage: this.codingLanguage,
          interactionMode: this.interactionMode,
          mcqMode: this.isMcqMode,
          rubicMode: this.rubicMode
        }
      };
    });

    ipcMain.handle("run-live-diagnostic-probe", async () => {
      const llmProbe = typeof llmService.runLiveDiagnosticsProbe === 'function' 
        ? await llmService.runLiveDiagnosticsProbe() 
        : { error: 'Diagnostic probe not implemented' };
      return {
        timestamp: Date.now(),
        llm: llmProbe,
        speech: {
          available: speechService && speechService.isAvailable ? speechService.isAvailable() : false,
          isRecording: speechService ? speechService.isRecording : false,
          provider: speechService ? speechService.provider : 'unknown'
        }
      };
    });

    // Settings handlers
    ipcMain.handle("show-settings", () => {
      windowManager.showSettings();

      // Send current settings to the settings window
      const settingsWindow = windowManager.getWindow("settings");
      if (settingsWindow) {
        const currentSettings = this.getSettings();
        setTimeout(() => {
          settingsWindow.webContents.send("load-settings", currentSettings);
        }, 100);
      }

      return { success: true };
    });

    ipcMain.handle("get-settings", () => {
      return this.getSettings();
    });

    // First-run onboarding status — renderer can query to know whether
    // to show the welcome banner / prompt for API-key entry.
    ipcMain.handle("get-first-run-status", () => {
      try {
        return this.firstRunManager.getStatus();
      } catch (e) {
        logger.warn("Failed to get first-run status", { error: e.message });
        return { needsOnboarding: false, error: e.message };
      }
    });

    ipcMain.handle("complete-first-run", async () => {
      try {
        this.firstRunManager.markCompleted();
        this.isFirstRun = false;
        // Reinitialize speech service with the latest persisted settings
        // so the mic button reflects the provider/command set during onboarding.
        speechService.initializeClient();
        this.speechAvailable = speechService.isAvailable
          ? speechService.isAvailable()
          : false;
        // Show the main overlay window now that onboarding is done
        // and API keys are configured.
        await windowManager.showMainWindow();
        // Broadcast speech availability so the mic button appears
        const { BrowserWindow } = require("electron");
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send("speech-availability", { available: this.speechAvailable });
          }
        });
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });

    // Open a URL in the system browser (used by the GitHub star button
    // in onboarding).
    ipcMain.handle("open-external", async (_event, url) => {
      try {
        if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
          return { ok: false, error: "Invalid URL" };
        }
        const { shell } = require("electron");
        await shell.openExternal(url);
        return { ok: true };
      } catch (e) {
        logger.warn("Failed to open external URL", { url, error: e.message });
        return { ok: false, error: e.message };
      }
    });

    // Close the onboarding wizard window.
    ipcMain.handle("close-onboarding", () => {
      try {
        windowManager.closeOnboarding();
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });

    // Detect an installed Whisper CLI across common locations.
    ipcMain.handle("detect-whisper", async () => {
      try {
        const installer = this.getWhisperInstaller();
        return await installer.detect();
      } catch (e) {
        logger.warn("Whisper detection failed", { error: e.message });
        return { found: false, command: null, version: null, error: e.message };
      }
    });

    // Install Whisper. Streams progress lines back via `webContents.send`
    // so the renderer can paint them as they arrive.
    ipcMain.handle("install-whisper", async (event) => {
      try {
        const installer = this.getWhisperInstaller();
        const sender = event.sender;
        const result = await installer.install({
          onProgress: (line) => {
            try { sender.send("install-progress", line); } catch (_) { /* ignore */ }
          },
        });
        return result;
      } catch (e) {
        logger.error("Whisper install failed", { error: e.message });
        return { ok: false, command: null, message: e.message, logs: "" };
      }
    });

    // Download Whisper model. Streams progress lines back via `webContents.send`
    ipcMain.handle("download-whisper-model", async (event, modelName) => {
      try {
        const installer = this.getWhisperInstaller();
        const sender = event.sender;
        const result = await installer.downloadModel(modelName || 'small', {
          onProgress: (line) => {
            try { sender.send("install-progress", line); } catch (_) { /* ignore */ }
          },
        });
        return result;
      } catch (e) {
        logger.error("Whisper model download failed", { error: e.message });
        return { ok: false, message: e.message, path: null };
      }
    });

    ipcMain.handle("save-settings", (event, settings) => {
      return this.saveSettings(settings);
    });

    // Auto-Type IPC handlers
    ipcMain.handle("type-clipboard", (event, options) => {
      return this.autoTypeClipboard(options);
    });

    ipcMain.handle("type-text", (event, text, options) => {
      return autoTypeService.typeText(text, options);
    });

    ipcMain.handle("stop-autotype", () => {
      autoTypeService.stop();
      return { success: true };
    });

    ipcMain.handle("get-autotype-status", () => {
      return { isTyping: autoTypeService.isTyping() };
    });

    // MCQ Mode IPC handlers
    ipcMain.handle("toggle-mcq-mode", () => {
      return this.toggleMcqMode();
    });

    ipcMain.handle("set-mcq-mode", (event, enabled) => {
      return this.setMcqMode(enabled);
    });

    ipcMain.handle("get-mcq-mode", () => {
      return { isMcqMode: this.isMcqMode };
    });

    // Auto-Hide Mode IPC handlers
    ipcMain.handle("toggle-autohide-mode", () => {
      return this.toggleAutoHideMode();
    });

    ipcMain.handle("set-autohide-mode", (event, enabled) => {
      return this.setAutoHideMode(enabled);
    });

    ipcMain.handle("get-autohide-mode", () => {
      return { isAutoHideMode: this.isAutoHideMode };
    });

    ipcMain.handle("check-autohide-now", () => {
      if (windowManager && typeof windowManager.checkAutoHideMousePosition === 'function') {
        windowManager.checkAutoHideMousePosition();
      }
      return { success: true };
    });

    // ── Rubic Mode IPC handlers ──
    ipcMain.handle("toggle-rubic-mode", () => {
      return this.toggleRubicMode();
    });

    ipcMain.handle("get-rubic-state", () => {
      return this.getRubicState();
    });

    ipcMain.handle("set-rubic-option", (event, { key, value }) => {
      return this.setRubicOption(key, value);
    });

    ipcMain.handle("trigger-rubic-mcq", () => {
      return this.triggerRubicMCQ();
    });

    ipcMain.handle("get-ai-status", () => {
      return {
        connected: llmService.isInitialized,
        model: llmService.model || null,
        requestCount: llmService.requestCount || 0,
        errorCount: llmService.errorCount || 0
      };
    });

    ipcMain.handle("update-app-icon", (event, iconKey) => {
      return this.updateAppIcon(iconKey);
    });

    ipcMain.handle("update-active-skill", (event, skill) => {
      this.activeSkill = skill;
      windowManager.broadcastToAllWindows("skill-changed", { skill });
      return { success: true };
    });

    ipcMain.handle("restart-app-for-stealth", () => {
      // Force restart the app to ensure stealth name changes take effect
      const { app } = require("electron");
      app.relaunch();
      app.exit();
    });

    ipcMain.handle("close-window", (event) => {
      const webContents = event.sender;
      windowManager.windows.forEach((win, type) => {
        if (win.webContents === webContents) {
          if (type === 'llmResponse') {
            windowManager.hideLLMResponse();
          } else {
            win.hide();
          }
          return true;
        }
      });
      return { success: true };
    });

    ipcMain.on("quit-app", () => {
      this.quitApp();
    });

    ipcMain.handle("quit-app", () => {
      this.quitApp();
      return { success: true };
    });

    // LLM window specific handlers
    ipcMain.handle("expand-llm-window", (event, contentMetrics) => {
      windowManager.expandLLMWindow(contentMetrics);
      return { success: true, contentMetrics };
    });

    ipcMain.handle("resize-llm-window-for-content", (event, contentMetrics) => {
      // Use the same expansion logic for now, can be enhanced later
      windowManager.expandLLMWindow(contentMetrics);
      return { success: true, contentMetrics };
    });

    // Handle close settings
    ipcMain.on("close-settings", () => {
      const settingsWindow = windowManager.getWindow("settings");
      if (settingsWindow) {
        settingsWindow.hide();
      }
    });

    // Handle save settings (synchronous)
    ipcMain.on("save-settings", (event, settings) => {
      this.saveSettings(settings);
    });

    // Handle update skill
    ipcMain.on("update-skill", (event, skill) => {
      this.activeSkill = skill;
      windowManager.broadcastToAllWindows("skill-updated", { skill });
    });
  }

  autoTypeClipboard(options = {}) {
    if (autoTypeService.isTyping()) {
      logger.info("Auto-type cancelled via shortcut/request");
      autoTypeService.stop();
      return { success: false, stopped: true };
    }
    logger.info("Auto-type triggered for clipboard content", {
      targetApp: this.lastExternalFrontApp || '(unknown)'
    });

    // ── Focus Hand-off (reliable) ────────────────────────────────────────────
    // win.blur() on a transparent floating macOS window does NOT reliably
    // transfer OS keyboard focus back to the user's target app. We must
    // explicitly activate the target app by name via NSRunningApplication.
    //
    // Strategy:
    //   1. _frontAppTracker polls every 500 ms and stores the last non-Electron
    //      frontmost app in this.lastExternalFrontApp.
    //   2. We activate that app via osascript right now.
    //   3. Give it 350 ms to complete the focus transition.
    //   4. Python starts typing with start_delay=0.1 (minimal extra pause).
    //
    // Fallback: if tracker hasn't seen an external app yet, blur all windows
    // and use a 600 ms start_delay as before.
    if (process.platform === 'darwin' && this.lastExternalFrontApp) {
      const targetApp = this.lastExternalFrontApp;
      const { exec } = require('child_process');
      return new Promise((resolve) => {
        exec(
          `osascript -e 'tell application "${targetApp.replace(/"/g, '\\"')}" to activate'`,
          (err) => {
            if (err) {
              logger.warn('Could not activate target app via osascript', {
                app: targetApp, error: err.message
              });
            } else {
              logger.info('Activated target app for typing', { app: targetApp });
            }
            // 350 ms is enough for NSRunningApplication to complete activation
            setTimeout(() => {
              resolve(autoTypeService.typeClipboard({ startDelay: 0.1, ...options }));
            }, 350);
          }
        );
      });
    }

    // Fallback: blur all windows and use a long start_delay
    try {
      const allWins = BrowserWindow.getAllWindows();
      for (const win of allWins) {
        if (!win.isDestroyed()) win.blur();
      }
    } catch (e) {
      logger.warn('Could not blur windows before auto-type', { error: e.message });
    }
    return autoTypeService.typeClipboard({ startDelay: 0.6, ...options });
  }

  toggleMcqMode() {
    this.isMcqMode = !this.isMcqMode;
    llmService.setMcqMode(this.isMcqMode);
    logger.info("MCQ Mode toggled", { isMcqMode: this.isMcqMode });
    windowManager.broadcastToAllWindows("mcq-mode-changed", { isMcqMode: this.isMcqMode });
    return { success: true, isMcqMode: this.isMcqMode };
  }

  setMcqMode(enabled) {
    this.isMcqMode = Boolean(enabled);
    llmService.setMcqMode(this.isMcqMode);
    logger.info("MCQ Mode set", { isMcqMode: this.isMcqMode });
    windowManager.broadcastToAllWindows("mcq-mode-changed", { isMcqMode: this.isMcqMode });
    return { success: true, isMcqMode: this.isMcqMode };
  }

  toggleAutoHideMode() {
    this.isAutoHideMode = !this.isAutoHideMode;
    windowManager.setAutoHideMode(this.isAutoHideMode);
    logger.info("Auto-Hide Mode toggled", { isAutoHideMode: this.isAutoHideMode });
    windowManager.broadcastToAllWindows("autohide-mode-changed", { isAutoHideMode: this.isAutoHideMode });
    return { success: true, isAutoHideMode: this.isAutoHideMode };
  }

  setAutoHideMode(enabled) {
    this.isAutoHideMode = Boolean(enabled);
    windowManager.setAutoHideMode(this.isAutoHideMode);
    logger.info("Auto-Hide Mode set", { isAutoHideMode: this.isAutoHideMode });
    windowManager.broadcastToAllWindows("autohide-mode-changed", { isAutoHideMode: this.isAutoHideMode });
    return { success: true, isAutoHideMode: this.isAutoHideMode };
  }

  // ── Rubic Mode Methods ──

  toggleRubicMode() {
    this.rubicMode = !this.rubicMode;
    // When Rubic mode turns on, auto-enable MCQ mode
    if (this.rubicMode && !this.isMcqMode) {
      this.setMcqMode(true);
    }
    logger.info("Rubic Mode toggled", { rubicMode: this.rubicMode });
    windowManager.broadcastToAllWindows("rubic-mode-changed", this.getRubicState());
    return { success: true, ...this.getRubicState() };
  }

  getRubicState() {
    return {
      rubicMode: this.rubicMode,
      enabled: this.rubicMode,
      singleSelect: this.rubicSingleSelect,
      capsLockLED: this.rubicCapsLockLED,
      menuBarSymbol: this.rubicMenuBarSymbol,
      hoverDwell: this.rubicHoverDwell,
      capsLockAvailable: capsLockLEDService.isAvailable(),
      lastAnswer: this.lastRubicAnswer || null,
    };
  }

  setRubicOption(key, value) {
    const boolVal = Boolean(value);
    switch (key) {
      case 'singleSelect':
        this.rubicSingleSelect = boolVal;
        break;
      case 'capsLockLED':
        this.rubicCapsLockLED = boolVal;
        break;
      case 'menuBarSymbol':
        this.rubicMenuBarSymbol = boolVal;
        if (boolVal) {
          const previewLetter = (this.lastRubicAnswer && this.lastRubicAnswer.split(',')[0]) || 'A';
          menuBarIndicator.showAnswer(previewLetter, 6000);
        } else {
          menuBarIndicator.hide();
        }
        break;
      case 'hoverDwell':
        this.rubicHoverDwell = boolVal;
        break;
      default:
        return { success: false, error: `Unknown Rubic option: ${key}` };
    }
    logger.info("Rubic option changed", { key, value: boolVal });
    windowManager.broadcastToAllWindows("rubic-mode-changed", this.getRubicState());
    return { success: true, ...this.getRubicState() };
  }

  /**
   * Core Rubic flow: Capture screen → AI MCQ detection → deliver answer.
   * While processing, Rubic button blinks/glows yellow.
   * Once answered, Rubic automatically turns OFF and the last answer remains stored and visible.
   */
  async triggerRubicMCQ() {
    if (!this.isReady) {
      logger.warn("Rubic MCQ triggered before application ready");
      windowManager.broadcastToAllWindows("rubic-status", { state: "idle" });
      return { success: false, error: 'App not ready' };
    }

    if (this._rubicMCQInProgress) {
      logger.info("Rubic MCQ trigger already in progress, ignoring duplicate trigger");
      return { inProgress: true };
    }
    this._rubicMCQInProgress = true;

    const startTime = Date.now();
    logger.info("Rubic MCQ triggered");

    // 0. Set processing state -> button glows and blinks yellow
    this.rubicMode = true;
    windowManager.broadcastToAllWindows("rubic-mode-changed", this.getRubicState());
    windowManager.broadcastToAllWindows("rubic-status", { state: "processing" });

    try {
      // 1. Capture screen
      const capture = await captureService.captureAndProcess();
      if (!capture.imageBuffer || !capture.imageBuffer.length) {
        this.rubicMode = false;
        windowManager.broadcastToAllWindows("rubic-mode-changed", this.getRubicState());
        windowManager.broadcastToAllWindows("rubic-status", { state: "idle" });
        return { success: false, error: 'Failed to capture screenshot' };
      }

      // 2. Build the MCQ-specific prompt with robust filtering of headers, rules, and titles
      const selectMode = this.rubicSingleSelect ? 'SINGLE' : 'MULTI';
      const rubicPrompt = [
        'You are an expert assessment solver and MCQ answer extraction engine.',
        'Carefully examine the screen image to locate and solve the active test question.',
        '',
        'CRITICAL FILTERING & EXTRACTION RULES:',
        '1. IGNORE all extraneous surrounding text: test title, exam rules/instructions, headers, navigation bars, timers, question number palette (1,2,3...), candidate info, watermarks, and footer action buttons (e.g. Previous, Next, Clear, Submit).',
        '2. LOCATE the ACTUAL question body text, including any associated code snippet, scenario, passage, equation, or diagram.',
        '3. IDENTIFY all selectable choice options (typically marked with radio buttons, checkboxes, letters A/B/C/D/E/F/G, or bulleted/stacked choice items).',
        '4. If options are explicitly labeled (A, B, C, D, E, F...), use those labels. If options are NOT labeled, map them in strict reading order (top-to-bottom, left-to-right) as:',
        '   1st option = A',
        '   2nd option = B',
        '   3rd option = C',
        '   4th option = D',
        '   5th option = E',
        '   6th option = F',
        '   7th option = G',
        '   (and so on).',
        '5. ACCURATELY SOLVE the question based on the options presented.',
        '',
        `SELECT MODE: ${selectMode}`,
        selectMode === 'SINGLE'
          ? 'Return EXACTLY ONE correct answer letter.'
          : 'Return ALL correct answer letters, comma-separated (e.g. "A,C" or "B,D").',
        '',
        'RESPONSE FORMAT: Output ONLY the uppercase letter(s), nothing else.',
        'Examples: "A" or "B" or "C" or "D" or "E" or "A,C".',
        'Do NOT write any explanations, reasoning, punctuation, quotes, or preamble. Just the letter(s).',
      ].join('\n');

      // 3. Send to AI with 10s strict timeout
      const requestTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Rubic request timed out after 10s')), 10000)
      );
      const result = await Promise.race([
        llmService.processImageDirect(
          capture.imageBuffer,
          capture.mimeType || 'image/png',
          rubicPrompt
        ),
        requestTimeout
      ]);

      // 4. Parse the answer — extract clean option letter(s)
      const rawText = (result.response || '').trim();
      let answer = '';

      const cleanCandidate = rawText.toUpperCase().replace(/[^A-Z,]/g, '');
      if (/^[A-Z](,[A-Z])*$/.test(cleanCandidate) && cleanCandidate.length <= 10) {
        answer = cleanCandidate;
      } else {
        const match = rawText.match(/(?:answer|option|\*\*|\()?([A-Z](?:\s*,\s*[A-Z])*)\b/i);
        if (match) {
          answer = match[1].replace(/\s+/g, '').toUpperCase();
        } else {
          const letterMatch = rawText.match(/\b([A-H])\b/i);
          if (letterMatch) {
            answer = letterMatch[1].toUpperCase();
          } else {
            answer = cleanCandidate.slice(0, 5);
          }
        }
      }

      if (!answer) {
        logger.warn("Rubic MCQ: AI returned no valid answer", { rawText });
        this.rubicMode = false;
        windowManager.broadcastToAllWindows("rubic-mode-changed", this.getRubicState());
        windowManager.broadcastToAllWindows("rubic-status", { state: "idle" });
        windowManager.broadcastToAllWindows("rubic-answer", {
          success: false,
          error: 'No answer detected',
          raw: rawText
        });
        return { success: false, error: 'No answer detected', raw: rawText };
      }

      logger.info("Rubic MCQ answer received", {
        answer,
        processingTime: Date.now() - startTime
      });

      // Store the last answer permanently for UI display
      this.lastRubicAnswer = answer;

      // 5. Deliver the answer via enabled channels
      if (this.rubicCapsLockLED) {
        capsLockLEDService.blinkAnswers(answer).catch(e =>
          logger.warn('Caps Lock LED delivery failed', { error: e.message })
        );
      }

      if (this.rubicMenuBarSymbol) {
        const firstLetter = answer.split(',')[0];
        if (answer.includes(',')) {
          menuBarIndicator.showAnswers(answer);
        } else {
          menuBarIndicator.showAnswer(firstLetter);
        }
      }

      // 6. Broadcast answer to renderer
      windowManager.broadcastToAllWindows("rubic-answer", {
        success: true,
        answer,
        lastAnswer: this.lastRubicAnswer,
        singleSelect: this.rubicSingleSelect,
        processingTime: Date.now() - startTime
      });

      // 7. Auto-turn off Rubic mode after answering and reset processing state
      this.rubicMode = false;
      windowManager.broadcastToAllWindows("rubic-mode-changed", this.getRubicState());
      windowManager.broadcastToAllWindows("rubic-status", { state: "idle" });
      logger.info("Rubic mode auto-turned off after answer delivery", { answer });

      return { success: true, answer, processingTime: Date.now() - startTime };
    } catch (error) {
      logger.error(`Rubic MCQ failed: ${error.message || error}`, { stack: error.stack });
      this.rubicMode = false;
      windowManager.broadcastToAllWindows("rubic-mode-changed", this.getRubicState());
      windowManager.broadcastToAllWindows("rubic-status", { state: "idle" });
      windowManager.broadcastToAllWindows("rubic-answer", {
        success: false,
        error: error.message
      });
      return { success: false, error: error.message };
    } finally {
      this._rubicMCQInProgress = false;
    }
  }

  toggleSpeechRecognition() {
    const isAvailable = typeof speechService.isAvailable === 'function' ? speechService.isAvailable() : !!speechService.getStatus?.().isInitialized;
    if (!isAvailable) {
      logger.warn("Speech recognition unavailable; toggle ignored");
      try {
        windowManager.broadcastToAllWindows("speech-status", { status: 'Speech recognition unavailable', available: false });
        windowManager.broadcastToAllWindows("speech-availability", { available: false });
      } catch (e) {}
      return;
    }
    const currentStatus = speechService.getStatus();
    if (currentStatus.isRecording) {
      try {
        speechService.stopRecording();
        logger.info("Speech recognition stopped via global shortcut; keeping windows visible for response");
      } catch (error) {
        logger.error("Error stopping speech recognition:", error);
      }
    } else {
      try {
        speechService.startRecording();
        if (this.getVoiceResponseTarget() === 'chat') {
          windowManager.showChatWindow();
        } else {
          windowManager.hideChatWindow();
          windowManager.showLLMReady();
        }
        if (typeof llmService.warmup === 'function') {
          llmService.warmup();
        }
        logger.info("Speech recognition started via global shortcut");
      } catch (error) {
        logger.error("Error starting speech recognition:", error);
      }
    }
  }

  clearSessionMemory() {
    try {
      sessionManager.clear();
      this._hasActiveAnswer = false;
      windowManager.broadcastToAllWindows("session-cleared");
      logger.info("Session memory cleared via global shortcut");
    } catch (error) {
      logger.error("Error clearing session memory:", error);
    }
  }

  handleUpArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (isInteractive) {
      // Interactive mode: Navigate to previous skill
      this.navigateSkill(-1);
    } else {
      // Non-interactive mode: Move window up
      windowManager.moveBoundWindows(0, -20);
    }
  }

  handleDownArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (isInteractive) {
      // Interactive mode: Navigate to next skill
      this.navigateSkill(1);
    } else {
      // Non-interactive mode: Move window down
      windowManager.moveBoundWindows(0, 20);
    }
  }

  handleLeftArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (!isInteractive) {
      // Non-interactive mode: Move window left
      windowManager.moveBoundWindows(-20, 0);
    }
    // Interactive mode: Left arrow does nothing
  }

  handleRightArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (!isInteractive) {
      // Non-interactive mode: Move window right
      windowManager.moveBoundWindows(20, 0);
    }
    // Interactive mode: Right arrow does nothing
  }

  backtrackAnswer(delta) {
    const llmWindow = windowManager.getWindow('llmResponse');
    if (llmWindow && !llmWindow.isDestroyed()) {
      llmWindow.webContents.send('backtrack-answer', { delta });
      logger.debug('Sent backtrack-answer event to llmResponse', { delta });
    }
  }

  navigateSkill(direction) {
    const availableSkills = [
      "dsa",
      "interview",
    ];

    const currentIndex = availableSkills.indexOf(this.activeSkill);
    if (currentIndex === -1) {
      logger.warn("Current skill not found in available skills", {
        currentSkill: this.activeSkill,
        availableSkills,
      });
      return;
    }

    // Calculate new index with wrapping
    let newIndex = currentIndex + direction;
    if (newIndex >= availableSkills.length) {
      newIndex = 0; // Wrap to beginning
    } else if (newIndex < 0) {
      newIndex = availableSkills.length - 1; // Wrap to end
    }

    const newSkill = availableSkills[newIndex];
    this.activeSkill = newSkill;

    // Update session manager with the new skill
    sessionManager.setActiveSkill(newSkill);

    logger.info("Skill navigated via global shortcut", {
      from: availableSkills[currentIndex],
      to: newSkill,
      direction: direction > 0 ? "down" : "up",
    });

    // Broadcast the skill change to all windows
    windowManager.broadcastToAllWindows("skill-updated", { skill: newSkill });
  }

  async triggerScreenshotOCR() {
    if (!this.isReady) {
      logger.warn("Screenshot requested before application ready");
      return;
    }

    const startTime = Date.now();

    try {
      windowManager.showLLMLoading();

  const capture = await captureService.captureAndProcess();

      if (!capture.imageBuffer || !capture.imageBuffer.length) {
        windowManager.hideLLMResponse();
        this.broadcastOCRError("Failed to capture screenshot image");
        return;
      }

      // Use image directly with LLM and active skill; do not send chat messages here
      const sessionHistory = sessionManager.getOptimizedHistory();

      const imageSkill = (this.activeSkill === 'interview' || !this.activeSkill) ? 'dsa' : this.activeSkill;
      const codingLanguage = this.codingLanguage || 'cpp';

      this._responseSeq = (this._responseSeq || 0) + 1;
      const messageId = `img-${Date.now()}-${this._responseSeq}`;
      windowManager.broadcastToAllWindows("transcription-llm-response-start", {
        messageId,
        skill: imageSkill
      });

      const llmResult = await llmService.processImageWithSkillStream(
        capture.imageBuffer,
        capture.mimeType || 'image/png',
        imageSkill,
        sessionHistory.recent,
        codingLanguage,
        (delta) => {
          windowManager.broadcastToAllWindows("transcription-llm-response-chunk", {
            messageId,
            delta
          });
        }
      );
      llmResult.metadata = { ...llmResult.metadata, messageId };

      sessionManager.addModelResponse(llmResult.response, {
        skill: imageSkill,
        processingTime: llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata.usedFallback,
        isImageAnalysis: true
      });

      this.broadcastTranscriptionLLMResponse(llmResult);

      windowManager.showLLMResponse(llmResult.response, {
        skill: imageSkill,
        processingTime: llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata.usedFallback,
        isImageAnalysis: true
      });

      // Extract generated code blocks for the snapshot circular copy button & smart typer
      try {
        const codeBlockRegex = /```(?:[a-zA-Z0-9_\-\.\+#]*)(?:[^\n\r]*)\r?\n([\s\S]*?)```/g;
        const extractedCodes = [];
        let codeMatch;
        while ((codeMatch = codeBlockRegex.exec(llmResult.response)) !== null) {
          if (codeMatch[1] && codeMatch[1].trim()) {
            extractedCodes.push(codeMatch[1].trim());
          }
        }
        let combinedCode = extractedCodes.join('\n\n');
        if (!combinedCode && llmResult.response && typeof llmResult.response === 'string') {
          combinedCode = llmResult.response.trim();
        }
        if (combinedCode) {
          autoTypeService.setLastCode(combinedCode);
          windowManager.broadcastToAllWindows("snapshot-code-available", {
            hasCode: true,
            code: combinedCode
          });
        } else {
          windowManager.broadcastToAllWindows("snapshot-code-available", {
            hasCode: false,
            code: ""
          });
        }
      } catch (extractErr) {
        logger.warn("Failed to extract code blocks from snapshot response", { error: extractErr.message });
      }
    } catch (error) {
      logger.error("Screenshot OCR process failed", {
        error: error.message,
        duration: Date.now() - startTime,
      });

      windowManager.hideLLMResponse();
      this.broadcastOCRError(error.message);
      
      sessionManager.addConversationEvent({
        role: 'system',
        content: `Screenshot OCR failed: ${error.message}`,
        action: 'ocr_error',
        metadata: {
          error: error.message
        }
      });
    }
  }

  async processWithLLM(text, sessionHistory, source = 'overlay') {
    try {
      if (!sessionHistory) {
        sessionHistory = sessionManager.getOptimizedHistory();
      }
      // Add user input to session memory
      sessionManager.addUserInput(text, 'llm_input');

      // Check if current query is interview/conceptual or requires code
      const isInterview = this.activeSkill === 'interview' || (typeof llmService.isInterviewOrConceptualQuery === 'function' && llmService.isInterviewOrConceptualQuery(text, this.activeSkill));
      const skillsRequiringProgrammingLanguage = ['dsa'];
      const needsProgrammingLanguage = !isInterview && skillsRequiringProgrammingLanguage.includes(this.activeSkill);

      this._responseSeq = (this._responseSeq || 0) + 1;
      const messageId = `chat-${Date.now()}-${this._responseSeq}`;

      if (source === 'chat') {
        this.sendToChatWindow("transcription-llm-response-start", {
          messageId,
          skill: this.activeSkill
        });
      } else {
        windowManager.broadcastToAllWindows("transcription-llm-response-start", {
          messageId,
          skill: this.activeSkill
        });
        windowManager.showLLMLoading();
      }

      const llmResult = await llmService.processTextWithSkillStream(
        text,
        this.activeSkill,
        sessionHistory.recent,
        needsProgrammingLanguage ? this.codingLanguage : null,
        (delta) => {
          if (source === 'chat') {
            this.sendToChatWindow("transcription-llm-response-chunk", {
              messageId,
              delta
            });
          } else {
            windowManager.broadcastToAllWindows("transcription-llm-response-chunk", {
              messageId,
              delta
            });
          }
        }
      );
      llmResult.metadata = { ...llmResult.metadata, messageId };

      logger.info("LLM processing completed, showing response", {
        responseLength: llmResult.response.length,
        skill: this.activeSkill,
        programmingLanguage: needsProgrammingLanguage ? this.codingLanguage : 'not applicable',
        processingTime: llmResult.metadata.processingTime,
        responsePreview: llmResult.response.substring(0, 200) + "...",
      });

      // Add LLM response to session memory
      sessionManager.addModelResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata.usedFallback,
      });

      if (source === 'chat') {
        this.sendToChatWindow("transcription-llm-response", {
          response: llmResult.response,
          metadata: llmResult.metadata,
          messageId,
          skill: this.activeSkill,
          isTranscriptionResponse: false
        });
      } else {
        this.broadcastTranscriptionLLMResponse(llmResult);
        windowManager.showLLMResponse(llmResult.response, {
          skill: this.activeSkill,
          processingTime: llmResult.metadata.processingTime,
          usedFallback: llmResult.metadata.usedFallback,
        });
      }
    } catch (error) {
      logger.error("LLM processing failed", {
        error: error.message,
        skill: this.activeSkill,
      });

      windowManager.hideLLMResponse();
      sessionManager.addConversationEvent({
        role: 'system',
        content: `LLM processing failed: ${error.message}`,
        action: 'llm_error',
        metadata: {
          error: error.message,
          skill: this.activeSkill
        }
      });

      this.broadcastLLMError(error.message);
    }
  }

  /**
   * Filter common Whisper hallucination artifacts from microphone silence/noise.
   */
  _isWhisperHallucination(text) {
    if (!text || typeof text !== 'string') return true;
    const trimmed = text.trim();
    if (trimmed.length <= 1) return true;
    const lower = trimmed.toLowerCase();
    const hallucinations = [
      'thank you for watching',
      'thanks for watching',
      'subtitles by',
      'amara.org',
      'subscribed',
      'please subscribe',
      'thank you very much',
      'bye bye',
      'you'
    ];
    if (hallucinations.some(h => lower === h || lower === `${h}.`)) return true;
    return false;
  }

  /**
   * Identify simple interview greetings / pleasantries to respond instantly without lag.
   */
  _isPureGreeting(text) {
    if (!text || typeof text !== 'string') return false;
    const clean = text.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
    if (!clean || clean.length > 50) return false;
    
    const greetingRegex = /^(hi|hello|hey|hey there|hi there|good morning|good afternoon|good evening)?\s*(how are you|how are you doing|how are you doing today|hows it going|can you hear me|am i audible|can you see me|are you ready|shall we start|lets start)?$/i;
    
    if (!greetingRegex.test(clean)) return false;
    
    const singleWords = clean.split(' ');
    const allowedWords = new Set([
      'hi', 'hello', 'hey', 'there', 'good', 'morning', 'afternoon', 'evening',
      'how', 'are', 'you', 'doing', 'today', 'hows', 'it', 'going',
      'can', 'hear', 'me', 'am', 'i', 'audible', 'see', 'ready', 'shall', 'we', 'start', 'lets'
    ]);
    return singleWords.every(w => allowedWords.has(w));
  }

  /**
   * Identify recruiter transitional acknowledgments that precede actual questions.
   * If a recruiter simply says "Great, thank you." or "That makes sense.", we should
   * NOT dispatch prematurely—we give a longer debounce window for the full question.
   */
  _isRecruiterPreambleOnly(text) {
    if (!text || typeof text !== 'string') return false;
    const t = text.trim().toLowerCase().replace(/[\.,!?;:\-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    
    const preambles = new Set([
      'okay', 'ok', 'great', 'awesome', 'good', 'perfect', 'got it', 'makes sense',
      'that makes sense', 'thank you', 'thanks', 'cool', 'nice', 'moving forward',
      'moving on', 'next question', 'alright', 'right', 'all right', 'sure',
      'fair enough', 'understood', 'sounds good', 'very good', 'thank you for that',
      'thanks for explaining', 'thanks for explaining that', 'great answer', 'that was great',
      'yes', 'yeah', 'yep', 'exactly', 'correct', 'absolutely', 'uh', 'um', 'hm', 'hmm'
    ]);
    return preambles.has(t);
  }

  /**
   * Detect unimportant audio connectivity remarks, repetition requests, and conversational fillers.
   * E.g. "sorry, didn't hear. Can you speak again", "can you hear me", "am I audible", "you're on mute".
   * These must NEVER overwrite the previous response or code on the response window.
   */
  _isNonQuestionOrAudioFiller(text) {
    if (!text || typeof text !== 'string') return false;
    const clean = text.trim();
    if (clean.length === 0) return false;

    // Normalization: strip apostrophes first (didn't -> didnt), then replace punctuation with space
    const lower = clean.toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[.,!?;:"\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!lower) return false;

    // RULE 1: Never filter if technical, algorithmic, system design, or coding keywords are present
    const technicalKeywords = [
      'algorithm', 'complexity', 'runtime', 'big o', 'data structure', 'array', 'string',
      'hashmap', 'hash map', 'hash table', 'map', 'set', 'tree', 'binary tree', 'bst', 'trie',
      'heap', 'priority queue', 'graph', 'dfs', 'bfs', 'dijkstra', 'dynamic programming',
      'recursion', 'backtrack', 'pointer', 'sliding window', 'binary search', 'stack', 'queue',
      'linked list', 'sql', 'database', 'index', 'transaction', 'acid', 'nosql', 'redis',
      'kafka', 'system design', 'load balancer', 'latency', 'throughput', 'api', 'rest',
      'graphql', 'docker', 'kubernetes', 'concurrency', 'thread', 'async', 'promise',
      'deadlock', 'mutex', 'python', 'javascript', 'typescript', 'java', 'golang', 'rust',
      'c++', 'inheritance', 'polymorphism', 'solid', 'design pattern', 'singleton', 'factory',
      'react', 'node', 'component', 'hook', 'redux', 'state', 'props', 'function', 'variable',
      'test', 'leetcode', 'palindrome', 'anagram', 'fibonacci', 'sort', 'quicksort', 'mergesort',
      'architecture', 'cache', 'caching', 'microservice', 'distributed', 'scale', 'scaling',
      'explain', 'difference between', 'how does', 'why do we', 'implement', 'write a function',
      'background', 'project', 'experience', 'worked on', 'tell me about'
    ];

    for (const kw of technicalKeywords) {
      if (lower.includes(kw)) {
        return false;
      }
    }

    // RULE 2: Standard Audio Quality / Connection / Hearing repetition phrases
    const audioFillerPatterns = [
      // Hearing issues / didn't hear / didn't catch / couldn't hear
      /\b(sorry\s+)?(i\s+)?(didnt|couldnt|did\s+not|could\s+not)\s+(hear|catch|get|understand)\b/,
      /\b(sorry\s+)?didnt\s+hear\b/,
      /\b(sorry\s+)?didnt\s+catch\b/,
      /\bcouldnt\s+hear\b/,
      
      // Repetition requests: speak again / say that again / repeat
      /\b(can|could|would)\s+(you\s+)?(please\s+)?(repeat|reiterate|speak\s+again|say\s+that\s+again|say\s+again|speak\s+louder|speak\s+up)\b/,
      /\b(please\s+)?(repeat|speak\s+again|say\s+that\s+again|say\s+again|speak\s+louder|speak\s+up)\b/,
      /\brepeat\s+(that|please|the\s+question)\b/,
      
      // Audibility / Mic checks
      /\b(can|could)\s+you\s+hear\s+me(\s+now)?\b/,
      /\b(am\s+i|can\s+you\s+hear)\s+(audible|clear)\b/,
      /\bam\s+i\s+audible\b/,
      /\b(you\s+are|youre)\s+(on\s+mute|muted|inaudible|breaking\s+up|cutting\s+out|lagging|frozen)\b/,
      /\b(voice|audio|sound|mic|microphone|connection)\s+(is\s+)?(breaking|cutting|lagging|bad|low|distorted|lost|glitching)\b/,
      /\b(cant|cannot)\s+hear\s+you\b/,
      /\byou\s+(cut\s+out|froze|dropped)\b/,
      /\bi\s+lost\s+you\b/,
      
      // Polite repetition prompts without technical substance
      /\b(pardon(\s+me)?|excuse\s+me|come\s+again)\b/,
      /\bwhat\s+did\s+you\s+say\b/,
      
      // Conversational pauses and small talk interruptions
      /\b(hold\s+on|wait\s+a\s+(sec|second|moment|min|minute)|give\s+me\s+a\s+(sec|second|moment|min)|just\s+a\s+(sec|second|moment)|one\s+second|one\s+sec)\b/,
      /\b(sorry\s+)?(go\s+ahead|you\s+go\s+first|please\s+go\s+ahead|after\s+you)\b/,
      /\b(never\s+mind|no\s+worries|its\s+okay|all\s+good|dont\s+worry)\b/,
      /\b(let\s+me\s+see|lets\s+see|let\s+me\s+check)\b/
    ];

    for (const pattern of audioFillerPatterns) {
      if (pattern.test(lower)) {
        return true;
      }
    }

    // RULE 3: Very short conversational non-questions (≤ 4 words) that don't have question words
    const words = lower.split(' ').filter(Boolean);
    if (words.length <= 4) {
      const nonQuestionPrefixes = [
        'sorry', 'yes', 'no', 'yeah', 'yep', 'nope', 'okay', 'ok', 'sure', 'alright',
        'hello', 'hi', 'hey', 'good', 'fine', 'thank', 'thanks'
      ];
      const startsWithConversational = nonQuestionPrefixes.includes(words[0]);
      const hasQuestionWord = /\b(what|how|why|when|where|who|which|explain|compare|define|implement)\b/.test(lower);
      const hasQuestionMark = clean.endsWith('?');

      if (startsWithConversational && !hasQuestionWord && !hasQuestionMark) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extract the actual actionable question from a composite recruiter statement.
   * E.g. "Great, thanks for explaining that. Moving forward, how do you handle deadlocks?"
   * -> "how do you handle deadlocks?"
   */
  _extractCoreQuestion(text) {
    if (!text || typeof text !== 'string') return text;
    let cleaned = text.trim();
    const prefixRegex = /^(\b(great|awesome|perfect|got it|makes sense|that makes sense|thank you|thanks|cool|nice|alright|all right|right|okay|ok|understood)\b[,\.\s!\-]*(thanks for explaining that|thank you for that|that was a great answer|that was great|good job|thanks for that)?[,\.\s!\-]*)+/i;
    cleaned = cleaned.replace(prefixRegex, '');
    const connectorRegex = /^(\b(moving forward|moving on|leading into my next question|next question|now|so|then|building on top of that|building on that)\b[,\.\s!\-]*)+/i;
    cleaned = cleaned.replace(connectorRegex, '');
    return cleaned.trim() || text.trim();
  }

  /**
   * Detect if an interview question is incomplete, a mumble, or a trailing sentence fragment.
   * If true, we avoid forcing an answer or calling the LLM; instead, we signal the candidate
   * to politely ask the interviewer to clarify or repeat.
   */
  _isIncompleteOrMumble(text) {
    if (!text || typeof text !== 'string') return true;
    const clean = text.trim();
    if (clean.length < 5) return true;

    // Pure conversational greetings (e.g. "hi", "good morning") are valid
    if (this._isPureGreeting(clean)) return false;

    // Check whisper hallucination loops
    if (this._isWhisperHallucination(clean)) return true;

    const words = clean.split(/\s+/).filter(Boolean);

    // Rule 1: Filler-only speech with no substantive concepts
    const fillerWords = new Set([
      'um', 'uh', 'er', 'ah', 'like', 'you', 'know', 'so', 'yeah', 'yes', 'no',
      'well', 'actually', 'basically', 'right', 'okay', 'ok', 'i', 'mean', 'just', 'huh'
    ]);
    const substantiveWords = words.filter(w => !fillerWords.has(w.toLowerCase().replace(/[^a-z0-9]/g, '')));
    if (substantiveWords.length < 2) {
      return true;
    }

    // Rule 2: If question has 5+ words and ends with question mark or punctuation, it is complete
    const hasPunctuation = /[?]$/.test(clean);
    if (words.length >= 5 && hasPunctuation) {
      return false;
    }

    // Rule 3: Dangling prefixes with no question body (e.g., "can you", "could you tell me", "what if we")
    const danglingPrefixOnly = /^(can you|could you|would you|should we|tell me|tell us|what if|what if we|how about|what about|so what|and then|and then what about|could you tell me)\s*[.,!?;:]*$/i;
    if (danglingPrefixOnly.test(clean)) {
      return true;
    }

    // Rule 4: Trailing dangling conjunctions where the sentence clearly got cut off mid-thought:
    const trailingDanglingConjunction = /\b(and|or|because|but|although|while|whereas|as well as|when you were|you were|they were|we were)\s*[.,!?;:]*$/i;
    if (trailingDanglingConjunction.test(clean)) {
      return true;
    }

    // Rule 5: If there's no question mark and the speech trails off on dangling connector on short fragment (<= 4 words)
    if (!hasPunctuation && words.length <= 4) {
      const trailingDangling = /\b(about|were|when|where|why|how|what|if|with|such as|into|onto|than|to|for|in|at|by|from|as|me|us|we)\s*$/i;
      if (trailingDangling.test(clean)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Display a high-impact, professional signal card when speech is incomplete or unclear.
   * Gives the candidate natural, confident phrases to ask for clarification instead of guessing.
   */
  _showClarificationSignal(cleanText, messageId) {
    const clarificationResponse = [
      `❓ Question: Question Incomplete or Unclear`,
      `🗣️ Start with: "Could you clarify what specific aspect you'd like me to focus on?"`,
      `⚡ Talking Points:`,
      `• The statement [trailed off] or was [incomplete] before a specific question was asked.`,
      `• Asking for clarification sounds [confident, attentive, and senior]—never guess on broken fragments.`,
      `• Alternative to say: "Could you repeat that last part? I want to make sure I cover the right angle."`,
      `🎯 Architecture & Problem Breakdown:`,
      `• The Problem: Answering an ambiguous, partial fragment risks answering the wrong topic entirely.`,
      `• Architecture & Fix: Politely bounce the question back to establish clear technical boundaries before diving into code.`,
      `• Trade-off / Gotcha: Never guess or start rambling when speech trails off; senior engineers clarify scope first.`,
      `• Project Metric: In system design and panel interviews, clarifying requirements upfront scores in the top 10% rubric.`
    ].join('\n');

    sessionManager.addModelResponse(clarificationResponse, {
      skill: this.activeSkill,
      processingTime: 1,
      usedFallback: false,
      isInstantResponse: true,
      isLocked: true,
      isTranscriptionResponse: true
    });

    this.sendTranscriptionLLMResponseToVoiceTargets({
      response: clarificationResponse,
      metadata: {
        skill: this.activeSkill,
        processingTime: 1,
        usedFallback: false,
        isLocked: true,
        isTranscriptionResponse: true,
        messageId
      }
    });

    if (this.shouldShowVoiceOverlay()) {
      windowManager.showLLMResponse(clarificationResponse, {
        skill: this.activeSkill,
        messageId,
        isInstantResponse: true,
        isLocked: true,
        isTranscriptionResponse: true
      });
    }
  }

  /**
   * Buffer a transcribed fragment and (re)arm the coalesce debounce. Fragments
   * are shown in the UI immediately so speech feels live, but the LLM is only
   * asked once the speaker has actually paused — this is what stops one spoken
   * line from producing two separate, slow answers.
   */
  handleTranscriptionFragment(text) {
    const fragment = (text || "").trim();
    if (!fragment) {
      return;
    }

    if (this._isWhisperHallucination(fragment)) {
      logger.debug("Filtered whisper hallucination fragment", { fragment });
      return;
    }

    // Route speech UI events immediately so hearing bar reflects live speech
    this.sendToVoiceResponseWindows("transcription-received", { text: fragment });

    this._utteranceBuffer = this._utteranceBuffer
      ? `${this._utteranceBuffer} ${fragment}`
      : fragment;

    if (this._utteranceTimer) {
      clearTimeout(this._utteranceTimer);
      this._utteranceTimer = null;
    }

    // Manual capture emits one complete transcript after the user presses stop,
    // so no debounce/coalescing delay is needed.
    if (speechService.isManualCaptureMode()) {
      this.dispatchCoalescedUtterance();
      return;
    }

    // In interview mode or system audio mode, provide zero-click, ultra-low latency response
    const isInterviewQuestion = (this.activeSkill === 'interview' || this.audioSourceMode === 'system');
    const isQuestionMark = /\?$/.test(fragment.trim());
    const isOtherPunctuation = /[!\.]$/.test(fragment.trim());
    const isPreambleOnly = isInterviewQuestion && this._isRecruiterPreambleOnly(this._utteranceBuffer);

    // Conversational debounce:
    // - If question ends with '?', debounce promptly at 200ms
    // - If ending in '.' or '!', wait 250ms
    // - If mid-sentence or without punctuation, wait 350ms so speech coalesces into one complete thought
    // - If pure preamble acknowledgment, wait 650ms for the actual question body
    const coalesceDelay = isInterviewQuestion 
      ? (isPreambleOnly ? 650 : (isQuestionMark ? 200 : (isOtherPunctuation ? 250 : 350))) 
      : this._utteranceCoalesceMs;

    this._utteranceTimer = setTimeout(() => {
      this._utteranceTimer = null;
      this.dispatchCoalescedUtterance();
    }, coalesceDelay);
  }

  /**
   * Send the coalesced utterance to the LLM.
   * Linear Motion & Latest-Wins Preemption Pipeline:
   * 1. If an existing LLM generation or analysis is currently in flight, immediately abort it.
   * 2. Immediately notify the Voice UI to transition from "Hearing..." to "Analyzing: [new question]".
   * 3. Evaluate fastest path first (instant greeting, curated KB, or Gemini 3.5 Flash Lite stream).
   */
  async dispatchCoalescedUtterance() {
    const combined = (this._utteranceBuffer || "").trim();
    if (!combined) {
      return;
    }

    // Suppress dispatch if the buffer is solely an isolated acknowledgment filler
    if (this._isRecruiterPreambleOnly(combined)) {
      logger.debug("Suppressing dispatch for pure recruiter acknowledgment", { text: combined });
      this._utteranceBuffer = "";
      return;
    }

    // Suppress dispatch if the utterance is an unimportant audio connection remark or repetition filler
    if (this._isNonQuestionOrAudioFiller(combined)) {
      logger.info("Suppressing dispatch for audio connection/repetition filler to preserve active answer", { text: combined });
      this._utteranceBuffer = "";
      return;
    }

    // Require substantive content (> 2 chars and at least two letters)
    if (combined.length < 3 || !/[a-zA-Z]{2,}/.test(combined)) {
      return;
    }

    // Extract core question from recruiter compound statement
    const targetQuestion = this._extractCoreQuestion(combined) || combined;
    if (this._isNonQuestionOrAudioFiller(targetQuestion)) {
      logger.info("Suppressing dispatch for core audio filler question to preserve active answer", { text: targetQuestion });
      this._utteranceBuffer = "";
      return;
    }
    this._utteranceBuffer = "";

    // 1. LATEST-WINS PREEMPTION:
    // If a previous LLM generation or analysis is currently running, ABORT IT IMMEDIATELY!
    if (this._activeLlmAbortController) {
      logger.info("Preempting in-flight LLM question with new incoming question", {
        newQuestionPreview: targetQuestion.substring(0, 80)
      });
      try {
        this._activeLlmAbortController.abort('Preempted by newer question');
      } catch (e) {
        logger.warn("Error aborting previous in-flight LLM controller", { error: e.message });
      }
      this._activeLlmAbortController = null;
    }

    // Create a new AbortController and track request ID for latest-wins validation
    const abortController = new AbortController();
    this._activeLlmAbortController = abortController;
    const currentRequestId = ++this._currentLlmRequestId;
    this._responseSeq = (this._responseSeq || 0) + 1;
    const messageId = `tr-${Date.now()}-${this._responseSeq}`;

    // 2. IMMEDIATE LINEAR UI NOTIFICATION:
    // Instantly transition the UI from "Hearing..." to "Analyzing: [new question]"
    this.sendToVoiceResponseWindows("transcription-llm-response-start", {
      messageId,
      skill: this.activeSkill,
      questionPreview: targetQuestion.substring(0, 80),
      isAnalyzing: true
    });
    if (this.shouldShowVoiceOverlay()) {
      windowManager.showLLMLoading(targetQuestion.substring(0, 80));
    }

    // 3. Record the full, coalesced question once in session history
    sessionManager.addUserInput(targetQuestion, 'speech');

    try {
      const finalQuestion = targetQuestion || combined;
      const sessionHistory = sessionManager.getOptimizedHistory();
      await this.processTranscriptionWithLLM(
        finalQuestion,
        sessionHistory,
        abortController.signal,
        currentRequestId,
        messageId
      );
    } catch (error) {
      if (abortController.signal.aborted || error.message === 'ABORTED' || error.name === 'AbortError') {
        logger.info("Transcription LLM was preempted by newer question, ignoring aborted response", {
          requestId: currentRequestId
        });
      } else {
        logger.error("Failed to process transcription with LLM", {
          error: error.message,
          text: combined.substring(0, 100)
        });
      }
    } finally {
      if (this._currentLlmRequestId === currentRequestId) {
        this._activeLlmAbortController = null;
      }
      // Check if any fresh fragments arrived while processing
      const leftover = (this._utteranceBuffer || "").trim();
      if (leftover && leftover.length >= 10 && /[a-zA-Z]{2,}/.test(leftover)) {
        this._utteranceTimer = setTimeout(() => {
          this._utteranceTimer = null;
          this.dispatchCoalescedUtterance();
        }, 300);
      }
    }
  }

  async processTranscriptionWithLLM(text, sessionHistory, abortSignal = null, requestId = 0, messageId = null, attempt = 1, maxAttempts = 3) {
    if (abortSignal && abortSignal.aborted) {
      return;
    }
    if (!sessionHistory) {
      sessionHistory = sessionManager.getOptimizedHistory();
    }

    if (!messageId) {
      this._responseSeq = (this._responseSeq || 0) + 1;
      messageId = `tr-${Date.now()}-${this._responseSeq}`;
    }

    try {
      // Validate input text
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        logger.warn("Skipping LLM processing for empty or invalid transcription", {
          textType: typeof text,
          textLength: text ? text.length : 0
        });
        return;
      }

      const rawTrimmed = (text || '').trim();
      const cleanText = this._extractCoreQuestion(rawTrimmed) || rawTrimmed;
      if (cleanText.length < 2) {
        logger.debug("Skipping LLM processing for very short transcription", {
          text: cleanText
        });
        return;
      }

      logger.info("Processing transcription with intelligent LLM response", {
        skill: this.activeSkill,
        requestId,
        messageId,
        attempt,
        maxAttempts,
        textLength: cleanText.length,
        textPreview: cleanText.substring(0, 100) + "..."
      });

      // Pure greeting fast-path: Instant 15ms response for greetings so recruiter can move on immediately
      if (this._isPureGreeting(cleanText)) {
        logger.info("Handling pure conversational greeting with ultra-fast instant response", { text: cleanText });
        const greetingResponse = `❓ Question: Warm interview greeting\n🗣️ Start with: "I'm doing well, thank you! It's great to connect with you today—I'm really excited for our conversation."\n⚡ Talking Points:\n• Express [genuine enthusiasm] about the role, team, and technology stack.\n• Confirm [clear audio] and that you are ready to dive into technical discussions.\n🎯 Key-Value Insights:\n• Candidate Mindset: Warm, articulate, humble, and engineering-ready.\n• Our Approach: Keep initial greeting brief and transition smoothly to technical questions.`;
        
        const fastResult = {
          response: greetingResponse,
          metadata: {
            skill: this.activeSkill,
            processingTime: 15,
            usedFallback: false,
            isTranscriptionResponse: true,
            messageId
          }
        };

        sessionManager.addModelResponse(greetingResponse, fastResult.metadata);
        this._hasActiveAnswer = true;
        this.sendTranscriptionLLMResponseToVoiceTargets(fastResult);
        return;
      }

      // Check if current speech transcription is interview/conceptual or requires code
      const isInterview = this.activeSkill === 'interview' || (typeof llmService.isInterviewOrConceptualQuery === 'function' && llmService.isInterviewOrConceptualQuery(cleanText, this.activeSkill));
      const skillsRequiringProgrammingLanguage = ['dsa'];
      const needsProgrammingLanguage = !isInterview && skillsRequiringProgrammingLanguage.includes(this.activeSkill);

      // 1. Instant local knowledge check
      const instant = localKnowledgeService.synthesizeInstantResponse(cleanText, this.activeSkill);

      // Path A: High-Confidence Curated Knowledge Match (<0.4ms)
      if (instant.isHighConfidenceMatch && instant.fullResponse) {
        logger.info("High-confidence answer locked in; skipping redundant LLM call to guarantee a single stable response", {
          topic: instant.questionTitle,
          requestId,
          messageId
        });

        const instantResult = {
          response: instant.fullResponse,
          metadata: {
            skill: this.activeSkill,
            processingTime: 1,
            usedFallback: false,
            isInstantResponse: true,
            isLocked: true,
            isTranscriptionResponse: true,
            messageId
          }
        };

        sessionManager.addModelResponse(instant.fullResponse, instantResult.metadata);
        this._hasActiveAnswer = true;
        this.sendTranscriptionLLMResponseToVoiceTargets(instantResult);
        return;
      }

      // Path B: Incomplete Speech, Mumbles, or Trailing Sentence Fragments
      if (this._isIncompleteOrMumble(cleanText)) {
        if (this._hasActiveAnswer) {
          logger.info("Incomplete or trailing speech detected, but active answer already displayed; preserving current answer without overwriting", {
            requestId,
            text: cleanText
          });
          this.sendToVoiceResponseWindows('restore-active-answer', {});
          return;
        }

        logger.info("Incomplete or trailing speech detected; showing clarification signal card instead of forcing answer", {
          requestId,
          text: cleanText
        });
        this._showClarificationSignal(cleanText, messageId);
        return;
      }

      // Path C: Novel / Bespoke Question (Requires Remote LLM)
      if (abortSignal && abortSignal.aborted) {
        return;
      }

      let hasReceivedChunk = false;
      let analyzeTimeout = null;
      const internalAbort = new AbortController();

      const combinedAbort = (reason) => {
        try { internalAbort.abort(reason); } catch (_) {}
      };

      if (abortSignal) {
        if (abortSignal.aborted) return;
        abortSignal.addEventListener('abort', () => combinedAbort(abortSignal.reason || 'Preempted'), { once: true });
      }

      // 5-second watchdog for "Analyzing..." phase:
      // If no chunks are received within 5 seconds, restart generation immediately with the same question!
      const WATCHDOG_MS = 5000;
      analyzeTimeout = setTimeout(() => {
        if (!hasReceivedChunk && !internalAbort.signal.aborted) {
          logger.warn(`Watchdog: question stuck on analyzing for >${WATCHDOG_MS}ms, restarting generation...`, {
            requestId,
            attempt,
            textPreview: cleanText.substring(0, 50)
          });
          combinedAbort('ANALYZE_TIMEOUT');
        }
      }, WATCHDOG_MS);

      try {
        const llmResult = await llmService.processTranscriptionWithIntelligentResponseStream(
          cleanText,
          this.activeSkill,
          (sessionHistory && sessionHistory.recent) || [],
          needsProgrammingLanguage ? this.codingLanguage : null,
          (delta) => {
            if (internalAbort.signal.aborted || (abortSignal && abortSignal.aborted)) return;
            hasReceivedChunk = true;
            if (analyzeTimeout) {
              clearTimeout(analyzeTimeout);
              analyzeTimeout = null;
            }
            this.sendToVoiceResponseWindows("transcription-llm-response-chunk", {
              messageId,
              delta
            });
          },
          internalAbort.signal
        );

        if (analyzeTimeout) {
          clearTimeout(analyzeTimeout);
          analyzeTimeout = null;
        }

        if (abortSignal && abortSignal.aborted) {
          logger.info("Dropping finished LLM result because request was aborted for newer question", { requestId });
          return;
        }

        llmResult.metadata = { ...llmResult.metadata, messageId };

        // Add LLM response to session memory
        sessionManager.addModelResponse(llmResult.response, {
          skill: this.activeSkill,
          processingTime: llmResult.metadata.processingTime,
          usedFallback: llmResult.metadata.usedFallback,
          isTranscriptionResponse: true
        });

        // Mark that an active answer is now displayed
        this._hasActiveAnswer = true;

        // Render the final answer cleanly ONCE
        this.sendTranscriptionLLMResponseToVoiceTargets(llmResult);

        logger.info("Transcription LLM response completed", {
          requestId,
          messageId,
          attempt,
          responseLength: llmResult.response.length,
          skill: this.activeSkill,
          programmingLanguage: needsProgrammingLanguage ? this.codingLanguage : 'not applicable',
          processingTime: llmResult.metadata.processingTime
        });

      } catch (streamError) {
        if (analyzeTimeout) {
          clearTimeout(analyzeTimeout);
          analyzeTimeout = null;
        }

        // If user preempted or newer question arrived, do not retry
        if (abortSignal && (abortSignal.aborted || streamError.message === 'ABORTED' || streamError.name === 'AbortError')) {
          if (streamError.message !== 'ANALYZE_TIMEOUT' && internalAbort.signal.reason !== 'ANALYZE_TIMEOUT') {
            logger.debug("Suppressed error/retry for aborted transcription LLM request", { requestId });
            return;
          }
        }

        // Auto-retry with same question if timed out or failed and attempts remain
        if (attempt < maxAttempts && (!abortSignal || !abortSignal.aborted)) {
          logger.warn(`Stuck on analyzing or stream error (attempt ${attempt}/${maxAttempts}). Instantly restarting with same question...`, {
            requestId,
            attempt,
            reason: streamError.message,
            text: cleanText.substring(0, 60)
          });

          // Notify voice windows that we are restarting/retrying
          this.sendToVoiceResponseWindows("transcription-llm-retry", {
            messageId,
            attempt: attempt + 1,
            maxAttempts,
            questionPreview: cleanText.substring(0, 80)
          });

          // Instantly restart with the same question
          return this.processTranscriptionWithLLM(
            text,
            sessionHistory,
            abortSignal,
            requestId,
            messageId,
            attempt + 1,
            maxAttempts
          );
        }

        // If all retries exhausted, throw to outer catch for fallback delivery
        throw streamError;
      }

    } catch (error) {
      if (abortSignal && (abortSignal.aborted || error.message === 'ABORTED' || error.name === 'AbortError')) {
        logger.debug("Suppressed error/fallback for aborted transcription LLM request", { requestId });
        return;
      }

      logger.error("Transcription LLM processing failed after retries", {
        requestId,
        error: error.message,
        errorStack: error.stack,
        skill: this.activeSkill,
        text: text ? text.substring(0, 100) : 'undefined'
      });

      // Try to provide a fallback response and deliver it to windows
      try {
        const fallbackResult = llmService.generateIntelligentFallbackResponse(text, this.activeSkill);
        if (messageId) {
          fallbackResult.metadata = { ...fallbackResult.metadata, messageId };
        }

        sessionManager.addModelResponse(fallbackResult.response, {
          skill: this.activeSkill,
          processingTime: fallbackResult.metadata.processingTime,
          usedFallback: true,
          isTranscriptionResponse: true,
          fallbackReason: error.message
        });

        // CRITICAL FIX: Deliver the fallback response to voice windows so the UI exits "Analyzing..."!
        this._hasActiveAnswer = true;
        this.sendTranscriptionLLMResponseToVoiceTargets(fallbackResult);

      } catch (fallbackError) {
        logger.error("Fallback response also failed", {
          fallbackError: fallbackError.message
        });
      }
    }
  }

  broadcastOCRSuccess(ocrResult) {
    windowManager.broadcastToAllWindows("ocr-completed", {
      text: ocrResult.text,
      metadata: ocrResult.metadata,
    });
  }

  broadcastOCRError(errorMessage) {
    windowManager.broadcastToAllWindows("ocr-error", {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastLLMSuccess(llmResult) {
    const broadcastData = {
      response: llmResult.response,
      metadata: llmResult.metadata,
      skill: this.activeSkill, // Add the current active skill to the top level
    };

    logger.info("Broadcasting LLM success to all windows", {
      responseLength: llmResult.response.length,
      skill: this.activeSkill,
      dataKeys: Object.keys(broadcastData),
      responsePreview: llmResult.response.substring(0, 100) + "...",
    });

    windowManager.broadcastToAllWindows("llm-response", broadcastData);
  }

  broadcastLLMError(errorMessage) {
    windowManager.broadcastToAllWindows("llm-error", {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastTranscriptionLLMResponse(llmResult) {
    const broadcastData = {
      response: llmResult.response,
      metadata: llmResult.metadata,
      messageId: llmResult.metadata && llmResult.metadata.messageId,
      skill: this.activeSkill,
      isTranscriptionResponse: true
    };

    logger.info("Broadcasting transcription LLM response to all windows", {
      responseLength: llmResult.response.length,
      skill: this.activeSkill,
      responsePreview: llmResult.response.substring(0, 100) + "..."
    });

    windowManager.broadcastToAllWindows("transcription-llm-response", broadcastData);
  }

  sendToChatWindow(channel, data) {
    const chatWindow = windowManager.getWindow("chat");
    if (!chatWindow || chatWindow.isDestroyed()) {
      logger.warn("Chat window unavailable for speech event", { channel });
      return;
    }
    chatWindow.webContents.send(channel, data);
  }

  getVoiceResponseTarget() {
    const configured = String(process.env.WHISPER_RESPONSE_TARGET || 'overlay').trim().toLowerCase();
    return ['chat', 'overlay', 'both'].includes(configured) ? configured : 'overlay';
  }

  shouldShowVoiceOverlay() {
    return ['overlay', 'both'].includes(this.getVoiceResponseTarget());
  }

  sendToVoiceResponseWindows(channel, data) {
    const target = this.getVoiceResponseTarget();
    if (target === 'chat') {
      this.sendToChatWindow(channel, data);
    } else if (target === 'overlay') {
      const responseWindow = windowManager.getWindow("llmResponse");
      if (responseWindow && !responseWindow.isDestroyed()) {
        responseWindow.webContents.send(channel, data);
      }
    } else if (target === 'both') {
      this.sendToChatWindow(channel, data);
      const responseWindow = windowManager.getWindow("llmResponse");
      if (responseWindow && !responseWindow.isDestroyed()) {
        responseWindow.webContents.send(channel, data);
      }
    }
  }

  sendTranscriptionLLMResponseToVoiceTargets(llmResult) {
    this._hasActiveAnswer = true;
    const messageId = (llmResult.metadata && llmResult.metadata.messageId) || null;
    const data = {
      response: llmResult.response,
      content: llmResult.response,
      metadata: llmResult.metadata,
      messageId,
      skill: this.activeSkill,
      isTranscriptionResponse: true
    };
    if (this.shouldShowVoiceOverlay()) {
      windowManager.showLLMResponse(llmResult.response, {
        skill: this.activeSkill,
        messageId,
        isInstantResponse: llmResult.metadata && llmResult.metadata.isInstantResponse,
        isLocked: llmResult.metadata && llmResult.metadata.isLocked,
        processingTime: llmResult.metadata && llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata && llmResult.metadata.usedFallback,
        isTranscriptionResponse: true
      });
    }
    this.sendToVoiceResponseWindows("transcription-llm-response", data);
  }

  onWindowAllClosed() {
    if (process.platform !== "darwin") {
      app.quit();
    }
  }

  onActivate() {
    if (!this.isReady && !this.starting) {
      this.onAppReady();
    } else if (this.isReady) {
      // When app is activated, ensure windows appear on current desktop
      const mainWindow = windowManager.getWindow("main");
      if (mainWindow && mainWindow.isVisible()) {
        windowManager.showOnCurrentDesktop(mainWindow);
      }

      // Also handle other visible windows
      windowManager.windows.forEach((window, type) => {
        if (window.isVisible()) {
          windowManager.showOnCurrentDesktop(window);
        }
      });

      logger.debug("App activated - ensured windows appear on current desktop");
    }
  }

  quitApp() {
    if (this._isQuitting) return;
    this._isQuitting = true;
    logger.info("Application quit initiated via Dock, shortcut, or signal");
    try {
      sessionManager.clear();
      this._utteranceBuffer = "";
      globalShortcut.unregisterAll();
      windowManager.destroyAllWindows();
      clipboardTrackerManager.stop();
      speechService.shutdown();
    } catch (err) {
      logger.warn("Cleanup error during quitApp", { error: err.message });
    }
    app.quit();
    setTimeout(() => {
      process.exit(0);
    }, 100);
  }

  onWillQuit() {
    this.quitApp();
  }

  getWhisperInstaller() {
    if (!this._whisperInstaller) {
      const WhisperInstaller = require("./src/core/whisper-installer");
      const { app } = require("electron");
      this._whisperInstaller = new WhisperInstaller({
        cwd: process.cwd(),
        dataDir: app.getPath("userData"),
        platform: process.platform,
      });
    }
    return this._whisperInstaller;
  }

  getSettings() {
    // Surface every value the settings UI can edit, reading the live source
    // of truth (process.env) so the UI shows exactly what the running app is
    // using. Empty strings are returned rather than skipped so the UI can
    // distinguish "unset" from "stale value from a previous load".
    return {
      codingLanguage: this.codingLanguage || "cpp",
      activeSkill: this.activeSkill || "interview",
      appIcon: this.appIcon || "settings",
      selectedIcon: this.appIcon || "settings",
      windowGap: windowManager.windowGap,

      speechProvider: speechService.provider || "whisper",
      azureKey: process.env.AZURE_SPEECH_KEY || "",
      azureRegion: process.env.AZURE_SPEECH_REGION || "",
      whisperCommand: process.env.WHISPER_COMMAND || "",
      whisperModel: process.env.WHISPER_MODEL || "small",
      whisperLanguage: process.env.WHISPER_LANGUAGE || "auto",
      whisperDevice: process.env.WHISPER_DEVICE || "auto",
      whisperCaptureMode: process.env.WHISPER_CAPTURE_MODE ||
        (process.env.WHISPER_MANUAL_CAPTURE === "true" ? "manual" : "vad"),
      whisperResponseTarget: process.env.WHISPER_RESPONSE_TARGET || "overlay",
      whisperSegmentMs: process.env.WHISPER_SEGMENT_MS || "4000",
      geminiKey: process.env.GEMINI_API_KEY || "",
      geminiKeySecondary: process.env.GEMINI_API_KEY_SECONDARY || "",

      azureConfigured: !!process.env.AZURE_SPEECH_KEY && !!process.env.AZURE_SPEECH_REGION,
      speechAvailable: this.speechAvailable,
      isMcqMode: this.isMcqMode,
      audioSourceMode: this.audioSourceMode || "system"
    };
  }

  saveSettings(settings) {
    try {
      // ── In-memory updates + window broadcasts ──
      if (settings.audioSourceMode !== undefined) {
        this.audioSourceMode = settings.audioSourceMode === "microphone" ? "microphone" : "system";
        if (typeof speechService.updateSettings === 'function') {
          speechService.updateSettings({ audioSourceMode: this.audioSourceMode });
        }
        windowManager.broadcastToAllWindows("audio-source-mode-changed", {
          mode: this.audioSourceMode,
        });
      }
      if (settings.isMcqMode !== undefined) {
        this.setMcqMode(settings.isMcqMode);
      }
      if (settings.codingLanguage) {
        this.codingLanguage = settings.codingLanguage;
        windowManager.broadcastToAllWindows("coding-language-changed", {
          language: settings.codingLanguage,
        });
      }
      if (settings.activeSkill) {
        this.activeSkill = settings.activeSkill;
        windowManager.broadcastToAllWindows("skill-updated", {
          skill: settings.activeSkill,
        });
      }
      if (settings.appIcon) {
        this.appIcon = settings.appIcon;
      }
      if (settings.selectedIcon) {
        this.appIcon = settings.selectedIcon;
        this.updateAppIcon(settings.selectedIcon);
      }
      if (settings.windowGap !== undefined) {
        const gap = Number(settings.windowGap);
        if (Number.isFinite(gap)) windowManager.setWindowGap(gap);
      }

      // ── Persist provider / API-key fields back to .env ──
      // The settings UI is now the source of truth for these values.
      // Writing to .env ensures they survive app restarts and are picked
      // up the next time the app boots.
      const envUpdates = {};
      if (settings.speechProvider === "azure" || settings.speechProvider === "whisper") {
        envUpdates.SPEECH_PROVIDER = settings.speechProvider;
      }
      if (settings.azureKey !== undefined) {
        envUpdates.AZURE_SPEECH_KEY = settings.azureKey;
      }
      if (settings.azureRegion !== undefined) {
        envUpdates.AZURE_SPEECH_REGION = settings.azureRegion;
      }
      if (settings.whisperCommand !== undefined) {
        envUpdates.WHISPER_COMMAND = settings.whisperCommand;
      }
      if (settings.whisperModel !== undefined) {
        envUpdates.WHISPER_MODEL = settings.whisperModel;
      }
      if (settings.whisperLanguage !== undefined) {
        envUpdates.WHISPER_LANGUAGE = settings.whisperLanguage;
      }
      if (["auto", "cpu", "cuda"].includes(settings.whisperDevice)) {
        envUpdates.WHISPER_DEVICE = settings.whisperDevice;
      }
      if (["manual", "vad"].includes(settings.whisperCaptureMode)) {
        envUpdates.WHISPER_CAPTURE_MODE = settings.whisperCaptureMode;
      }
      if (["chat", "overlay", "both"].includes(settings.whisperResponseTarget)) {
        envUpdates.WHISPER_RESPONSE_TARGET = settings.whisperResponseTarget;
      }
      if (settings.whisperSegmentMs !== undefined) {
        envUpdates.WHISPER_SEGMENT_MS = String(settings.whisperSegmentMs);
      }
      if (settings.geminiKey !== undefined) {
        envUpdates.GEMINI_API_KEY = settings.geminiKey;
      }
      if (settings.geminiKeySecondary !== undefined) {
        envUpdates.GEMINI_API_KEY_SECONDARY = settings.geminiKeySecondary;
      }

      // Capture the previous whisper command BEFORE persisting — persistEnvUpdates
      // mutates process.env in place, so comparing afterwards would always read
      // equal and skip the speech re-init below (the exact stale-mic-after-install
      // bug the re-init guards against).
      const prevWhisperCommand = process.env.WHISPER_COMMAND || '';

      const persistedKeys = this.persistEnvUpdates(envUpdates);

      // If either Gemini key was just saved, reinitialize the LLM service
      // so the new client picks up the key. Without this, the test-
      // connection button in the onboarding wizard fails with
      // "Service not initialized" because the client was first created
      // at app startup, before any key was set.
      if ((settings.geminiKey !== undefined && envUpdates.GEMINI_API_KEY !== undefined) ||
          (settings.geminiKeySecondary !== undefined && envUpdates.GEMINI_API_KEY_SECONDARY !== undefined)) {
        try {
          llmService.initializeClient();
          logger.info("LLM service reinitialized after Gemini key update");
        } catch (e) {
          logger.warn("Failed to reinitialize LLM service after Gemini key update", {
            error: e.message
          });
        }
      }

      // Reinitialize speech service when provider OR whisper command
      // changes. Without the second check, the install flow (which
      // writes a new whisperCommand after install but keeps the same
      // provider) would leave the speech service pointing at a stale
      // (or non-existent) binary, and the main overlay's mic button
      // would stay hidden / non-functional.
      const providerChanged = settings.speechProvider && speechService.provider !== settings.speechProvider;
      const whisperCommandChanged = settings.whisperCommand !== undefined &&
        prevWhisperCommand !== String(settings.whisperCommand || '');
      if (providerChanged || whisperCommandChanged) {
        try {
          speechService.initializeClient();
          this.speechAvailable = speechService.isAvailable
            ? speechService.isAvailable()
            : false;
          // Broadcast so any open window (settings, overlay, chat)
          // can react immediately — especially the main overlay's
          // mic button, which queries availability on load.
          const { BrowserWindow } = require("electron");
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send("speech-availability", { available: this.speechAvailable });
            }
          });
          logger.info('Speech service reinitialized after settings change', {
            providerChanged,
            whisperCommandChanged,
            speechAvailable: this.speechAvailable,
          });
        } catch (e) {
          logger.warn("Failed to reinitialize speech service after settings change", {
            error: e.message
          });
        }
      }

      logger.info("Settings saved successfully", {
        ...settings,
        persistedEnvKeys: persistedKeys
      });
      return { success: true, persistedEnvKeys: persistedKeys };
    } catch (error) {
      logger.error("Failed to save settings", { error: error.message });
      return { success: false, error: error.message };
    }
  }

  persistSettings(settings) {
    // You can extend this to save to a file or database
    // For now, we'll just keep them in memory
    logger.debug("Settings persisted", settings);
  }

  /**
   * Write key=value pairs to the project's .env file. Existing keys are
   * replaced in-place; new keys are appended. Comments and unrelated lines
   * are preserved. Uses an atomic write (temp file + rename) so a crash
   * mid-write cannot corrupt .env.
   *
   * @param {Object<string, string>} updates - keys to upsert
   * @returns {string[]} keys that were actually persisted
   */
  persistEnvUpdates(updates) {
    if (!updates || typeof updates !== "object") return [];
    const keys = Object.keys(updates);
    if (keys.length === 0) return [];

    const fs = require("fs");
    // Single source of truth — the same file dotenv loaded at startup and that
    // FirstRunManager reads/writes (userData in packaged builds, project .env
    // in dev). Writing to process.cwd() here would silently diverge.
    const envPath = ENV_PATH;

    let existing = "";
    try {
      existing = fs.readFileSync(envPath, "utf8");
    } catch (_) {
      // .env doesn't exist yet — we'll create one from scratch
      existing = "";
    }

    const existingLines = existing.length > 0 ? existing.split(/\r?\n/) : [];
    const updated = new Set();
    const outLines = [];

    for (const line of existingLines) {
      // Match "KEY=" (with optional whitespace) but skip comment lines
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
      if (m && Object.prototype.hasOwnProperty.call(updates, m[1])) {
        const key = m[1];
        outLines.push(`${key}=${formatEnvValue(updates[key])}`);
        updated.add(key);
      } else {
        outLines.push(line);
      }
    }

    // Append any keys that weren't already present
    for (const key of keys) {
      if (!updated.has(key)) {
        outLines.push(`${key}=${formatEnvValue(updates[key])}`);
        updated.add(key);
      }
    }

    // Update process.env so the running app picks up the new values
    // immediately (and so the settings UI reads the same source of truth).
    for (const key of keys) {
      process.env[key] = String(updates[key]);
    }

    const newContent = outLines.join("\n");
    try {
      const tmpPath = envPath + ".tmp";
      fs.writeFileSync(tmpPath, newContent, "utf8");
      fs.renameSync(tmpPath, envPath);
    } catch (e) {
      logger.error("Failed to persist .env updates", {
        error: e.message,
        keys
      });
      return [];
    }

    logger.info("Persisted .env updates", { keys: Array.from(updated) });
    return Array.from(updated);
  }

  updateAppIcon(iconKey) {
    try {
      const { app } = require("electron");
      const path = require("path");
      const fs = require("fs");

      // Icon mapping for available icons in assests/icons folder
      const iconPaths = {
        terminal: "assests/icons/terminal.png",
        activity: "assests/icons/activity.png",
        settings: "assests/icons/settings.png",
      };

      // App name mapping for stealth mode
      const appNames = {
        terminal: "Terminal ",
        activity: "Activity Monitor ",
        settings: "Settings",
      };

      const iconPath = iconPaths[iconKey];
      const appName = appNames[iconKey];

      if (!iconPath) {
        logger.error("Invalid icon key", { iconKey });
        return { success: false, error: "Invalid icon key" };
      }

      const fullIconPath = path.resolve(__dirname, iconPath);

      if (!fs.existsSync(fullIconPath)) {
        logger.error("Icon file not found", {
          iconKey,
          iconPath: fullIconPath,
        });
        return { success: false, error: "Icon file not found" };
      }

      // Set app icon for dock/taskbar
      if (process.platform === "darwin") {
        // macOS - update dock icon only if not default settings icon
        if (app.dock) {
          if (iconKey === "settings" || iconKey === "setting") {
            const icnsPath = path.join(process.resourcesPath, "app.icns");
            const sysIcns = "/System/Applications/System Settings.app/Contents/Resources/SystemSettings.icns";
            const targetIcns = fs.existsSync(icnsPath) ? icnsPath : (fs.existsSync(sysIcns) ? sysIcns : null);
            if (targetIcns) {
              try {
                const img = nativeImage.createFromPath(targetIcns);
                if (!img.isEmpty()) app.dock.setIcon(img);
              } catch (_) {}
            }
          } else {
            app.dock.setIcon(fullIconPath);
          }
        }
      } else {
        // Windows/Linux - update window icons
        windowManager.windows.forEach((window, type) => {
          if (window && !window.isDestroyed()) {
            window.setIcon(fullIconPath);
          }
        });
      }

      // Update app name for stealth mode
      this.updateAppName(appName, iconKey);

      logger.info("App icon and name updated successfully", {
        iconKey,
        appName,
        iconPath: fullIconPath,
        platform: process.platform,
        fileExists: fs.existsSync(fullIconPath),
      });

      this.appIcon = iconKey;
      return { success: true };
    } catch (error) {
      logger.error("Failed to update app icon", {
        error: error.message,
        stack: error.stack,
      });
      return { success: false, error: error.message };
    }
  }

  updateAppName(appName, iconKey) {
    try {
      const { app } = require("electron");

      // Force update process title for Activity Monitor stealth - CRITICAL
      process.title = appName;

      // Set app name in dock (macOS) - this affects the dock and Activity Monitor
      if (process.platform === "darwin") {
        // Multiple attempts to ensure the name sticks
        app.setName(appName);

        // Clear dock badge and reset
        if (app.dock) {
          app.dock.setBadge("");
          if (iconKey !== "settings" && iconKey !== "setting") {
            setTimeout(() => {
              try {
                app.dock.setIcon(
                  require("path").resolve(__dirname, `assests/icons/${iconKey}.png`)
                );
              } catch (_) {}
            }, 50);
          }
        }
      }

      // Set app user model ID for Windows taskbar grouping (Windows only)
      if (process.platform === "win32") {
        app.setAppUserModelId(`${appName.trim()}-${iconKey}`);
      }

      // Update all window titles to match the new app name
      const windows = windowManager.windows;
      windows.forEach((window, type) => {
        if (window && !window.isDestroyed()) {
          // Use stealth name for all windows
          const stealthTitle = appName.trim();
          window.setTitle(stealthTitle);
        }
      });

      // Multiple force refreshes with increasing delays
      const refreshTimes = [50, 100, 200, 500];
      refreshTimes.forEach((delay) => {
        setTimeout(() => {
          process.title = appName;
          if (process.platform === "darwin") {
            app.setName(appName);
            // Force update bundle display name
            if (app.getName() !== appName) {
              app.setName(appName);
            }
          }
        }, delay);
      });

      logger.info("App name updated for stealth mode", {
        appName,
        processTitle: process.title,
        appGetName: app.getName(),
        iconKey,
        platform: process.platform,
      });
    } catch (error) {
      logger.error("Failed to update app name", { error: error.message });
    }
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  const controller = new ApplicationController();
  app.on("second-instance", () => controller.handleSecondInstance());
}
