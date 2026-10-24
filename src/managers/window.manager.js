const { BrowserWindow, screen, desktopCapturer, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const logger = require('../core/logger').createServiceLogger('WINDOW');
const config = require('../core/config');

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
    
    // Add debouncing to prevent excessive operations
    this.lastEnforceTime = 0;
    this.enforceDebounceMs = 1000; // Only enforce once per second
    this.focusLocked = false; // Prevent focus loops
    
    // Window binding properties
    this.bindWindows = true; // Enable window binding by default
    this.windowGap = 10; // Small gap between windows
    this.boundWindowsPosition = { x: null, y: null }; // Track position of bound windows
    this.hasUserMovedBoundWindows = false;
    this.userPositions = {};
    
    // State persistence
    this.stateFilePath = path.join(os.homedir(), '.sysconfig', 'window-state.json');
    this.isHoverDragging = false;
    this.hoverDragInterval = null;
    this._saveStateTimer = null;
    this.loadSavedWindowState();
    
    // Auto-Hide properties
    this.isAutoHideMode = false;
    this.autoHideState = 'visible'; // 'visible' | 'hidden'
    this.autoHideWatcher = null;
    
    // Global transparency & theme tracking across all windows
    this.currentOpacity = 0.38;
    this.currentTheme = 'dark';
    
    this.windowConfigs = {
      main: {
        width: 1450,
        height: 40,
        useContentSize: true,
        file: 'index.html',
        title: 'Preferences'
      },
      chat: {
        width: 500,
        height: 700,
        file: 'chat.html',
        title: 'Input'
      },
      llmResponse: {
        width: 780,
        height: 380,
        file: 'llm-response.html',
        title: 'Output',
        alwaysOnTop: true
      },
      settings: {
        width: 400,
        height: 380,
        file: 'settings.html',
        title: 'General',
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
      onboarding: {
        width: 560,
        height: 680,
        file: 'onboarding.html',
        title: 'Setup Assistant',
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
      },
      clipboard: {
        width: 600,
        height: 700,
        file: 'clipboard.html',
        title: 'Pasteboard',
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true
      },
      targetBox: {
        width: 400,
        height: 300,
        file: 'target-box.html',
        title: 'Selection',
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        hasShadow: false,
        visibleOnAllWorkspaces: true
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
      await this.createClipboardWindow();
      await this.createTargetBoxWindow();
      
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

    // Notify all windows of LLM window open/close state
    window.on('show', () => {
      this.isLLMWindowOpen = true;
      this.broadcastToAllWindows('llm-window-state', { isOpen: true });
    });
    window.on('hide', () => {
      setTimeout(() => {
        if (window.isDestroyed() || !window.isVisible()) {
          this.isLLMWindowOpen = false;
          this.broadcastToAllWindows('llm-window-state', { isOpen: false });
        }
      }, 100);
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

  async createClipboardWindow() {
    if (this.windows.has('clipboard')) {
      return this.windows.get('clipboard');
    }
    const window = await this.createWindow('clipboard');
    this.windows.set('clipboard', window);
    window.hide();
    return window;
  }

  async createTargetBoxWindow() {
    if (this.windows.has('targetBox')) {
      return this.windows.get('targetBox');
    }
    const window = await this.createWindow('targetBox');
    this.windows.set('targetBox', window);
    window.hide();
    return window;
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
        devTools: process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true',
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
      // First-run onboarding wizard — same frameless style as
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
    // Allow wide bar up to 2200px so all tools fit and user can resize
    minWidth: 60,
    maxWidth: 2200,
        minimizable: false,
        maximizable: false,
        closable: false,
        hasShadow: false,
        useContentSize: windowConfig.useContentSize || false,
        thickFrame: false,
        focusable: true,
        ...(process.platform === 'darwin' && {
          type: 'panel',
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: -100, y: -100 },
          acceptFirstMouse: true,
          disableAutoHideCursor: true
        }),
        level: process.platform === 'darwin' ? 'floating' : undefined,
      };
    } else if (type === 'llmResponse') {
      // LLM Response window - completely frameless, top-middle teleprompter
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
        focusable: false, // Anti-detection: Never steals OS focus or triggers window.onblur in bot interviews
        ...(process.platform === 'darwin' && {
          type: 'panel',
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: -100, y: -100 },
          acceptFirstMouse: true,
          disableAutoHideCursor: true
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
          type: 'panel',
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: -100, y: -100 },
          acceptFirstMouse: true
        }),
        level: process.platform === 'darwin' ? 'floating' : undefined,
      };
    } else if (type === 'clipboard' || type === 'targetBox') {
      // Use config settings for frameless/transparency
      browserWindowOptions = {
        ...baseOptions,
        ...windowConfig,
        ...(process.platform === 'darwin' && {
          type: 'panel',
          titleBarStyle: windowConfig.titleBarStyle || (windowConfig.frame === false ? 'hiddenInset' : 'default'),
          trafficLightPosition: { x: -100, y: -100 },
          acceptFirstMouse: true
        }),
        level: process.platform === 'darwin' ? 'floating' : undefined,
      };
    } else {
      // Other windows (skills)
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
            const maxW = 2200;
            const desiredW = Math.max(minW, Math.min(maxW, Math.round(newBounds.width || minW)));
            window.setContentSize(desiredW, Math.max(1, currentContentHeight));
          } catch (e) {
            // Fallback: lock window height using window size
            try {
              const [__w, currentWindowHeight] = window.getSize();
              event.preventDefault();
              const minW = 60;
              const maxW = 2200;
              const desiredW = Math.max(minW, Math.min(maxW, Math.round(newBounds.width || minW)));
              window.setSize(desiredW, Math.max(1, currentWindowHeight));
            } catch { /* noop */ }
          }
        });

        // When resized (by user or programmatically), keep main window in place and update bound windows
        window.on('resize', () => {
          if (this.bindWindows) {
            const [curX, curY] = window.getPosition();
            this.userPositions['main'] = { x: curX, y: curY };
            this.boundWindowsPosition = { x: curX, y: curY };
            this.hasUserMovedBoundWindows = true;
            this.debouncedSaveWindowState();

            const llmWindow = this.windows.get('llmResponse');
            if (llmWindow && !llmWindow.isDestroyed() && llmWindow.isVisible()) {
              const [_, curH] = window.getSize();
              llmWindow.setPosition(curX, curY + curH + this.windowGap);
            }
          }
        });
      } catch { /* ignore */ }
    }
    
    // Track user window repositioning to preserve exact user-placed positions
    window.on('move', () => {
      if (!window.isDestroyed()) {
        const pos = window.getPosition();
        this.userPositions[type] = { x: pos[0], y: pos[1] };
        if (type === 'main') {
          this.hasUserMovedBoundWindows = true;
          this.boundWindowsPosition = { x: pos[0], y: pos[1] };
          this.debouncedSaveWindowState();
        } else if (type === 'llmResponse') {
          this.hasUserMovedLLMWindow = true;
          this.debouncedSaveWindowState();
        }
      }
    });

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

    window.webContents.on('did-finish-load', () => {
      if (this.currentOpacity !== undefined) {
        window.webContents.send('update-opacity', this.currentOpacity);
      }
      if (this.currentTheme !== undefined) {
        window.webContents.send('theme-changed', this.currentTheme);
      }
    });

    window.on('moved', () => {
      const [x, y] = window.getPosition();
      this.userPositions[type] = { x, y };
      if (type === 'main') {
        this.hasUserMovedBoundWindows = true;
        this.boundWindowsPosition = { x, y };
        this.saveWindowState();
      }
      logger.debug('Window moved by user', { type, x, y });
    });

    return window;
  }

  applyStealthMeasures(window, type) {
    // Determine if this window needs permanent fullscreen visibility
    const isOverlayWindow = (type === 'main' || type === 'llmResponse');

    // Enhanced always-on-top enforcement for all platforms
    if (process.platform === 'darwin') {
      // macOS: Use screen-saver level consistently for fullscreen overlay
      try {
        window.setAlwaysOnTop(true, 'screen-saver', 2);
        logger.debug(`Set always-on-top with level: screen-saver (level 2)`, { type });
      } catch {
        try { window.setAlwaysOnTop(true, 'pop-up-menu', 2); }
        catch { try { window.setAlwaysOnTop(true, 'floating', 2); }
        catch { window.setAlwaysOnTop(true); }}
      }
    } else if (process.platform === 'win32') {
      window.setAlwaysOnTop(true);
      setTimeout(() => { if (!window.isDestroyed()) window.setAlwaysOnTop(true); }, 100);
      setTimeout(() => { if (!window.isDestroyed()) window.setAlwaysOnTop(true); }, 500);
    } else {
      window.setAlwaysOnTop(true);
      setTimeout(() => { if (!window.isDestroyed()) window.setAlwaysOnTop(true); }, 100);
    }

    // Ensure window appears on all workspaces/desktops including fullscreen spaces
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true
    });
    
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
    
    // Event listeners to maintain always-on-top and fullscreen visibility for ALL windows
    const enforceAlwaysOnTop = () => {
      if (!window.isDestroyed()) {
        try {
          if (process.platform === 'darwin') {
            window.setAlwaysOnTop(true, 'screen-saver', 2);
            window.setVisibleOnAllWorkspaces(true, {
              visibleOnFullScreen: true,
              skipTransformProcessType: true
            });
          } else {
            window.setAlwaysOnTop(true);
            window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
          }
          window.setContentProtection(true);
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
    
    // Periodic enforcement every 3 seconds
    const periodicEnforcement = setInterval(() => {
      if (window.isDestroyed()) {
        clearInterval(periodicEnforcement);
        return;
      }
      enforceAlwaysOnTop();
    }, 3000);
    
    logger.debug('Applied stealth measures with fullscreen overlay support', {
      type,
      platform: process.platform,
      alwaysOnTop: true,
      visibleOnAllWorkspaces: true,
      isOverlayWindow,
      skipTaskbar: true
    });
  }

  positionWindow(window, type) {
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.workArea || display.workAreaSize;
    
    if (this.bindWindows && (type === 'main' || type === 'llmResponse')) {
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
      settings: { x: displayX + (screenWidth - windowWidth) / 2, y: displayY + topMargin }
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

  /**
   * Position the LLM response window at the top-middle of the screen,
   * directly underneath the webcam / MacBook notch.
   * This guarantees candidate eye contact with the webcam while reading responses,
   * completely passing TalentStrokes / bot interview gaze tracking tests.
   */
  positionLLMResponseNearWebcam() {
    const llmWindow = this.windows.get('llmResponse');
    if (!llmWindow || llmWindow.isDestroyed()) return;

    // Respect custom drag-and-drop location if user placed the window
    if (this.hasUserMovedLLMWindow && this.userPositions['llmResponse']) {
      const { x, y } = this.userPositions['llmResponse'];
      try { llmWindow.setPosition(x, y); } catch (_) {}
      return;
    }

    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth } = display.workArea;
    const [currentW, currentH] = llmWindow.getSize();
    const targetW = Math.max(760, currentW);
    const targetH = Math.max(360, currentH);
    if (currentW < 760 || currentH < 360) {
      try { llmWindow.setSize(targetW, targetH); } catch (_) {}
    }

    // Top horizontal center directly under webcam
    const x = Math.round(displayX + (screenWidth - targetW) / 2);
    // 8px below workArea bounds (right beneath MacBook notch / webcam bezel)
    const y = Math.round(displayY + 8);

    llmWindow.setPosition(x, y);
    this.userPositions['llmResponse'] = { x, y };
    logger.debug('Positioned LLM response window directly near webcam', { x, y, width: targetW, height: targetH });
  }

  // Position bound windows (vertical column layout) - Respects user positions and prevents jumping to top
  positionBoundWindows() {
    const mainWindow = this.windows.get('main');
    const llmWindow = this.windows.get('llmResponse');
    
    if (!mainWindow || mainWindow.isDestroyed()) return;
    
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.workArea;
    
    const [mainWidth, mainHeight] = mainWindow.getSize();
    
    // Always anchor LLM response window at the top-middle right near the webcam
    if (llmWindow && !llmWindow.isDestroyed()) {
      this.positionLLMResponseNearWebcam();
    }

    let startX, startY;
    
    if (this.hasUserMovedBoundWindows && this.boundWindowsPosition && typeof this.boundWindowsPosition.x === 'number') {
      // Respect user's custom placed position!
      startX = this.boundWindowsPosition.x;
      startY = this.boundWindowsPosition.y;
    } else if (this.userPositions['main']) {
      startX = this.userPositions['main'].x;
      startY = this.userPositions['main'].y;
      this.hasUserMovedBoundWindows = true;
      this.boundWindowsPosition = { x: startX, y: startY };
    } else {
      // Default main toolbar placed neatly below the response window at center
      const [llmWidth, llmHeight] = llmWindow && !llmWindow.isDestroyed() ? llmWindow.getSize() : [760, 280];
      startX = displayX + Math.round((screenWidth - mainWidth) / 2);
      startY = displayY + 8 + llmHeight + 10;
      this.boundWindowsPosition = { x: startX, y: startY };
      this.userPositions['main'] = { x: startX, y: startY };
    }
    
    const mainX = Math.round(startX);
    const mainY = Math.round(startY);
    mainWindow.setPosition(mainX, mainY);
    
    this.userPositions['main'] = { x: mainX, y: mainY };
    this.debouncedSaveWindowState();
    
    logger.debug('Positioned bound windows', {
      mainPosition: `${mainX},${mainY}`,
      userMoved: this.hasUserMovedBoundWindows
    });
  }

  // Move bound windows (column layout) - Keeps main window wherever user placed it
  moveBoundWindows(deltaX, deltaY) {
    if (!this.bindWindows) return;
    
    const mainWindow = this.windows.get('main');
    const llmWindow = this.windows.get('llmResponse');
    
    if (!mainWindow || mainWindow.isDestroyed()) return;
    
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.workArea;
    
    // Get current positions and sizes
    const [mainX, mainY] = mainWindow.getPosition();
    const [mainWidth, mainHeight] = mainWindow.getSize();
    
    // Calculate new positions with bounds checking
    const newMainX = Math.max(displayX, Math.min(displayX + screenWidth - mainWidth, mainX + deltaX));
    const newMainY = Math.max(displayY, Math.min(displayY + screenHeight - mainHeight, mainY + deltaY));
    
    // Move main window
    mainWindow.setPosition(newMainX, newMainY);
    
    // LLM window follows
    if (llmWindow && !llmWindow.isDestroyed()) {
      const [llmWidth] = llmWindow.getSize();
      const newLlmX = Math.max(displayX, Math.min(displayX + screenWidth - llmWidth, newMainX));
      const newLlmY = newMainY + mainHeight + this.windowGap;
      llmWindow.setPosition(newLlmX, newLlmY);
      this.userPositions['llmResponse'] = { x: newLlmX, y: newLlmY };
    }
    
    // Update stored position
    this.hasUserMovedBoundWindows = true;
    this.boundWindowsPosition.x = newMainX;
    this.boundWindowsPosition.y = newMainY;
    this.userPositions['main'] = { x: newMainX, y: newMainY };
    this.saveWindowState();
    
    logger.debug('Moved bound windows', {
      delta: `${deltaX},${deltaY}`,
      newMainPosition: `${newMainX},${newMainY}`
    });
  }

  loadSavedWindowState() {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, 'utf8');
        const data = JSON.parse(raw);
        if (data && data.main && typeof data.main.x === 'number' && typeof data.main.y === 'number') {
          this.userPositions['main'] = { x: data.main.x, y: data.main.y };
          this.boundWindowsPosition = { x: data.main.x, y: data.main.y };
          this.hasUserMovedBoundWindows = true;
          logger.info('Loaded saved window position for main window', this.userPositions['main']);
        }
      }
    } catch (err) {
      logger.warn('Failed to load saved window state:', err.message);
    }
  }

  saveWindowState() {
    try {
      const mainWindow = this.windows.get('main');
      if (mainWindow && !mainWindow.isDestroyed()) {
        const [x, y] = mainWindow.getPosition();
        this.userPositions['main'] = { x, y };
        this.boundWindowsPosition = { x, y };
        this.hasUserMovedBoundWindows = true;

        const dir = path.dirname(this.stateFilePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(this.stateFilePath, JSON.stringify({
          main: { x, y }
        }, null, 2));
      }
    } catch (err) {
      logger.warn('Failed to save window state:', err.message);
    }
  }

  debouncedSaveWindowState() {
    if (this._saveStateTimer) clearTimeout(this._saveStateTimer);
    this._saveStateTimer = setTimeout(() => {
      this.saveWindowState();
    }, 300);
  }

  startHoverDrag(targetWindowName = 'main') {
    const targetWin = this.windows.get(targetWindowName);
    if (!targetWin || targetWin.isDestroyed()) return { success: false };

    this.stopHoverDrag();

    const initialCursor = screen.getCursorScreenPoint();
    const [winX, winY] = targetWin.getPosition();
    const offsetX = initialCursor.x - winX;
    const offsetY = initialCursor.y - winY;

    this.isHoverDragging = true;
    this.hoverDraggingWindowName = targetWindowName;
    let lastStationaryPoint = { x: initialCursor.x, y: initialCursor.y };
    let stationaryStartTime = Date.now();
    const dwellDurationMs = 3000;

    this.hoverDragInterval = setInterval(() => {
      if (!this.isHoverDragging || targetWin.isDestroyed()) {
        this.stopHoverDrag();
        return;
      }

      const curCursor = screen.getCursorScreenPoint();
      const newX = curCursor.x - offsetX;
      const newY = curCursor.y - offsetY;

      const display = screen.getDisplayNearestPoint(curCursor);
      const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.workArea;
      const [winWidth, winHeight] = targetWin.getSize();

      const clampedX = Math.max(displayX, Math.min(displayX + screenWidth - winWidth, Math.round(newX)));
      const clampedY = Math.max(displayY, Math.min(displayY + screenHeight - winHeight, Math.round(newY)));

      targetWin.setPosition(clampedX, clampedY);

      if (targetWindowName === 'main' && this.bindWindows) {
        const llmWindow = this.windows.get('llmResponse');
        if (llmWindow && !llmWindow.isDestroyed() && llmWindow.isVisible() && !this.hasUserMovedLLMWindow) {
          llmWindow.setPosition(clampedX, clampedY + winHeight + this.windowGap);
        }
      }

      const dist = Math.hypot(curCursor.x - lastStationaryPoint.x, curCursor.y - lastStationaryPoint.y);
      const now = Date.now();

      if (dist > 8) {
        // Cursor is moving - reset stationary timer
        lastStationaryPoint = { x: curCursor.x, y: curCursor.y };
        stationaryStartTime = now;
        try {
          targetWin.webContents.send('hover-drag-status', {
            isStationary: false,
            progress: 0,
            targetWindow: targetWindowName
          });
        } catch (_) {}
      } else {
        // Cursor is stationary at the new location
        const elapsed = now - stationaryStartTime;
        const progress = Math.min(elapsed / dwellDurationMs, 1.0);

        try {
          targetWin.webContents.send('hover-drag-status', {
            isStationary: true,
            progress,
            targetWindow: targetWindowName
          });
        } catch (_) {}

        if (progress >= 1.0) {
          // Unhook after 3 continuous seconds remaining at new location
          this.stopHoverDrag();
          try {
            targetWin.webContents.send('hover-drag-unhooked', {
              x: clampedX,
              y: clampedY,
              targetWindow: targetWindowName
            });
          } catch (_) {}
        }
      }
    }, 20); // 50fps smooth tracking

    return { success: true };
  }

  stopHoverDrag() {
    this.isHoverDragging = false;
    if (this.hoverDragInterval) {
      clearInterval(this.hoverDragInterval);
      this.hoverDragInterval = null;
    }
    const targetName = this.hoverDraggingWindowName || 'main';
    const targetWin = this.windows.get(targetName);
    if (targetWin && !targetWin.isDestroyed()) {
      const [x, y] = targetWin.getPosition();
      this.userPositions[targetName] = { x, y };
      if (targetName === 'main') {
        this.boundWindowsPosition = { x, y };
        this.hasUserMovedBoundWindows = true;
      } else if (targetName === 'llmResponse') {
        this.hasUserMovedLLMWindow = true;
      }
      this.saveWindowState();
    }
    this.hoverDraggingWindowName = null;
    return { success: true };
  }

  showOnCurrentDesktop(win) {
    if (!win || win.isDestroyed()) return;

    if (process.platform === 'darwin') {
      // macOS: prevent space switching and keep visibility stable across all desktops/fullscreens
      win.hide();
      win.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      });

      const setMacOSAlwaysOnTop = () => {
        if (win.isDestroyed()) return;
        try {
          win.setAlwaysOnTop(true, 'screen-saver', 2);
          win.setVisibleOnAllWorkspaces(true, {
            visibleOnFullScreen: true,
            skipTransformProcessType: true
          });
          win.setContentProtection(true);
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
        if (win.isFocusable && win.isFocusable()) {
          win.focus();
        }
        setMacOSAlwaysOnTop();
        setTimeout(() => { if (!win.isDestroyed()) setMacOSAlwaysOnTop(); }, 100);
        setTimeout(() => {
          if (win.isDestroyed()) return;
          setMacOSAlwaysOnTop();
        }, 300);
      }, 50);
    } else {
      // Linux/Windows
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setAlwaysOnTop(true);
      try { win.setContentProtection(true); } catch (e) {}
      if (!win.isVisible()) {
        win.showInactive();
      }
      setTimeout(() => {
        if (win.isDestroyed()) return;
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        win.setAlwaysOnTop(true);
        try { win.setContentProtection(true); } catch (e) {}
      }, 500);
    }

    logger.debug('Showing window on current desktop with enhanced always-on-top and stealth protection', {
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
    // Only check once at startup to verify screen capture enumeration works,
    // avoiding continuous 5-second polling that races with user screen captures.
    this.checkScreenCaptureAvailability().catch(() => {});
    logger.info('Screen capture availability initial check complete');
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

    // Only show the main toolbar window. Auxiliary windows (chat, settings, clipboard, targetBox)
    // are on-demand dialogs and must remain hidden unless specifically opened by the user.
    const mainWindow = this.windows.get('main');
    if (mainWindow && !mainWindow.isDestroyed()) {
      this.showOnCurrentDesktop(mainWindow);
      mainWindow.focus();
    }
    
    this.isVisible = true;
    this.activeWindow = 'main';
    
    logger.info('Main window shown on current desktop');
  }

  hideAllWindows() {
    this.windows.forEach((window) => {
      if (window && !window.isDestroyed()) {
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

    const mainWindow = this.windows.get('main');
    const isMainVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();

    if (isMainVisible) {
      this.hideAllWindows();
      this.isVisible = false;
    } else {
      this.showAllWindows();
      this.isVisible = true;
    }
    
    return this.isVisible;
  }

  setInteractive(interactive) {
    this.isInteractive = interactive;
    
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        if (interactive) {
          // Interactive mode: allow mouse events for all windows
          window.setIgnoreMouseEvents(false);
        } else {
          // Non-interactive mode: enable click-through with forwarding for all windows
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

  setAutoHideMode(enabled) {
    this.isAutoHideMode = Boolean(enabled);
    logger.info('WindowManager Auto-Hide mode updated', { isAutoHideMode: this.isAutoHideMode });
    if (this.isAutoHideMode) {
      this.hideAllWindowsInstant();
      this.startAutoHideWatcher();
    } else {
      this.stopAutoHideWatcher();
    }
  }

  hideAllWindowsInstant() {
    this.autoHideState = 'hidden';
    // Immediately hide all popups and set main bar invisible with zero delay
    const popupsToHide = ['chat', 'llmResponse', 'settings', 'clipboard', 'targetBox'];
    popupsToHide.forEach((type) => {
      const win = this.windows.get(type);
      if (win && !win.isDestroyed()) {
        try {
          win.hide();
        } catch (_) {}
      }
    });
    this.windows.forEach((win, type) => {
      if (!win.isDestroyed()) {
        try {
          win.setOpacity(0);
          win.setIgnoreMouseEvents(true, { forward: true });
        } catch (e) {
          logger.debug('Error setting hidden opacity in hideAllWindowsInstant', { type, error: e.message });
        }
      }
    });
    this.broadcastToAllWindows('autohide-state-changed', { state: 'hidden' });
  }

  startAutoHideWatcher() {
    if (this.autoHideWatcher) clearInterval(this.autoHideWatcher);
    this._autoHideHideTimeout = null;
    this.autoHideWatcher = setInterval(() => {
      this.checkAutoHideMousePosition();
    }, 25);
    logger.info('Started Auto-Hide mouse position watcher (25ms interval)');
  }

  stopAutoHideWatcher() {
    if (this.autoHideWatcher) {
      clearInterval(this.autoHideWatcher);
      this.autoHideWatcher = null;
    }
    if (this._autoHideHideTimeout) {
      clearTimeout(this._autoHideHideTimeout);
      this._autoHideHideTimeout = null;
    }
    this.setAutoHideVisibility('visible');
    logger.info('Stopped Auto-Hide mouse position watcher');
  }

  checkAutoHideMousePosition() {
    if (!this.isAutoHideMode) return;

    const mainWin = this.windows.get('main');
    if (!mainWin || mainWin.isDestroyed()) return;

    const point = screen.getCursorScreenPoint();
    const bounds = mainWin.getBounds();

    // Cache valid bounds so we always have the accurate location
    if (bounds.width > 50 && bounds.height > 15) {
      this._lastKnownBarBounds = { ...bounds };
    }
    const barBounds = this._lastKnownBarBounds || bounds;

    // Strict detection: ONLY when cursor is right on top of the bar (no padding / no proximity reveal)
    const isCursorInBar = (
      point.x >= barBounds.x &&
      point.x <= barBounds.x + barBounds.width &&
      point.y >= barBounds.y &&
      point.y <= barBounds.y + barBounds.height
    );

    if (this.autoHideState === 'visible') {
      if (!isCursorInBar) {
        // Cursor moved away from bar — hide INSTANTLY (0 delay)
        if (this._autoHideHideTimeout) {
          clearTimeout(this._autoHideHideTimeout);
          this._autoHideHideTimeout = null;
        }
        this.setAutoHideVisibility('hidden');
      }
    } else {
      // Currently hidden — ONLY show up when cursor is right on top of it!
      if (isCursorInBar) {
        if (this._autoHideHideTimeout) {
          clearTimeout(this._autoHideHideTimeout);
          this._autoHideHideTimeout = null;
        }
        this.setAutoHideVisibility('visible');
      }
    }
  }

  setAutoHideVisibility(state) {
    if (this.autoHideState === state) return;
    this.autoHideState = state;
    logger.info('Auto-Hide visibility changed', { state });

    if (state === 'hidden') {
      // Completely hide bar & open windows at 0% opacity and ignore mouse events
      this.windows.forEach((win, type) => {
        if (!win.isDestroyed()) {
          try {
            win.setOpacity(0);
            win.setIgnoreMouseEvents(true, { forward: true });
          } catch (e) {
            logger.debug('Error setting hidden opacity', { type, error: e.message });
          }
        }
      });
    } else {
      // Restore visibility and interactive state
      const targetOpacity = this.currentOpacity !== undefined ? this.currentOpacity : 1;
      this.windows.forEach((win, type) => {
        if (!win.isDestroyed()) {
          try {
            win.setOpacity(targetOpacity);
            if (this.isInteractive) {
              win.setIgnoreMouseEvents(false);
            }
          } catch (e) {
            logger.debug('Error restoring opacity', { type, error: e.message });
          }
        }
      });
    }

    this.broadcastToAllWindows('autohide-state-changed', { state });
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
      logger.warn('LLM response blocked due to screen sharing mode');
      return;
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
    llmWindow.webContents.send('display-llm-response', {
      content,
      metadata,
      timestamp: new Date().toISOString()
    });
    
    logger.debug('Showing LLM window');
    this.showOnCurrentDesktop(llmWindow);
    this.isLLMWindowOpen = true;
    this.broadcastToAllWindows('llm-window-state', { isOpen: true });
    const targetOpacity = (this.isAutoHideMode && this.autoHideState === 'hidden')
      ? 0
      : (this.currentOpacity !== undefined ? Math.max(0.20, Math.min(1.0, this.currentOpacity)) : 0.95);
    try {
      llmWindow.setOpacity(targetOpacity);
    } catch (_) {}
    this.positionLLMResponseNearWebcam();
        
    logger.info('LLM response displayed', {
      contentLength: content.length,
      skill: metadata.skill,
      windowVisible: llmWindow.isVisible(),
      boundWindows: this.bindWindows
    });
  }

  showLLMReady() {
    if (this.isScreenBeingShared) {
      logger.warn('LLM ready display blocked due to screen sharing mode');
      return;
    }

    const llmWindow = this.windows.get('llmResponse');
    if (!llmWindow || llmWindow.isDestroyed()) {
      logger.error('LLM response window not available to show ready state');
      return;
    }

    this.showOnCurrentDesktop(llmWindow);
    this.isLLMWindowOpen = true;
    this.broadcastToAllWindows('llm-window-state', { isOpen: true });
    const targetOpacity = (this.isAutoHideMode && this.autoHideState === 'hidden')
      ? 0
      : (this.currentOpacity !== undefined ? Math.max(0.20, Math.min(1.0, this.currentOpacity)) : 0.95);
    try {
      llmWindow.setOpacity(targetOpacity);
    } catch (_) {}
    this.positionLLMResponseNearWebcam();

    // Signal renderer that mic is active and window is ready
    llmWindow.webContents.send('recording-started');
    llmWindow.webContents.send('mic-ready', { isRecording: true });
    logger.info('LLM response window shown and ready immediately on mic enable');
  }

  showLLMLoading(questionPreview = null) {
    if (this.isScreenBeingShared) {
      logger.warn('LLM loading blocked due to screen sharing mode');
      return;
    }

    const llmWindow = this.windows.get('llmResponse');
    if (llmWindow) {
      logger.debug('Showing LLM loading state', { questionPreview });
      llmWindow.webContents.send('show-loading', questionPreview);
      this.showOnCurrentDesktop(llmWindow);
      this.isLLMWindowOpen = true;
      this.broadcastToAllWindows('llm-window-state', { isOpen: true });
      const targetOpacity = (this.isAutoHideMode && this.autoHideState === 'hidden')
        ? 0
        : (this.currentOpacity !== undefined ? Math.max(0.20, Math.min(1.0, this.currentOpacity)) : 0.95);
      try {
        llmWindow.setOpacity(targetOpacity);
      } catch (_) {}
      this.positionLLMResponseNearWebcam();
      
      logger.debug('LLM loading window shown');
    } else {
      logger.error('LLM window not available for loading state');
    }
  }

  hideLLMResponse() {
    if (this.isHoverDragging && this.hoverDraggingWindowName === 'llmResponse') {
      this.stopHoverDrag();
    }
    const llmWindow = this.windows.get('llmResponse');
    if (llmWindow && !llmWindow.isDestroyed()) {
      llmWindow.hide();
    }
    this.isLLMWindowOpen = false;
    this.broadcastToAllWindows('llm-window-state', { isOpen: false });
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

  closeSettings() {
    const settingsWindow = this.windows.get('settings');
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
  }

  async showClipboardWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('toggle-clipboard-popover');
    }
  }

  hideClipboardWindow() {
    const win = this.windows.get('clipboard');
    if (win) win.hide();
  }

  async showTargetBox() {
    if (this.isScreenBeingShared) return;
    const win = await this.createTargetBoxWindow();
    if (win) {
      this.showOnCurrentDesktop(win);
      if (!this.userPositions['targetBox']) {
        this.centerWindow(win);
      } else {
        win.setPosition(this.userPositions['targetBox'].x, this.userPositions['targetBox'].y);
      }
    }
  }

  hideTargetBox() {
    const win = this.windows.get('targetBox');
    if (win) win.hide();
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
    if (!llmWindow || llmWindow.isDestroyed() || this.isScreenBeingShared) return;

    const optimalSize = this.calculateOptimalWindowSize(contentMetrics);
    
    const width = Math.round(Number(optimalSize.width)) || 680;
    const height = Math.round(Number(optimalSize.height)) || 320;
    
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth } = display.workArea;

    // Anchor near webcam at the top center
    const x = Math.round(displayX + (screenWidth - width) / 2);
    const y = Math.round(displayY + 8);

    const [currentX, currentY] = llmWindow.getPosition();
    const [currentW, currentH] = llmWindow.getSize();

    // Atomic setBounds with hysteresis: prevents double-redraw and eliminates window jitter/flicker
    if (Math.abs(currentW - width) >= 2 || Math.abs(currentH - height) >= 2 || Math.abs(currentX - x) >= 2 || Math.abs(currentY - y) >= 2) {
      llmWindow.setBounds({ x, y, width, height });
      this.userPositions['llmResponse'] = { x, y };
      
      logger.debug('LLM window resized atomically', { 
        newSize: `${width}x${height}`,
        pos: `${x},${y}`,
        basedOnContent: !!contentMetrics
      });
    }
  }

  calculateOptimalWindowSize(contentMetrics) {
    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { x: displayX = 0, y: displayY = 0, width: screenWidth, height: screenHeight } = display.workArea || display.workAreaSize;
    
    const llmWindow = this.windows.get('llmResponse');
    const llmY = (llmWindow && !llmWindow.isDestroyed()) ? llmWindow.getPosition()[1] : (displayY + 8);

    // Maximum safe vertical height on screen (leaves bottom safety margin for macOS Dock/Taskbar)
    const maxAvailableHeight = Math.max(300, screenHeight - (llmY - displayY) - 40);

    // Stable locked width (780px standard, 840px for code) to eliminate width jitter/cheating
    const hasCode = contentMetrics && contentMetrics.hasCode;
    const stableWidth = hasCode 
      ? Math.min(Math.round(screenWidth * 0.75), 840)
      : Math.min(Math.round(screenWidth * 0.65), 780);
    const width = Math.max(760, stableWidth);
    let height = 380;
    
    if (contentMetrics && typeof contentMetrics === 'object') {
      const measured = Number(contentMetrics.measuredHeight);
      if (measured && measured > 30) {
        // Dynamic adaptive height: fits the measured content exactly with zero clipping or scrollbars
        const desiredHeight = Math.round(measured) + 4;
        height = Math.min(maxAvailableHeight, Math.max(360, desiredHeight));
      }
    }
    
    return { 
      width: Math.round(Number(width)) || 780, 
      height: Math.round(Number(height)) || 380 
    };
  }

  centerWindow(window) {
    if (!window || window.isDestroyed()) return;
    
    // Find window type
    let windowType = null;
    this.windows.forEach((w, type) => {
      if (w === window) windowType = type;
    });
    
    // Preserve user's last placed position if set
    if (windowType && this.userPositions[windowType]) {
      const pos = this.userPositions[windowType];
      window.setPosition(Math.round(pos.x), Math.round(pos.y));
      return;
    }

    const display = this.currentDisplay || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.workArea || display.workAreaSize;
    const [windowWidth, windowHeight] = window.getSize();
    
    // Center horizontally but position at top margin by default
    const topMargin = 20;
    const x = displayX + Math.round((screenWidth - windowWidth) / 2);
    const y = displayY + topMargin;
    
    window.setPosition(x, y);
    if (windowType) {
      this.userPositions[windowType] = { x, y };
    }
  }

  setOpacity(opacity) {
    const val = typeof opacity === 'number' ? Math.max(0.2, Math.min(1.0, opacity)) : 1.0;
    this.currentOpacity = val;
    this.broadcastToAllWindows('update-opacity', val);

    // Apply directly to windows with safe floor for the teleprompter window
    this.windows.forEach((win, type) => {
      if (!win.isDestroyed()) {
        try {
          if (type === 'llmResponse') {
            const teleprompterOpacity = (this.isAutoHideMode && this.autoHideState === 'hidden') 
              ? 0 
              : Math.max(0.20, Math.min(1.0, val));
            win.setOpacity(teleprompterOpacity);
          } else {
            win.setOpacity(val);
          }
        } catch (_) {}
      }
    });
  }

  setTheme(theme) {
    const t = (theme === 'light') ? 'light' : 'dark';
    this.currentTheme = t;
    this.broadcastToAllWindows('theme-changed', t);
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
    if (this.bindWindows) {
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
        const topMargin = 20;
        
        if (this.userPositions[type]) {
          newX = this.userPositions[type].x;
          newY = this.userPositions[type].y;
        } else {
          switch (type) {
            case 'main':
              newX = displayX + 50;
              newY = displayY + topMargin;
              break;
            case 'chat':
              newX = displayX + displayWidth - windowWidth - 50;
              newY = displayY + topMargin;
              break;
            case 'skills':
              newX = displayX + 50;
              newY = displayY + topMargin + 100;
              break;
            case 'llmResponse':
              newX = displayX + (displayWidth - windowWidth) / 2;
              newY = displayY + topMargin;
              break;
            case 'settings':
              newX = displayX + (displayWidth - windowWidth) / 2;
              newY = displayY + topMargin;
              break;
            default:
              newX = displayX + 100;
              newY = displayY + topMargin;
          }
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

  handleRecordingStarted(options = {}) {
    this.isRecording = true;
    if (options && options.target === 'chat') {
      this.showChatWindow();
    } else {
      this.showLLMReady();
    }
    // Notify all windows about recording state
    this.broadcastToAllWindows('recording-started');
    logger.debug('Recording started', { target: options ? options.target : undefined });
  }

  handleRecordingStopped() {
    this.isRecording = false;
    // Notify all windows about recording state
    this.broadcastToAllWindows('recording-stopped');
    logger.debug('Recording stopped, chat window kept visible for the response');
  }

  broadcastSkillChange(skill) {
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        window.webContents.send('skill-changed', { skill });
      }
    });
    
    logger.info('Skill change broadcasted to all windows', { 
      skill,
      windowCount: this.windows.size 
    });
    }
}

module.exports = new WindowManager();
