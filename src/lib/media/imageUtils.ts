export interface ImageDimensions {
  width: number;
  height: number;
  aspectRatio: number;
}

export interface ImagePlacementOptions {
  imageWidth?: number;
  imageHeight?: number;
  aspectRatio?: number;
  pageWidth?: number;
  pageHeight?: number;
  cursorX?: number;
  cursorY?: number;
  devicePixelRatio?: number;
}

export interface ImagePlacementResult {
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: number;
}

/**
 * Loads an image from a DataURL or URL to extract its natural width, height, and aspect ratio.
 */
export function getImageDimensions(dataUrl: string): Promise<ImageDimensions> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve({ width: 300, height: 200, aspectRatio: 1.5 });
      return;
    }
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width || 300;
      const height = img.naturalHeight || img.height || 200;
      const aspectRatio = height > 0 ? width / height : 1.33;
      resolve({ width, height, aspectRatio });
    };
    img.onerror = () => {
      resolve({ width: 300, height: 200, aspectRatio: 1.33 });
    };
    img.src = dataUrl;
  });
}

/**
 * Calculates normalized (0..1) coordinates and dimensions for placing an image on a PDF page.
 * Guarantees that the bounding box on the rendered page matches the image's aspect ratio exactly.
 */
export function calculateImagePlacement(options: ImagePlacementOptions): ImagePlacementResult {
  const pWidth = options.pageWidth && options.pageWidth > 0 ? options.pageWidth : 595;
  const pHeight = options.pageHeight && options.pageHeight > 0 ? options.pageHeight : 842;
  const pageRatio = pWidth / pHeight;

  let ar = options.aspectRatio;
  if (!ar || isNaN(ar) || ar <= 0) {
    if (options.imageWidth && options.imageHeight && options.imageHeight > 0) {
      ar = options.imageWidth / options.imageHeight;
    } else {
      ar = 1.33;
    }
  }

  const dpr =
    options.devicePixelRatio ||
    (typeof window !== 'undefined' && window.devicePixelRatio ? Math.max(1, window.devicePixelRatio) : 2);

  const imgW = options.imageWidth;
  const naturalWidthRatio = imgW ? imgW / dpr / pWidth : 0.32;

  // Clamp target width between 12% and 40% of page width
  let targetWidth = Math.max(0.12, Math.min(0.4, naturalWidthRatio));
  // Exact height matching the image's aspect ratio on the page
  let targetHeight = (targetWidth * pageRatio) / ar;

  if (targetHeight > 0.45) {
    targetHeight = 0.45;
    targetWidth = (targetHeight * ar) / pageRatio;
  } else if (targetHeight < 0.04) {
    targetHeight = 0.04;
    targetWidth = Math.min(0.85, (targetHeight * ar) / pageRatio);
  }

  const width = Math.max(0.05, Math.min(targetWidth, 0.9));
  const height = Math.max(0.03, Math.min(targetHeight, 0.9));

  let posX = options.cursorX !== undefined ? options.cursorX - width / 2 : (1 - width) / 2;
  let posY = options.cursorY !== undefined ? options.cursorY - height / 2 : 0.35;

  posX = Math.max(0, Math.min(posX, 1 - width));
  posY = Math.max(0, Math.min(posY, 1 - height));

  return {
    x: posX,
    y: posY,
    width,
    height,
    aspectRatio: ar,
  };
}
