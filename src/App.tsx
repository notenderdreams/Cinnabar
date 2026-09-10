import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { PDFViewer } from './components/PDFViewer';
import { Dashboard } from './components/Dashboard';
import { ColorThemeModal } from './components/ColorThemeModal';
import { SearchBar } from './components/SearchBar';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { SettingsModal } from './components/SettingsModal';
import { ExportModal } from './components/ExportModal';
import { DeletePageConfirmationDialog } from './components/DeletePageConfirmationDialog';
import { Check, Info, LoaderCircle, Sidebar as SidebarIcon } from 'lucide-react';

import { usePDFDocument } from './hooks/usePDFDocument';
import { useAnnotations } from './hooks/useAnnotations';
import { useSnippets } from './hooks/useSnippets';
import { useColorTheme } from './hooks/useColorTheme';
import { useAiExplanations } from './hooks/useAiExplanations';
import { usesInvertedColorSpace } from './utils/readingTheme';
import {
  mergeAnnotations,
  openAnnotationsJsonFile,
  parseAnnotationsJson,
  exportAnnotationsJson,
} from './utils/annotationTransfer';
import { pdfjsLib } from './utils/pdfWorker';
import { useKeyboard } from './hooks/useKeyboard';
import {
  clearLastActiveDoc,
  idbLoadActivePdf,
  idbSaveActivePdf,
  loadHighlightPalette,
  loadLastActiveDoc,
  loadViewMode,
  recordRecentDoc,
  saveHighlightPalette,
  saveLastActiveDoc,
  saveViewMode,
  type LastActiveDocument,
} from './utils/storage';
import {
  isTauri,
  tauriOpenPdf,
  tauriOpenImage,
  tauriWritePdf,
  tauriUpdateLibraryDocumentState,
  tauriImportLibraryPdf,
  tauriTouchLibraryDocument,
  tauriReadFile,
  toggleFullscreenWindow,
  exitFullscreenWindow,
  listenToNativeMenuEvents,
} from './utils/tauriBridge';
import {
  extractPageText,
  copyTextToClipboard,
  copyPageImageToClipboard,
  addBlankPageBelow,
  deletePageFromPdf,
  reindexAfterPageInsertion,
  reindexAfterPageDeletion,
  downloadPageAsJpg,
} from './utils/pageExtractor';
import { getImageDimensions } from './utils/imageUtils';
import { createTextHighlightsFromSelection } from './utils/textHighlight';
import {
  HIGHLIGHT_COLOR_PRESETS,
  replaceHighlightPaletteColor,
} from './utils/highlightStyle';
import {
  cropCanvasRegion,
  copyStitchedSnippetsToClipboard,
  downloadStitchedSnippets,
} from './utils/snippetExtractor';
import type { AiExplanationAnnotation, Annotation, AppScreen, HighlightStyle, LineHighlightStyle, ToolType, ViewMode, StitchOptions } from './utils/types';
import type { SidebarTabType } from './components/Sidebar';

