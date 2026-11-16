import { describe, expect, test } from 'bun:test';
import { fitPageWidthZoom, fitPageZoom } from '../src/lib/pdf/fitViewport';
import { MAX_ZOOM } from '../src/lib/pdf/zoomLimits';

describe('fit a page to its pane', () => {
  test('fits portrait pages by height and landscape pages by width', () => {
    expect(fitPageZoom(1000, 700, 595, 842)).toBeCloseTo(652 / 842);
    expect(fitPageZoom(500, 900, 842, 595)).toBeCloseTo(452 / 842);
  });

  test('allows a fit smaller than ordinary zoom controls in a narrow split', () => {
    const zoom = fitPageZoom(240, 800, 595, 842);
    expect(zoom).toBeLessThan(0.4);
    expect(595 * zoom).toBeLessThanOrEqual(192);
    expect(842 * zoom).toBeLessThanOrEqual(752);
  });

  test('responds to pane resizing and caps enlargement', () => {
    expect(fitPageZoom(450, 900, 595, 842)).toBeLessThan(fitPageZoom(700, 900, 595, 842));
    expect(fitPageZoom(60000, 60000, 595, 842)).toBe(MAX_ZOOM);
    expect(MAX_ZOOM).toBe(9);
  });
});

describe('fit a page width to its pane', () => {
  test('scales so the page width fills the pane minus the page-fit gutter, regardless of height', () => {
    expect(fitPageWidthZoom(1000, 595)).toBeCloseTo(952 / 595);
    expect(fitPageWidthZoom(1000, 842)).toBeCloseTo(952 / 842);
  });

  test('is larger than a whole-page fit for a portrait page in a wide pane', () => {
    expect(fitPageWidthZoom(1000, 595)).toBeGreaterThan(fitPageZoom(1000, 700, 595, 842));
  });

  test('stays within the zoom limits', () => {
    expect(fitPageWidthZoom(100000, 595)).toBe(MAX_ZOOM);
    expect(fitPageWidthZoom(10, 595)).toBeGreaterThan(0);
  });
});
