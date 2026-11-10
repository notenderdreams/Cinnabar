import type { AiChatAttachment } from '../types';
import { calculateCropSize } from './regionContext';

export function getClipboardImageFiles(clipboard: DataTransfer): File[] {
  const images = Array.from(clipboard.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .flatMap((item) => { const file = item.getAsFile(); return file ? [file] : []; });
  return images.length ? images : Array.from(clipboard.files).filter((file) => file.type.startsWith('image/'));
}

/** Normalize clipboard images for the existing CLI PNG attachment boundary. */
export async function createAiClipboardAttachment(file: File): Promise<AiChatAttachment> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not read the pasted image.'));
      image.src = url;
    });
    const { width, height } = calculateCropSize(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the pasted image.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return { id: crypto.randomUUID(), type: 'image', dataUrl: canvas.toDataURL('image/png'), width, height };
  } finally { URL.revokeObjectURL(url); }
}
