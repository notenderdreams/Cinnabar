import type { ReadingTheme } from '../types/index';

/** Themes whose PDF filters invert the page color space. */
export function usesInvertedColorSpace(theme: ReadingTheme) {
  return theme === 'invert' || theme === 'oled' || theme === 'nord' || theme === 'matrix';
}
