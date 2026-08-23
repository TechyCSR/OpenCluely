const { BrowserWindow, screen, desktopCapturer, shell } = require('electron');
const path = require('path');
const logger = require('../core/logger').createServiceLogger('WINDOW');
const config = require('../core/config');
const {
  computeInterviewBarBounds,
  computeInterviewCardBounds,
  computeInterviewCardSize,
  applyStreamingResize,
  resolveStreamingWidth,
  chooseInterviewCardHeight,
  MIN_HEIGHT
} = require('../ui/interview-hud');

class WindowManager {
  constructor() {
    this.windows = new Map();
    this.activeWindow = 'main';
    this.isInteractive = true; // default to interactive so windows are clickable/drag-able
    this.isVisible = false;
    this.currentDisplay = null;
    this.screenWatcher = null;
    this.desktopWatcher = null;
    this.lastActiveSpace = null;
    this.screenCaptureAvailabilityWatcher = null;
    this.isScreenBeingShared = false;
    this.wasVisibleBeforeSharing = false;
    this.screenCaptureStatus = {
      available: null,
      lastError: null,
      lastCheckedAt: null
    };
    this.isCheckingScreenCaptureStatus = false;
    this.isInitialized = false;
    this.isInitializing = false;
    this.isRecording = false;
    this.interviewModeActive = false;
    this.interviewAnswerDock = 'right';
    this._hudPersistPath = null;
    this._dockAnim = null;
    this.interviewCardMetrics = { hasCode: false, contentHeight: MIN_HEIGHT };
    this.interviewCardLock = null;
    this.interviewCardFrozen = false;
    this.INTERVIEW_CARD = { width: 560, height: MIN_HEIGHT };
    
    // Add debouncing to prevent excessive operations
    this.lastEnforceTime = 0;
    this.enforceDebounceMs = 1000; // Only enforce once per second
    this.focusLocked = false; // Prevent focus loops
    
    // Window binding properties
    this.bindWindows = true; // Enable window binding by default
    this.windowGap = 10; // Small gap between windows
    this.boundWindowsPosition = { x: 0, y: 0 }; // Track position of bound windows
    
    this.windowConfigs = {
      main: {
        width: 520,
        height: 35,
        useContentSize: true,
        file: 'index.html',
        title: 'OpenCluely'
      },
      chat: {
        width: 500,
        height: 700,
        file: 'chat.html',
        title: 'Chat'
      },
      llmResponse: {
        width: 840,
        height: 480,
        file: 'llm-response.html',
        title: 'AI Response',
        alwaysOnTop: true
      },
      settings: {
        width: 440,
        height: 560,
        file: 'settings.html',
        title: 'Settings',
        frame: false,
        titleBarStyle: 'hidden',
        transparent: true,
        skipTaskbar: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
        fullscreenable: false
      },
      interviewBar: {
        width: 920,
        height: 32,
        file: 'interview-bar.html',
        title: 'Interview Captions',
        alwaysOnTop: true
      },
      onboarding: {
        width: 560,
        height: 680,
        file: 'onboarding.html',
        title: 'Welcome to OpenCluely',
        frame: false,
        titleBarStyle: 'hidden',
        transparent: true,
        skipTaskbar: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: true,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
        fullscreenable: false
      }
    };

    this.init();
  }

  init() {
    // ... existing initialization code ...
  }

  async initializeWindows(options = {}) {
    const { showMainWindow = true } = options;
    if (this.isInitialized || this.isInitializing) {
      logger.warn('Windows already initialized or initializing');
      return;
    }

    this.isInitializing = true;
    logger.info('Initializing application windows', { showMainWindow });
    
    try {
      // Pass autoShow so the main window doesn't flash visible during
      // first-run onboarding before the user has configured API keys.
      await this.createMainWindow({ autoShow: showMainWindow });
      await this.createChatWindow();
      await this.createLLMResponseWindow();
      await this.createSettingsWindow();
      await this.createInterviewBarWindow();
      
      this.setupWindowEventHandlers();
      this.setupScreenTracking();
      this.setupScreenCaptureAvailabilityWatcher();

      // Make windows interactive by default so they are not click-through
      this.setInteractive(true);
      
      // Optionally show the main window (deferred during onboarding)
      if (showMainWindow) {
        await this.showMainWindow();
      }
      
      this.isInitialized = true;
      this.isInitializing = false;
      logger.info('All windows initialized successfully');
    } catch (error) {
      this.isInitializing = false;
      logger.error('Failed to initialize windows', { error: error.message });
      throw error;
    }
  }

  async showMainWindow() {
    const mainWindow = this.windows.get('main');
    if (!mainWindow) return;
    
    // Immediate always-on-top enforcement for main window
    if (process.platform === 'darwin') {
      try {
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 2);
      } catch (error) {
        mainWindow.setAlwaysOnTop(true, 'floating', 2);
      }
    } else {
      mainWindow.setAlwaysOnTop(true);
    }
    
    // Wait for app to fully initialize and detect current desktop
    await new Promise((resolve) => setTimeout(resolve, 100));
    this.showOnCurrentDesktop(mainWindow);
    
    // Additional enforcement after showing
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (!mainWindow.isDestroyed()) {
      if (process.platform === 'darwin') {
        try {
          mainWindow.setAlwaysOnTop(true, 'screen-saver', 2);
        } catch (error) {
          mainWindow.setAlwaysOnTop(true, 'floating', 2);
        }
      } else {
        mainWindow.setAlwaysOnTop(true);
      }
    }
    
