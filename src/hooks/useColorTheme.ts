import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import type { ReadingTheme, ThemeSettings } from '../lib/types/index';
import { loadThemeSettings, saveThemeSettings } from '../lib/storage/storage';
import { usesInvertedColorSpace } from '../lib/theme/readingTheme';

const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  theme: 'default',
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  sepiaAmount: 0,
  invertImages: false,
};

export function useColorTheme() {
  const [settings, setSettings] = useState<ThemeSettings>(() => {
    return loadThemeSettings() || DEFAULT_THEME_SETTINGS;
  });

  useEffect(() => {
    saveThemeSettings(settings);
  }, [settings]);

  const setTheme = useCallback((theme: ReadingTheme) => {
    setSettings((prev) => ({ ...prev, theme }));
  }, []);

  const toggleInvert = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      theme: usesInvertedColorSpace(prev.theme) ? 'default' : 'invert',
    }));
  }, []);

  const updateSetting = useCallback(<K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      brightness: 100,
      contrast: 100,
      grayscale: 0,
      sepiaAmount: 0,
    }));
  }, []);

  // Compute CSS filter style for PDF pages
  const getPageFilterClass = useCallback((): string => {
    switch (settings.theme) {
      case 'invert':
        return 'page-theme-invert';
      case 'oled':
        return 'page-theme-oled';
      case 'sepia':
        return 'page-theme-sepia';
      case 'nord':
        return 'page-theme-nord';
      case 'matrix':
        return 'page-theme-matrix';
      default:
        return 'page-theme-default';
    }
  }, [settings.theme]);

  // Keep adjustments in a CSS variable so they compose with the selected
  // reading-theme filter instead of replacing it through an inline `filter`.
  const getCustomFilterStyle = useCallback(() => {
    const filters: string[] = [];
    if (settings.brightness !== 100) {
      filters.push(`brightness(${settings.brightness}%)`);
    }
    if (settings.contrast !== 100) {
      filters.push(`contrast(${settings.contrast}%)`);
    }
    if (settings.grayscale > 0) {
      filters.push(`grayscale(${settings.grayscale}%)`);
    }
    return filters.length > 0
      ? ({ '--pdf-page-adjustment-filter': filters.join(' ') } as CSSProperties)
      : {};
  }, [settings.brightness, settings.contrast, settings.grayscale]);

  return {
    settings,
    setTheme,
    toggleInvert,
    updateSetting,
    resetFilters,
    getPageFilterClass,
    getCustomFilterStyle,
  };
}
