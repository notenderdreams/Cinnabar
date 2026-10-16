export type ReadingTheme = 'default' | 'invert' | 'oled' | 'sepia' | 'nord' | 'matrix';

export interface HighlightColorPreset {
  id: string;
  name: string;
  color: string;
  hex: string;
  textColor: string;
}

export interface ThemeSettings {
  theme: ReadingTheme;
  brightness: number; // 50 - 150 (default 100)
  contrast: number; // 50 - 150 (default 100)
  grayscale: number; // 0 - 100 (default 0)
  sepiaAmount: number; // 0 - 100 (default 0)
  invertImages: boolean; // whether to preserve or invert attached images
}
