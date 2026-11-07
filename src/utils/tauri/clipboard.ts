import { commands } from '../../lib/bindings';
import { isTauri } from './runtime';

export async function tauriCopyImageToClipboard(pngDataUrl: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const res = await commands.copyImageToClipboard(pngDataUrl);
    return res;
  } catch (err) {
    console.error('Tauri native copy image error:', err);
    return false;
  }
}
export async function tauriCopyTextToClipboard(text: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const res = await commands.copyTextToClipboard(text);
    return res;
  } catch (err) {
    console.error('Tauri native copy text error:', err);
    return false;
  }
}
