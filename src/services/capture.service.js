const { desktopCapturer, screen, systemPreferences } = require('electron');
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
    const targetDisplay = this._getTargetDisplay(options.displayId);
    const { width, height } = targetDisplay.size || { width: 1920, height: 1080 };

    // On macOS 14+ (Sonoma), calling desktopCapturer.getSources() without
    // screen recording permission can crash the Electron helper process.
    // Check permission status first and give a clear error if denied.
    if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus) {
      try {
        const status = systemPreferences.getMediaAccessStatus('screen');
        if (status === 'denied') {
          throw new Error(
            'Screen recording permission denied. ' +
            'Go to System Settings → Privacy & Security → Screen Recording, ' +
            'find OpenCluely in the list and check the box, then restart the app.'
          );
        }
      } catch (e) {
        // getMediaAccessStatus('screen') may throw on older macOS or Electron versions.
        // In that case, proceed with the capture attempt — it may still work.
        if (e.message && e.message.includes('Screen recording permission denied')) {
          throw e;
        }
        logger.warn('Could not check screen recording permission', { error: e.message });
      }
    }

    let sources;
    try {
      sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height }
      });
    } catch (e) {
      // desktopCapturer.getSources() can crash the app on macOS 14+ when
      // permission hasn't been granted. If it throws instead of crashing,
      // we catch it here. On some Electron versions the crash is unrecoverable
      // (segfault in the GPU process), so we also check below whether the
      // call left the app in a broken state.
      throw new Error(
        `Screen capture failed: ${e.message}. ` +
        'Make sure Screen Recording permission is granted in System Settings.'
      );
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

    const image = source.thumbnail;
    if (!image) throw new Error('Failed to capture screen thumbnail');

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
