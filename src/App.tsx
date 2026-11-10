import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { Toolbar } from './components/layout/Toolbar';
import { PDFViewer } from './components/viewer/PDFViewer';
import { NotePanel } from './components/viewer/NotePanel';
import { createAiClipboardAttachment } from './lib/ai/chatClipboard';
import { appendAiNotebookText, getAiNotebookContext } from './lib/ai/notebookActions';
import { notebookKey, loadNotePageCount, notePageCount, editNotePages } from './lib/notes';
import { Dashboard } from './components/dashboard/Dashboard';
import { ColorThemeModal } from './components/modals/ColorThemeModal';
import { SearchBar } from './components/layout/SearchBar';
import { KeyboardShortcutsModal } from './components/modals/KeyboardShortcutsModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { ExportModal } from './components/modals/ExportModal';
import { DeletePageConfirmationDialog } from './components/modals/DeletePageConfirmationDialog';
import { AiChatPanel } from './components/ai';
import { Check, Info, LoaderCircle, Sidebar as SidebarIcon } from 'lucide-react';
import { SparkleIcon } from './components/icons/SparkleIcon';

import { usePDFDocument } from './hooks/usePDFDocument';
import { useAnnotations } from './hooks/useAnnotations';
import { useSnippets } from './hooks/useSnippets';
import { useColorTheme } from './hooks/useColorTheme';
import { useAiExplanations } from './hooks/useAiExplanations';
import { useToast } from './hooks/useToast';
import { useDocumentSession } from './hooks/useDocumentSession';
import { usePdfPageMutations } from './hooks/usePdfPageMutations';
import { useCompanionPDF } from './hooks/useCompanionPDF';
import { usesInvertedColorSpace } from './lib/theme/readingTheme';
import {
  mergeAnnotations,
  openAnnotationsJsonFile,
  parseAnnotationsJson,
  exportAnnotationsJson,
} from './lib/annotations/annotationTransfer';
import { useKeyboard } from './hooks/useKeyboard';
import {
  loadHighlightPalette,
  loadViewMode,
  saveHighlightPalette,
  saveViewMode,
} from './lib/storage/storage';
import {
  isTauri,
  tauriOpenImage,
  tauriUpdateLibraryDocumentState,
  toggleFullscreenWindow,
  exitFullscreenWindow,
  listenToNativeMenuEvents,
} from './utils/tauriBridge';
import {
  extractPageText,
  copyTextToClipboard,
  copyPageImageToClipboard,
} from './lib/pdf/pageExtractor';
import { getImageDimensions } from './lib/media/imageUtils';
import { createTextHighlightsFromSelection } from './lib/annotations/textHighlight';
import {
  HIGHLIGHT_COLOR_PRESETS,
  replaceHighlightPaletteColor,
} from './lib/annotations/highlightStyle';
import {
  cropCanvasRegion,
  copyStitchedSnippetsToClipboard,
  downloadStitchedSnippets,
} from './lib/snippets/snippetExtractor';
import type { AiChatAttachment, AiExplanationAnnotation, Annotation, AppScreen, HighlightStyle, LineHighlightStyle, ToolType, ViewMode, StitchOptions } from './lib/types/index';
import type { SidebarTabType } from './components/layout/Sidebar';

