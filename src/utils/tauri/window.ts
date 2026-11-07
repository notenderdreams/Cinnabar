import type React from 'react';
import { commands } from '../../lib/bindings';
import { isTauri, unwrapNativeResult } from './runtime';

export async function startDraggingWindow(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().startDragging();
  } catch (err) {
    console.warn('Tauri startDragging failed:', err);
  }
}

export async function toggleMaximizeWindow(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().toggleMaximize();
  } catch (err) {
    console.warn('Tauri toggleMaximize failed:', err);
  }
}

export async function toggleFullscreenWindow(): Promise<void> {
  if (isTauri()) {
    try {
      const res = await commands.toggleFullscreenWindow();
      unwrapNativeResult(res);
      return;
    } catch (err) {
      console.warn('Native toggleFullscreenWindow command failed, falling back to window API:', err);
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        const isFull = await win.isFullscreen();
        await win.setFullscreen(!isFull);
        return;
      } catch (err2) {
        console.warn('Tauri window API setFullscreen failed:', err2);
      }
    }
  }

  // Browser / WebKit fallback
  try {
    if (typeof document !== 'undefined') {
      const doc = document as unknown as {
        fullscreenElement?: Element | null;
        webkitFullscreenElement?: Element | null;
        mozFullScreenElement?: Element | null;
        msFullscreenElement?: Element | null;
        exitFullscreen?: () => Promise<void>;
        webkitExitFullscreen?: () => Promise<void>;
        mozCancelFullScreen?: () => Promise<void>;
        msExitFullscreen?: () => Promise<void>;
      };
      const docEl = document.documentElement as unknown as {
        requestFullscreen?: () => Promise<void>;
        webkitRequestFullscreen?: () => Promise<void>;
        mozRequestFullScreen?: () => Promise<void>;
        msRequestFullscreen?: () => Promise<void>;
      };

      const isFullScreen = !!(
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement
      );

      if (!isFullScreen) {
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        } else if (docEl.mozRequestFullScreen) {
          await docEl.mozRequestFullScreen();
        } else if (docEl.msRequestFullscreen) {
          await docEl.msRequestFullscreen();
        }
      } else {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          await doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          await doc.msExitFullscreen();
        }
      }
    }
  } catch (err) {
    console.warn('Browser toggleFullscreen failed:', err);
  }
}

export async function exitFullscreenWindow(): Promise<void> {
  if (isTauri()) {
    try {
      const res = await commands.exitFullscreenWindow();
      unwrapNativeResult(res);
      return;
    } catch (err) {
      console.warn('Native exitFullscreenWindow command failed, falling back to window API:', err);
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        const isFull = await win.isFullscreen();
        if (isFull) {
          await win.setFullscreen(false);
        }
        return;
      } catch (err2) {
        console.warn('Tauri window API exitFullscreen failed:', err2);
      }
    }
  }

  // Browser / WebKit fallback
  try {
    if (typeof document !== 'undefined') {
      const doc = document as unknown as {
        fullscreenElement?: Element | null;
        webkitFullscreenElement?: Element | null;
        mozFullScreenElement?: Element | null;
        msFullscreenElement?: Element | null;
        exitFullscreen?: () => Promise<void>;
        webkitExitFullscreen?: () => Promise<void>;
        mozCancelFullScreen?: () => Promise<void>;
        msExitFullscreen?: () => Promise<void>;
      };

      const isFullScreen = !!(
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement
      );

      if (isFullScreen) {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          await doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          await doc.msExitFullscreen();
        }
      }
    }
  } catch (err) {
    console.warn('Browser exitFullscreen failed:', err);
  }
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
