import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Annotation, AttachedImageAnnotation, DocumentInfo } from '../lib/types/index';
import {
  loadAnnotationRecordForDocAsync,
  loadAnnotationRecordForDocSync,
  saveAnnotationsForDoc,
} from '../lib/storage/storage';

import { calculateImagePlacement } from '../lib/media/imageUtils';

export function useAnnotations(docKey: string, docInfo?: DocumentInfo | null) {
  const [activeDocKey, setActiveDocKey] = useState<string>(docKey);

  const fallbackKeys = useMemo(() => {
    const keys: string[] = [];
    if (docInfo?.filePath && docInfo.filePath !== docKey) {
      keys.push(docInfo.filePath);
    }
    if (docInfo?.fingerprint && docInfo.fingerprint !== docKey && !keys.includes(docInfo.fingerprint)) {
      keys.push(docInfo.fingerprint);
    }
    if (docInfo?.fileName && (docInfo?.numPages || docInfo?.fileSize)) {
      const contentKey = `${docInfo.fileName}_${docInfo.numPages ?? 0}_${docInfo.fileSize ?? 0}`;
      if (contentKey !== docKey && !keys.includes(contentKey)) {
        keys.push(contentKey);
      }
    }
    return keys;
  }, [docInfo?.filePath, docInfo?.fileName, docInfo?.fingerprint, docInfo?.numPages, docInfo?.fileSize, docKey]);

  const storageIdentity = useMemo(
    () => [docKey, ...fallbackKeys].join('\u0000'),
    [docKey, fallbackKeys]
  );

  const [annotations, setAnnotations] = useState<Annotation[]>(() => {
    if (!docKey) return [];
    return loadAnnotationRecordForDocSync(docKey, [])?.annotations ?? [];
  });
  const [history, setHistory] = useState<Annotation[][]>(() => {
    if (!docKey) return [[]];
    const initial = loadAnnotationRecordForDocSync(docKey, [])?.annotations ?? [];
    return [initial];
  });
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [loadedIdentity, setLoadedIdentity] = useState<string | null>(() =>
    docKey ? [docKey, ...fallbackKeys].join('\u0000') : null
  );
  const annotationsRef = useRef<Annotation[]>(annotations);
  const mutationVersionRef = useRef(0);
  const saveGenerationRef = useRef(0);
  const skipAutosaveForRef = useRef<Annotation[] | null>(annotations);

  // Synchronously switch document annotations during render to prevent any flash or bleed
  if (docKey !== activeDocKey) {
    setActiveDocKey(docKey);
    const syncRecord = docKey ? loadAnnotationRecordForDocSync(docKey, fallbackKeys) : null;
    const initialAnns = syncRecord?.annotations ?? [];
    annotationsRef.current = initialAnns;
    skipAutosaveForRef.current = initialAnns;
    setAnnotations(initialAnns);
    setHistory([initialAnns]);
    setHistoryIndex(0);
    setSaveStatus('saved');
    setLoadedIdentity(storageIdentity);
  }

  // Load annotations from IndexedDB on docKey or document identity change
  useEffect(() => {
    if (!docKey) {
      setLoadedIdentity(null);
      return;
    }
    const loadMutationVersion = ++mutationVersionRef.current;
    let isCancelled = false;

    // 2. Async load from IndexedDB for high-capacity payloads (images/stickers)
    loadAnnotationRecordForDocAsync(docKey, fallbackKeys).then((asyncRecord) => {
      if (isCancelled || mutationVersionRef.current !== loadMutationVersion) return;

      const syncRecord = loadAnnotationRecordForDocSync(docKey, fallbackKeys);
      const newestRecord =
        asyncRecord && asyncRecord.updatedAt > (syncRecord?.updatedAt ?? -1)
          ? asyncRecord
          : syncRecord;
      if (newestRecord === asyncRecord && asyncRecord) {
        annotationsRef.current = asyncRecord.annotations;
        skipAutosaveForRef.current = asyncRecord.annotations;
        setAnnotations(asyncRecord.annotations);
        setHistory([asyncRecord.annotations]);
        setHistoryIndex(0);
      }
      // Materialize only if loaded from a fallback key rather than direct docKey
      if (newestRecord && newestRecord.annotations.length > 0) {
        const hasDirectRecord = Boolean(loadAnnotationRecordForDocSync(docKey, []));
        if (!hasDirectRecord) {
          void saveAnnotationsForDoc(docKey, newestRecord.annotations);
        }
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [docKey, fallbackKeys, storageIdentity]);

  // Auto-save on annotations change
  useEffect(() => {
    if (!docKey || loadedIdentity !== storageIdentity) return;
    if (annotations === skipAutosaveForRef.current) {
      skipAutosaveForRef.current = null;
      return;
    }

    const saveGeneration = ++saveGenerationRef.current;
    setSaveStatus('saving');

    void saveAnnotationsForDoc(docKey, annotations, fallbackKeys)
      .then(() => {
        if (saveGenerationRef.current === saveGeneration) setSaveStatus('saved');
      })
      .catch((error) => {
        console.error('Failed to auto-save annotations:', error);
        if (saveGenerationRef.current === saveGeneration) setSaveStatus('error');
      });
  }, [annotations, docKey, fallbackKeys, loadedIdentity, storageIdentity]);

  annotationsRef.current = annotations;

  const pushState = useCallback((newAnnotations: Annotation[]) => {
    mutationVersionRef.current += 1;
    setHistory((prevHistory) => {
      const upToCurrent = prevHistory.slice(0, historyIndex + 1);
      const updated = [...upToCurrent, newAnnotations];
      // Keep last 40 history states for memory efficiency
      if (updated.length > 40) {
        updated.shift();
      }
      return updated;
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 39));
    setAnnotations(newAnnotations);
    annotationsRef.current = newAnnotations;
  }, [historyIndex]);

  const addAnnotation = useCallback((annotation: Annotation) => {
    const updated = [...annotationsRef.current, annotation];
    pushState(updated);
  }, [pushState]);

  const addAnnotations = useCallback((items: Annotation[]) => {
    if (items.length) pushState([...annotationsRef.current, ...items]);
  }, [pushState]);

  const updateAnnotation = useCallback((id: string, updates: Partial<Annotation>) => {
    const updated = annotationsRef.current.map((item) =>
      item.id === id ? ({ ...item, ...updates } as Annotation) : item
    );
    pushState(updated);
  }, [pushState]);

  const deleteAnnotation = useCallback((id: string) => {
    const updated = annotationsRef.current.filter((item) => item.id !== id);
    pushState(updated);
  }, [pushState]);

  const clearAllAnnotationsForPage = useCallback((pageNumber: number) => {
    const updated = annotationsRef.current.filter((item) => item.pageNumber !== pageNumber);
    pushState(updated);
  }, [pushState]);

  const clearAllAnnotations = useCallback(() => {
    pushState([]);
  }, [pushState]);

  const replaceAnnotations = useCallback((nextAnnotations: Annotation[]) => {
    mutationVersionRef.current += 1;
    setAnnotations(nextAnnotations);
    annotationsRef.current = nextAnnotations;
    setHistory([nextAnnotations]);
    setHistoryIndex(0);
  }, []);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const nextState = history[newIndex];
      mutationVersionRef.current += 1;
      setAnnotations(nextState);
      annotationsRef.current = nextState;
    }
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const nextState = history[newIndex];
      mutationVersionRef.current += 1;
      setAnnotations(nextState);
      annotationsRef.current = nextState;
    }
  }, [historyIndex, history]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Add attached image helper
  const addAttachedImage = useCallback((
    pageNumber: number,
    dataUrl: string,
    aspectRatio: number = 1.33,
    name: string = 'Attached Image',
    options?: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      pageWidth?: number;
      pageHeight?: number;
      imageWidth?: number;
      imageHeight?: number;
      attachedInInvertedMode?: boolean;
      invertInLightMode?: boolean;
    }
  ) => {
    let x = options?.x;
    let y = options?.y;
    let width = options?.width;
    let height = options?.height;
    let ar = aspectRatio;

    if (!width || !height || x === undefined || y === undefined) {
      const placement = calculateImagePlacement({
        imageWidth: options?.imageWidth,
        imageHeight: options?.imageHeight,
        aspectRatio: ar,
        pageWidth: options?.pageWidth,
        pageHeight: options?.pageHeight,
        cursorX: options?.x,
        cursorY: options?.y,
      });

      if (x === undefined) x = placement.x;
      if (y === undefined) y = placement.y;
      if (!width) width = placement.width;
      if (!height) height = placement.height;
      if (!ar || ar <= 0) ar = placement.aspectRatio;
    }

    const newImage: AttachedImageAnnotation = {
      id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      pageNumber,
      type: 'image',
      dataUrl,
      x,
      y,
      width,
      height,
      rotation: 0,
      opacity: 1,
      aspectRatio: ar,
      name,
      createdAt: Date.now(),
      attachedInInvertedMode: options?.attachedInInvertedMode ?? false,
      invertInLightMode: options?.invertInLightMode ?? (options?.attachedInInvertedMode ?? false),
    };

    addAnnotation(newImage);
    return newImage;
  }, [addAnnotation]);

  return {
    annotations,
    saveStatus,
    addAnnotation,
    addAnnotations,
    updateAnnotation,
    deleteAnnotation,
    clearAllAnnotationsForPage,
    clearAllAnnotations,
    undo,
    redo,
    canUndo,
    canRedo,
    addAttachedImage,
    replaceAnnotations,
  };
}