export function App() {
  // Screen Routing: 'dashboard' (Library view) | 'reader' (PDF reader & annotation studio)
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('dashboard');

  // View & UI State
  const [zoom, setZoom] = useState<number>(1.15);
  const [fitPageRequest, setFitPageRequest] = useState<{ id: number; page: number } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewMode());
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState<boolean>(false);
  const [pendingAiAttachments, setPendingAiAttachments] = useState<AiChatAttachment[]>([]);
  const [snipTarget, setSnipTarget] = useState<'snippets' | 'ai-prompt'>('snippets');
  const [sidebarTab, setSidebarTab] = useState<SidebarTabType>('thumbnails');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isZenMode, setIsZenMode] = useState<boolean>(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState<boolean>(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isNoteMode, setIsNoteMode] = useState(false);
  const [notePaneActive, setNotePaneActive] = useState(false);
  const notesActive = isNoteMode && notePaneActive;
  const [noteZoom, setNoteZoom] = useState(.8);
  const [noteNavRequest, setNoteNavRequest] = useState<{ page: number; timestamp: number } | null>(null);
  const [noteFitRequest, setNoteFitRequest] = useState<{ id: number; page: number } | null>(null);

  // Active Toast Feedback
  const { toastMessage, showToast } = useToast();

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
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  // Active Cursor coordinates over PDF pages for precise cursor pasting
  const cursorPosRef = useRef<{ pageNumber: number; x: number; y: number } | null>(null);
  const noteCursorRef = useRef<{ pageNumber: number; x: number; y: number } | null>(null);

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

  const notesKey = notebookKey(docKey);
  useEffect(() => {
    setNoteNavRequest(null);
    noteCursorRef.current = null;
  }, [notesKey]);
  const notes = useAnnotations(notesKey);
  const [notebook, setNotebook] = useState(() => ({ key: notesKey, count: loadNotePageCount(notesKey), page: 1 }));
  if (notebook.key !== notesKey) {
    setNotebook({ key: notesKey, count: loadNotePageCount(notesKey), page: 1 });
  }
  const notesCount = notePageCount(notebook.count, notes.annotations);
  const notebookWriteState = useRef({ annotations: notes.annotations, count: notesCount, addAnnotations: notes.addAnnotations });
  notebookWriteState.current = { annotations: notes.annotations, count: notesCount, addAnnotations: notes.addAnnotations };
  const aiNotebook = useMemo(() => notesKey ? getAiNotebookContext(notesKey, notesCount, notes.annotations) : undefined,
    [notesKey, notesCount, notes.annotations]);
  const navigateNotePage = (page: number) => {
    const target = Math.max(1, Math.min(notesCount, page));
    setNotePaneActive(true);
    setNotebook((value) => ({ ...value, page: target }));
    setNoteNavRequest({ page: target, timestamp: Date.now() });
  };
  const activeNotesKey = useRef(notesKey);
  activeNotesKey.current = notesKey;
  const mutateNotePage = (page: number, action: 'insert' | 'delete') => {
    try {
      const result = editNotePages(notes.annotations, notesCount, page, action);
      localStorage.setItem(`${notesKey}:pages`, String(result.count));
      notes.replaceAnnotations(result.annotations);
      setSelectedAnnotationId(null);
      noteCursorRef.current = null;
      setNotePaneActive(true);
      setNotebook({ key: notesKey, count: result.count, page: result.page });
      setNoteNavRequest({ page: result.page, timestamp: Date.now() });
    } catch {
      showToast(`Could not ${action === 'insert' ? 'add' : 'delete'} the note page.`, true);
    }
  };
  const addNotePage = () => mutateNotePage(notesCount, 'insert');

  const {
    companionPdfDoc,
    companionFileName,
    companionCurrentPage,
    companionZoom,
    activeReaderPane,
    setCompanionCurrentPage,
    setCompanionZoom,
    setActiveReaderPane,
    closeCompanionPdf,
    loadCompanionPdf,
  } = useCompanionPDF({
    primaryFileName: docInfo?.fileName,
    onOpenCompanion: () => {
      setIsNoteMode(false);
      setViewMode('continuous');
      saveViewMode('continuous');
    },
    showToast,
  });

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

    const selectedAnnotation = [...annotations, ...notes.annotations].find((annotation) => annotation.id === id);
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
  }, [annotations, notes.annotations, highlightColors]);

  useEffect(() => {
    document.documentElement.dataset.uiTheme = isDarkTheme ? 'dark' : 'light';
    return () => {
      delete document.documentElement.dataset.uiTheme;
    };
  }, [isDarkTheme]);

  // Handle View Mode persistence
  const handleChangeViewMode = (mode: ViewMode) => {
    setIsNoteMode(false);
    if (companionPdfDoc && mode !== 'continuous') {
      closeCompanionPdf();
    }
    setViewMode(mode);
    saveViewMode(mode);
  };

  const {
    lastActiveDoc,
    pdfInputRef,
    openPdfInReader,
    openPdfPairInReader,
    handleResumeReading,
    handleOpenPdf,
    handlePdfInputChange,
  } = useDocumentSession({
    pdfDoc, docInfo, currentPage, loadPdf, closeCompanionPdf, loadCompanionPdf,
    onScreenChange: setCurrentScreen,
    showToast,
  });

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
        if (pdfDoc && !notesActive) {
          try {
            const page = await pdfDoc.getPage(targetPage);
            const vp = page.getViewport({ scale: 1.0 });
            pageW = vp.width;
            pageH = vp.height;
          } catch {}
        }

        const addImage = notesActive ? notes.addAttachedImage : addAttachedImage;
        addImage(targetPage, dataUrl, aspectRatio, fileName, {
          x: cursorPos ? cursorPos.x : undefined,
          y: cursorPos ? cursorPos.y : undefined,
          pageWidth: pageW,
          pageHeight: pageH,
          imageWidth: imgW,
          imageHeight: imgH,
          attachedInInvertedMode: !notesActive && isDarkTheme,
          invertInLightMode: !notesActive && isDarkTheme,
        });
        setActiveTool('select');
      } catch (err) {
        console.error('Failed to attach image:', err);
      }
    },
    [pdfDoc, addAttachedImage, isDarkTheme, notesActive, notes.addAttachedImage]
  );

  // Open Image to Attach (Desktop native dialog or Browser File Input fallback)
  const handleOpenImage = async () => {
    if (isTauri()) {
      const imgData = await tauriOpenImage();
      if (imgData) {
        const cursor = notesActive ? noteCursorRef.current : cursorPosRef.current;
        const targetPage = cursor?.pageNumber ?? (notesActive ? notebook.page : currentPage);
        const cursorPos = cursor ? { x: cursor.x, y: cursor.y } : null;
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
          const cursor = notesActive ? noteCursorRef.current : cursorPosRef.current;
          const targetPage = cursor?.pageNumber ?? (notesActive ? notebook.page : currentPage);
          const cursorPos = cursor ? { x: cursor.x, y: cursor.y } : null;
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
          (notesActive ? noteCursorRef.current : cursorPosRef.current)?.pageNumber === pageNumber
            ? { x: (notesActive ? noteCursorRef.current : cursorPosRef.current)!.x, y: (notesActive ? noteCursorRef.current : cursorPosRef.current)!.y }
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
      if (snipTarget !== 'ai-prompt' && !isNoteMode) {
        setIsSidebarOpen(true);
        setSidebarTab('snippets');
      }
    } else {
      setSnipTarget('snippets');
    }
  }, [snipTarget, isNoteMode]);

  // Snippet capture handler from canvas
  const handleCaptureSnippet = useCallback(
    async (pageNumber: number, rect: { x: number; y: number; width: number; height: number }) => {
      const captureNotesKey = notesKey;
      try {
        const entry = await cropCanvasRegion(pageNumber, rect, pdfDoc);
        if (entry) {
          if (activeNotesKey.current !== captureNotesKey) return;
          if (isNoteMode && snipTarget !== 'ai-prompt') {
            notes.addAttachedImage(notebook.page, entry.dataUrl, entry.aspectRatio, `Cutout from PDF page ${pageNumber}`, {
              imageWidth: entry.width, imageHeight: entry.height,
            });
            setActiveTool('select');
            showToast(`Added cutout to note page ${notebook.page}`);
          } else if (snipTarget === 'ai-prompt') {
            const newAttachment: AiChatAttachment = {
              id: `snip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: 'image',
              dataUrl: entry.dataUrl,
              pageNumber,
              width: entry.width,
              height: entry.height,
            };
            setPendingAiAttachments((prev) => [...prev, newAttachment]);
            setSnipTarget('snippets');
            setActiveTool('select');
            setIsAiPanelOpen(true);
            showToast(`Attached Page ${pageNumber} snippet to AI prompt!`);
          } else {
            addSnippet(entry);
            setIsSidebarOpen(true);
            setSidebarTab('snippets');
            setActiveTool('select');
            showToast(`Captured snippet from Page ${pageNumber}!`);
          }
        }
      } catch (err) {
        console.error('Failed to capture snippet:', err);
        showToast('Failed to capture snippet', true);
      }
    },
    [pdfDoc, snipTarget, addSnippet, showToast, isNoteMode, notesKey, notes.addAttachedImage, notebook.page]
  );

  const handleStartSnipCaptureForAi = useCallback(() => {
    setSnipTarget('ai-prompt');
    setActiveTool('snip');
    showToast('Drag a box on the PDF to attach snippet to AI prompt');
  }, [showToast]);

  const handleAttachSelectedTextToAi = useCallback((text?: unknown, pageNumber?: number) => {
    let textToAttach = typeof text === 'string' && text.trim().length > 0 ? text.trim() : '';
    if (!textToAttach) {
      const sel = window.getSelection();
      textToAttach = sel ? sel.toString().trim() : '';
    }
    if (!textToAttach) {
      showToast('Select text on the PDF to attach', true);
      return;
    }
    const newAttachment: AiChatAttachment = {
      id: `quote_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'text',
      text: textToAttach,
      pageNumber: typeof pageNumber === 'number' ? pageNumber : currentPage,
    };
    setPendingAiAttachments((prev) => [...prev, newAttachment]);
    setIsAiPanelOpen(true);
    showToast('Attached selected text to AI prompt!');
  }, [currentPage, showToast]);

  const handleRemoveAiAttachment = useCallback((id: string) => {
    setPendingAiAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

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
    if (notesActive) { notes.undo(); return; }
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
    notesActive, notes.undo,
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
    if (notesActive) { notes.redo(); return; }
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
    notesActive, notes.redo,
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

  const handleAiChatResponseDrop = useCallback(
    (pageNumber: number, x: number, y: number, prompt: string, response: string) => {
      if (!pdfDoc) return;
      const now = Date.now();

      // Regionless and page-free: the card anchors to the nearest page but its
      // position (and cardX/cardY) may sit anywhere in the workspace around it.
      const annotation: AiExplanationAnnotation = {
        id: `ai_chat_${now}_${Math.random().toString(36).slice(2, 7)}`,
        pageNumber,
        type: 'ai-explanation',
        x,
        y,
        width: 0.002,
        height: 0.002,
        prompt: prompt.trim(),
        response,
        provider: 'chat',
        isOpen: true,
        cardX: x,
        cardY: y,
        createdAt: now,
        updatedAt: now,
      };

      addAnnotation(annotation);
      setSelectedAnnotationId(annotation.id);
    },
    [addAnnotation, pdfDoc, setSelectedAnnotationId]
  );

  const handlePageMutation = useCallback((page: number) => {
    setSelectedAnnotationId(null);
    cursorPosRef.current = null;
    setPageNavRequest({ page, timestamp: Date.now() });
  }, []);

  const {
    pagePendingDeletion,
    setPagePendingDeletion,
    isDeletingPage,
    requestDeletePage,
    handleDeletePage,
    handleAddPageBelow,
  } = usePdfPageMutations({
    pdfDoc, rawPdfBytes, docInfo, docKey, loadPdf,
    annotations, replaceAnnotations, snippets, replaceSnippets,
    onPageChanged: handlePageMutation,
    showToast,
  });

  // Cursor-aware Clipboard Paste: Pastes image at mouse cursor position on hovered page
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented || (e.target instanceof Element && e.target.closest('[data-ai-chat-composer]'))) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = async () => {
            if (typeof reader.result === 'string') {
              const cursor = notesActive ? noteCursorRef.current : cursorPosRef.current;
              const targetPage = cursor?.pageNumber ?? (notesActive ? notebook.page : currentPage);
              const cursorPos = cursor ? { x: cursor.x, y: cursor.y } : null;

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
  }, [currentPage, handleAddImage, showToast, notesActive, notebook.page]);

  const addHighlightsFromSelection = useCallback(
    (style: HighlightStyle = 'box', showEmptyToast = true, color?: string) => {
      const selection = window.getSelection();
      const targetColor = color || selectedColor;
      const highlights = createTextHighlightsFromSelection(
        selection,
        targetColor,
        opacity,
        style
      );

      if (highlights.length === 0) {
        if (showEmptyToast) showToast('Select PDF text first', true);
        return false;
      }

      highlights.forEach(addAnnotation);
      selection?.removeAllRanges();
      const location =
        highlights.length === 1
          ? `Page ${highlights[0].pageNumber}`
          : `${highlights.length} pages`;
      showToast(
        `${style === 'underline' ? 'Underlined' : style === 'stroke' ? 'Boxed' : 'Highlighted'} selected text on ${location}`
      );
      return true;
    },
    [addAnnotation, opacity, selectedColor, showToast]
  );

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
      const selectedAnnotation = (notesActive ? notes.annotations : annotations).find(({ id }) => id === selectedAnnotationId);
      if (
        selectedAnnotation &&
        (selectedAnnotation.type === 'highlight-line' ||
          selectedAnnotation.type === 'highlight-pen' ||
          selectedAnnotation.type === 'highlight-rect' ||
          selectedAnnotation.type === 'highlight-text')
      ) {
        (notesActive ? notes.updateAnnotation : updateAnnotation)(selectedAnnotation.id, { color });
      }
    },
    onUndo: handleGlobalUndo,
    onRedo: handleGlobalRedo,
    onZoomIn: () => {
      if (notesActive) { setNoteZoom((zoom) => Math.min(3.5, zoom + .15)); return; }
      if (companionPdfDoc && activeReaderPane === 'companion') {
        setCompanionZoom((z) => Math.min(3.5, z + 0.15));
      } else {
        setZoom((z) => Math.min(3.5, z + 0.15));
      }
    },
    onZoomOut: () => {
      if (notesActive) { setNoteZoom((zoom) => Math.max(.3, zoom - .15)); return; }
      if (companionPdfDoc && activeReaderPane === 'companion') {
        setCompanionZoom((z) => Math.max(0.3, z - 0.15));
      } else {
        setZoom((z) => Math.max(0.3, z - 0.15));
      }
    },
    onResetZoom: () => {
      if (notesActive) { setNoteZoom(.8); return; }
      if (companionPdfDoc && activeReaderPane === 'companion') setCompanionZoom(1.15);
      else setZoom(1.15);
    },
    onNextPage: () => {
      if (notesActive) { navigateNotePage(notebook.page + 1); return; }
      if (companionPdfDoc && activeReaderPane === 'companion') {
        setCompanionCurrentPage((page) => Math.min(companionPdfDoc.numPages, page + 1));
        return;
      }
      const spreadStart = currentPage % 2 === 0 ? currentPage - 1 : currentPage;
      handleNavigatePage(viewMode === 'spread' ? spreadStart + 2 : currentPage + 1);
    },
    onPrevPage: () => {
      if (notesActive) { navigateNotePage(notebook.page - 1); return; }
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
      if (isAiPanelOpen) {
        setIsAiPanelOpen(false);
        return;
      }
      if (selectedAnnotationId) {
        const selectedAnn = (notesActive ? notes.annotations : annotations).find((a) => a.id === selectedAnnotationId);
        if (selectedAnn && selectedAnn.type === 'ai-explanation') {
          if (!selectedAnn.response) {
            (notesActive ? notes.deleteAnnotation : deleteAnnotation)(selectedAnn.id);
          } else {
            (notesActive ? notes.updateAnnotation : updateAnnotation)(selectedAnn.id, { isOpen: false, updatedAt: Date.now() });
          }
        }
        setSelectedAnnotationId(null);
        return;
      }
      if (activeTool !== 'select') {
        setActiveTool('select');
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
    onToggleAiPanel: () => {
      if (currentScreen === 'reader') {
        setIsAiPanelOpen((prev) => !prev);
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
      if (notesActive) { addNotePage(); return; }
      if (currentScreen === 'reader' && pdfDoc) {
        void handleAddPageBelow(currentPage);
      }
    },
    onCopyStitchedSnippets: handleQuickCopyStitched,
    onClearSnippets: handleQuickDumpSnippets,
    onHighlightSelectedText: handleHighlightSelectedText,
    onDeleteSelectedAnnotation: () => {
      if (selectedAnnotationId) {
        (notesActive ? notes.deleteAnnotation : deleteAnnotation)(selectedAnnotationId);
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
            currentPage={notesActive ? notebook.page : companionPdfDoc && activeReaderPane === 'companion' ? companionCurrentPage : currentPage}
            numPages={notesActive ? notesCount : companionPdfDoc && activeReaderPane === 'companion' ? companionPdfDoc.numPages : pdfDoc?.numPages || 0}
            zoom={notesActive ? noteZoom : companionPdfDoc && activeReaderPane === 'companion' ? companionZoom : zoom}
            activeDocumentName={notesActive ? `${docInfo?.fileName} · Notes` : companionPdfDoc && activeReaderPane === 'companion' ? companionFileName : docInfo?.fileName}
            canUsePageActions={!notesActive}
            viewMode={viewMode}
            theme={themeSettings.theme}
            isZenMode={isZenMode}
            isSearchOpen={isSearchOpen}
            isAiPanelOpen={isAiPanelOpen}
            annotationCount={annotations.length}
            saveStatus={notesActive ? notes.saveStatus : saveStatus}
            onOpenDashboard={() => setCurrentScreen('dashboard')}
            onToggleSearch={() => setIsSearchOpen((prev) => !prev)}
            onToggleAiPanel={() => setIsAiPanelOpen((prev) => !prev)}
            onToggleInvert={toggleInvert}
            onOpenThemeModal={() => setIsThemeModalOpen(true)}
            onToggleZen={() => setIsZenMode((prev) => !prev)}
            onToggleShortcuts={() => setIsShortcutsModalOpen(true)}
            onChangeViewMode={handleChangeViewMode}
            onChangeZoom={notesActive ? setNoteZoom : activeReaderPane === 'companion' ? setCompanionZoom : setZoom}
            isNoteMode={isNoteMode}
            onToggleNoteMode={() => {
              if (!isNoteMode) {
                closeCompanionPdf();
                setViewMode('continuous');
                saveViewMode('continuous');
                setIsSidebarOpen(false);
                setFitPageRequest((request) => ({ id: (request?.id ?? 0) + 1, page: currentPage }));
              }
              setIsNoteMode((value) => !value);
            }}
            onFitPage={() => {
              if (notesActive) {
                setNoteFitRequest((request) => ({ id: (request?.id ?? 0) + 1, page: notebook.page }));
                navigateNotePage(notebook.page);
                return;
              }
              if (companionPdfDoc && activeReaderPane === 'companion') {
                setCompanionZoom(0.75);
              } else {
                setFitPageRequest((request) => ({
                  id: (request?.id ?? 0) + 1,
                  page: currentPage,
                }));
              }
            }}
            onPageChange={notesActive ? navigateNotePage : activeReaderPane === 'companion'
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
              <div className={isNoteMode ? 'note-source-pane' : 'contents'}
                onPointerEnter={() => setNotePaneActive(false)} onPointerDownCapture={() => setNotePaneActive(false)}
                onFocusCapture={() => setNotePaneActive(false)}>
              <PDFViewer
                key={companionPdfDoc ? 'read-together' : 'single-document'}
                pdfDoc={pdfDoc}
                companionPdfDoc={companionPdfDoc}
                primaryFileName={docInfo?.fileName || 'Primary PDF'}
                companionFileName={companionFileName}
                companionCurrentPage={companionCurrentPage}
                companionZoom={companionZoom}
                activePane={activeReaderPane}
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
                onAiResponseDrop={handleAiChatResponseDrop}
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
                onAttachTextToAi={handleAttachSelectedTextToAi}
                onHighlightSelection={(style, color) => addHighlightsFromSelection(style || 'box', false, color)}
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
              {isNoteMode && pdfDoc && <NotePanel key={notesKey} notes={notes} docKey={notesKey}
                page={notebook.page} pageCount={notesCount}
                zoom={noteZoom} onZoomChange={setNoteZoom} pageNavRequest={noteNavRequest} fitPageRequest={noteFitRequest}
                activeTool={activeTool} selectedColor={selectedColor} highlightColors={highlightColors}
                strokeWidth={strokeWidth} opacity={opacity} highlightStyle={highlightStyle} lineHighlightStyle={lineHighlightStyle}
                onChangeHighlightStyle={setHighlightStyle} onChangeLineHighlightStyle={setLineHighlightStyle}
                onSelectTool={handleSelectTool} selectedAnnotationId={selectedAnnotationId} onSelectAnnotation={handleSelectAnnotation}
                onImageDrop={handleImageDropOnPage}
                onCursorMove={(pageNumber, x, y) => { noteCursorRef.current = { pageNumber, x, y }; }}
                onActivate={() => setNotePaneActive(true)}
                onPageChange={(page) => setNotebook((value) => ({ ...value, page }))}
                onAddPage={addNotePage}
                onAddPageAfter={(page) => mutateNotePage(page, 'insert')}
                onDeletePage={(page) => mutateNotePage(page, 'delete')}
                onCapture={(entry) => { addSnippet(entry); showToast('Captured note region.'); }}
                showToast={showToast}
              />}
            </div>

            {!isZenMode && (
              <button
                onClick={() => setIsAiPanelOpen(true)}
                className={`macos-sidebar-collapse-control canvas-ai-toggle transition-all duration-200 ease-out ${
                  !isAiPanelOpen
                    ? 'opacity-100 translate-x-0 pointer-events-auto'
                    : 'opacity-0 translate-x-3 pointer-events-none'
                }`}
                title="Show AI Assistant & Chat (Cmd+J)"
              >
                <SparkleIcon className="w-3.5 h-3.5" />
              </button>
            )}

            {/* AI Assistant & Chat Panel */}
            <AiChatPanel
              isOpen={isAiPanelOpen && !isZenMode}
              onClose={() => setIsAiPanelOpen(false)}
              pdfDoc={pdfDoc}
              docInfo={docInfo}
              currentPage={currentPage}
              notebook={aiNotebook}
              isDocumentLoading={isLoading}
              onAppendToNotebook={async (key, text, canApply) => {
                if (key !== activeNotesKey.current) throw new Error('The document changed. No notes were added.');
                const snapshot = notebookWriteState.current;
                const result = await appendAiNotebookText(snapshot.annotations, snapshot.count, text);
                if (!canApply() || key !== activeNotesKey.current) throw new Error('The request was cancelled. No notes were added.');
                const latest = notebookWriteState.current;
                const firstPage = latest.annotations.some((annotation) => annotation.pageNumber === latest.count) ? latest.count + 1 : latest.count;
                const shift = firstPage - result.firstPage;
                result.annotations = result.annotations.map((annotation) => ({ ...annotation, pageNumber: annotation.pageNumber + shift }));
                result.firstPage = firstPage;
                result.count += shift;
                localStorage.setItem(`${key}:pages`, String(result.count));
                latest.addAnnotations(result.annotations);
                setNotebook({ key, count: result.count, page: result.firstPage });
                setNoteNavRequest({ page: result.firstPage, timestamp: Date.now() });
                closeCompanionPdf();
                setViewMode('continuous');
                saveViewMode('continuous');
                setIsNoteMode(true);
                setNotePaneActive(true);
                setSelectedAnnotationId(result.annotations[0].id);
                return result.annotations.length === 1 ? `Added to note page ${result.firstPage}.` : `Added to note pages ${result.firstPage}–${result.count}.`;
              }}
              isSnipCapturing={activeTool === 'snip' && snipTarget === 'ai-prompt'}
              pendingAttachments={pendingAiAttachments}
              onStartSnipCapture={handleStartSnipCaptureForAi}
              onAttachSelectedText={handleAttachSelectedTextToAi}
              onRemoveAttachment={handleRemoveAiAttachment}
              onPasteImages={async (files) => {
                const key = activeNotesKey.current;
                const attachments = await Promise.all(files.map(createAiClipboardAttachment));
                if (key === activeNotesKey.current) setPendingAiAttachments((current) => [...current, ...attachments]);
              }}
            />
          </div>

          {/* Floating Tool Dock */}
          {pdfDoc && !isZenMode && (
            <Toolbar
              activeTool={activeTool}
              selectedColor={selectedColor}
              colorPresets={highlightColors}
              isInvertedColorMode={!notesActive && isDarkTheme}
              strokeWidth={strokeWidth}
              opacity={opacity}
              highlightStyle={highlightStyle}
              lineHighlightStyle={lineHighlightStyle}
              canUndo={notesActive ? notes.canUndo : activeTool === 'snip' ? canUndoSnippets : canUndoAnnotations}
              canRedo={notesActive ? notes.canRedo : activeTool === 'snip' ? canRedoSnippets : canRedoAnnotations}
              onSelectTool={handleSelectTool}
              onSelectColor={(c, index) => {
                setSelectedPaletteIndex(index);
                setSelectedColor(c);
                if (selectedAnnotationId) {
                  (notesActive ? notes.updateAnnotation : updateAnnotation)(selectedAnnotationId, { color: c });
                }
              }}
              onReplaceSelectedColor={(c) => {
                setHighlightColors((colors) =>
                  replaceHighlightPaletteColor(colors, selectedPaletteIndex, c)
                );
                setSelectedColor(c);
                if (selectedAnnotationId) {
                  (notesActive ? notes.updateAnnotation : updateAnnotation)(selectedAnnotationId, { color: c });
                }
              }}
              onChangeStrokeWidth={(w) => setStrokeWidth(w)}
              onChangeOpacity={(o) => setOpacity(o)}
              onChangeHighlightStyle={setHighlightStyle}
              onChangeLineHighlightStyle={setLineHighlightStyle}
              onAttachImageClick={handleOpenImage}
              onUndo={handleGlobalUndo}
              onRedo={handleGlobalRedo}
              onClearPageAnnotations={() => notesActive ? notes.clearAllAnnotationsForPage(notebook.page) : clearAllAnnotationsForPage(currentPage)}
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
            getPdfBytes={() => rawPdfBytes}
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
