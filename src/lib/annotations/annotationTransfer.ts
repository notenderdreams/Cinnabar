import type { Annotation } from '../types/index';
import { tauriOpenJson, tauriSaveJson } from '../../utils/tauriBridge';
import { validateNotebookDocument } from '../notebook/operations';

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
      if (item.type === 'text-note' && item.notebookDocument) validateNotebookDocument(item.notebookDocument);
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
 * Opens the native file dialog to select an annotation JSON file.
 */
export async function openAnnotationsJsonFile(): Promise<{ fileName: string; content: string } | null> {
  if (isOpeningJsonDialog) return null;
  isOpeningJsonDialog = true;
  try { return await tauriOpenJson(); }
  finally { isOpeningJsonDialog = false; }
}

/**
 * Exports annotations to a JSON file through the native dialog.
 */
export async function exportAnnotationsJson(annotations: Annotation[], fileName = 'annotations.json'): Promise<{ success: boolean; path?: string }> {
  if (isExportingJson) return { success: false };
  isExportingJson = true;
  try { return await tauriSaveJson(JSON.stringify(annotations, null, 2), fileName); }
  finally { isExportingJson = false; }
}
