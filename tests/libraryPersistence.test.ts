import { describe, expect, test, beforeEach } from 'bun:test';

// In-memory mock for localStorage in test environment
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

// Install localStorage global before importing storage
const mockStorage = createLocalStorageMock();
(globalThis as unknown as { localStorage: typeof mockStorage }).localStorage = mockStorage;

import {
  loadLibraryFilter,
  saveLibraryFilter,
  loadLibrarySort,
  saveLibrarySort,
  loadSavedDirectories,
  loadHighlightPalette,
  saveHighlightPalette,
  saveSavedDirectories,
  saveLastActiveDoc,
  loadLastActiveDoc,
  clearLastActiveDoc,
} from '../src/lib/storage/storage';
import { HIGHLIGHT_COLOR_PRESETS } from '../src/lib/annotations/highlightStyle';

describe('Library filter & folder selection persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('defaults to "all" filter and "recent" sort when uninitialized', () => {
    expect(loadLibraryFilter()).toBe('all');
    expect(loadLibrarySort()).toBe('recent');
  });

  test('persists view filter tabs (recent, favorites, all)', () => {
    saveLibraryFilter('favorites');
    expect(loadLibraryFilter()).toBe('favorites');

    saveLibraryFilter('recent');
    expect(loadLibraryFilter()).toBe('recent');

    saveLibraryFilter('all');
    expect(loadLibraryFilter()).toBe('all');
  });

  test('persists selected folder directory ID/path', () => {
    const folderPath = '/Users/test/Documents/ResearchPDFs';
    saveLibraryFilter(folderPath);
    expect(loadLibraryFilter()).toBe(folderPath);
  });

  test('persists library sorting option', () => {
    saveLibrarySort('name');
    expect(loadLibrarySort()).toBe('name');

    saveLibrarySort('size');
    expect(loadLibrarySort()).toBe('size');

    saveLibrarySort('recent');
    expect(loadLibrarySort()).toBe('recent');
  });

  test('persists saved directories list', () => {
    const dirs = [
      { id: 'dir1', name: 'Work', path: '/work', addedAt: 1000, pdfCount: 5 },
      { id: 'dir2', name: 'Personal', path: '/personal', addedAt: 2000, pdfCount: 12 },
    ];
    saveSavedDirectories(dirs);
    expect(loadSavedDirectories()).toEqual(dirs);
  });

  test('persists the customized highlight palette and active swatch', () => {
    const colors = [...HIGHLIGHT_COLOR_PRESETS];
    colors[0] = '#fff123';

    saveHighlightPalette({ colors, selectedIndex: 3 });

    expect(loadHighlightPalette(HIGHLIGHT_COLOR_PRESETS)).toEqual({
      colors,
      selectedIndex: 3,
    });
  });

  test('falls back when persisted highlight palette data is malformed', () => {
    localStorage.setItem(
      'pdfuck_highlight_palette',
      JSON.stringify({ colors: ['not-a-color'], selectedIndex: 20 })
    );

    expect(loadHighlightPalette(HIGHLIGHT_COLOR_PRESETS)).toEqual({
      colors: [...HIGHLIGHT_COLOR_PRESETS],
      selectedIndex: 0,
    });
  });

  test('persists and restores last active reading document across app sessions', () => {
    expect(loadLastActiveDoc()).toBeNull();

    const activeDoc = {
      documentId: 'doc-uuid-456',
      fileName: 'thesis.pdf',
      filePath: '/path/to/thesis.pdf',
      lastReadPage: 18,
      numPages: 120,
      timestamp: 123456789,
    };

    saveLastActiveDoc(activeDoc);
    expect(loadLastActiveDoc()).toEqual(activeDoc);

    clearLastActiveDoc();
    expect(loadLastActiveDoc()).toBeNull();
  });
});
