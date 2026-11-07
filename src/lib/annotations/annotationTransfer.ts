import type { Annotation } from '../types/index';
import { isTauri, tauriOpenJson, tauriSaveJson } from '../../utils/tauriBridge';

/**
 * Validates whether an object matches the shape of a known Cinnabar annotation.
 */
function isValidAnnotation(item: any): item is Annotation {
  if (!item || typeof item !== 'object') return false;
  if (
    typeof item.pageNumber !== 'number' ||
    !Number.isFinite(item.pageNumber) ||
    item.pageNumber < 1
  ) {
    return false;
  }
  if (typeof item.type !== 'string') return false;

  switch (item.type) {
    case 'pen':
    case 'highlight-pen':
      return Array.isArray(item.points) && item.points.length > 0;
    case 'highlight-line':
      return (
        typeof item.startX === 'number' &&
        typeof item.startY === 'number' &&
        typeof item.endX === 'number' &&
        typeof item.endY === 'number'
      );
    case 'highlight-rect':
      return (
        typeof item.x === 'number' &&
        typeof item.y === 'number' &&
        typeof item.width === 'number' &&
        typeof item.height === 'number'
      );
    case 'highlight-text':
      return Array.isArray(item.rects) && typeof item.text === 'string';
    case 'image':
      return (
        typeof item.dataUrl === 'string' &&
        typeof item.x === 'number' &&
        typeof item.y === 'number' &&
        typeof item.width === 'number' &&
        typeof item.height === 'number'
      );
    case 'text-note':
      return (
        typeof item.text === 'string' &&
        typeof item.x === 'number' &&
        typeof item.y === 'number'
      );
    case 'ai-explanation':
      return (
        typeof item.prompt === 'string' &&
        typeof item.response === 'string' &&
        typeof item.x === 'number' &&
        typeof item.y === 'number'
      );
    default:
      return false;
  }
}

/**
 * Normalizes an annotation object by ensuring valid ID and timestamps.
 */
function normalizeAnnotation(item: Annotation, index: number): Annotation {
  const baseId =
    typeof item.id === 'string' && item.id.trim().length > 0
      ? item.id.trim()
      : `imported_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`;
  const createdAt =
    typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
      ? item.createdAt
      : Date.now();

  const normalized: Annotation = {
    ...item,
    id: baseId,
    createdAt,
  };

  if (normalized.type === 'ai-explanation') {
    const aiAnn = normalized as any;
    if (typeof aiAnn.updatedAt !== 'number' || !Number.isFinite(aiAnn.updatedAt)) {
      aiAnn.updatedAt = createdAt;
    }
  }

  return normalized;
}

/**
 * Parses and validates raw JSON text or objects into a typed Annotation[] array.
 * Supports raw array JSON (`[...]`) or wrapper object (`{ annotations: [...] }`).
 * Throws a descriptive error if input is invalid or contains 0 valid annotations.
 */
export function parseAnnotationsJson(input: string | unknown): Annotation[] {
  let parsed: unknown;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error('The selected file is empty.');
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new Error(
        `Failed to parse JSON: ${err instanceof Error ? err.message : 'Invalid JSON format'}`
      );
    }
  } else {
    parsed = input;
  }

  let rawList: unknown[] | null = null;
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { annotations?: unknown }).annotations)
  ) {
    rawList = (parsed as { annotations: unknown[] }).annotations;
  }

  if (!rawList) {
    throw new Error(
      'Invalid annotations file format. Expected a JSON array of annotations or an object containing an "annotations" array.'
    );
  }

  const validAnnotations: Annotation[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const item = rawList[i];
    if (isValidAnnotation(item)) {
      validAnnotations.push(normalizeAnnotation(item, i));
    }
  }

  if (validAnnotations.length === 0) {
    throw new Error('No valid annotations were found in the JSON file.');
  }

  return validAnnotations;
}

/**
 * Merges incoming annotations into existing annotations without duplicate ID collisions.
 */
export function mergeAnnotations(
  existing: Annotation[],
  incoming: Annotation[]
): Annotation[] {
  const existingIds = new Set(existing.map((a) => a.id));
  const normalizedIncoming = incoming.map((item) => {
    if (existingIds.has(item.id)) {
      return {
        ...item,
        id: `${item.id}_${Math.random().toString(36).slice(2, 7)}`,
      };
    }
    return item;
  });
  return [...existing, ...normalizedIncoming];
}

let isOpeningJsonDialog = false;
let isExportingJson = false;

/**
 * Opens a file picker (Tauri native dialog or browser input fallback) to select a JSON file.
 */
export async function openAnnotationsJsonFile(): Promise<{
  fileName: string;
  content: string;
} | null> {
  if (isOpeningJsonDialog) {
    return null;
  }
  isOpeningJsonDialog = true;
  try {
    if (isTauri()) {
      const nativeResult = await tauriOpenJson();
      if (nativeResult) {
        return {
          fileName: nativeResult.fileName,
          content: nativeResult.content,
        };
      }
      return null;
    }

    // Browser Web fallback
    return await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.style.display = 'none';

      let resolved = false;
      const cleanup = () => {
        if (input.parentNode) {
          document.body.removeChild(input);
        }
      };

      input.onchange = async () => {
        resolved = true;
        const file = input.files?.[0];
        cleanup();
        if (!file) {
          resolve(null);
          return;
        }
        try {
          const text = await file.text();
          resolve({
            fileName: file.name,
            content: text,
          });
        } catch (err) {
          console.error('Failed to read JSON file in browser:', err);
          resolve(null);
        }
      };

      input.oncancel = () => {
        resolved = true;
        cleanup();
        resolve(null);
      };

      window.addEventListener(
        'focus',
        () => {
          setTimeout(() => {
            if (!resolved) {
              cleanup();
              resolve(null);
            }
          }, 1000);
        },
        { once: true }
      );

      document.body.appendChild(input);
      input.click();
    });
  } finally {
    isOpeningJsonDialog = false;
  }
}

/**
 * Exports annotations to a JSON file via Tauri native dialog or Web browser download.
 */
export async function exportAnnotationsJson(
  annotations: Annotation[],
  fileName: string = 'annotations.json'
): Promise<{ success: boolean; path?: string }> {
  if (isExportingJson) {
    return { success: false };
  }
  isExportingJson = true;
  try {
    const jsonString = JSON.stringify(annotations, null, 2);

    if (isTauri()) {
      const res = await tauriSaveJson(jsonString, fileName);
      if (res.success) return res;
    }

    // Web Browser fallback
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return { success: true };
  } finally {
    isExportingJson = false;
  }
}
