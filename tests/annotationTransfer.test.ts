import { describe, expect, test } from 'bun:test';
import {
  parseAnnotationsJson,
  mergeAnnotations,
} from '../src/lib/annotations/annotationTransfer';
import type { Annotation, TextHighlightAnnotation, DrawingAnnotation } from '../src/lib/types/index';

const projectFile = (path: string) => Bun.file(new URL(`../${path}`, import.meta.url)).text();

describe('annotationTransfer - parseAnnotationsJson', () => {
  test('parses a valid JSON array of annotations', () => {
    const raw: Annotation[] = [
      {
        id: 'hl-1',
        pageNumber: 1,
        type: 'highlight-text',
        rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.05 }],
        text: 'Sample highlight text',
        color: '#ffea00',
        opacity: 0.5,
        createdAt: 1700000000000,
      } as TextHighlightAnnotation,
      {
        id: 'pen-1',
        pageNumber: 2,
        type: 'pen',
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.2, y: 0.2 },
        ],
        color: '#ff0000',
        strokeWidth: 2,
        opacity: 1,
        createdAt: 1700000001000,
      } as DrawingAnnotation,
    ];

    const json = JSON.stringify(raw);
    const parsed = parseAnnotationsJson(json);

    expect(parsed.length).toBe(2);
    expect(parsed[0].id).toBe('hl-1');
    expect(parsed[0].pageNumber).toBe(1);
    expect(parsed[0].type).toBe('highlight-text');
    expect(parsed[1].id).toBe('pen-1');
    expect(parsed[1].pageNumber).toBe(2);
    expect(parsed[1].type).toBe('pen');
  });

  test('parses wrapped object { annotations: [...] }', () => {
    const wrapped = {
      version: 1,
      exportedAt: 1700000000000,
      annotations: [
        {
          id: 'rect-1',
          pageNumber: 3,
          type: 'highlight-rect',
          x: 0.2,
          y: 0.3,
          width: 0.4,
          height: 0.2,
          color: '#00ff00',
          opacity: 0.4,
          createdAt: 1700000000000,
        },
      ],
    };

    const parsed = parseAnnotationsJson(JSON.stringify(wrapped));
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe('rect-1');
    expect(parsed[0].pageNumber).toBe(3);
    expect(parsed[0].type).toBe('highlight-rect');
  });

  test('normalizes missing ID and createdAt timestamps', () => {
    const raw = [
      {
        pageNumber: 1,
        type: 'text-note',
        text: 'Imported note without ID',
        x: 0.5,
        y: 0.5,
        color: '#ffff00',
        fontSize: 12,
      },
    ];

    const parsed = parseAnnotationsJson(JSON.stringify(raw));
    expect(parsed.length).toBe(1);
    expect(typeof parsed[0].id).toBe('string');
    expect(parsed[0].id.length).toBeGreaterThan(0);
    expect(typeof parsed[0].createdAt).toBe('number');
    expect(parsed[0].createdAt).toBeGreaterThan(0);
  });

  test('filters out invalid items and throws error if no valid annotations remain', () => {
    expect(() => parseAnnotationsJson('')).toThrow('The selected file is empty.');
    expect(() => parseAnnotationsJson('{ invalid json')).toThrow('Failed to parse JSON');
    expect(() => parseAnnotationsJson('{"something": "else"}')).toThrow('Invalid annotations file format');
    expect(() => parseAnnotationsJson('[{"invalid": 123}]')).toThrow('No valid annotations were found');
  });

  test('filters out invalid page numbers or invalid coordinates while keeping valid items', () => {
    const mixed = [
      {
        id: 'valid-1',
        pageNumber: 1,
        type: 'highlight-line',
        startX: 0.1,
        startY: 0.2,
        endX: 0.5,
        endY: 0.2,
        color: '#ffe600',
        strokeWidth: 4,
        opacity: 0.45,
        createdAt: 1000,
      },
      {
        id: 'invalid-page',
        pageNumber: -1, // Invalid page number
        type: 'highlight-line',
        startX: 0.1,
        startY: 0.2,
        endX: 0.5,
        endY: 0.2,
        color: '#ffe600',
        strokeWidth: 4,
        opacity: 0.45,
        createdAt: 1000,
      },
      {
        id: 'invalid-type',
        pageNumber: 1,
        type: 'unknown-type-xyz',
      },
    ];

    const parsed = parseAnnotationsJson(JSON.stringify(mixed));
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe('valid-1');
  });
});

describe('annotationTransfer - mergeAnnotations', () => {
  test('merges incoming annotations and resolves ID collisions', () => {
    const existing: Annotation[] = [
      {
        id: 'ann-1',
        pageNumber: 1,
        type: 'text-note',
        text: 'Existing Note',
        x: 0.1,
        y: 0.1,
        color: '#ffffff',
        fontSize: 12,
        createdAt: 1000,
      },
    ];

    const incoming: Annotation[] = [
      {
        id: 'ann-1', // Collision!
        pageNumber: 2,
        type: 'text-note',
        text: 'Incoming Note with same ID',
        x: 0.2,
        y: 0.2,
        color: '#ffffff',
        fontSize: 12,
        createdAt: 2000,
      },
      {
        id: 'ann-2', // Unique
        pageNumber: 3,
        type: 'text-note',
        text: 'Unique Incoming Note',
        x: 0.3,
        y: 0.3,
        color: '#ffffff',
        fontSize: 12,
        createdAt: 3000,
      },
    ];

    const merged = mergeAnnotations(existing, incoming);
    expect(merged.length).toBe(3);
    expect(merged[0].id).toBe('ann-1');
    expect(merged[0].pageNumber).toBe(1);

    // Collision resolved with new unique ID
    expect(merged[1].id).not.toBe('ann-1');
    expect(merged[1].id.startsWith('ann-1_')).toBe(true);
    expect(merged[1].pageNumber).toBe(2);

    expect(merged[2].id).toBe('ann-2');
    expect(merged[2].pageNumber).toBe(3);
  });
});

describe('annotation import/export UI and native menu wiring', () => {
  test('Native macOS Menu Bar and shortcuts expose Import / Export and ExportModal supports importing', async () => {
    const [tauriAppSource, modalSource, appSource, shortcutsSource] = await Promise.all([
      Promise.all([projectFile('src-tauri/src/app/menu.rs'), projectFile('src-tauri/src/app.rs')]).then(parts => parts.join('\n')),
      projectFile('src/components/modals/ExportModal.tsx'),
      projectFile('src/App.tsx'),
      projectFile('src/components/modals/KeyboardShortcutsModal.tsx'),
    ]);

    expect(tauriAppSource).toContain('import_annotations');
    expect(tauriAppSource).toContain('export_annotations');
    expect(tauriAppSource).toContain('open_transfer_modal');
    expect(tauriAppSource).toContain('native-menu-action');
    expect(appSource).toContain('listenToNativeMenuEvents');
    expect(modalSource).toContain('Import Annotations');
    expect(modalSource).toContain('onImportAnnotations');
    expect(modalSource).toContain('hasOpenPdf');
    expect(modalSource).toContain('handleImportJson');
    expect(modalSource).toContain('handleExportJson');
    expect(appSource).toContain('handleImportAnnotations');
    expect(appSource).toContain('onImportAnnotations={handleImportAnnotations}');
    expect(shortcutsSource).toContain("desc: 'Import & Export Annotations'");
  });
});
