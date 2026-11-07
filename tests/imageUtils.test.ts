import { describe, expect, test } from 'bun:test';
import { calculateImagePlacement } from '../src/lib/media/imageUtils';

describe('calculateImagePlacement', () => {
  test('guarantees rendered pixel aspect ratio matches image aspect ratio exactly', () => {
    const pageWidth = 595;
    const pageHeight = 842;
    const testRatios = [1.0, 1.333, 1.7778, 0.5625, 2.5, 0.75];

    for (const ar of testRatios) {
      const placement = calculateImagePlacement({
        aspectRatio: ar,
        pageWidth,
        pageHeight,
        imageWidth: 600,
        imageHeight: 600 / ar,
      });

      const renderedPixelWidth = placement.width * pageWidth;
      const renderedPixelHeight = placement.height * pageHeight;
      const renderedRatio = renderedPixelWidth / renderedPixelHeight;

      expect(Math.abs(renderedRatio - ar)).toBeLessThan(0.001);
      expect(placement.width).toBeGreaterThan(0);
      expect(placement.width).toBeLessThanOrEqual(1);
      expect(placement.height).toBeGreaterThan(0);
      expect(placement.height).toBeLessThanOrEqual(1);
    }
  });

  test('centers placement around cursor coordinates within page bounds', () => {
    const placement = calculateImagePlacement({
      aspectRatio: 1.0,
      pageWidth: 600,
      pageHeight: 800,
      cursorX: 0.5,
      cursorY: 0.5,
    });

    const expectedX = 0.5 - placement.width / 2;
    const expectedY = 0.5 - placement.height / 2;
    expect(Math.abs(placement.x - expectedX)).toBeLessThan(0.001);
    expect(Math.abs(placement.y - expectedY)).toBeLessThan(0.001);
  });

  test('clamps placement when cursor is near page edges', () => {
    const placement = calculateImagePlacement({
      aspectRatio: 1.0,
      pageWidth: 600,
      pageHeight: 800,
      cursorX: 0.99,
      cursorY: 0.99,
    });

    expect(placement.x + placement.width).toBeLessThanOrEqual(1.0001);
    expect(placement.y + placement.height).toBeLessThanOrEqual(1.0001);
  });
});
