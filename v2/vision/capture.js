const { desktopCapturer, screen } = require("electron");

/**
 * High-Speed Vision & Screen Capture Pipeline
 * Captures primary or target display at native device pixel ratio.
 * Supports full screen capture or region cropping without coordinate distortion.
 */
class VisionCapture {
  /**
   * Capture the primary display.
   * @param {Object} [cropRect] - Optional { x, y, width, height } in physical or logical coordinates
   * @returns {Promise<{ base64: string, dataUrl: string, width: number, height: number }>}
   */
  static async captureScreen(cropRect = null) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    const scaleFactor = primaryDisplay.scaleFactor || 1;

    // Request native resolution thumbnail matching physical pixels
    const physicalWidth = Math.round(width * scaleFactor);
    const physicalHeight = Math.round(height * scaleFactor);

    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: physicalWidth,
        height: physicalHeight
      }
    });

    if (!sources || sources.length === 0) {
      throw new Error("No screen capture source available");
    }

    // Match primary display source if possible, else first source
    let targetSource = sources.find(s => s.display_id === String(primaryDisplay.id)) || sources[0];
    let image = targetSource.thumbnail;

    // Apply crop if requested
    if (cropRect && cropRect.width > 10 && cropRect.height > 10) {
      const cropX = Math.max(0, Math.round(cropRect.x * scaleFactor));
      const cropY = Math.max(0, Math.round(cropRect.y * scaleFactor));
      const cropW = Math.min(image.getSize().width - cropX, Math.round(cropRect.width * scaleFactor));
      const cropH = Math.min(image.getSize().height - cropY, Math.round(cropRect.height * scaleFactor));

      if (cropW > 0 && cropH > 0) {
        image = image.crop({
          x: cropX,
          y: cropY,
          width: cropW,
          height: cropH
        });
      }
    }

    const pngBuffer = image.toPNG();
    const base64 = pngBuffer.toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;

    return {
      base64,
      dataUrl,
      width: image.getSize().width,
      height: image.getSize().height
    };
  }
}

module.exports = { VisionCapture };
