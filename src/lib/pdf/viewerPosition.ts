export const shouldRestoreViewerPosition = (
  hasDocument: boolean,
  isNewDocument: boolean,
  isNewViewMode: boolean
) => hasDocument && (isNewDocument || isNewViewMode);

export interface PageViewportBounds {
  pageNumber: number;
  top: number;
  bottom: number;
}

/**
 * Returns the page the reader is looking at, using the same upper-viewport
 * focal line used by continuous reading. This is more reliable than a page
 * value that is still waiting for a React state update after scrolling.
 */
export const findFocalPageNumber = (
  containerTop: number,
  containerHeight: number,
  pages: readonly PageViewportBounds[],
  fallbackPage: number
) => {
  const focalLine = containerTop + Math.min(containerHeight * 0.35, 240);
  let visiblePage = fallbackPage;
  let maxOverlap = 0;

  for (const page of pages) {
    if (page.bottom < containerTop || page.top > containerTop + containerHeight) continue;

    if (page.top <= focalLine && page.bottom > focalLine) {
      return page.pageNumber;
    }

    const overlap = Math.max(
      0,
      Math.min(page.bottom, containerTop + containerHeight) - Math.max(page.top, containerTop)
    );
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      visiblePage = page.pageNumber;
    }
  }

  return visiblePage;
};

type RestoreScheduler = (restore: () => void) => void;

const scheduleViewerPositionRestore: RestoreScheduler = (restore) => {
  queueMicrotask(restore);
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
};

export const keepViewerPositionAfter = (
  element: HTMLElement,
  action: () => void,
  schedule: RestoreScheduler = scheduleViewerPositionRestore
) => {
  const viewer = element.closest<HTMLElement>('.pdf-viewer-viewport');
  if (!viewer) {
    action();
    return;
  }

  const scrollLeft = viewer.scrollLeft;
  const scrollTop = viewer.scrollTop;
  const restore = () => {
    viewer.scrollLeft = scrollLeft;
    viewer.scrollTop = scrollTop;
  };

  action();
  restore();
  schedule(restore);
};

export const focusWithoutMovingViewer = (element: HTMLElement) => {
  keepViewerPositionAfter(element, () => element.focus({ preventScroll: true }));
};