    this.isVisible = true;
    logger.info('Main window displayed');
    // Notify renderer to refresh speech availability
    mainWindow.webContents.send('main-window-shown', {});
  }

  async createMainWindow(options = {}) {
    const { autoShow = true } = options;
    if (this.windows.has('main')) {
      return this.windows.get('main');
    }
    const window = await this.createWindow('main', false); // Don't show during creation
    this.windows.set('main', window);

    // Always-on-top must be set even when we're deferring the visual
    // show — it persists into the future showOnCurrentDesktop call.
    if (process.platform === 'darwin') {
      try {
        window.setAlwaysOnTop(true, 'screen-saver', 2);
      } catch (error) {
        window.setAlwaysOnTop(true, 'floating', 2);
      }
    } else {
      window.setAlwaysOnTop(true);
    }

    // Only auto-show when explicitly allowed (e.g. not during first-run
    // onboarding). The single entry point for showing the overlay is
    // `showMainWindow()` — callers control timing via the flag below.
    if (autoShow) {
      // Wait for app to fully initialize and detect current desktop
      setTimeout(() => {
        this.showOnCurrentDesktop(window);
        // Additional enforcement after showing
        setTimeout(() => {
          if (!window.isDestroyed()) {
            if (process.platform === 'darwin') {
              try {
                window.setAlwaysOnTop(true, 'screen-saver', 2);
              } catch (error) {
                window.setAlwaysOnTop(true, 'floating', 2);
              }
            } else {
              window.setAlwaysOnTop(true);
            }
          }
        }, 200);
      }, 100);
    }

    return window;
  }

  async createChatWindow() {
    if (this.windows.has('chat')) {
      return this.windows.get('chat');
    }
    const window = await this.createWindow('chat');
    this.windows.set('chat', window);
    window.hide();
    return window;
  }

  async createLLMResponseWindow() {
    if (this.windows.has('llmResponse')) {
      return this.windows.get('llmResponse');
    }
    const window = await this.createWindow('llmResponse');
    this.windows.set('llmResponse', window);
    
    // Add console message listener to see renderer logs in main process
    window.webContents.on('console-message', (event, level, message, line, sourceId) => {
      if (message.includes('LLM-RESPONSE')) {
        logger.info(`[RENDERER] ${message}`);
      }
    });
    
    window.hide();
    return window;
  }

  async createSettingsWindow() {
    if (this.windows.has('settings')) {
      return this.windows.get('settings');
    }
    const window = await this.createWindow('settings');
    this.windows.set('settings', window);
    window.hide();
    return window;
  }

  async createInterviewBarWindow() {
    if (this.windows.has('interviewBar')) {
      return this.windows.get('interviewBar');
    }
    const window = await this.createWindow('interviewBar');
    this.windows.set('interviewBar', window);
    try {
      window.setIgnoreMouseEvents(true, { forward: true });
    } catch (e) {}
    window.hide();
    return window;
  }

  async createLoopbackCaptureWindow() {
    if (this.windows.has('loopbackCapture')) {
      const existing = this.windows.get('loopbackCapture');
      if (existing && !existing.isDestroyed()) {
        return existing;
      }
    }
    const win = new BrowserWindow({
      width: 8,
      height: 8,
      x: 0,
      y: 0,
      show: false,
      frame: false,
      skipTaskbar: true,
      transparent: true,
      focusable: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      webPreferences: {
        preload: require('path').join(__dirname, '../../preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
        sandbox: false
      }
    });
    try { win.webContents.setBackgroundThrottling(false); } catch (e) {}
    win.webContents.on('console-message', (_event, _level, message) => {
      if (String(message || '').includes('[LOOPBACK]')) {
        logger.info(String(message));
      }
    });
    await win.loadFile(require('path').join(__dirname, '../../loopback-capture.html'));
    this.windows.set('loopbackCapture', win);
    logger.info('Loopback capture window ready');
    return win;
  }

  async startLoopbackCapture() {
    try {
      const win = await this.createLoopbackCaptureWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('start-loopback-capture');
        logger.info('Loopback capture start requested');
      }
    } catch (error) {
      logger.error('Failed to start loopback capture window', { error: error.message });
    }
  }

  stopLoopbackCapture() {
    const win = this.windows.get('loopbackCapture');
    if (win && !win.isDestroyed()) {
      try { win.webContents.send('stop-loopback-capture'); } catch (e) {}
    }
  }

  async createWindow(type, showOnCreate = false) {
    const windowConfig = this.windowConfigs[type];
    if (!windowConfig) {
      throw new Error(`Unknown window type: ${type}`);
    }

    // Base options
    const baseOptions = {
      width: windowConfig.width,
      height: windowConfig.height,
      webPreferences: {
        ...config.get('window.webPreferences'),
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
        devTools: true, // Enable DevTools for debugging
      },
      show: false, // Never show during creation, use showOnCurrentDesktop instead
      title: windowConfig.title,
      skipTaskbar: true,
      alwaysOnTop: true,
      visibleOnAllWorkspaces: true,
      fullscreenable: false,
      // Platform-specific always-on-top settings
      ...(process.platform === 'darwin' && {
        level: 'floating' // Start with floating level for macOS
      })
    };

    // Type-specific window configurations
    let browserWindowOptions;
    
    if (type === 'settings') {
      // Completely minimal settings window - no decorations at all
      browserWindowOptions = {
        ...baseOptions,
        frame: false,
        titleBarStyle: 'hidden',
        transparent: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        hasShadow: false,
        backgroundColor: '#00000000',
        level: process.platform === 'darwin' ? 'floating' : undefined,
        // Additional macOS flags for better always-on-top behavior
        ...(process.platform === 'darwin' && {
          type: 'panel',
          acceptFirstMouse: true,
          disableAutoHideCursor: true
        })
      };
  } else if (type === 'onboarding') {
      // First-run onboarding wizard — same frameless/panel style as
      // settings, but closable (X button) and slightly larger.
      browserWindowOptions = {
        ...baseOptions,
        frame: false,
        titleBarStyle: 'hidden',
        transparent: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: true,
        hasShadow: true,
        backgroundColor: '#00000000',
        level: process.platform === 'darwin' ? 'floating' : undefined,
        ...(process.platform === 'darwin' && {
          type: 'panel',
          acceptFirstMouse: true,
          disableAutoHideCursor: true
        })
      };
  } else if (type === 'main') {
      // Main window configuration - fit to content, completely frameless
      browserWindowOptions = {
        ...baseOptions,
        frame: false,
        titleBarStyle: 'hidden',
        titleBarOverlay: false,
        transparent: true,
        backgroundColor: '#00000000',
  // Allow resizing so users can adjust width; we will lock height in handlers
  resizable: true,
    // Keep the original max width as cap; allow small min width so it can collapse to one icon
    minWidth: 60,
    maxWidth: this.windowConfigs.main.width,
        minimizable: false,
        maximizable: false,
        closable: false,
        hasShadow: false,
        useContentSize: windowConfig.useContentSize || false,
        thickFrame: false,
        focusable: true,
        ...(process.platform === 'darwin' && {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: -100, y: -100 },
          acceptFirstMouse: true,
          disableAutoHideCursor: true
        }),
        level: process.platform === 'darwin' ? 'floating' : undefined,
      };
    } else if (type === 'llmResponse') {
      // LLM Response window - completely frameless, just content
      browserWindowOptions = {
        ...baseOptions,
        frame: false,
        titleBarStyle: 'hidden',
        transparent: true,
        backgroundColor: '#00000000',
        resizable: true,
        minimizable: false,
        maximizable: false,
        closable: false,
        hasShadow: false,
        thickFrame: false,
        ...(process.platform === 'darwin' && {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: -100, y: -100 },
          acceptFirstMouse: true
        }),
        level: process.platform === 'darwin' ? 'floating' : undefined,
      };
    } else if (type === 'interviewBar') {
      browserWindowOptions = {
        ...baseOptions,
        frame: false,
        titleBarStyle: 'hidden',
        transparent: true,
        backgroundColor: '#00000000',
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        hasShadow: false,
        thickFrame: false,
        focusable: false,
        ...(process.platform === 'darwin' && {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: -100, y: -100 },
          acceptFirstMouse: true
        }),
        level: process.platform === 'darwin' ? 'floating' : undefined,
      };
    } else if (type === 'chat') {
      // Chat window - frameless without window controls
      browserWindowOptions = {
        ...baseOptions,
        minWidth: config.get('window.minWidth'),
        minHeight: config.get('window.minHeight'),
        maxWidth: config.get('window.maxWidth'),
        maxHeight: config.get('window.maxHeight'),
        frame: false,
        titleBarStyle: 'hidden',
        transparent: true,
        resizable: true,
        minimizable: false,
        maximizable: false,
        closable: false,
        hasShadow: true,
        ...(process.platform === 'darwin' && {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: -100, y: -100 },
          acceptFirstMouse: true
        }),
        level: process.platform === 'darwin' ? 'floating' : undefined,
      };
    } else {
      browserWindowOptions = {
        ...baseOptions,
        minWidth: config.get('window.minWidth'),
        minHeight: config.get('window.minHeight'),
        maxWidth: config.get('window.maxWidth'),
        maxHeight: config.get('window.maxHeight'),
        frame: true,
        titleBarStyle: 'default',
        transparent: false,
        resizable: true,
        minimizable: false,
        maximizable: true,
        closable: true,
        hasShadow: true,
        level: process.platform === 'darwin' ? 'floating' : undefined,
      };
    }

    // Windows-specific settings
    if (process.platform === 'win32') {
      browserWindowOptions = {
        ...browserWindowOptions,
        parent: null,
        modal: false,
        thickFrame: false,
      };
    }

    browserWindowOptions.kiosk = false;
    browserWindowOptions.simpleFullscreen = false;

  const window = new BrowserWindow(browserWindowOptions);

    // External links (GitHub, the website, Google AI Studio, etc.) must open in
    // the user's real browser, never inside the frameless overlay windows.
    // Deny any in-app window.open and hand http(s) URLs to the OS browser, and
    // block the current window from navigating away to an external site.
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, url) => {
      if (/^https?:\/\//i.test(url) && url !== window.webContents.getURL()) {
        event.preventDefault();
        shell.openExternal(url);
      }
    });

  // Load the HTML file
    await window.loadFile(windowConfig.file);
    
  // Position the window
    this.positionWindow(window, type);
    
  // Apply simplified stealth measures
    this.applyStealthMeasures(window, type);
    
  // Initialize interaction mode based on current state for ALL windows
    if (this.isInteractive) {
      window.setIgnoreMouseEvents(false);
    } else {
      window.setIgnoreMouseEvents(true, { forward: true });
    }

    // Horizontal-only resize behavior for main overlay window
    if (type === 'main') {
      try {
        // Small practical minimum width so it can collapse to roughly one icon width
        // Height is managed dynamically; don't lock here to allow programmatic changes
        if (typeof window.setMinimumSize === 'function') {
          // Set a conservative minimum width; height will be adjusted via IPC as needed
          window.setMinimumSize(60, windowConfig.height);
        }

        // Intercept user-initiated resizes to lock height and allow width changes only
        window.on('will-resize', (event, newBounds) => {
          try {
            // Keep current content height; only apply the new width
            const [_, currentContentHeight] = window.getContentSize();
            event.preventDefault();
            // Enforce width within min/max bounds
            const minW = 60;
            const maxW = this.windowConfigs.main.width;
            const desiredW = Math.max(minW, Math.min(maxW, Math.round(newBounds.width || minW)));
            window.setContentSize(desiredW, Math.max(1, currentContentHeight));
          } catch (e) {
            // Fallback: lock window height using window size
            try {
              const [__w, currentWindowHeight] = window.getSize();
              event.preventDefault();
              const minW = 60;
              const maxW = this.windowConfigs.main.width;
              const desiredW = Math.max(minW, Math.min(maxW, Math.round(newBounds.width || minW)));
              window.setSize(desiredW, Math.max(1, currentWindowHeight));
            } catch { /* noop */ }
          }
        });

        // When resized (by user or programmatically), keep bound windows aligned at top
        window.on('resize', () => {
          if (this.bindWindows) {
            this.positionBoundWindows();
          }
        });
      } catch { /* ignore */ }
    }
    
    // Show window on current desktop if requested
    if (showOnCreate) {
      this.showOnCurrentDesktop(window);
    }

    logger.debug('Window created successfully', {
      type,
      title: windowConfig.title,
      dimensions: `${windowConfig.width}x${windowConfig.height}`,
      showOnCreate: showOnCreate
    });

    return window;
  }

  applyStealthMeasures(window, type) {
    // Enhanced always-on-top enforcement for all platforms
    if (process.platform === 'darwin') {
      // macOS: Use native window level constants for maximum effectiveness
      try {
        // Try the most aggressive levels first
        const levels = [
          'screen-saver',    // Highest level
          'pop-up-menu',     // Menu level
          'modal-panel',     // Modal panel level
          'floating',        // Floating level
          'normal'           // Fallback to normal with alwaysOnTop
        ];
        
        let levelSet = false;
        for (const level of levels) {
          try {
            window.setAlwaysOnTop(true, level, 1);
            levelSet = true;
            logger.debug(`Successfully set always-on-top with level: ${level}`, { type });
            break;
          } catch (levelError) {
            logger.debug(`Failed to set level: ${level}`, { error: levelError.message });
          }
        }
        
        if (!levelSet) {
          // Final fallback
          window.setAlwaysOnTop(true);
        }
        
        // Additional macOS-specific enforcement
        setTimeout(() => {
          if (!window.isDestroyed()) {
            try {
              // Force re-application of always-on-top
              window.setAlwaysOnTop(false);
              setTimeout(() => {
                if (!window.isDestroyed()) {
                  window.setAlwaysOnTop(true, 'floating', 1);
                }
              }, 50);
            } catch (error) {
              logger.warn('Error in macOS re-enforcement', { error: error.message });
            }
          }
        }, 200);
        
      } catch (error) {
        logger.warn('Error setting always-on-top for macOS', { error: error.message });
        // Absolute fallback
        window.setAlwaysOnTop(true);
      }
    } else if (process.platform === 'win32') {
      // Windows: Multiple enforcement attempts
      window.setAlwaysOnTop(true);
      
      setTimeout(() => {
        if (!window.isDestroyed()) {
          window.setAlwaysOnTop(true);
        }
      }, 100);
      
      setTimeout(() => {
        if (!window.isDestroyed()) {
          window.setAlwaysOnTop(true);
        }
      }, 500);
      
    } else {
      // Linux and other platforms
      window.setAlwaysOnTop(true);
      
      setTimeout(() => {
        if (!window.isDestroyed()) {
          window.setAlwaysOnTop(true);
        }
      }, 100);
    }

    // Ensure window appears on all workspaces/desktops initially
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    
    // Hide from taskbar to maintain stealth
    window.setSkipTaskbar(true);
    
    // Make window undetectable by screen capture (if supported)
    try {
      window.setContentProtection(true);
      if (process.platform === 'linux' && !this._warnedNoContentProtection) {
        this._warnedNoContentProtection = true;
        logger.warn('Screen-capture protection is unavailable on Linux (Electron limitation). The overlay WILL be visible in screen shares. This stealth feature only works on macOS and Windows.');
      }
    } catch (error) {
      logger.debug('Content protection not supported on this platform');
    }
    
    // More aggressive event listeners to maintain always-on-top behavior
    const enforceAlwaysOnTop = () => {
      if (!window.isDestroyed()) {
        try {
          if (process.platform === 'darwin') {
            // Try multiple levels on macOS
            window.setAlwaysOnTop(true, 'floating', 1);
            setTimeout(() => {
              if (!window.isDestroyed()) {
                window.setAlwaysOnTop(true, 'screen-saver', 1);
              }
            }, 50);
          } else {
            window.setAlwaysOnTop(true);
          }
        } catch (error) {
          logger.debug('Error in enforceAlwaysOnTop', { error: error.message });
        }
      }
    };
    
    // Event-based enforcement
    window.on('blur', () => {
      setTimeout(enforceAlwaysOnTop, 50);
      setTimeout(enforceAlwaysOnTop, 200);
      setTimeout(enforceAlwaysOnTop, 500);
    });
    
    window.on('show', () => {
      setTimeout(enforceAlwaysOnTop, 50);
      setTimeout(enforceAlwaysOnTop, 200);
    });
    
    window.on('focus', () => {
      setTimeout(enforceAlwaysOnTop, 50);
    });
    
    window.on('restore', () => {
      setTimeout(enforceAlwaysOnTop, 50);
    });
    
    // Periodic enforcement every 3 seconds (more frequent)
    const periodicEnforcement = setInterval(() => {
      if (window.isDestroyed()) {
        clearInterval(periodicEnforcement);
        return;
      }
      enforceAlwaysOnTop();
    }, 3000);
    
    logger.debug('Applied enhanced stealth measures with aggressive always-on-top', {
      type,
      platform: process.platform,
      alwaysOnTop: true,
      visibleOnAllWorkspaces: true,
      skipTaskbar: true
    });
  }

  positionWindow(window, type) {
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.workArea || display.workAreaSize;
    
    if (this.bindWindows && !this.interviewModeActive && (type === 'main' || type === 'llmResponse')) {
      // Position bound windows together
      this.positionBoundWindows();
      return;
    }
    
    // All windows positioned at top of screen with small margin
    const topMargin = 20;
    const [windowWidth] = window.getSize();
    
    const positions = {
      main: { x: displayX + 50, y: displayY + topMargin },
      chat: { x: displayX + screenWidth - windowWidth - 50, y: displayY + topMargin },
      llmResponse: { x: displayX + (screenWidth - windowWidth) / 2, y: displayY + topMargin },
      settings: { x: displayX + (screenWidth - windowWidth) / 2, y: displayY + topMargin },
      interviewBar: computeInterviewBarBounds({
        x: displayX,
        y: displayY,
        width: screenWidth,
        height: screenHeight
      })
    };

    const position = positions[type] || { x: displayX + 100, y: displayY + topMargin };
    window.setPosition(position.x, position.y);
    
    logger.debug('Positioned window at top', {
      type,
      position: `${position.x},${position.y}`,
      topMargin,
      display: display.id || 'primary'
    });
  }

  // New method to position bound windows (vertical column layout) - Always at top
  positionBoundWindows() {
    const mainWindow = this.windows.get('main');
    const llmWindow = this.windows.get('llmResponse');
    
    if (!mainWindow || !llmWindow) return;
    
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.workArea;
    
    const [mainWidth, mainHeight] = mainWindow.getSize();
    const [llmWidth, llmHeight] = llmWindow.getSize();
    
    // Always position at the top of the screen with small margin
    const topMargin = 20;
    const startY = displayY + topMargin;
    
    // Use the wider window for horizontal centering
    const maxWidth = Math.max(mainWidth, llmWidth);
    
    // Center horizontally on the display
    const xPosition = displayX + Math.round((screenWidth - maxWidth) / 2);
    
    // Ensure windows don't go outside screen bounds horizontally
    const adjustedMainX = Math.max(displayX, Math.min(displayX + screenWidth - mainWidth, xPosition));
    const adjustedLlmX = Math.max(displayX, Math.min(displayX + screenWidth - llmWidth, xPosition));
    
    // Position main window (top)
    const mainX = adjustedMainX;
    const mainY = startY;
    mainWindow.setPosition(mainX, mainY);
    
    // Position LLM response window below with gap
    const llmX = adjustedLlmX;
    const llmY = startY + mainHeight + this.windowGap;
    llmWindow.setPosition(llmX, llmY);
    
    // Update stored position (use main window position as reference)
    this.boundWindowsPosition = { x: adjustedMainX, y: startY };
    
    logger.debug('Positioned bound windows at top (column layout)', {
      mainPosition: `${mainX},${mainY}`,
      llmPosition: `${llmX},${llmY}`,
      gap: this.windowGap,
      topMargin: topMargin,
      display: display.id
    });
  }

  // New method to move bound windows (column layout) - Maintains top positioning preference
  moveBoundWindows(deltaX, deltaY) {
    if (!this.bindWindows) return;
    
    const mainWindow = this.windows.get('main');
    const llmWindow = this.windows.get('llmResponse');
    
    if (!mainWindow || !llmWindow) return;
    
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.workArea;
    
    // Get current positions and sizes
    const [mainX, mainY] = mainWindow.getPosition();
    const [llmX, llmY] = llmWindow.getPosition();
    const [mainWidth, mainHeight] = mainWindow.getSize();
    const [llmWidth, llmHeight] = llmWindow.getSize();
    
    // Calculate total height for bounds checking
    const totalHeight = mainHeight + this.windowGap + llmHeight;
    const topMargin = 20;
    const minY = displayY + topMargin;
    
    // Calculate new positions with bounds checking
    const newMainX = Math.max(displayX, Math.min(displayX + screenWidth - mainWidth, mainX + deltaX));
    // Ensure we don't go above the top margin or below screen bounds
    const newMainY = Math.max(minY, Math.min(displayY + screenHeight - totalHeight, mainY + deltaY));
    
    // LLM window follows the same horizontal movement but maintains vertical relationship
    const newLlmX = Math.max(displayX, Math.min(displayX + screenWidth - llmWidth, llmX + deltaX));
    const newLlmY = newMainY + mainHeight + this.windowGap;
    
    // Move both windows
    mainWindow.setPosition(newMainX, newMainY);
    llmWindow.setPosition(newLlmX, newLlmY);
    
    // Update stored position (use main window as reference)
    this.boundWindowsPosition.x = newMainX;
    this.boundWindowsPosition.y = newMainY;
    
    logger.debug('Moved bound windows (maintaining top preference)', {
      delta: `${deltaX},${deltaY}`,
      newMainPosition: `${newMainX},${newMainY}`,
      newLlmPosition: `${newLlmX},${newLlmY}`,
      topMargin: topMargin,
      totalHeight: totalHeight
    });
  }

  showOnCurrentDesktop(win) {
    if (!win || win.isDestroyed()) return;

    const llmWin = this.windows.get('llmResponse');
    const isLLM = llmWin && !llmWin.isDestroyed() && win.id === llmWin.id;

    if (process.platform === 'darwin') {
      // macOS: prevent space switching and keep visibility stable
      win.hide();
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

      const setMacOSAlwaysOnTop = () => {
        if (win.isDestroyed()) return;
        try {
          win.setAlwaysOnTop(true, 'screen-saver', 2);
        } catch {
          try { win.setAlwaysOnTop(true, 'pop-up-menu', 2); }
          catch { try { win.setAlwaysOnTop(true, 'floating', 2); }
          catch { win.setAlwaysOnTop(true); }}
        }
      };

      setMacOSAlwaysOnTop();

      setTimeout(() => {
        if (win.isDestroyed()) return;
        win.show();
        win.focus();
        setMacOSAlwaysOnTop();
        setTimeout(() => { if (!win.isDestroyed()) setMacOSAlwaysOnTop(); }, 100);
        // Keep LLM window visible across workspaces; others revert
        setTimeout(() => {
          if (win.isDestroyed()) return;
          if (!isLLM) {
            win.setVisibleOnAllWorkspaces(false);
          }
          setMacOSAlwaysOnTop();
        }, 300);
      }, 50);
    } else {
      // Linux/Windows
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setAlwaysOnTop(true);
      win.show();
      win.focus();
      setTimeout(() => {
        if (win.isDestroyed()) return;
        if (!isLLM) {
          win.setVisibleOnAllWorkspaces(false);
        }
        win.setAlwaysOnTop(true);
      }, 500);
    }

    logger.debug('Showing window on current desktop with enhanced always-on-top', {
      platform: process.platform,
      windowId: win.id,
      isDestroyed: win.isDestroyed()
    });
  }
  
  setupWindowEventHandlers() {
    this.windows.forEach((window, type) => {
      window.on('closed', () => {
        logger.debug('Window closed', { type });
        this.windows.delete(type);
      });

      window.on('focus', () => {
        this.activeWindow = type;
        logger.debug('Window focused', { type });
      });

      // SIMPLIFIED blur handler - no aggressive re-focusing
      window.on('blur', () => {
        // Only log, don't force focus back
        logger.debug('Window blurred', { type });
      });

      window.on('show', () => {
        logger.debug('Window shown', { type });
      });

      window.on('hide', () => {
        logger.debug('Window hidden', { type });
      });

      // Handle window minimize attempts
      window.on('minimize', (event) => {
        event.preventDefault();
        logger.debug('Prevented window minimize', { type });
      });

      window.on('restore', () => {
        // Simplified restore handling
        logger.debug('Window restored', { type });
      });
    });
  }

  setupScreenCaptureAvailabilityWatcher() {
    // Avoid screencast portal errors on Linux/Wayland by disabling periodic detection
    if (process.platform === 'linux') {
      logger.info('Skipping screen capture availability watcher on Linux to avoid portal screencast errors');
      return;
    }

    if (this.screenCaptureAvailabilityWatcher) {
      clearInterval(this.screenCaptureAvailabilityWatcher);
    }

    // This is only a capture availability probe. desktopCapturer.getSources()
    // cannot tell whether another app is currently sharing the screen.
    this.screenCaptureAvailabilityWatcher = setInterval(async () => {
      await this.checkScreenCaptureAvailability();
    }, 5000); // Check every 5 seconds instead of 1

    logger.info('Screen capture availability watcher initialized');
  }

  async checkScreenCaptureAvailability() {
    if (this.isCheckingScreenCaptureStatus) {
      logger.debug('Skipping overlapping screen capture availability check');
      return;
    }

    this.isCheckingScreenCaptureStatus = true;
    const previousAvailability = this.screenCaptureStatus.available;
    const checkedAt = new Date().toISOString();

    try {
      await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 1, height: 1 }
      });

      this.screenCaptureStatus = {
        available: true,
        lastError: null,
        lastCheckedAt: checkedAt
      };

      if (previousAvailability === false) {
        logger.info('Screen capture enumeration recovered');
      }
    } catch (error) {
      this.screenCaptureStatus = {
        available: false,
        lastError: error.message,
        lastCheckedAt: checkedAt
      };

      const logContext = {
        error: error.message,
        isScreenBeingShared: this.isScreenBeingShared
      };

      if (previousAvailability === false) {
        logger.debug('Screen capture enumeration still unavailable', logContext);
      } else {
        logger.warn('Screen capture enumeration unavailable; leaving screen sharing mode unchanged', logContext);
      }
    } finally {
      this.isCheckingScreenCaptureStatus = false;
    }
  }

  startScreenSharingMode() {
    if (!this.isScreenBeingShared) {
      this.isScreenBeingShared = true;
      this.wasVisibleBeforeSharing = this.isVisible;
      this.handleScreenSharingStarted();
    }
  }

  stopScreenSharingMode() {
    if (this.isScreenBeingShared) {
      this.isScreenBeingShared = false;
      this.handleScreenSharingStopped();
    }
  }

  handleScreenSharingStarted() {
    logger.info('Screen sharing mode enabled - hiding windows');
    
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        window.hide();
        window.setPosition(-10000, -10000);
      }
    });
  }

  handleScreenSharingStopped() {
    logger.info('Screen sharing mode disabled - restoring windows');
    
    if (this.wasVisibleBeforeSharing) {
      this.moveWindowsToActiveScreen();
      this.showAllWindows();
    }
  }

  switchToWindow(windowType) {
    if (this.windows.has('chat') && this.windows.get('chat').isVisible()) {
      this.hideChatWindow();
      return;
    }

    if (!this.windowConfigs[windowType]) {
      logger.warn('Attempted to switch to unknown window type', { windowType });
      return;
    }

    if (this.isScreenBeingShared) {
      return;
    }

    const targetWindow = this.windows.get(windowType);
    if (targetWindow) {
      this.showOnCurrentDesktop(targetWindow);

      this.activeWindow = windowType;
      
      logger.info('Switched to window', {
        windowType,
        isVisible: this.isVisible
      });
    }
  }

  showAllWindows() {
    if (this.isScreenBeingShared) {
      return;
    }

    this.windows.forEach((window, type) => {
      if (type === 'llmResponse') {
        return;
      }
      if (type === 'interviewBar' && !this.interviewModeActive) {
        return;
      }
      this.showOnCurrentDesktop(window);
    });
    
    this.isVisible = true;
    const activeWindow = this.windows.get(this.activeWindow);
    if (activeWindow) {
      activeWindow.focus();
    }
    
    logger.info('All windows shown on current desktop', { 
      activeWindow: this.activeWindow,
      windowCount: this.windows.size 
    });
  }

  hideAllWindows() {
    this.windows.forEach((window, type) => {
      if (type !== 'llmResponse') {
        window.hide();
      }
    });
    
    this.isVisible = false;
    logger.info('All windows hidden');
  }

  toggleVisibility() {
    if (this.isScreenBeingShared) {
      return this.isVisible;
    }

    if (this.isVisible) {
      this.hideAllWindows();
    } else {
      this.showAllWindows();
    }
    
    return this.isVisible;
  }

  setInteractive(interactive) {
    this.isInteractive = interactive;
    
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        if (type === 'interviewBar') {
          window.setIgnoreMouseEvents(true, { forward: true });
        } else if (interactive) {
          window.setIgnoreMouseEvents(false);
        } else {
          window.setIgnoreMouseEvents(true, { forward: true });
        }
        window.webContents.send('interaction-mode-changed', interactive);
      }
    });
    
    logger.info('Window interaction mode changed', { 
      interactive,
      clickThrough: !interactive,
      affectedWindows: Array.from(this.windows.keys())
    });
  }

  toggleInteraction() {
    this.setInteractive(!this.isInteractive);
    
    // Ensure all windows remain always-on-top after interaction mode change
    this.enforceAlwaysOnTopForAllWindows();
    
    return this.isInteractive;
  }

  // New method to enforce always-on-top for all windows
  enforceAlwaysOnTopForAllWindows() {
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        try {
          if (process.platform === 'darwin') {
            // Try multiple levels for macOS
            window.setAlwaysOnTop(true, 'pop-up-menu', 1);
            
            setTimeout(() => {
              if (!window.isDestroyed()) {
                window.setAlwaysOnTop(true, 'floating', 1);
              }
            }, 100);
            
            setTimeout(() => {
              if (!window.isDestroyed()) {
                window.setAlwaysOnTop(true, 'screen-saver', 1);
              }
            }, 200);
          } else {
            // Windows and Linux
            window.setAlwaysOnTop(true);
            
            // Additional enforcement after a short delay
            setTimeout(() => {
              if (!window.isDestroyed()) {
                window.setAlwaysOnTop(true);
              }
            }, 100);
          }
        } catch (error) {
          logger.warn('Error enforcing always-on-top', { 
            type, 
            error: error.message 
          });
          // Fallback to basic always-on-top
          try {
            window.setAlwaysOnTop(true);
          } catch (fallbackError) {
            logger.error('Fallback always-on-top failed', { 
              type, 
              error: fallbackError.message 
            });
          }
        }
      }
    });
    
    logger.debug('Enforced always-on-top for all windows with aggressive strategy', {
      platform: process.platform,
      windowCount: this.windows.size
    });
  }

  // Public method to manually enforce always-on-top for all windows
  forceAlwaysOnTopForAllWindows() {
    this.enforceAlwaysOnTopForAllWindows();
    logger.info('Manually enforced always-on-top for all windows');
  }

  // Debug method to test and verify always-on-top functionality
  testAlwaysOnTopForAllWindows() {
    const results = {};
    
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        try {
          const isAlwaysOnTop = window.isAlwaysOnTop();
          
          if (process.platform === 'darwin') {
            // Test different levels on macOS
            window.setAlwaysOnTop(true, 'screen-saver', 2);
            setTimeout(() => {
              if (!window.isDestroyed()) {
                window.setAlwaysOnTop(true, 'pop-up-menu', 2);
                setTimeout(() => {
                  if (!window.isDestroyed()) {
                    window.setAlwaysOnTop(true, 'floating', 2);
                  }
                }, 50);
              }
            }, 50);
          } else {
            // For other platforms
            window.setAlwaysOnTop(true);
            setTimeout(() => {
              if (!window.isDestroyed()) {
                window.setAlwaysOnTop(true);
              }
            }, 50);
          }
          
          results[type] = {
            success: true,
            isAlwaysOnTop: isAlwaysOnTop,
            isVisible: window.isVisible(),
            isDestroyed: window.isDestroyed()
          };
          
        } catch (error) {
          results[type] = {
            success: false,
            error: error.message,
            isDestroyed: window.isDestroyed()
          };
        }
      } else {
        results[type] = {
          success: false,
          error: 'Window is destroyed'
        };
      }
    });
    
    logger.info('Always-on-top test results', { 
      platform: process.platform,
      results 
    });
    
    return results;
  }

  showLLMResponse(content, metadata = {}) {
    logger.debug('showLLMResponse called', {
      isScreenBeingShared: this.isScreenBeingShared,
      contentLength: content.length,
      skill: metadata.skill
    });

    if (this.isScreenBeingShared) {
      logger.warn('LLM response shown during screen sharing (stealth overlay)');
    }

    const llmWindow = this.windows.get('llmResponse');
    if (!llmWindow) {
      logger.error('LLM response window not available');
      return;
    }

    // Ensure window is not destroyed before use
    if (llmWindow.isDestroyed()) {
      logger.error('LLM response window is destroyed');
      return;
    }

    logger.debug('Sending display-llm-response event to window');
    if (this.interviewModeActive) {
      llmWindow.webContents.send('interview-hud', { enabled: true });
    }
    llmWindow.webContents.send('display-llm-response', {
      content,
      metadata: { ...metadata, compactCard: this.interviewModeActive, question: metadata.question || '' },
      timestamp: new Date().toISOString(),
      question: metadata.question || ''
    });

    if (this.interviewModeActive) {
      this.resizeInterviewCard({
        hasCode: this._responseLooksLikeCode(content),
        contentHeight: this.interviewCardMetrics.contentHeight
      });
      this.showInterviewAnswerCard();
    } else {
      this.showOnCurrentDesktop(llmWindow);
      if (this.bindWindows) {
        this.positionBoundWindows();
      }
    }
        
    logger.info('LLM response displayed', {
      contentLength: content.length,
      skill: metadata.skill,
      windowVisible: llmWindow.isVisible(),
      boundWindows: this.bindWindows
    });
  }

  showLLMLoading(options = {}) {
    if (this.isScreenBeingShared) {
      logger.warn('LLM loading shown during screen sharing (stealth overlay)');
    }

    const llmWindow = this.windows.get('llmResponse');
    if (!llmWindow) {
      logger.error('LLM window not available for loading state');
      return;
    }

    const payload = {
      compact: !!this.interviewModeActive,
      question: options.question || ''
    };

    if (this.interviewModeActive) {
      this.interviewCardFrozen = false;
      this.interviewCardMetrics = { hasCode: false, contentHeight: MIN_HEIGHT };
      llmWindow.webContents.send('interview-hud', { enabled: true });
      llmWindow.webContents.send('show-loading', payload);
      this.showInterviewAnswerCard();
      return;
    }

    logger.debug('Showing LLM loading state');
    llmWindow.webContents.send('show-loading', payload);
    this.showOnCurrentDesktop(llmWindow);

    if (this.bindWindows) {
      this.positionBoundWindows();
    }
  }

  hideLLMResponse() {
    const llmWindow = this.windows.get('llmResponse');
    if (llmWindow) {
      llmWindow.hide();
    }
    this.interviewCardLock = null;
    this.interviewCardFrozen = false;
  }

  showSettings() {
    if (this.isScreenBeingShared) return;

    const settingsWindow = this.windows.get('settings');
    if (settingsWindow) {
      this.showOnCurrentDesktop(settingsWindow);
      this.centerWindow(settingsWindow); // This now positions at top-center
      
      // Notify that settings window is shown
      setTimeout(() => {
        settingsWindow.webContents.send('settings-window-shown');
      }, 50);
      
      logger.info('Settings window displayed at top');
    }
  }

  hideSettings() {
    const settingsWindow = this.windows.get('settings');
    if (settingsWindow) {
      settingsWindow.hide();
    }
  }

  async showOnboarding() {
    if (this.isScreenBeingShared) return null;

    let onboardingWindow = this.windows.get('onboarding');
    if (!onboardingWindow) {
      onboardingWindow = await this.createWindow('onboarding');
      this.windows.set('onboarding', onboardingWindow);

      // Once the wizard renderer signals it's ready, send it the
      // current first-run status so it can pre-populate correctly.
      onboardingWindow.webContents.once('did-finish-load', () => {
        logger.info('Onboarding window loaded');
      });
    }

    this.showOnCurrentDesktop(onboardingWindow);
    this.centerWindow(onboardingWindow);
    onboardingWindow.focus();
    logger.info('Onboarding window displayed');
    return onboardingWindow;
  }

  hideOnboarding() {
    const onboardingWindow = this.windows.get('onboarding');
    if (onboardingWindow) {
      onboardingWindow.hide();
    }
  }

  closeOnboarding() {
    const onboardingWindow = this.windows.get('onboarding');
    if (onboardingWindow && !onboardingWindow.isDestroyed()) {
      onboardingWindow.close();
    }
    this.windows.delete('onboarding');
  }

  expandLLMWindow(contentMetrics = null) {
    const llmWindow = this.windows.get('llmResponse');
    if (!llmWindow || this.isScreenBeingShared) return;
    if (this.interviewModeActive) {
      this.resizeInterviewCard(contentMetrics || this.interviewCardMetrics);
      return;
    }

    const optimalSize = this.calculateOptimalWindowSize(contentMetrics);
    
    // Ensure we have valid numbers for setSize
    const width = Math.round(Number(optimalSize.width)) || 840;
    const height = Math.round(Number(optimalSize.height)) || 480;
    
    llmWindow.setSize(width, height);
    
    // If windows are bound, position them together; otherwise center the LLM window
    if (this.bindWindows) {
      this.positionBoundWindows();
    } else {
      this.centerWindow(llmWindow);
    }
    
    logger.debug('LLM window resized', { 
      newSize: `${width}x${height}`,
      basedOnContent: !!contentMetrics,
      boundWindows: this.bindWindows
    });
  }

  calculateOptimalWindowSize(contentMetrics) {
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = display.workArea || display.workAreaSize;
    
    let width = 840; // Default LLM window width
    let height = 480; // Default LLM window height
    
    if (contentMetrics && typeof contentMetrics === 'object') {
      const lineCount = Number(contentMetrics.lineCount) || 20;
      const avgLineLength = Number(contentMetrics.avgLineLength) || 80;
      
      width = Math.min(Math.max(avgLineLength * 8, 500), screenWidth * 0.8);
      height = Math.min(Math.max(lineCount * 25 + 100, 300), screenHeight * 0.8);
    }
    
    return { 
      width: Math.round(Number(width)) || 840, 
      height: Math.round(Number(height)) || 480 
    };
  }

  centerWindow(window) {
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.workArea || display.workAreaSize;
    const [windowWidth, windowHeight] = window.getSize();
    
    // Center horizontally but position at top
    const topMargin = 20;
    const x = displayX + Math.round((screenWidth - windowWidth) / 2);
    const y = displayY + topMargin;
    
    window.setPosition(x, y);
    
    logger.debug('Positioned window at top-center', {
      position: `${x},${y}`,
      topMargin,
      display: display.id || 'primary'
    });
  }

  broadcastToAllWindows(channel, data) {
    const windowStates = {};
    
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, data);
        windowStates[type] = {
          isVisible: window.isVisible(),
          isDestroyed: window.isDestroyed(),
          hasWebContents: !!window.webContents
        };
      } else {
        windowStates[type] = { isDestroyed: true };
      }
    });
    
    logger.info('Broadcast sent to all windows', { 
      channel, 
      windowCount: this.windows.size,
      windowStates,
      dataKeys: data ? Object.keys(data) : [],
      // Fixed: Check for 'content' instead of 'response' to match actual data structure
      dataPreview: data && data.content ? data.content.substring(0, 50) + '...' : 
                   data && data.response ? data.response.substring(0, 50) + '...' : 'No response'
    });
  }

  getWindow(type) {
    return this.windows.get(type);
  }

  getActiveWindow() {
    return this.windows.get(this.activeWindow);
  }

  getWindowStats() {
    const stats = {};
    
    this.windows.forEach((window, type) => {
      stats[type] = {
        isVisible: window.isVisible(),
        isFocused: window.isFocused(),
        position: window.getPosition(),
        size: window.getSize()
      };
    });
    
    return {
      windows: stats,
      activeWindow: this.activeWindow,
      isInteractive: this.isInteractive,
      isVisible: this.isVisible,
      isScreenBeingShared: this.isScreenBeingShared,
      screenCaptureStatus: { ...this.screenCaptureStatus }
    };
  }

  destroyAllWindows() {
    this.windows.forEach((window, type) => {
      logger.debug('Destroying window', { type });
      if (!window.isDestroyed()) {
        window.destroy();
      }
    });
    
    this.windows.clear();
    
    // Clean up all watchers
    if (this.screenWatcher) {
      clearInterval(this.screenWatcher);
      this.screenWatcher = null;
    }
    
    if (this.desktopWatcher) {
      clearInterval(this.desktopWatcher);
      this.desktopWatcher = null;
    }

    if (this.screenCaptureAvailabilityWatcher) {
      clearInterval(this.screenCaptureAvailabilityWatcher);
      this.screenCaptureAvailabilityWatcher = null;
    }
    
    logger.info('All windows destroyed');
  }

  setupScreenTracking() {
    // Initialize with current cursor position to get the active display
    const cursorPoint = screen.getCursorScreenPoint();
    this.currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
    
    screen.on('display-added', () => {
      logger.debug('Display added');
      this.handleDisplayChange();
    });

    screen.on('display-removed', () => {
      logger.debug('Display removed');
      this.handleDisplayChange();
    });

    screen.on('display-metrics-changed', () => {
      logger.debug('Display metrics changed');
      this.handleDisplayChange();
    });

    // More frequent tracking during initialization
    this.screenWatcher = setInterval(() => {
      this.trackActiveScreen();
    }, 2000);

    // SIMPLIFIED desktop tracking
    this.setupDesktopTracking();

    logger.info('Screen and desktop tracking initialized', {
      currentDisplay: this.currentDisplay.id,
      cursorPosition: cursorPoint
    });
  }

  handleDisplayChange() {
    setTimeout(() => {
      this.moveWindowsToActiveScreen();
    }, 500);
  }

  trackActiveScreen() {
    if (this.isScreenBeingShared) return;

    const cursorPoint = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
    
    if (!this.currentDisplay || activeDisplay.id !== this.currentDisplay.id) {
      this.currentDisplay = activeDisplay;
      this.moveWindowsToActiveScreen();
      
      logger.debug('Active screen changed', {
        displayId: activeDisplay.id,
        bounds: activeDisplay.bounds
      });
    }
  }

  moveWindowsToActiveScreen() {
    if (!this.currentDisplay || this.isScreenBeingShared) return;

    const { x: displayX, y: displayY, width: displayWidth, height: displayHeight } = this.currentDisplay.workArea;
    
    // Handle bound windows specially
    if (this.bindWindows && !this.interviewModeActive) {
      const mainWindow = this.windows.get('main');
      const llmWindow = this.windows.get('llmResponse');
      
      if (mainWindow && llmWindow && !mainWindow.isDestroyed() && !llmWindow.isDestroyed()) {
        // Position bound windows on the new screen and ensure they appear on current desktop
        this.positionBoundWindows();
        if (mainWindow.isVisible()) this.showOnCurrentDesktop(mainWindow);
        if (llmWindow.isVisible()) this.showOnCurrentDesktop(llmWindow);
      }
    }
    
    this.windows.forEach((window, type) => {
      if (window && !window.isDestroyed()) {
        // Skip main and llmResponse if they're bound (already handled above)
        if (this.bindWindows && (type === 'main' || type === 'llmResponse')) {
          return;
        }
        
        const [windowWidth, windowHeight] = window.getSize();
        
        let newX, newY;
        
        // All windows positioned at top of screen
        const topMargin = 20;
        
        switch (type) {
          case 'main':
            newX = displayX + 50;
            newY = displayY + topMargin;
            break;
          case 'chat':
            newX = displayX + displayWidth - windowWidth - 50;
            newY = displayY + topMargin;
            break;
          case 'llmResponse':
            if (this.interviewModeActive) {
              const docked = this.getInterviewAnswerBounds();
              newX = docked.x;
              newY = docked.y;
              try { window.setBounds(docked); } catch (e) {}
            } else {
              newX = displayX + (displayWidth - windowWidth) / 2;
              newY = displayY + topMargin;
            }
            break;
          case 'settings':
            newX = displayX + (displayWidth - windowWidth) / 2;
            newY = displayY + topMargin;
            break;
          case 'interviewBar': {
            const barBounds = computeInterviewBarBounds({
              x: displayX,
              y: displayY,
              width: displayWidth,
              height: displayHeight
            });
            newX = barBounds.x;
            newY = barBounds.y;
            try { window.setBounds(barBounds); } catch (e) {}
            break;
          }
          default:
            newX = displayX + 100;
            newY = displayY + topMargin;
        }
        
        window.setPosition(Math.round(newX), Math.round(newY));
        
        // Ensure always-on-top is maintained after moving
        if (process.platform === 'darwin') {
          window.setAlwaysOnTop(true, 'screen-saver', 1);
        } else {
          window.setAlwaysOnTop(true);
        }
        
        // Ensure window appears on current desktop if it's visible
        if (window.isVisible()) {
          this.showOnCurrentDesktop(window);
        }
        
        logger.debug('Window moved to active screen and shown on current desktop', {
          type,
          position: `${newX},${newY}`,
          isVisible: window.isVisible(),
          displayId: this.currentDisplay.id
        });
      }
    });
  }

  setupDesktopTracking() {
    // MUCH less aggressive desktop tracking
    this.desktopWatcher = setInterval(() => {
      this.trackDesktopChanges();
    }, 10000); // Changed from 1500ms to 10000ms (10 seconds)

    logger.info('Desktop tracking initialized');
  }

  trackDesktopChanges() {
    if (this.isScreenBeingShared) return;

    // Simplified tracking - just log changes
    if (process.platform === 'darwin') {
      const cursorPoint = screen.getCursorScreenPoint();
      const currentSpaceSignature = `${cursorPoint.x}_${cursorPoint.y}`;
      
      if (this.lastActiveSpace && this.lastActiveSpace !== currentSpaceSignature) {
        logger.debug('Desktop space might have changed');
      }
      
      this.lastActiveSpace = currentSpaceSignature;
    }
  }

  // REMOVED all the aggressive enforcement methods that were causing flickering:
  // - handlePossibleSpaceChange()
  // - handleSpaceChange() 
  // - ensureWindowVisibility()
  // - enforceWindowProperties()
  // - enforceAllWindowProperties()
  // - enforceAlwaysOnTop()

  // Public methods for manual screen sharing control
  enableScreenSharingMode() {
    this.startScreenSharingMode();
  }

  disableScreenSharingMode() {
    this.stopScreenSharingMode();
  }

  isInScreenSharingMode() {
    return this.isScreenBeingShared;
  }

  // Window binding management methods
  setWindowBinding(enabled) {
    this.bindWindows = enabled;
    
    if (enabled) {
      // Position bound windows when binding is enabled
      const mainWindow = this.windows.get('main');
      const llmWindow = this.windows.get('llmResponse');
      
      if (mainWindow && llmWindow) {
        this.positionBoundWindows();
      }
      
      logger.info('Window binding enabled');
    } else {
      logger.info('Window binding disabled');
    }
    
    return this.bindWindows;
  }

  toggleWindowBinding() {
    return this.setWindowBinding(!this.bindWindows);
  }

  getWindowBindingStatus() {
    return {
      enabled: this.bindWindows,
      gap: this.windowGap,
      position: this.boundWindowsPosition
    };
  }

  setWindowGap(gap) {
    this.windowGap = Math.max(0, gap);
    
    // Re-position if currently bound
    if (this.bindWindows) {
      this.positionBoundWindows();
    }
    
    logger.debug('Window gap updated', { gap: this.windowGap });
    return this.windowGap;
  }

  showChatWindow() {
    const chatWindow = this.windows.get('chat');
    if (chatWindow && !chatWindow.isDestroyed()) {
      this.showOnCurrentDesktop(chatWindow);
      logger.debug('Chat window shown');
    }
  }

  hideChatWindow() {
    const chatWindow = this.windows.get('chat');
    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.hide();
      logger.debug('Chat window hidden');
    }
  }

  setInterviewModeActive(active) {
    this.interviewModeActive = !!active;
    const main = this.windows.get('main');
    const llmWindow = this.windows.get('llmResponse');
    if (this.interviewModeActive) {
      this.loadInterviewHudPrefs();
      this.interviewCardFrozen = false;
      this.interviewCardMetrics = { hasCode: false, contentHeight: MIN_HEIGHT };
      if (main && !main.isDestroyed()) {
        main.hide();
      }
      if (llmWindow && !llmWindow.isDestroyed()) {
        llmWindow.webContents.send('interview-hud', { enabled: true });
      }
    } else {
      this.hideInterviewBar();
      this.hideLLMResponse();
      this.interviewCardFrozen = false;
      this.interviewCardMetrics = { hasCode: false, contentHeight: MIN_HEIGHT };
      this.interviewCardLock = null;
      if (llmWindow && !llmWindow.isDestroyed()) {
        llmWindow.webContents.send('interview-hud', { enabled: false });
      }
      if (main && !main.isDestroyed() && this.isVisible && !this.isScreenBeingShared) {
        this.showOnCurrentDesktop(main);
      }
    }
  }

  showInterviewBar() {
    if (this.isScreenBeingShared) {
      return;
    }
    const bar = this.windows.get('interviewBar');
    if (!bar || bar.isDestroyed()) {
      return;
    }
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const area = display.workArea || display.bounds;
    const bounds = computeInterviewBarBounds(area);
    try { bar.setBounds(bounds); } catch (e) {}
    if (!bar.isVisible()) {
      this.showOnCurrentDesktop(bar);
    }
    try {
      bar.setIgnoreMouseEvents(true, { forward: true });
    } catch (e) {}
  }

  hideInterviewBar() {
    const bar = this.windows.get('interviewBar');
    if (bar && !bar.isDestroyed()) {
      bar.hide();
    }
  }

  _hudPrefsPath() {
    if (this._hudPersistPath) return this._hudPersistPath;
    const os = require('os');
    const fsPath = require('path');
    const dir = fsPath.join(os.homedir(), '.OpenCluely');
    this._hudPersistPath = fsPath.join(dir, 'interview-hud.json');
    return this._hudPersistPath;
  }

  loadInterviewHudPrefs() {
    try {
      const fs = require('fs');
      const file = this._hudPrefsPath();
      if (!fs.existsSync(file)) return;
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (['left', 'right', 'top'].includes(parsed.answerDock)) {
        this.interviewAnswerDock = parsed.answerDock;
      }
    } catch (error) {
      logger.debug('Could not load interview HUD prefs', { error: error.message });
    }
  }

  saveInterviewHudPrefs() {
    try {
      const fs = require('fs');
      const fsPath = require('path');
      const file = this._hudPrefsPath();
      const dir = fsPath.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ answerDock: this.interviewAnswerDock }), 'utf8');
    } catch (error) {
      logger.debug('Could not save interview HUD prefs', { error: error.message });
    }
  }

  getInterviewAnswerBounds() {
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const area = display.workArea || display.bounds;
    return computeInterviewCardBounds(area, this.interviewAnswerDock, this.interviewCardMetrics);
  }

  _workArea() {
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    return display.workArea || display.bounds || { x: 0, y: 0, width: 1280, height: 720 };
  }

  _responseLooksLikeCode(text) {
    return /```/.test(String(text || '')) || /\n {4,}|\n\t/.test(String(text || ''));
  }

  resizeInterviewCard(metrics = {}) {
    if (!this.interviewModeActive) {
      return false;
    }
    if (metrics.frozen === false) {
      this.interviewCardFrozen = false;
    }
    const hasCode = metrics.hasCode === true || this._responseLooksLikeCode(metrics.response);
    const contentHeight = Number(metrics.contentHeight) || this.interviewCardMetrics.contentHeight || MIN_HEIGHT;
    this.interviewCardMetrics = { hasCode, contentHeight };

    const win = this.windows.get('llmResponse');
    if (!win || win.isDestroyed()) {
      return false;
    }

    if (!this.interviewCardLock) {
      const shown = this.showInterviewAnswerCard();
      if (metrics.frozen === true) this.interviewCardFrozen = true;
      return shown;
    }

    const area = this._workArea();
    const widthInfo = resolveStreamingWidth(area, this.interviewCardLock, hasCode);
    const maxHeight = computeInterviewCardSize(area, { hasCode, contentHeight }).maxHeight;
    const height = chooseInterviewCardHeight({
      needed: contentHeight,
      current: this.interviewCardLock.height,
      maxHeight,
      frozen: this.interviewCardFrozen && metrics.frozen !== false,
      fit: metrics.fit === true
    });
    const bounds = applyStreamingResize(this.interviewCardLock, {
      width: widthInfo.width,
      height
    });
    this.interviewCardLock = {
      ...this.interviewCardLock,
      width: bounds.width,
      height: bounds.height,
      widthMode: widthInfo.mode
    };
    if (metrics.frozen === true) {
      this.interviewCardFrozen = true;
    }
    if (!win.isVisible()) {
      this.showOnCurrentDesktop(win);
    }
    win.setBounds(bounds);
    return true;
  }

  dockInterviewAnswer(side, { animate = true } = {}) {
    if (!['left', 'right', 'top'].includes(side)) return false;
    this.interviewAnswerDock = side;
    this.saveInterviewHudPrefs();
    const win = this.windows.get('llmResponse');
    if (!win || win.isDestroyed()) {
      logger.warn('Interview dock ignored; answer window missing', { side });
      return false;
    }
    if (this.interviewCardLock) {
      this.interviewCardMetrics = {
        hasCode: this.interviewCardMetrics.hasCode === true,
        contentHeight: this.interviewCardLock.height
      };
    }
    const bounds = this.getInterviewAnswerBounds();
    if (this.interviewModeActive && !win.isVisible()) {
      this.interviewCardLock = null;
      this.showInterviewAnswerCard();
    } else if (animate && win.isVisible()) {
      this._animateWindowBounds(win, bounds, 150);
      this.interviewCardLock = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        widthMode: 'card'
      };
    } else {
      win.setBounds(bounds);
      this.interviewCardLock = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        widthMode: 'card'
      };
    }
    logger.info('Interview answer card docked', { side, bounds, visible: win.isVisible() });
    return true;
  }

  _animateWindowBounds(win, target, durationMs) {
    if (this._dockAnim) {
      clearInterval(this._dockAnim);
      this._dockAnim = null;
    }
    const start = win.getBounds();
    const t0 = Date.now();
    this._dockAnim = setInterval(() => {
      if (!win || win.isDestroyed()) {
        clearInterval(this._dockAnim);
        this._dockAnim = null;
        return;
      }
      const t = Math.min(1, (Date.now() - t0) / durationMs);
      const e = t * (2 - t);
      win.setBounds({
        x: Math.round(start.x + (target.x - start.x) * e),
        y: Math.round(start.y + (target.y - start.y) * e),
        width: target.width,
        height: target.height
      });
      if (t >= 1) {
        clearInterval(this._dockAnim);
        this._dockAnim = null;
      }
    }, 16);
  }

  showInterviewAnswerCard() {
    const llmWindow = this.windows.get('llmResponse');
    if (!llmWindow || llmWindow.isDestroyed()) return false;

    const bounds = this.interviewCardLock
      ? {
          x: this.interviewCardLock.x,
          y: this.interviewCardLock.y,
          width: this.interviewCardLock.width,
          height: this.interviewCardLock.height
        }
      : this.getInterviewAnswerBounds();
    if (!this.interviewCardLock) {
      this.interviewCardLock = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        widthMode: 'card'
      };
    }
    try { llmWindow.setAlwaysOnTop(true); } catch (e) {}
    try { llmWindow.setBounds(bounds); } catch (e) {}
    try { llmWindow.webContents.send('interview-hud', { enabled: true }); } catch (e) {}
    this.showOnCurrentDesktop(llmWindow);
    logger.debug('Interview answer card shown', { bounds, dock: this.interviewAnswerDock });
    return true;
  }

  handleRecordingStarted(payload) {
    this.isRecording = true;
    if (!this.interviewModeActive) {
      this.showChatWindow();
    }
    if (payload && payload.source === 'loopback') {
      this.startLoopbackCapture();
    }
    this.broadcastToAllWindows('recording-started', payload || {});
    logger.debug('Recording started', { interviewMode: this.interviewModeActive });
  }

  handleRecordingStopped() {
    this.isRecording = false;
    this.stopLoopbackCapture();
    // Notify all windows about recording state
    this.broadcastToAllWindows('recording-stopped');
    logger.debug('Recording stopped, chat window kept visible for the response');
  }
}

module.exports = new WindowManager();
