import { commands } from '../../lib/bindings';
import { unwrapNativeResult } from './runtime';

export async function readClipboardText(): Promise<string | null> {
  return unwrapNativeResult(await commands.readTextFromClipboard());
}

export async function tauriCopyImageToClipboard(pngDataUrl: string): Promise<boolean> {
  try {
    const res = await commands.copyImageToClipboard(pngDataUrl);
    return res;
  } catch (err) {
    console.error('Tauri native copy image error:', err);
    return false;
  }
}
export async function tauriCopyTextToClipboard(text: string): Promise<boolean> {
  try {
    const res = await commands.copyTextToClipboard(text);
    return res;
  } catch (err) {
    console.error('Tauri native copy text error:', err);
    return false;
  }
}
