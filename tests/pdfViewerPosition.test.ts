import { describe, expect, test } from 'bun:test';
import {
  findFocalPageNumber,
  keepViewerPositionAfter,
  shouldRestoreViewerPosition,
} from '../src/lib/pdf/viewerPosition';

describe('PDF viewer position restoration', () => {
  test('does not restore or recenter when only the active page changes', () => {
    expect(shouldRestoreViewerPosition(true, false, false)).toBe(false);
  });

  test('restores position when a document opens or the view mode changes', () => {
    expect(shouldRestoreViewerPosition(true, true, false)).toBe(true);
    expect(shouldRestoreViewerPosition(true, false, true)).toBe(true);
  });

  test('restores the exact viewer position after a focused text editor is removed', () => {
    const viewer = { scrollLeft: 125, scrollTop: 8450 };
    const editor = {
      closest: (selector: string) => (selector === '.pdf-viewer-viewport' ? viewer : null),
    };
    const scheduled: Array<() => void> = [];

    keepViewerPositionAfter(
      editor as unknown as HTMLElement,
      () => {
        viewer.scrollLeft = 900;
        viewer.scrollTop = 13200;
      },
      (restore) => scheduled.push(restore)
    );
    scheduled.forEach((restore) => restore());

    expect(viewer).toEqual({ scrollLeft: 125, scrollTop: 8450 });
  });

  test('uses the page at the reading focal line when fitting after a resize', () => {
    const page = findFocalPageNumber(
      100,
      800,
      [
        { pageNumber: 17, top: -350, bottom: 50 },
        { pageNumber: 18, top: 72, bottom: 672 },
        { pageNumber: 19, top: 694, bottom: 1294 },
      ],
      17
    );

    expect(page).toBe(18);
  });
});
