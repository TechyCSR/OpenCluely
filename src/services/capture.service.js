const { desktopCapturer, screen, systemPreferences, nativeImage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const logger = require('../core/logger').createServiceLogger('CAPTURE');

class CaptureService {
  constructor() {
    this.isProcessing = false;
  }

  listDisplays() {
    try {
      const displays = screen.getAllDisplays().map(d => ({
        id: d.id,
        bounds: d.bounds,
        size: d.size,
        scaleFactor: d.scaleFactor,
        rotation: d.rotation,
        touchSupport: d.touchSupport || 'unknown'
      }));
      return { success: true, displays };
    } catch (error) {
      logger.error('Failed to list displays', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Capture screenshot and return an image buffer.
   * options: { displayId?: number, area?: { x, y, width, height } }
   */
  async captureAndProcess(options = {}) {
    if (this.isProcessing) throw new Error('Capture already in progress');
    this.isProcessing = true;
    const startTime = Date.now();
    try {
      const { image, metadata } = await this.captureScreenshot(options);

      // Crop if area specified
      let finalImage = image;
      if (options.area && this._isValidArea(options.area)) {
        try {
          finalImage = image.crop(options.area);
        } catch (e) {
          logger.warn('Crop failed, returning full image', { error: e.message, area: options.area });
        }
      }

      const buffer = finalImage.toPNG();
      logger.logPerformance('Screenshot capture', startTime, {
        bytes: buffer.length,
        dimensions: finalImage.getSize()
      });

      return {
        imageBuffer: buffer,
        mimeType: 'image/png',
        metadata: {
          timestamp: new Date().toISOString(),
          source: metadata,
          processingTime: Date.now() - startTime
        }
      };
    } finally {
      this.isProcessing = false;
    }
  }

  async captureScreenshot(options = {}) {
    if (process.platform === 'darwin' && systemPreferences?.getMediaAccessStatus) {
      const status = systemPreferences.getMediaAccessStatus('screen');
      logger.info('macOS Screen Recording permission status', { status });
      if (status === 'denied' || status === 'restricted') {
        const appIdentity = process.defaultApp ? 'Electron (development)' : 'OpenCluely';
        const restartTarget = process.defaultApp ? 'npm start' : 'OpenCluely';
        throw new Error(`Screen Recording permission is not enabled for ${appIdentity}. Open System Settings → Privacy & Security → Screen & System Audio Recording, enable ${appIdentity}, then fully quit and restart ${restartTarget}.`);
      }
    }

    const targetDisplay = this._getTargetDisplay(options.displayId);
    const { width, height } = targetDisplay.size || { width: 1920, height: 1080 };

    let sources;
    try {
      sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height }
      });
    } catch (error) {
      logger.error('Screen source enumeration failed', { reason: error.message });
      if (process.platform === 'darwin') {
        return this._captureWithMacOSNativeTool(targetDisplay, error.message);
      }
      throw new Error(`Screen capture could not start: ${error.message}`);
    }

    if (sources.length === 0) {
      throw new Error('No screen sources available for capture');
    }

    // Find source matching the target display by comparing sizes as heuristic
    let source = sources[0];
    const match = sources.find(s => {
      const size = s.thumbnail.getSize();
      return size.width === width && size.height === height;
    });
    if (match) source = match;

    let image = source.thumbnail;
    if (!image || image.isEmpty()) {
      logger.warn('Electron returned an empty screen thumbnail', {
        sourceCount: sources.length,
        sources: sources.map((item) => ({
          id: item.id,
          name: item.name,
          size: item.thumbnail?.getSize?.() || null,
          empty: !item.thumbnail || item.thumbnail.isEmpty()
        }))
      });
      if (process.platform === 'darwin') {
        return this._captureWithMacOSNativeTool(targetDisplay, 'Electron returned an empty thumbnail');
      }
      throw new Error('Screen capture returned an empty image. Check screen-capture permission and try again.');
    }

    logger.debug('Screenshot captured successfully', {
      sourceName: source.name,
      imageSize: image.getSize()
    });

    return {
      image,
      metadata: {
        displayId: targetDisplay.id,
        sourceName: source.name,
        dimensions: image.getSize(),
        captureTime: new Date().toISOString()
      }
    };
  }

  /**
   * macOS can grant Screen Recording permission while Electron's
   * desktopCapturer still returns empty thumbnails (observed on Intel Macs
   * with newer macOS releases). Use the OS-provided screencapture utility as
   * a narrow fallback only in that state. It inherits the same macOS privacy
   * permission and creates a temporary file that is removed immediately.
   */
  _captureWithMacOSNativeTool(targetDisplay, trigger) {
    return new Promise((resolve, reject) => {
      const displays = screen.getAllDisplays();
      const displayIndex = Math.max(0, displays.findIndex((display) => display.id === targetDisplay.id));
      const tempPath = path.join(os.tmpdir(), `opencluely-screen-${process.pid}-${Date.now()}.png`);
      const cleanup = () => fs.unlink(tempPath, () => {});

      execFile('/usr/sbin/screencapture', ['-x', '-t', 'png', '-D', String(displayIndex + 1), tempPath], {
        timeout: 10000,
        windowsHide: true
      }, (error, _stdout, stderr) => {
        if (error) {
          cleanup();
          logger.error('macOS native screenshot fallback failed', {
            trigger,
            error: error.message,
            stderr: String(stderr || '').trim()
          });
          reject(new Error('Screen capture failed even though macOS reports permission granted. Fully quit Electron, re-enable Electron under Screen & System Audio Recording, then relaunch.'));
          return;
        }

        try {
          const image = nativeImage.createFromPath(tempPath);
          cleanup();
          if (!image || image.isEmpty()) {
            throw new Error('macOS screencapture returned an empty image');
          }
          logger.info('Captured screenshot with macOS native fallback', {
            trigger,
            displayId: targetDisplay.id,
            dimensions: image.getSize()
          });
          resolve({
            image,
            metadata: {
              displayId: targetDisplay.id,
              sourceName: 'macOS native screencapture fallback',
              dimensions: image.getSize(),
              captureTime: new Date().toISOString(),
              fallback: true
            }
          });
        } catch (readError) {
          cleanup();
          logger.error('Failed to read macOS native screenshot fallback', { error: readError.message, trigger });
          reject(new Error(`Screen capture fallback failed: ${readError.message}`));
        }
      });
    });
  }

  _getTargetDisplay(displayId) {
    const all = screen.getAllDisplays();
    if (!all || all.length === 0) return screen.getPrimaryDisplay();
    if (displayId == null) return screen.getPrimaryDisplay();
    const found = all.find(d => d.id === displayId);
    return found || screen.getPrimaryDisplay();
  }

  _isValidArea(area) {
    return area && Number.isFinite(area.x) && Number.isFinite(area.y) &&
      Number.isFinite(area.width) && Number.isFinite(area.height) &&
      area.width > 0 && area.height > 0;
  }
}

module.exports = new CaptureService();
