import { describe, expect, test } from 'bun:test';
import { fitPageZoom } from '../src/lib/pdf/fitViewport';

describe('fit a page to its pane', () => {
  test('fits portrait pages by height and landscape pages by width', () => {
    expect(fitPageZoom(1000, 700, 595, 842)).toBeCloseTo(652 / 842);
    expect(fitPageZoom(500, 900, 842, 595)).toBeCloseTo(452 / 842);
  });

  test('allows a fit smaller than ordinary zoom controls in a narrow split', () => {
    const zoom = fitPageZoom(240, 800, 595, 842);
    expect(zoom).toBeLessThan(.4);
    expect(595 * zoom).toBeLessThanOrEqual(192);
    expect(842 * zoom).toBeLessThanOrEqual(752);
  });

  test('responds to pane resizing and caps enlargement', () => {
    expect(fitPageZoom(450, 900, 595, 842)).toBeLessThan(fitPageZoom(700, 900, 595, 842));
    expect(fitPageZoom(6000, 6000, 595, 842)).toBe(3.5);
  });
});
