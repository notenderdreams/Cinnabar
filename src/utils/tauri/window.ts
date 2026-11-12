import type React from 'react';
import { commands } from '../../lib/bindings';
import { unwrapNativeResult } from './runtime';

export async function startDraggingWindow(): Promise<void> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().startDragging();
  } catch (err) {
    console.warn('Tauri startDragging failed:', err);
  }
}

export async function toggleMaximizeWindow(): Promise<void> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().toggleMaximize();
  } catch (err) {
    console.warn('Tauri toggleMaximize failed:', err);
  }
}

export async function toggleFullscreenWindow(): Promise<void> {
  try { unwrapNativeResult(await commands.toggleFullscreenWindow()); }
  catch (error) { console.warn('Native fullscreen toggle failed:', error); }
}

export async function exitFullscreenWindow(): Promise<void> {
  try { unwrapNativeResult(await commands.exitFullscreenWindow()); }
  catch (error) { console.warn('Native fullscreen exit failed:', error); }
}

export function handleTitlebarMouseDown(e: React.MouseEvent): void {
  if (e.button !== 0) return;
  const target = e.target as HTMLElement | null;
  if (!target) return;
  if (target.closest('button, input, textarea, select, a, [role="button"], .app-no-drag, [data-tauri-drag-region="false"]')) {
    return;
  }
  if (e.detail === 2) {
    void toggleMaximizeWindow();
    return;
  }
  void startDraggingWindow();
}