export function App() {
  // Screen Routing: 'dashboard' (Library view) | 'reader' (PDF reader & annotation studio)
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('dashboard');

  // View & UI State
  const [zoom, setZoom] = useState<number>(1.15);
  const [companionZoom, setCompanionZoom] = useState<number>(1.15);
  const [companionCurrentPage, setCompanionCurrentPage] = useState<number>(1);
  const [activeReaderPane, setActiveReaderPane] = useState<'primary' | 'companion'>('primary');
  const [fitPageRequest, setFitPageRequest] = useState<{ id: number; page: number } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewMode());
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTabType>('thumbnails');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isZenMode, setIsZenMode] = useState<boolean>(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState<boolean>(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [pagePendingDeletion, setPagePendingDeletion] = useState<number | null>(null);
  const [isDeletingPage, setIsDeletingPage] = useState<boolean>(false);

  // Active Toast Feedback
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const showToast = useCallback((text: string, isError = false) => {
    setToastMessage({ text, isError });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 2400);
  }, []);

  // Active Tool & Style State
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [initialHighlightPalette] = useState(() =>
    loadHighlightPalette(HIGHLIGHT_COLOR_PRESETS)
  );
  const [highlightColors, setHighlightColors] = useState<string[]>(
    initialHighlightPalette.colors
  );
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState(
    initialHighlightPalette.selectedIndex
  );
  const [selectedColor, setSelectedColor] = useState<string>(
    initialHighlightPalette.colors[initialHighlightPalette.selectedIndex]
  );
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [opacity, setOpacity] = useState<number>(0.45);
  const [highlightStyle, setHighlightStyle] = useState<HighlightStyle>('box');
  const [lineHighlightStyle, setLineHighlightStyle] = useState<LineHighlightStyle>('highlight');
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

  useEffect(() => {
    saveHighlightPalette({ colors: highlightColors, selectedIndex: selectedPaletteIndex });
  }, [highlightColors, selectedPaletteIndex]);

  // Hidden File Inputs for Browser fallback
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const companionLoadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const companionPdfRef = useRef<PDFDocumentProxy | null>(null);
  const [companionPdfDoc, setCompanionPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [companionFileName, setCompanionFileName] = useState<string | null>(null);

  // Active Cursor coordinates over PDF pages for precise cursor pasting
  const cursorPosRef = useRef<{ pageNumber: number; x: number; y: number } | null>(null);

  // Custom Hooks
  const {
    pdfDoc,
    rawPdfBytes,
    docInfo,
    outline,
    currentPage,
    docKey,
    isLoading,
    loadPdf,
    changePage,
    searchResults,
    currentMatchIndex,
    isSearching,
    searchInDocument,
    nextSearchResult,
    prevSearchResult,
  } = usePDFDocument();

  const closeCompanionPdf = useCallback(() => {
    void companionLoadingTaskRef.current?.destroy();
    companionLoadingTaskRef.current = null;
    void companionPdfRef.current?.destroy();
    companionPdfRef.current = null;
    setCompanionPdfDoc(null);
    setCompanionFileName(null);
    setCompanionCurrentPage(1);
    setCompanionZoom(1.15);
    setActiveReaderPane('primary');
  }, []);

  const loadCompanionPdf = useCallback(async (data: Uint8Array, fileName: string): Promise<boolean> => {
    void companionLoadingTaskRef.current?.destroy();
    const loadingTask = pdfjsLib.getDocument({
      data: data.slice(),
      cMapUrl: 'https://unpkg.com/pdfjs-dist@4.0.379/cmaps/',
      cMapPacked: true,
    });
    companionLoadingTaskRef.current = loadingTask;

    try {
      const loadedDoc = await loadingTask.promise;
      if (companionLoadingTaskRef.current !== loadingTask) {
        void loadedDoc.destroy();
        return false;
      }

      void companionPdfRef.current?.destroy();
      companionPdfRef.current = loadedDoc;
      companionLoadingTaskRef.current = null;
      setCompanionPdfDoc(loadedDoc);
      setCompanionFileName(fileName);
      setCompanionCurrentPage(1);
      setCompanionZoom(1.15);
      setActiveReaderPane('primary');
      setViewMode('continuous');
      saveViewMode('continuous');
      showToast(`Reading ${docInfo?.fileName || 'PDF'} with ${fileName}`);
      return true;
    } catch (error) {
      if (companionLoadingTaskRef.current === loadingTask) {
        companionLoadingTaskRef.current = null;
        console.error('Failed to load companion PDF:', error);
        showToast(`Could not open ${fileName}.`, true);
      }
      return false;
    }
  }, [docInfo?.fileName, showToast]);

  useEffect(() => closeCompanionPdf, [closeCompanionPdf]);

  const {
    annotations,
    saveStatus,
    addAnnotation,
    addAttachedImage,
    updateAnnotation,
    deleteAnnotation,
    clearAllAnnotationsForPage,
    replaceAnnotations,
    undo: undoAnnotations,
    redo: redoAnnotations,
    canUndo: canUndoAnnotations,
    canRedo: canRedoAnnotations,
  } = useAnnotations(docKey, docInfo);

  useEffect(() => {
    if (!isTauri() || !docInfo?.libraryId) return;
    const timer = window.setTimeout(() => {
      void tauriUpdateLibraryDocumentState(docInfo.libraryId!, currentPage, annotations.length)
        .catch((error) => console.warn('Failed to update library reading state:', error));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [annotations.length, currentPage, docInfo?.libraryId]);

  const aiExplanations = useAiExplanations({
    pdfDoc,
    documentName: docInfo?.fileName || 'document.pdf',
    docKey,
    updateAnnotation,
  });

  const handleImportAnnotations = useCallback(
    (imported: Annotation[], mode: 'replace' | 'merge' = 'replace') => {
      if (mode === 'merge') {
        const merged = mergeAnnotations(annotations, imported);
        replaceAnnotations(merged);
        showToast(`Merged ${imported.length} annotations`);
      } else {
        replaceAnnotations(imported);
        showToast(`Imported ${imported.length} annotations`);
      }
    },
    [annotations, replaceAnnotations, showToast]
  );

  const snippetFallbackKeys = useMemo(() => {
    const keys: string[] = [];
    if (docInfo?.filePath && docInfo.filePath !== docKey) keys.push(docInfo.filePath);
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

  const {
    snippets,
    addSnippet,
    addDivider,
    removeEntry: removeSnippetEntry,
    moveEntry: moveSnippetEntry,
    updateDivider,
    updateSnippetLabel,
    clearAll: clearAllSnippets,
    undo: undoSnippets,
    redo: redoSnippets,
    canUndo: canUndoSnippets,
    canRedo: canRedoSnippets,
    replaceSnippets,
  } = useSnippets(docKey, snippetFallbackKeys);

  const {
    settings: themeSettings,
    setTheme,
    toggleInvert,
    updateSetting: updateThemeSetting,
    resetFilters: resetThemeFilters,
    getPageFilterClass,
    getCustomFilterStyle,
  } = useColorTheme();

  const [pageNavRequest, setPageNavRequest] = useState<{ page: number; timestamp: number } | null>(null);

  const handleNavigatePage = useCallback(
    (page: number) => {
      setActiveReaderPane('primary');
      changePage(page);
      setPageNavRequest({ page, timestamp: Date.now() });
    },
    [changePage]
  );

  const isDarkTheme = usesInvertedColorSpace(themeSettings.theme);

  const handleSelectAnnotation = useCallback((id: string | null) => {
    setSelectedAnnotationId(id);
    if (!id) return;

    const selectedAnnotation = annotations.find((annotation) => annotation.id === id);
    if (
      selectedAnnotation &&
      (selectedAnnotation.type === 'highlight-line' ||
        selectedAnnotation.type === 'highlight-pen' ||
        selectedAnnotation.type === 'highlight-rect' ||
        selectedAnnotation.type === 'highlight-text')
    ) {
      setSelectedColor(selectedAnnotation.color);
      const paletteIndex = highlightColors.findIndex(
        (color) => color.toLowerCase() === selectedAnnotation.color.toLowerCase()
      );
      if (paletteIndex >= 0) setSelectedPaletteIndex(paletteIndex);
    }
  }, [annotations, highlightColors]);

  useEffect(() => {
    document.documentElement.dataset.uiTheme = isDarkTheme ? 'dark' : 'light';
    return () => {
      delete document.documentElement.dataset.uiTheme;
    };
  }, [isDarkTheme]);

  // Handle View Mode persistence
  const handleChangeViewMode = (mode: ViewMode) => {
    if (companionPdfDoc && mode !== 'continuous') {
      closeCompanionPdf();
    }
    setViewMode(mode);
    saveViewMode(mode);
  };

  const [lastActiveDoc, setLastActiveDoc] = useState<LastActiveDocument | null>(() => loadLastActiveDoc());

  useEffect(() => {
    if (docInfo && pdfDoc) {
      const active: LastActiveDocument = {
        documentId: docInfo.libraryId,
        fileName: docInfo.fileName,
        filePath: docInfo.filePath,
        lastReadPage: currentPage,
        numPages: pdfDoc.numPages,
        timestamp: Date.now(),
      };
      setLastActiveDoc(active);
      saveLastActiveDoc(active);
    }
  }, [docInfo, pdfDoc, currentPage]);

  const openPdfInReader = useCallback(
    async (
      data: Uint8Array | ArrayBuffer,
      fileName: string,
      filePath?: string,
      initialPage?: number,
      documentId?: string
    ) => {
      closeCompanionPdf();
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      void idbSaveActivePdf(bytes, fileName);
      const loaded = await loadPdf(data, fileName, filePath, initialPage, documentId);
      if (loaded) setCurrentScreen('reader');
      else showToast(`Could not open ${fileName}.`, true);
      return loaded;
    },
    [closeCompanionPdf, loadPdf, showToast]
  );

  const handleResumeReading = useCallback(async () => {
    if (pdfDoc) {
      setCurrentScreen('reader');
      return;
    }
    const targetDoc = lastActiveDoc || loadLastActiveDoc();
    if (!targetDoc) return;

    try {
      if (isTauri() && targetDoc.filePath) {
        const fileData = await tauriReadFile(targetDoc.filePath);
        if (fileData) {
          if (targetDoc.documentId) {
            await tauriTouchLibraryDocument(targetDoc.documentId, targetDoc.lastReadPage);
          }
          const loaded = await openPdfInReader(
            fileData.data,
            fileData.fileName,
            fileData.filePath,
            targetDoc.lastReadPage,
            targetDoc.documentId
          );
          if (loaded) return;
        }
        showToast(`Could not locate "${targetDoc.fileName}".`, true);
      } else {
        const cached = await idbLoadActivePdf();
        if (cached && cached.data) {
          const loaded = await openPdfInReader(
            cached.data,
            cached.fileName,
            undefined,
            targetDoc.lastReadPage,
            targetDoc.documentId
          );
          if (loaded) return;
        }
        showToast('Please open a PDF to start reading.', true);
      }
    } catch (err) {
      console.error('Failed to resume reading last document:', err);
      showToast('Failed to reopen document.', true);
    }
  }, [pdfDoc, lastActiveDoc, openPdfInReader, showToast]);

  const openPdfPairInReader = useCallback(
    async (
      primary: { data: Uint8Array; fileName: string; filePath?: string; initialPageNumber?: number; documentId?: string },
      companion: { data: Uint8Array; fileName: string; filePath?: string }
    ) => {
      const primaryOpened = await openPdfInReader(
        primary.data,
        primary.fileName,
        primary.filePath,
        primary.initialPageNumber,
        primary.documentId
      );
      if (!primaryOpened) return false;
      return loadCompanionPdf(companion.data, companion.fileName);
    },
    [loadCompanionPdf, openPdfInReader]
  );

  // Open PDF File (Desktop native dialog or Browser File Input fallback)
  const handleOpenPdf = async () => {
    if (isTauri()) {
      const imported = await tauriImportLibraryPdf();
      if (imported && imported.filePath) {
        const fileData = await tauriReadFile(imported.filePath);
        if (fileData) {
          await tauriTouchLibraryDocument(imported.id, imported.lastReadPage || 1);
          recordRecentDoc({
            fileName: fileData.fileName,
            filePath: fileData.filePath,
            fileSize: fileData.data.byteLength,
            modifiedTimestamp: Date.now(),
            lastReadPage: imported.lastReadPage || 1,
          });
          await openPdfInReader(
            fileData.data,
            fileData.fileName,
            fileData.filePath,
            imported.lastReadPage,
            imported.id
          );
        }
      }
    } else {
      pdfInputRef.current?.click();
    }
  };

  const handlePdfInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async () => {
        if (reader.result instanceof ArrayBuffer) {
          const bytes = new Uint8Array(reader.result);
          recordRecentDoc({
            fileName: file.name,
            filePath: file.name,
            fileSize: file.size,
            modifiedTimestamp: file.lastModified || Date.now(),
          });
          await openPdfInReader(bytes, file.name);
        }
      };
      reader.readAsArrayBuffer(file);
    }
    e.target.value = '';
  };

  // Unified image addition handler that measures natural dimensions and places image with exact aspect ratio
  const handleAddImage = useCallback(
    async (
      dataUrl: string,
      targetPage: number,
      fileName: string = 'Attached Image',
      cursorPos?: { x: number; y: number } | null
    ) => {
      try {
        const { width: imgW, height: imgH, aspectRatio } = await getImageDimensions(dataUrl);
        let pageW = 595;
        let pageH = 842;
        if (pdfDoc) {
          try {
            const page = await pdfDoc.getPage(targetPage);
            const vp = page.getViewport({ scale: 1.0 });
            pageW = vp.width;
            pageH = vp.height;
          } catch {}
        }

        addAttachedImage(targetPage, dataUrl, aspectRatio, fileName, {
          x: cursorPos ? cursorPos.x : undefined,
          y: cursorPos ? cursorPos.y : undefined,
          pageWidth: pageW,
          pageHeight: pageH,
          imageWidth: imgW,
          imageHeight: imgH,
          attachedInInvertedMode: isDarkTheme,
          invertInLightMode: isDarkTheme,
        });
        setActiveTool('select');
      } catch (err) {
        console.error('Failed to attach image:', err);
      }
    },
    [pdfDoc, addAttachedImage, isDarkTheme]
  );

  // Open Image to Attach (Desktop native dialog or Browser File Input fallback)
  const handleOpenImage = async () => {
    if (isTauri()) {
      const imgData = await tauriOpenImage();
      if (imgData) {
        const targetPage = cursorPosRef.current ? cursorPosRef.current.pageNumber : currentPage;
        const cursorPos = cursorPosRef.current ? { x: cursorPosRef.current.x, y: cursorPosRef.current.y } : null;
        await handleAddImage(imgData.dataUrl, targetPage, imgData.fileName, cursorPos);
      }
    } else {
      imageInputRef.current?.click();
    }
  };

  const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async () => {
        if (typeof reader.result === 'string') {
          const targetPage = cursorPosRef.current ? cursorPosRef.current.pageNumber : currentPage;
          const cursorPos = cursorPosRef.current ? { x: cursorPosRef.current.x, y: cursorPosRef.current.y } : null;
          await handleAddImage(reader.result, targetPage, file.name, cursorPos);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  // Handle Drag & Drop of image directly onto a page canvas
  const handleImageDropOnPage = (pageNumber: number, file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        const cursorPos =
          cursorPosRef.current && cursorPosRef.current.pageNumber === pageNumber
            ? { x: cursorPosRef.current.x, y: cursorPosRef.current.y }
            : { x: 0.5, y: 0.5 };
        await handleAddImage(reader.result, pageNumber, file.name, cursorPos);
      }
    };
    reader.readAsDataURL(file);
  };

  // Tool selection handler that syncs sidebar when snip tool is selected
  const handleSelectTool = useCallback((tool: ToolType) => {
    setActiveTool(tool);
    if (tool === 'snip') {
      setIsSidebarOpen(true);
      setSidebarTab('snippets');
    }
  }, []);

  // Snippet capture handler from canvas
  const handleCaptureSnippet = useCallback(
    async (pageNumber: number, rect: { x: number; y: number; width: number; height: number }) => {
      try {
        const entry = await cropCanvasRegion(pageNumber, rect, pdfDoc);
        if (entry) {
          addSnippet(entry);
          setIsSidebarOpen(true);
          setSidebarTab('snippets');
          showToast(`Captured snippet from Page ${pageNumber}!`);
        }
      } catch (err) {
        console.error('Failed to capture snippet:', err);
        showToast('Failed to capture snippet', true);
      }
    },
    [pdfDoc, addSnippet, showToast]
  );

  const handleCopyStitchedSnippets = useCallback(
    async (options?: StitchOptions) => {
      return await copyStitchedSnippetsToClipboard(snippets, options);
    },
    [snippets]
  );

  const handleDownloadStitchedSnippets = useCallback(
    async (options?: StitchOptions) => {
      const baseName = docInfo?.fileName || 'document';
      return await downloadStitchedSnippets(snippets, baseName, options);
    },
    [snippets, docInfo]
  );

  // Quick keyboard shortcut handler to copy stitched snippets
  const handleQuickCopyStitched = useCallback(async () => {
    if (snippets.length === 0) {
      showToast('No snippets to copy. Snip an area with C first.', true);
      return;
    }
    const ok = await copyStitchedSnippetsToClipboard(snippets);
    if (ok) {
      showToast(`Copied ${snippets.length} stitched snippets to clipboard!`);
    } else {
      showToast('Failed to copy stitched image', true);
    }
  }, [snippets, showToast]);

  // Quick keyboard shortcut handler to dump all snippets
  const handleQuickDumpSnippets = useCallback(() => {
    if (snippets.length === 0) {
      showToast('Snippet compactor is already empty.');
      return;
    }
    const count = snippets.length;
    clearAllSnippets();
    showToast(`Dumped all ${count} snippets from compactor.`);
  }, [snippets.length, clearAllSnippets, showToast]);

  // Contextual Global Undo handler
  const handleGlobalUndo = useCallback(() => {
    if (activeTool === 'snip' || sidebarTab === 'snippets') {
      if (canUndoSnippets) {
        undoSnippets();
        showToast('Undid snippet change');
        return;
      }
    }
    if (canUndoAnnotations) {
      undoAnnotations();
      showToast('Undid annotation');
    } else if (canUndoSnippets) {
      undoSnippets();
      showToast('Undid snippet change');
    }
  }, [
    activeTool,
    sidebarTab,
    canUndoSnippets,
    canUndoAnnotations,
    undoSnippets,
    undoAnnotations,
    showToast,
  ]);

  // Contextual Global Redo handler
  const handleGlobalRedo = useCallback(() => {
    if (activeTool === 'snip' || sidebarTab === 'snippets') {
      if (canRedoSnippets) {
        redoSnippets();
        showToast('Redid snippet change');
        return;
      }
    }
    if (canRedoAnnotations) {
      redoAnnotations();
      showToast('Redid annotation');
    } else if (canRedoSnippets) {
      redoSnippets();
      showToast('Redid snippet change');
    }
  }, [
    activeTool,
    sidebarTab,
    canRedoSnippets,
    canRedoAnnotations,
    redoSnippets,
    redoAnnotations,
    showToast,
  ]);

  // Extract and Copy all text from a page
  const handleCopyPageText = useCallback(
    async (pageParam?: number | unknown) => {
      const pageNumber = typeof pageParam === 'number' && !isNaN(pageParam) ? pageParam : currentPage;
      if (!pdfDoc) return;
      try {
        const fullText = await extractPageText(pdfDoc, pageNumber);
        if (!fullText) {
          showToast(`No text found on Page ${pageNumber}.`, true);
          return;
        }

        const copied = await copyTextToClipboard(fullText);
        if (copied) {
          const wordCount = fullText.split(/\s+/).filter(Boolean).length;
          showToast(`Copied ${wordCount} words from Page ${pageNumber}!`);
        } else {
          showToast(`Could not copy to clipboard.`, true);
        }
      } catch (err) {
        console.error('Failed to copy page text:', err);
        showToast(`Failed to extract page text.`, true);
      }
    },
    [pdfDoc, currentPage, showToast]
  );

  // Copy selected text directly to clipboard
  const handleCopySelectedText = useCallback(
    async (text: string) => {
      if (!text) return;
      try {
        const copied = await copyTextToClipboard(text);
        if (copied) {
          const wordCount = text.split(/\s+/).filter(Boolean).length;
          showToast(`Copied ${wordCount} ${wordCount === 1 ? 'word' : 'words'} to clipboard!`);
        } else {
          showToast('Could not copy to clipboard.', true);
        }
      } catch (err) {
        console.error('Failed to copy selected text:', err);
        showToast('Failed to copy text.', true);
      }
    },
    [showToast]
  );

  // Copy active page text to clipboard as image
  const handleCopyPageJpg = useCallback(
    async (pageParam?: number | unknown) => {
      const pageNumber = typeof pageParam === 'number' && !isNaN(pageParam) ? pageParam : currentPage;
      if (!pdfDoc) return;
      try {
        const copiedToClipboard = await copyPageImageToClipboard(pageNumber, pdfDoc);
        if (copiedToClipboard) {
          showToast(`Page ${pageNumber} image copied to clipboard!`);
        } else {
          showToast(`Could not copy image to clipboard.`, true);
        }
      } catch (err) {
        console.error('Failed to copy page image:', err);
        showToast(`Failed to capture page image.`, true);
      }
    },
    [pdfDoc, currentPage, showToast]
  );

  const handleCopyCompanionPageText = useCallback(async () => {
    if (!companionPdfDoc) return;
    try {
      const fullText = await extractPageText(companionPdfDoc, companionCurrentPage);
      if (!fullText) {
        showToast(`No text found on Page ${companionCurrentPage}.`, true);
        return;
      }
      const copied = await copyTextToClipboard(fullText);
      const wordCount = fullText.split(/\s+/).filter(Boolean).length;
      showToast(
        copied
          ? `Copied ${wordCount} words from Page ${companionCurrentPage}!`
          : 'Could not copy to clipboard.',
        !copied
      );
    } catch (error) {
      console.error('Failed to copy companion page text:', error);
      showToast('Failed to extract page text.', true);
    }
  }, [companionCurrentPage, companionPdfDoc, showToast]);

  const handleCopyCompanionPageImage = useCallback(async () => {
    if (!companionPdfDoc) return;
    try {
      const copied = await copyPageImageToClipboard(
        companionCurrentPage,
        companionPdfDoc,
        'companion-pdf-page'
      );
      showToast(
        copied
          ? `Page ${companionCurrentPage} image copied to clipboard!`
          : 'Could not copy image to clipboard.',
        !copied
      );
    } catch (error) {
      console.error('Failed to copy companion page image:', error);
      showToast('Failed to capture page image.', true);
    }
  }, [companionCurrentPage, companionPdfDoc, showToast]);

  const handleAskAiAboutPage = useCallback(
    (pageNumber: number) => {
      if (!pdfDoc) return;
      const now = Date.now();
      const cursor =
        cursorPosRef.current && cursorPosRef.current.pageNumber === pageNumber
          ? { x: cursorPosRef.current.x, y: cursorPosRef.current.y }
          : null;

      const annotation: AiExplanationAnnotation = {
        id: `ai_page_${now}_${Math.random().toString(36).slice(2, 7)}`,
        pageNumber,
        type: 'ai-explanation',
        x: 0.01,
        y: 0.01,
        width: 0.98,
        height: 0.98,
        prompt: '',
        response: '',
        provider: 'codex',
        isOpen: true,
        cardX: cursor ? cursor.x : undefined,
        cardY: cursor ? cursor.y : undefined,
        createdAt: now,
        updatedAt: now,
      };

      addAnnotation(annotation);
      aiExplanations.openComposer(annotation.id);
      setSelectedAnnotationId(annotation.id);
      setActiveTool('select');
    },
    [addAnnotation, aiExplanations.openComposer, pdfDoc]
  );

  const requestDeletePage = useCallback(
    (pageNumber: number) => {
      if (!pdfDoc || !rawPdfBytes || !docInfo) return;
      if (pdfDoc.numPages <= 1) {
        showToast('A PDF must keep at least one page.', true);
        return;
      }
      setPagePendingDeletion(pageNumber);
    },
    [docInfo, pdfDoc, rawPdfBytes, showToast]
  );

  const handleDeletePage = useCallback(
    async () => {
      const pageNumber = pagePendingDeletion;
      if (pageNumber === null) return;
      if (!pdfDoc || !rawPdfBytes || !docInfo) return;
      if (pdfDoc.numPages <= 1) {
        showToast('A PDF must keep at least one page.', true);
        setPagePendingDeletion(null);
        return;
      }

      // Close the confirmation dialog immediately so the user can continue uninterrupted
      setPagePendingDeletion(null);
      setIsDeletingPage(true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      try {
        const updatedBytes = await deletePageFromPdf(rawPdfBytes, pageNumber);
        const updatedAnnotations = reindexAfterPageDeletion(annotations, pageNumber);
        const updatedSnippets = reindexAfterPageDeletion(snippets, pageNumber);
        const nextPage = Math.min(pageNumber, pdfDoc.numPages - 1);

        if (isTauri() && docInfo.filePath) {
          const persisted = await tauriWritePdf(updatedBytes, docInfo.filePath);
          if (!persisted) {
            showToast('Could not save the page deletion to the PDF.', true);
            return;
          }
        } else {
          void idbSaveActivePdf(updatedBytes, docInfo.fileName);
        }

        const reloaded = await loadPdf(
          updatedBytes,
          docInfo.fileName,
          docInfo.filePath,
          nextPage,
          docKey,
          docInfo.fingerprint,
          true
        );
        if (!reloaded) {
          showToast('Could not reload the PDF after deleting the page.', true);
          return;
        }

        replaceAnnotations(updatedAnnotations);
        replaceSnippets(updatedSnippets);
        setSelectedAnnotationId(null);
        cursorPosRef.current = null;
        setPageNavRequest({ page: nextPage, timestamp: Date.now() });
        showToast(
          isTauri() && docInfo.filePath
            ? `Page ${pageNumber} deleted and changes saved`
            : `Page ${pageNumber} deleted`
        );
      } catch (error) {
        console.error('Failed to delete PDF page:', error);
        showToast('Could not delete the page.', true);
      } finally {
        setIsDeletingPage(false);
      }
    },
    [
      annotations,
      docInfo,
      docKey,
      loadPdf,
      pagePendingDeletion,
      pdfDoc,
      rawPdfBytes,
      replaceAnnotations,
      replaceSnippets,
      showToast,
      snippets,
    ]
  );

  const handleAddPageBelow = useCallback(
    async (pageNumber: number) => {
      if (!pdfDoc || !rawPdfBytes || !docInfo) return;

      try {
        const targetPage = pageNumber;
        const newPageNumber = targetPage + 1;
        const updatedBytes = await addBlankPageBelow(rawPdfBytes, targetPage);
        const updatedAnnotations = reindexAfterPageInsertion(annotations, targetPage);
        const updatedSnippets = reindexAfterPageInsertion(snippets, targetPage);

        if (isTauri() && docInfo.filePath) {
          const persisted = await tauriWritePdf(updatedBytes, docInfo.filePath);
          if (!persisted) {
            showToast('Could not save the new page to the PDF.', true);
            return;
          }
        } else {
          void idbSaveActivePdf(updatedBytes, docInfo.fileName);
        }

        const reloaded = await loadPdf(
          updatedBytes,
          docInfo.fileName,
          docInfo.filePath,
          newPageNumber,
          docKey,
          docInfo.fingerprint,
          true
        );
        if (!reloaded) {
          showToast('Could not reload the PDF after adding page.', true);
          return;
        }

        replaceAnnotations(updatedAnnotations);
        replaceSnippets(updatedSnippets);
        setSelectedAnnotationId(null);
        cursorPosRef.current = null;
        setPageNavRequest({ page: newPageNumber, timestamp: Date.now() });
        showToast(
          isTauri() && docInfo.filePath
            ? `Page ${newPageNumber} added and changes saved`
            : `Page ${newPageNumber} added`
        );
      } catch (error) {
        console.error('Failed to add PDF page:', error);
        showToast('Could not add new page.', true);
      }
    },
    [
      annotations,
      docInfo,
      docKey,
      loadPdf,
      pdfDoc,
      rawPdfBytes,
      replaceAnnotations,
      replaceSnippets,
      showToast,
      snippets,
    ]
  );

  // Cursor-aware Clipboard Paste: Pastes image at mouse cursor position on hovered page
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = async () => {
            if (typeof reader.result === 'string') {
              const targetPage = cursorPosRef.current ? cursorPosRef.current.pageNumber : currentPage;
              const cursorPos = cursorPosRef.current ? { x: cursorPosRef.current.x, y: cursorPosRef.current.y } : null;

              await handleAddImage(reader.result, targetPage, 'Pasted-Image', cursorPos);
              showToast(`Pasted image on Page ${targetPage}!`);
            }
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [currentPage, handleAddImage, showToast]);

  const addHighlightsFromSelection = useCallback((style: HighlightStyle, showEmptyToast: boolean) => {
    const selection = window.getSelection();
    const highlights = createTextHighlightsFromSelection(
      selection,
      selectedColor,
      opacity,
      style
    );

    if (highlights.length === 0) {
      if (showEmptyToast) showToast('Select PDF text first', true);
      return false;
    }

    highlights.forEach(addAnnotation);
    selection?.removeAllRanges();
    const location = highlights.length === 1
      ? `Page ${highlights[0].pageNumber}`
      : `${highlights.length} pages`;
    showToast(`${style === 'underline' ? 'Underlined' : 'Highlighted'} selected text on ${location}`);
    return true;
  }, [addAnnotation, opacity, selectedColor, showToast]);

  const handleHighlightSelectedText = useCallback(() => {
    addHighlightsFromSelection(highlightStyle, true);
  }, [addHighlightsFromSelection, highlightStyle]);

  const handleUnderlineShortcut = useCallback(() => {
    if (addHighlightsFromSelection('underline', false)) return;
    handleSelectTool('highlight-line');
    setLineHighlightStyle('underline');
  }, [addHighlightsFromSelection, handleSelectTool]);

  // Global Keyboard Shortcuts
  useKeyboard({
    onOpenPdf: handleOpenPdf,
    onSavePdf: () => setIsExportModalOpen(true),
    onSaveJson: () => setIsExportModalOpen(true),
    onToggleInvert: toggleInvert,
    onToggleSearch: () => setIsSearchOpen((prev) => !prev),
    onSelectTool: handleSelectTool,
    onSelectLineTool: () => {
      handleSelectTool('highlight-line');
      setLineHighlightStyle('highlight');
    },
    onSelectUnderlineTool: handleUnderlineShortcut,
    onSelectHighlightColor: (index) => {
      const color = highlightColors[index];
      if (!color) return;

      setSelectedPaletteIndex(index);
      setSelectedColor(color);
      const selectedAnnotation = annotations.find(({ id }) => id === selectedAnnotationId);
      if (
        selectedAnnotation &&
        (selectedAnnotation.type === 'highlight-line' ||
          selectedAnnotation.type === 'highlight-pen' ||
          selectedAnnotation.type === 'highlight-rect' ||
          selectedAnnotation.type === 'highlight-text')
      ) {
        updateAnnotation(selectedAnnotation.id, { color });
      }
    },
    onUndo: handleGlobalUndo,
    onRedo: handleGlobalRedo,
    onZoomIn: () => {
      if (companionPdfDoc && activeReaderPane === 'companion') {
        setCompanionZoom((z) => Math.min(3.5, z + 0.15));
      } else {
        setZoom((z) => Math.min(3.5, z + 0.15));
      }
    },
    onZoomOut: () => {
      if (companionPdfDoc && activeReaderPane === 'companion') {
        setCompanionZoom((z) => Math.max(0.3, z - 0.15));
      } else {
        setZoom((z) => Math.max(0.3, z - 0.15));
      }
    },
    onResetZoom: () => {
      if (companionPdfDoc && activeReaderPane === 'companion') setCompanionZoom(1.15);
      else setZoom(1.15);
    },
    onNextPage: () => {
      if (companionPdfDoc && activeReaderPane === 'companion') {
        setCompanionCurrentPage((page) => Math.min(companionPdfDoc.numPages, page + 1));
        return;
      }
      const spreadStart = currentPage % 2 === 0 ? currentPage - 1 : currentPage;
      handleNavigatePage(viewMode === 'spread' ? spreadStart + 2 : currentPage + 1);
    },
    onPrevPage: () => {
      if (companionPdfDoc && activeReaderPane === 'companion') {
        setCompanionCurrentPage((page) => Math.max(1, page - 1));
        return;
      }
      const spreadStart = currentPage % 2 === 0 ? currentPage - 1 : currentPage;
      handleNavigatePage(viewMode === 'spread' ? Math.max(1, spreadStart - 2) : currentPage - 1);
    },
    onToggleZen: () => setIsZenMode((prev) => !prev),
    onToggleFullscreen: () => void toggleFullscreenWindow(),
    onEscape: () => {
      if (pagePendingDeletion !== null) {
        setPagePendingDeletion(null);
        return;
      }
      if (isSettingsOpen) {
        setIsSettingsOpen(false);
        return;
      }
      if (isShortcutsModalOpen) {
        setIsShortcutsModalOpen(false);
        return;
      }
      if (isExportModalOpen) {
        setIsExportModalOpen(false);
        return;
      }
      if (isThemeModalOpen) {
        setIsThemeModalOpen(false);
        return;
      }
      if (isSearchOpen) {
        setIsSearchOpen(false);
        return;
      }
      if (selectedAnnotationId) {
        const selectedAnn = annotations.find((a) => a.id === selectedAnnotationId);
        if (selectedAnn && selectedAnn.type === 'ai-explanation') {
          if (!selectedAnn.response) {
            deleteAnnotation(selectedAnn.id);
          } else {
            updateAnnotation(selectedAnn.id, { isOpen: false, updatedAt: Date.now() });
          }
        }
        setSelectedAnnotationId(null);
        return;
      }
      if (isZenMode) {
        setIsZenMode(false);
        return;
      }
      void exitFullscreenWindow();
    },
    onToggleSidebar: () => {
      if (currentScreen === 'reader') {
        setIsSidebarOpen((prev) => !prev);
      }
    },
    onToggleShortcuts: () => setIsShortcutsModalOpen((prev) => !prev),
    onToggleSettings: () => setIsSettingsOpen((prev) => !prev),
    onChangeViewMode: handleChangeViewMode,
    onToggleLibrary: () =>
      setCurrentScreen((prev) => (prev === 'dashboard' ? 'reader' : 'dashboard')),
    onCopyPageText: () => {
      if (companionPdfDoc && activeReaderPane === 'companion') void handleCopyCompanionPageText();
      else void handleCopyPageText(currentPage);
    },
    onCopyPageJpg: () => {
      if (companionPdfDoc && activeReaderPane === 'companion') void handleCopyCompanionPageImage();
      else void handleCopyPageJpg(currentPage);
    },
    onAddPageBelow: () => {
      if (currentScreen === 'reader' && pdfDoc) {
        void handleAddPageBelow(currentPage);
      }
    },
    onCopyStitchedSnippets: handleQuickCopyStitched,
    onClearSnippets: handleQuickDumpSnippets,
    onHighlightSelectedText: handleHighlightSelectedText,
    onDeleteSelectedAnnotation: () => {
      if (selectedAnnotationId) {
        deleteAnnotation(selectedAnnotationId);
        setSelectedAnnotationId(null);
      }
    },
  });

  // Native macOS Application Menu Events
  const menuHandlerRef = useRef({
    handleOpenPdf,
    handleImportAnnotations,
    annotations,
    docInfo,
    showToast,
    setIsExportModalOpen,
    setIsSettingsOpen,
    toggleInvert,
    handleChangeViewMode,
    setZoom,
    setIsSidebarOpen,
    setIsZenMode,
    setIsShortcutsModalOpen,
    pdfDoc,
  });

  menuHandlerRef.current = {
    handleOpenPdf,
    handleImportAnnotations,
    annotations,
    docInfo,
    showToast,
    setIsExportModalOpen,
    setIsSettingsOpen,
    toggleInvert,
    handleChangeViewMode,
    setZoom,
    setIsSidebarOpen,
    setIsZenMode,
    setIsShortcutsModalOpen,
    pdfDoc,
  };

  useEffect(() => {
    if (!isTauri()) return;
    const unsubscribe = listenToNativeMenuEvents((action) => {
      const h = menuHandlerRef.current;
      switch (action) {
        case 'open_pdf':
          h.handleOpenPdf();
          break;
        case 'import_annotations':
          void (async () => {
            try {
              const fileData = await openAnnotationsJsonFile();
              if (!fileData) return;
              const imported = parseAnnotationsJson(fileData.content);
              h.handleImportAnnotations(imported, 'replace');
            } catch (err) {
              h.showToast(err instanceof Error ? err.message : 'Failed to import annotations', true);
            }
          })();
          break;
        case 'export_annotations':
          if (!h.pdfDoc) {
            h.showToast('Open a PDF first to export annotations', true);
            return;
          }
          void (async () => {
            try {
              const baseName = (h.docInfo?.fileName || 'document').replace(/\.pdf$/i, '');
              const exportName = `${baseName}_annotations.json`;
              const res = await exportAnnotationsJson(h.annotations, exportName);
              if (res.success) {
                h.showToast(`Saved annotations to ${exportName}`);
              }
            } catch (err) {
              h.showToast(err instanceof Error ? err.message : 'Failed to export annotations', true);
            }
          })();
          break;
        case 'open_transfer_modal':
          if (!h.pdfDoc) {
            h.showToast('Open a PDF first to transfer annotations', true);
            return;
          }
          h.setIsExportModalOpen(true);
          break;
        case 'settings':
          h.setIsSettingsOpen(true);
          break;
        case 'toggle_theme':
        case 'toggle_invert':
          h.toggleInvert();
          break;
        case 'view_continuous':
          h.handleChangeViewMode('continuous');
          break;
        case 'view_single':
          h.handleChangeViewMode('single');
          break;
        case 'view_spread':
          h.handleChangeViewMode('spread');
          break;
        case 'zoom_in':
          h.setZoom((z) => Math.min(3.0, z + 0.15));
          break;
        case 'zoom_out':
          h.setZoom((z) => Math.max(0.4, z - 0.15));
          break;
        case 'zoom_reset':
          h.setZoom(1.0);
          break;
        case 'toggle_sidebar':
          h.setIsSidebarOpen((prev) => !prev);
          break;
        case 'toggle_zen':
          h.setIsZenMode((prev) => !prev);
          break;
        case 'keyboard_shortcuts':
          h.setIsShortcutsModalOpen(true);
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div
      data-ui-theme={isDarkTheme ? 'dark' : 'light'}
      className="macos-window h-screen w-screen flex flex-col bg-[#1e1e24] text-[#f0f0f4] overflow-hidden select-none transition-colors duration-200"
    >
      {/* Hidden File Inputs for Browser Fallback */}
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handlePdfInputChange}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageInputChange}
      />

      {/* Floating Dynamic Feedback Toast */}
      {toastMessage && (
        <div className="fixed top-13 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#26262e]/95 border border-[#3e3e4c] text-xs text-zinc-100 shadow-2xl backdrop-blur-md animate-slide-down pointer-events-none">
          {toastMessage.isError ? (
            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          ) : (
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          )}
          <span className="font-medium">{toastMessage.text}</span>
        </div>
      )}

      {isLoading && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
          aria-label="Opening PDF"
        >
          <div className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--popover)] px-4 py-2.5 text-xs font-medium text-zinc-200 shadow-xl">
            <LoaderCircle className="h-4 w-4 animate-spin text-blue-500" />
            <span>Opening PDF…</span>
          </div>
        </div>
      )}

      {/* VIEW 1: DASHBOARD & SAVED DIRECTORIES LIBRARY */}
      {currentScreen === 'dashboard' ? (
        <Dashboard
          hasActiveDoc={Boolean(pdfDoc || lastActiveDoc)}
          activeDocName={docInfo?.fileName || lastActiveDoc?.fileName}
          isDarkTheme={isDarkTheme}
          onToggleTheme={toggleInvert}
          onResumeReading={handleResumeReading}
          onSwitchToReader={() => setCurrentScreen('reader')}
          onOpenPdf={openPdfInReader}
          onOpenPdfPair={openPdfPairInReader}
          themeSettings={themeSettings}
          onSelectTheme={setTheme}
          onUpdateThemeSetting={updateThemeSetting}
          onResetThemeFilters={resetThemeFilters}
          viewMode={viewMode}
          onChangeViewMode={handleChangeViewMode}
        />
      ) : (
        /* VIEW 2: FULL READER & ANNOTATION STUDIO */
        <>
          {/* Top Header & Titlebar */}
          <Header
            docInfo={docInfo}
            currentPage={companionPdfDoc && activeReaderPane === 'companion' ? companionCurrentPage : currentPage}
            numPages={companionPdfDoc && activeReaderPane === 'companion' ? companionPdfDoc.numPages : pdfDoc?.numPages || 0}
            zoom={companionPdfDoc && activeReaderPane === 'companion' ? companionZoom : zoom}
            activeDocumentName={companionPdfDoc && activeReaderPane === 'companion' ? companionFileName : docInfo?.fileName}
            viewMode={viewMode}
            theme={themeSettings.theme}
            isZenMode={isZenMode}
            isSearchOpen={isSearchOpen}
            annotationCount={annotations.length}
            saveStatus={saveStatus}
            onOpenDashboard={() => setCurrentScreen('dashboard')}
            onToggleSearch={() => setIsSearchOpen((prev) => !prev)}
            onToggleInvert={toggleInvert}
            onOpenThemeModal={() => setIsThemeModalOpen(true)}
            onToggleZen={() => setIsZenMode((prev) => !prev)}
            onToggleShortcuts={() => setIsShortcutsModalOpen(true)}
            onChangeViewMode={handleChangeViewMode}
            onChangeZoom={activeReaderPane === 'companion' ? setCompanionZoom : setZoom}
            onFitPage={() => {
              if (companionPdfDoc && activeReaderPane === 'companion') {
                setCompanionZoom(0.75);
              } else {
                setFitPageRequest((request) => ({
                  id: (request?.id ?? 0) + 1,
                  page: currentPage,
                }));
              }
            }}
            onPageChange={activeReaderPane === 'companion'
              ? (page) => setCompanionCurrentPage(Math.max(1, Math.min(companionPdfDoc?.numPages || 1, page)))
              : handleNavigatePage}
            onCopyPageText={() => {
              if (companionPdfDoc && activeReaderPane === 'companion') void handleCopyCompanionPageText();
              else void handleCopyPageText(currentPage);
            }}
            onCopyPageJpg={() => {
              if (companionPdfDoc && activeReaderPane === 'companion') void handleCopyCompanionPageImage();
              else void handleCopyPageJpg(currentPage);
            }}
          />

          {/* Main Reading & Sidebar Workspace */}
          <div className="flex-1 flex overflow-hidden relative">
            {/* Navigation Sidebar */}
            <Sidebar
              isOpen={isSidebarOpen && !isZenMode}
              activeTab={sidebarTab}
              onTabChange={setSidebarTab}
              pdfDoc={pdfDoc}
              docInfo={docInfo}
              outline={outline}
              currentPage={currentPage}
              numPages={pdfDoc?.numPages || 0}
              annotations={annotations}
              filterClass={getPageFilterClass()}
              customFilterStyle={getCustomFilterStyle()}
              onClose={() => setIsSidebarOpen(false)}
              onPageSelect={handleNavigatePage}
              onSelectAnnotation={handleSelectAnnotation}
              onDeleteAnnotation={(id) => deleteAnnotation(id)}
              onDeletePage={requestDeletePage}
              snippets={snippets}
              isSnipActive={activeTool === 'snip'}
              canUndoSnippets={canUndoSnippets}
              canRedoSnippets={canRedoSnippets}
              onUndoSnippets={undoSnippets}
              onRedoSnippets={redoSnippets}
              onToggleSnipTool={() => handleSelectTool(activeTool === 'snip' ? 'select' : 'snip')}
              onAddDivider={addDivider}
              onRemoveSnippetEntry={removeSnippetEntry}
              onMoveSnippetEntry={moveSnippetEntry}
              onUpdateDivider={updateDivider}
              onUpdateSnippetLabel={updateSnippetLabel}
              onClearAllSnippets={clearAllSnippets}
              onCopyStitchedImage={handleCopyStitchedSnippets}
              onDownloadStitchedImage={handleDownloadStitchedSnippets}
              showToast={showToast}
            />

            {!isZenMode && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                className={`macos-sidebar-collapse-control canvas-sidebar-toggle transition-all duration-200 ease-out ${
                  !isSidebarOpen
                    ? 'opacity-100 translate-x-0 pointer-events-auto'
                    : 'opacity-0 -translate-x-3 pointer-events-none'
                }`}
                title="Show Sidebar"
              >
                <SidebarIcon className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Primary PDF Canvas Viewport */}
            <div className="flex-1 min-w-0 relative overflow-hidden flex bg-[var(--workspace)]">
              <PDFViewer
                key={companionPdfDoc ? 'read-together' : 'single-document'}
                pdfDoc={pdfDoc}
                companionPdfDoc={companionPdfDoc}
                primaryFileName={docInfo?.fileName || 'Primary PDF'}
                companionFileName={companionFileName}
                companionCurrentPage={companionCurrentPage}
                companionZoom={companionZoom}
                activePane={activeReaderPane}
                rawPdfBytes={rawPdfBytes}
                currentPage={currentPage}
                numPages={pdfDoc?.numPages || 0}
                pageNavRequest={pageNavRequest}
                zoom={zoom}
                viewMode={viewMode}
                currentTheme={themeSettings.theme}
                filterClass={getPageFilterClass()}
                customFilterStyle={getCustomFilterStyle()}
                activeTool={activeTool}
                selectedColor={selectedColor}
                highlightColors={highlightColors}
                strokeWidth={strokeWidth}
                opacity={opacity}
                highlightStyle={highlightStyle}
                lineHighlightStyle={lineHighlightStyle}
                annotations={annotations}
                selectedAnnotationId={selectedAnnotationId}
                onPageChange={(p) => changePage(p)}
                onCompanionPageChange={setCompanionCurrentPage}
                onCompanionZoomChange={setCompanionZoom}
                onActivePaneChange={setActiveReaderPane}
                onSelectAnnotation={handleSelectAnnotation}
                onAddAnnotation={(ann) => addAnnotation(ann)}
                onUpdateAnnotation={(id, up) => updateAnnotation(id, up)}
                onChangeHighlightStyle={setHighlightStyle}
                onChangeLineHighlightStyle={setLineHighlightStyle}
                onDeleteAnnotation={(id) => deleteAnnotation(id)}
                onImageDrop={handleImageDropOnPage}
                onCursorMove={(page, x, y) => {
                  cursorPosRef.current = { pageNumber: page, x, y };
                }}
                onCaptureSnippet={handleCaptureSnippet}
                aiJobs={aiExplanations.jobs}
                onAiBoxCreated={(id) => {
                  setSelectedAnnotationId(id);
                  aiExplanations.openComposer(id);
                }}
                onSelectTool={handleSelectTool}
                onSubmitAi={(annotation, prompt) => {
                  void aiExplanations.submit(annotation, prompt);
                  if (activeTool === 'ai-box') {
                    setActiveTool('select');
                  }
                }}
                onCancelAi={(annotationId) => {
                  void aiExplanations.cancel(annotationId);
                  if (activeTool === 'ai-box') {
                    setActiveTool('select');
                  }
                }}
                onCloseAi={(annotationId) => {
                  aiExplanations.close(annotationId);
                  if (activeTool === 'ai-box') {
                    setActiveTool('select');
                  }
                }}
                onAddPageBelow={handleAddPageBelow}
                onDeletePage={requestDeletePage}
                onCopySelectedText={(text) => void handleCopySelectedText(text)}
                onCopyPageText={(pageNumber) => void handleCopyPageText(pageNumber)}
                onCopyPageImage={(pageNumber) => void handleCopyPageJpg(pageNumber)}
                onAskAiAboutPage={handleAskAiAboutPage}
                onPdfFileDrop={(file) => {
                  const reader = new FileReader();
                  reader.onload = async () => {
                    if (reader.result instanceof ArrayBuffer) {
                      await openPdfInReader(new Uint8Array(reader.result), file.name);
                    }
                  };
                  reader.readAsArrayBuffer(file);
                }}
                onOpenPdfClick={handleOpenPdf}
                onChangeZoom={setZoom}
                fitPageRequest={fitPageRequest}
              />

              {pdfDoc && (
                <div
                  className="reader-progress"
                  role="progressbar"
                  aria-label="Reading progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round((
                    companionPdfDoc && activeReaderPane === 'companion'
                      ? companionCurrentPage / companionPdfDoc.numPages
                      : currentPage / pdfDoc.numPages
                  ) * 100)}
                >
                  <div className="reader-progress-track">
                    <div
                      className="reader-progress-value"
                      style={{
                        width: `${(
                          companionPdfDoc && activeReaderPane === 'companion'
                            ? companionCurrentPage / companionPdfDoc.numPages
                            : currentPage / pdfDoc.numPages
                        ) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Floating Tool Dock */}
          {pdfDoc && !isZenMode && (
            <Toolbar
              activeTool={activeTool}
              selectedColor={selectedColor}
              colorPresets={highlightColors}
              isInvertedColorMode={isDarkTheme}
              strokeWidth={strokeWidth}
              opacity={opacity}
              highlightStyle={highlightStyle}
              lineHighlightStyle={lineHighlightStyle}
              canUndo={activeTool === 'snip' ? canUndoSnippets : canUndoAnnotations}
              canRedo={activeTool === 'snip' ? canRedoSnippets : canRedoAnnotations}
              onSelectTool={handleSelectTool}
              onSelectColor={(c, index) => {
                setSelectedPaletteIndex(index);
                setSelectedColor(c);
                if (selectedAnnotationId) {
                  updateAnnotation(selectedAnnotationId, { color: c });
                }
              }}
              onReplaceSelectedColor={(c) => {
                setHighlightColors((colors) =>
                  replaceHighlightPaletteColor(colors, selectedPaletteIndex, c)
                );
                setSelectedColor(c);
                if (selectedAnnotationId) {
                  updateAnnotation(selectedAnnotationId, { color: c });
                }
              }}
              onChangeStrokeWidth={(w) => setStrokeWidth(w)}
              onChangeOpacity={(o) => setOpacity(o)}
              onChangeHighlightStyle={setHighlightStyle}
              onChangeLineHighlightStyle={setLineHighlightStyle}
              onAttachImageClick={handleOpenImage}
              onUndo={handleGlobalUndo}
              onRedo={handleGlobalRedo}
              onClearPageAnnotations={() => clearAllAnnotationsForPage(currentPage)}
            />
          )}

          {/* In-Document Quick Search HUD */}
          <SearchBar
            isOpen={isSearchOpen}
            isSearching={isSearching}
            searchResults={searchResults}
            currentMatchIndex={currentMatchIndex}
            onSearch={searchInDocument}
            onNext={nextSearchResult}
            onPrev={prevSearchResult}
            onClose={() => setIsSearchOpen(false)}
          />

          {/* Reading Theme & Brightness Modal */}
          <ColorThemeModal
            isOpen={isThemeModalOpen}
            settings={themeSettings}
            onClose={() => setIsThemeModalOpen(false)}
            onSelectTheme={setTheme}
            onUpdateSetting={updateThemeSetting}
            onResetFilters={resetThemeFilters}
          />

          {/* Keyboard Shortcuts Reference Modal */}
          <KeyboardShortcutsModal
            isOpen={isShortcutsModalOpen}
            onClose={() => setIsShortcutsModalOpen(false)}
          />

          {/* Preferences & Settings Modal */}
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            themeSettings={themeSettings}
            onSelectTheme={setTheme}
            onUpdateThemeSetting={updateThemeSetting}
            onResetThemeFilters={resetThemeFilters}
            viewMode={viewMode}
            onChangeViewMode={handleChangeViewMode}
          />

          {/* PDF & Annotations Export/Import Modal */}
          <ExportModal
            isOpen={isExportModalOpen}
            rawPdfBytes={rawPdfBytes}
            annotations={annotations}
            fileName={docInfo?.fileName || 'document.pdf'}
            currentPage={currentPage}
            onClose={() => setIsExportModalOpen(false)}
            onImportAnnotations={handleImportAnnotations}
          />
        </>
      )}

      <DeletePageConfirmationDialog
        pageNumber={pagePendingDeletion}
        isDeleting={isDeletingPage}
        onCancel={() => setPagePendingDeletion(null)}
        onConfirm={() => void handleDeletePage()}
      />
    </div>
  );
}

export default App;
