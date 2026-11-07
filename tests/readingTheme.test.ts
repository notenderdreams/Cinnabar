import { describe, expect, test } from 'bun:test';
import { usesInvertedColorSpace } from '../src/lib/theme/readingTheme';

describe('usesInvertedColorSpace', () => {
  test('keeps annotation colors aligned with every dark PDF filter', () => {
    expect(['invert', 'oled', 'nord', 'matrix'].every(usesInvertedColorSpace)).toBe(true);
    expect(['default', 'sepia'].some(usesInvertedColorSpace)).toBe(false);
  });
});
