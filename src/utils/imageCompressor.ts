/**
 * COTRAC Signature Image Compressor
 * Reduces Firestore document payload size by 85-95% by converting
 * raw oversized canvases and camera frames into lightweight, optimized JPEGs.
 */

export function compressCanvas(
  sourceCanvas: HTMLCanvasElement, 
  maxWidth = 360, 
  maxHeight = 180, 
  quality = 0.72
): string {
  try {
    let width = sourceCanvas.width;
    let height = sourceCanvas.height;

    if (width === 0 || height === 0) {
      return sourceCanvas.toDataURL('image/jpeg', quality);
    }

    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const targetCanvas = document.createElement('canvas');
    targetCanvas.width = width;
    targetCanvas.height = height;

    const ctx = targetCanvas.getContext('2d');
    if (!ctx) {
      return sourceCanvas.toDataURL('image/jpeg', quality);
    }

    // Fill clean white background so transparent canvas areas don't render black in JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(sourceCanvas, 0, 0, width, height);

    return targetCanvas.toDataURL('image/jpeg', quality);
  } catch (err) {
    console.warn("Canvas compression fallback:", err);
    return sourceCanvas.toDataURL('image/jpeg', quality);
  }
}

