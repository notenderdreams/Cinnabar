import React, { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react';
import {
  FolderPlus,
  FolderOpen,
  FileText,
  Search,
  Star,
  Clock,
  RefreshCw,
  Trash2,
  BookOpen,
  ArrowRight,
  HardDrive,
  Folder,
  Moon,
  Sun,
  ChevronDown,
  Check,
  ArrowUpDown,
  Settings,
} from 'lucide-react';
import type { DashboardPdfItem, ReadingTheme, SavedDirectory, ThemeSettings, ViewMode } from '../../lib/types/index';
import {
  isTauri,
  tauriScanDirectoryPdfs,
  tauriReadFile,
  tauriListLibrary,
  tauriImportLibraryPdf,
  tauriImportLibraryFolder,
  tauriRefreshLibrary,
  tauriRemoveLibraryFolder,
  tauriRemoveLibraryDocument,
  tauriSetLibraryFavorite,
  tauriTouchLibraryDocument,
  tauriRelinkLibraryDocument,
  handleTitlebarMouseDown,
} from '../../utils/tauriBridge';
import {
  loadSavedDirectories,
  saveSavedDirectories,
  loadRecentDocs,
  recordRecentDoc,
  loadFavorites,
  toggleFavorite as toggleStorageFavorite,
  loadLibraryFilter,
  saveLibraryFilter,
  loadLibrarySort,
  saveLibrarySort,
} from '../../lib/storage/storage';
import { SettingsModal } from '../modals/SettingsModal';

interface DashboardProps {
  onOpenPdf: (data: Uint8Array, fileName: string, filePath?: string, initialPageNumber?: number, documentId?: string) => Promise<boolean>;
  onOpenPdfPair: (
    primary: { data: Uint8Array; fileName: string; filePath?: string; initialPageNumber?: number; documentId?: string },
    companion: { data: Uint8Array; fileName: string; filePath?: string }
  ) => Promise<boolean>;
  onSwitchToReader: () => void;
  onResumeReading?: () => void;
  hasActiveDoc: boolean;
  activeDocName?: string;
  isDarkTheme: boolean;
  onToggleTheme: () => void;
  // Theme & Appearance
  themeSettings?: ThemeSettings;
  onSelectTheme?: (theme: ReadingTheme) => void;
  onUpdateThemeSetting?: <K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => void;
  onResetThemeFilters?: () => void;
  // View mode
  viewMode?: ViewMode;
  onChangeViewMode?: (mode: ViewMode) => void;
}

type FilterTab = 'all' | 'recent' | 'favorites' | string; // string for specific directory ID
type SortOption = 'recent' | 'name' | 'size';

const SORT_OPTIONS: { value: SortOption; label: string; icon: React.FC<{ className?: string }> }[] = [
  { value: 'recent', label: 'Recently opened', icon: Clock },
  { value: 'name', label: 'File name', icon: FileText },
  { value: 'size', label: 'File size', icon: HardDrive },
];

export const Dashboard: React.FC<DashboardProps> = ({
  onOpenPdf,
  onOpenPdfPair,
  onSwitchToReader,
  onResumeReading,
  hasActiveDoc,
  activeDocName,
  isDarkTheme,
  onToggleTheme,
  themeSettings,
  onSelectTheme,
  onUpdateThemeSetting,
  onResetThemeFilters,
  viewMode,
  onChangeViewMode,
}) => {
  const [directories, setDirectories] = useState<SavedDirectory[]>(() => loadSavedDirectories());
  const [pdfItems, setPdfItems] = useState<DashboardPdfItem[]>([]);
  const [recentDocs, setRecentDocs] = useState<DashboardPdfItem[]>(() => loadRecentDocs());
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => loadFavorites());
  const [activeFilter, setActiveFilter] = useState<FilterTab>(() => loadLibraryFilter());
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [sortBy, setSortBy] = useState<SortOption>(() => loadLibrarySort());
  const [isScanning, setIsScanning] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedPdfIds, setSelectedPdfIds] = useState<string[]>([]);
  const [isOpeningPair, setIsOpeningPair] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const browserPdfInputRef = useRef<HTMLInputElement | null>(null);

  // Keyboard shortcut: Cmd+, / Ctrl+, / Ctrl+Cmd+, / Shift+, to toggle settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const isSettingsKey = e.key === ',' || e.key === '<' || e.code === 'Comma';
      if (isCmdOrCtrl && isSettingsKey) {
        e.preventDefault();
        setIsSettingsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Persist active filter & selected folder tab
  useEffect(() => {
    saveLibraryFilter(activeFilter);
  }, [activeFilter]);

  // If active filter is a specific folder that no longer exists in directories, fallback to all
  useEffect(() => {
    if (
      activeFilter !== 'all' &&
      activeFilter !== 'recent' &&
      activeFilter !== 'favorites' &&
      directories.length > 0 &&
      !directories.some((d) => d.id === activeFilter)
    ) {
      setActiveFilter('all');
    }
  }, [activeFilter, directories]);

  // Persist library sorting preference
  useEffect(() => {
    saveLibrarySort(sortBy);
  }, [sortBy]);

  useEffect(() => {
    if (!isSortOpen) return;

    const closeSortMenu = (event: MouseEvent) => {
      if (!sortMenuRef.current?.contains(event.target as Node)) {
        setIsSortOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSortOpen(false);
    };

    document.addEventListener('mousedown', closeSortMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeSortMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isSortOpen]);

  // Auto-scan all saved directories
  const scanAllDirectories = useCallback(async (dirList: SavedDirectory[]) => {
    setIsScanning(true);
    if (isTauri()) {
      try {
        const snapshot = await tauriRefreshLibrary();
        setDirectories(snapshot.directories);
        setPdfItems(snapshot.documents);
      } finally {
        setIsScanning(false);
      }
      return;
    }
    const allFound: DashboardPdfItem[] = [];
    const updatedDirs = [...dirList];

    for (let i = 0; i < updatedDirs.length; i++) {
      const dir = updatedDirs[i];
      if (isTauri()) {
        const results = await tauriScanDirectoryPdfs(dir.path);
        updatedDirs[i] = {
          ...dir,
          pdfCount: results.length,
        };

        results.forEach((res) => {
          allFound.push({
            id: res.file_path,
            fileName: res.file_name,
            filePath: res.file_path,
            fileSize: res.file_size,
            modifiedTimestamp: res.modified_timestamp,
            directoryPath: dir.path,
            numPages: res.num_pages ?? undefined,
          });
        });
      }
    }

    setDirectories(updatedDirs);
    saveSavedDirectories(updatedDirs);
    setPdfItems(allFound);
    setIsScanning(false);
  }, []);

  // Refresh library snapshot whenever returning to Dashboard or on window focus
  const refreshLibrarySnapshot = useCallback(async () => {
    if (isTauri()) {
      try {
        const snapshot = await tauriListLibrary();
        setDirectories(snapshot.directories);
        setPdfItems(snapshot.documents);
      } catch (error) {
        console.error('Failed to refresh library snapshot:', error);
      }
    }
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      void refreshLibrarySnapshot();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshLibrarySnapshot]);

  // Load the durable catalog
  useEffect(() => {
    const initDirs = async () => {
      if (isTauri()) {
        try {
          const snapshot = await tauriListLibrary();
          setDirectories(snapshot.directories);
          setPdfItems(snapshot.documents);
          return;
        } catch (error) {
          console.error('Failed to initialize PDF library:', error);
        }
      }
      const saved = loadSavedDirectories();
      if (saved.length > 0) {
        scanAllDirectories(saved);
      }
    };
    initDirs();
  }, [scanAllDirectories]);

  // Handle Adding a new directory
  const handleAddDirectory = async () => {
    if (isTauri()) {
      const snapshot = await tauriImportLibraryFolder();
      if (snapshot) {
        setDirectories(snapshot.directories);
        setPdfItems(snapshot.documents);
      }
    } else {
      // Browser Web fallback directory name
      const customName = prompt('Enter a directory / collection label:');
      if (customName) {
        const newDir: SavedDirectory = {
          id: `dir_${Date.now()}`,
          path: customName,
          name: customName,
          addedAt: Date.now(),
          pdfCount: 0,
        };
        const updated = [...directories, newDir];
        setDirectories(updated);
        saveSavedDirectories(updated);
      }
    }
  };

  // Remove a saved directory
  const handleRemoveDirectory = async (dirId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTauri()) {
      const snapshot = await tauriRemoveLibraryFolder(dirId, true);
      setDirectories(snapshot.directories);
      setPdfItems(snapshot.documents);
      if (activeFilter === dirId) setActiveFilter('all');
      return;
    }
    const updated = directories.filter((d) => d.id !== dirId);
    setDirectories(updated);
    saveSavedDirectories(updated);
    if (activeFilter === dirId) {
      setActiveFilter('all');
    }
    scanAllDirectories(updated);
  };

  // Toggle favorite status
  const handleToggleFavorite = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTauri()) {
      const item = pdfItems.find((document) => document.id === docId);
      if (!item) return;
      const favorite = !item.isFavorite;
      await tauriSetLibraryFavorite(docId, favorite);
      setPdfItems((items) => items.map((document) => document.id === docId ? { ...document, isFavorite: favorite } : document));
      return;
    }
    toggleStorageFavorite(docId);
    setFavoriteIds(loadFavorites());
  };

  const handleRemoveDocument = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isTauri()) return;
    await tauriRemoveLibraryDocument(docId);
    setPdfItems((items) => items.filter((document) => document.id !== docId));
    setSelectedPdfIds((items) => items.filter((id) => id !== docId));
  };

  // Open PDF file handler
  const handleOpenItem = async (item: DashboardPdfItem) => {
    if (isTauri() && item.filePath) {
      if (item.availability === 'missing') {
        const relinked = await tauriRelinkLibraryDocument(item.id);
        if (!relinked) return;
        setPdfItems((items) => items.map((document) => document.id === item.id ? relinked : document));
        item = relinked;
      }
      const fileData = await tauriReadFile(item.filePath);
      if (fileData) {
        await tauriTouchLibraryDocument(item.id, item.lastReadPage || 1);
        setPdfItems((items) => items.map((document) => document.id === item.id ? { ...document, lastOpenedAt: Date.now() } : document));
        await onOpenPdf(fileData.data, fileData.fileName, fileData.filePath, item.lastReadPage, item.id);
        return;
      }

      // If file was not readable at its path, offer relinking
      const relinked = await tauriRelinkLibraryDocument(item.id);
      if (relinked && relinked.filePath) {
        setPdfItems((items) => items.map((document) => document.id === item.id ? relinked : document));
        const relinkedFileData = await tauriReadFile(relinked.filePath);
        if (relinkedFileData) {
          await tauriTouchLibraryDocument(relinked.id, relinked.lastReadPage || 1);
          setPdfItems((items) => items.map((document) => document.id === relinked.id ? { ...document, lastOpenedAt: Date.now() } : document));
          await onOpenPdf(relinkedFileData.data, relinkedFileData.fileName, relinkedFileData.filePath, relinked.lastReadPage, relinked.id);
        }
      }
    }
  };

  const itemKey = (item: DashboardPdfItem) => item.id || item.filePath;

  const handleItemClick = (event: React.MouseEvent, item: DashboardPdfItem) => {
    const key = itemKey(item);
    if (event.shiftKey) {
      setSelectedPdfIds((selected) => {
        if (selected.includes(key)) return selected.filter((id) => id !== key);
        if (selected.length >= 2) return selected;
        return [...selected, key];
      });
      return;
    }

    setSelectedPdfIds([]);
    void handleOpenItem(item);
  };

  // Browse standalone PDF from disk
  const handleBrowsePdf = async () => {
    if (isTauri()) {
      const imported = await tauriImportLibraryPdf();
      if (imported) {
        setPdfItems((items) => [imported, ...items.filter((item) => item.id !== imported.id)]);
        await handleOpenItem(imported);
      }
    } else {
      browserPdfInputRef.current?.click();
    }
  };

  const handleBrowserPdfImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (!(reader.result instanceof ArrayBuffer)) return;
      const item: DashboardPdfItem = {
        id: file.name,
        fileName: file.name,
        filePath: file.name,
        fileSize: file.size,
        modifiedTimestamp: file.lastModified || Date.now(),
      };
      recordRecentDoc(item);
      setRecentDocs(loadRecentDocs());
      await onOpenPdf(new Uint8Array(reader.result), file.name);
    };
    reader.readAsArrayBuffer(file);
  };

  // Combine directory items with recent history items
  const combinedItems = useMemo(() => {
    if (isTauri()) return pdfItems;
    const map = new Map<string, DashboardPdfItem>();

    // 1. Add all scanned directory items
    pdfItems.forEach((item) => {
      map.set(item.filePath, item);
    });

    // 2. Overlay recent docs
    recentDocs.forEach((rec) => {
      const existing = map.get(rec.filePath);
      if (existing) {
        map.set(rec.filePath, {
          ...existing,
          ...rec,
          modifiedTimestamp: existing.modifiedTimestamp,
        });
      } else {
        map.set(rec.filePath, rec);
      }
    });

    return Array.from(map.values()).map((item) => ({
      ...item,
      isFavorite: favoriteIds.includes(item.id || item.filePath),
    }));
  }, [pdfItems, recentDocs, favoriteIds]);

  // Filtered and sorted documents list
  const filteredItems = useMemo(() => {
    let list = combinedItems;

    // Filter by active category tab
    if (activeFilter === 'recent') {
      list = list.filter((i) => (i.lastOpenedAt || 0) > 0);
    } else if (activeFilter === 'favorites') {
      list = list.filter((i) => i.isFavorite);
    } else if (activeFilter !== 'all') {
      // Specific directory ID
      list = list.filter((i) => i.folderIds?.includes(activeFilter) || i.folderId === activeFilter || i.directoryPath === activeFilter);
    }

    // Filter by Search Query
    if (deferredSearchQuery.trim()) {
      const q = deferredSearchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.fileName.toLowerCase().includes(q) ||
          (i.filePath && i.filePath.toLowerCase().includes(q))
      );
    }

    // Sorting
    list = [...list].sort((a, b) => {
      if (sortBy === 'name') {
        return a.fileName.localeCompare(b.fileName);
      }
      if (sortBy === 'size') {
        return (b.fileSize || 0) - (a.fileSize || 0);
      }
      // Default: recent / modified
      const timeA = a.lastOpenedAt || a.modifiedTimestamp || 0;
      const timeB = b.lastOpenedAt || b.modifiedTimestamp || 0;
      return timeB - timeA;
    });

    return list;
  }, [combinedItems, activeFilter, deferredSearchQuery, sortBy]);

  const handleOpenSelectedPair = useCallback(async () => {
    if (selectedPdfIds.length !== 2 || isOpeningPair) return;
    const selectedItems = selectedPdfIds
      .map((id) => combinedItems.find((item) => itemKey(item) === id))
      .filter((item): item is NonNullable<typeof item> => item !== undefined);
    const [primaryItem, companionItem] = selectedItems;
    if (!primaryItem || !companionItem || !isTauri()) return;

    setIsOpeningPair(true);
    try {
      const [primaryFile, companionFile] = await Promise.all(
        [primaryItem, companionItem].map((item) => tauriReadFile(item.filePath))
      );
      if (!primaryFile || !companionFile) return;

      await Promise.all([
        tauriTouchLibraryDocument(primaryItem.id, primaryItem.lastReadPage || 1),
        tauriTouchLibraryDocument(companionItem.id, 1),
      ]);
      const opened = await onOpenPdfPair(
        {
          ...primaryFile,
          initialPageNumber: primaryItem.lastReadPage,
          documentId: primaryItem.id,
        },
        companionFile
      );
      if (opened) setSelectedPdfIds([]);
    } finally {
      setIsOpeningPair(false);
    }
  }, [combinedItems, isOpeningPair, onOpenPdfPair, selectedPdfIds]);

  useEffect(() => {
    const handlePairKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
        return;
      }
      if (event.key === 'Escape' && selectedPdfIds.length > 0) {
        event.preventDefault();
        setSelectedPdfIds([]);
      } else if (event.key === 'Enter' && selectedPdfIds.length === 2) {
        event.preventDefault();
        void handleOpenSelectedPair();
      }
    };
    window.addEventListener('keydown', handlePairKeyboard);
    return () => window.removeEventListener('keydown', handlePairKeyboard);
  }, [handleOpenSelectedPair, selectedPdfIds.length]);

  const totalPdfsCount = combinedItems.length;

  return (
    <div className="macos-window h-screen w-screen flex flex-col bg-[#1e1e24] text-[#f0f0f4] overflow-hidden select-none">
      {/* Top Studio App Header (macOS Tahoe Window Bar) */}
      <input
        ref={browserPdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleBrowserPdfImport}
      />
      <header
        data-tauri-drag-region
        onMouseDown={handleTitlebarMouseDown}
        className="macos-titlebar h-12 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-3.5 z-30 select-none app-drag-region text-xs cursor-default"
      >
        {/* Left window chrome */}
        <div className="flex items-center gap-2.5 justify-self-start" data-tauri-drag-region>
          {/* Spacer for native macOS traffic lights on desktop */}
          {isTauri() && <div className="macos-window-controls-spacer shrink-0" aria-hidden="true" data-tauri-drag-region />}
        </div>

        {/* Center Search Input (dead center in titlebar) */}
        <div className="flex items-center justify-center w-80 sm:w-96 md:w-[28rem] justify-self-center" data-tauri-drag-region>
          <div className="control-field macos-search-field w-full flex items-center gap-2 px-2.5 py-1 rounded-lg app-no-drag" data-tauri-drag-region="false">
            <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search library documents..."
              className="bg-transparent text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 border-0 outline-none w-full font-sans"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-zinc-500 hover:text-zinc-300 text-[10px] px-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Right Actions: Add Folder, Open File & Back to Reader Studio */}
        <div className="flex items-center gap-1.5 app-no-drag justify-self-end" data-tauri-drag-region="false">
          <button
            onClick={onToggleTheme}
            className="btn-icon"
            title={isDarkTheme ? 'Use light appearance' : 'Use dark appearance'}
            aria-label={isDarkTheme ? 'Use light appearance' : 'Use dark appearance'}
          >
            {isDarkTheme ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5 text-zinc-600" />}
          </button>

          <button
            onClick={handleAddDirectory}
            className="btn-secondary"
            title="Add directory folder to library"
          >
            <FolderPlus className="w-3.5 h-3.5 text-zinc-400" />
            <span>Add Folder</span>
          </button>

          <button
            onClick={handleBrowsePdf}
            className="btn-secondary"
            title="Import a PDF into the library"
          >
            <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
            <span>Import PDF</span>
          </button>
        </div>
      </header>

      {/* Main Studio Body: Sidebar Navigation + Document Grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Library Navigator (Tahoe macOS Sidebar) */}
        <aside className="macos-sidebar w-60 flex flex-col p-3 gap-3 overflow-hidden select-none">
          {/* Scrollable Main Navigation: Categories & Folders */}
          <div className="flex-1 flex flex-col gap-3 overflow-y-auto min-h-0 pr-0.5">
            {/* Quick Categories */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 px-2 py-1">
                Library Views
              </span>

              <button
                onClick={() => setActiveFilter('all')}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeFilter === 'all'
                    ? 'bg-blue-500/15 text-blue-400 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className={`w-3.5 h-3.5 ${activeFilter === 'all' ? 'text-blue-500' : 'text-zinc-400'}`} />
                  <span>All Documents</span>
                </div>
                <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded-md ${activeFilter === 'all' ? 'bg-blue-500/20 text-blue-400 font-bold' : 'text-zinc-500'}`}>
                  {totalPdfsCount}
                </span>
              </button>

              <button
                onClick={() => setActiveFilter('recent')}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeFilter === 'recent'
                    ? 'bg-blue-500/15 text-blue-400 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock className={`w-3.5 h-3.5 ${activeFilter === 'recent' ? 'text-blue-500' : 'text-zinc-400'}`} />
                  <span>Recent Reads</span>
                </div>
                <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded-md ${activeFilter === 'recent' ? 'bg-blue-500/20 text-blue-400 font-bold' : 'text-zinc-500'}`}>
                  {combinedItems.filter((item) => (item.lastOpenedAt || 0) > 0).length}
                </span>
              </button>

              <button
                onClick={() => setActiveFilter('favorites')}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeFilter === 'favorites'
                    ? 'bg-blue-500/15 text-blue-400 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span>Favorites</span>
                </div>
                <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded-md ${activeFilter === 'favorites' ? 'bg-blue-500/20 text-blue-400 font-bold' : 'text-zinc-500'}`}>
                  {combinedItems.filter((item) => item.isFavorite).length}
                </span>
              </button>
            </div>

            {/* Saved Directories List */}
            <div className="flex flex-col gap-1 pt-2 border-t border-[var(--border)]">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                  Folders
                </span>
                <button
                  onClick={() => scanAllDirectories(directories)}
                  disabled={isScanning}
                  className="text-zinc-400 hover:text-zinc-200 p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  title="Rescan directories"
                >
                  <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {directories.length === 0 ? (
                <div className="px-2 py-3 text-[11px] text-zinc-500 text-center">
                  No folders added yet. Click &quot;Add Folder&quot; above.
                </div>
              ) : (
                directories.map((dir) => (
                  <div
                    key={dir.id}
                    onClick={() => setActiveFilter(dir.id)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer group transition-all ${
                      activeFilter === dir.id
                        ? 'bg-blue-500/15 text-blue-400 font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Folder className={`w-3.5 h-3.5 shrink-0 ${activeFilter === dir.id ? 'text-blue-500' : 'text-zinc-400'}`} />
                      <span className="truncate font-medium">{dir.name}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[10px] text-zinc-500 group-hover:text-zinc-300">
                        {dir.pdfCount ?? 0}
                      </span>
                      <button
                        onClick={(e) => handleRemoveDirectory(dir.id, e)}
                        className="p-1 rounded-md text-zinc-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove folder from library"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Bottom Sidebar Footer: Settings Button */}
          <div className="pt-2 border-t border-[var(--border)] mt-auto shrink-0">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-100 border border-transparent hover:border-[var(--border)] hover:bg-[var(--secondary)] hover:shadow-xs active:scale-[0.98] transition-all group"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                <span>Settings</span>
              </div>
              <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400 font-mono">⌘,</span>
            </button>
          </div>
        </aside>

        {/* Main Document Library Content */}
        <main className="macos-content flex-1 p-6 overflow-y-auto flex flex-col gap-5">
          {/* Controls Bar: Title, Count, Layout, Sorting */}
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-100 tracking-tight capitalize">
                {activeFilter === 'all'
                  ? 'All Documents'
                  : activeFilter === 'recent'
                  ? 'Recently Read Documents'
                  : activeFilter === 'favorites'
                  ? 'Favorite Documents'
                  : directories.find((d) => d.id === activeFilter)?.name || 'Directory Documents'}
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-[var(--secondary)] text-[10.5px] font-mono text-zinc-400 border border-[var(--border)]">
                {filteredItems.length} {filteredItems.length === 1 ? 'file' : 'files'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Tahoe Styled Sort Selector */}
              <div ref={sortMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsSortOpen((open) => !open)}
                  className={`flex items-center gap-2 min-w-40 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    isSortOpen
                      ? 'bg-[var(--card)] border-[var(--ring)] text-white shadow-md'
                      : 'bg-[var(--secondary)] border-[var(--border)] text-zinc-300 hover:bg-[var(--card)]'
                  }`}
                  aria-haspopup="menu"
                  aria-expanded={isSortOpen}
                >
                  <ArrowUpDown className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                  <span className="flex-1 text-left">
                    {SORT_OPTIONS.find((option) => option.value === sortBy)?.label}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 shrink-0 text-zinc-400 transition-transform ${isSortOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isSortOpen && (
                  <div
                    role="menu"
                    className="absolute top-full right-0 z-50 mt-1.5 w-48 p-1.5 rounded-xl bg-[var(--popover)] border border-[var(--border)] shadow-2xl backdrop-blur-xl animate-slide-down"
                  >
                    <div className="px-2.5 pt-1 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                      Sort documents
                    </div>
                    {SORT_OPTIONS.map((option) => {
                      const OptionIcon = option.icon;
                      const isSelected = sortBy === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isSelected}
                          onClick={() => {
                            setSortBy(option.value);
                            setIsSortOpen(false);
                          }}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5 hover:text-zinc-100'
                          }`}
                        >
                          <OptionIcon className="w-3.5 h-3.5 shrink-0" />
                          <span className="flex-1 text-left font-medium">{option.label}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Empty State */}
          {filteredItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[var(--secondary)] border border-[var(--border)] flex items-center justify-center text-zinc-400 shadow-sm">
                <HardDrive className="w-6 h-6" />
              </div>
              <div className="flex flex-col gap-1 max-w-sm">
                <h3 className="text-sm font-semibold text-zinc-200">No PDF documents found</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {directories.length === 0
                    ? 'Add folders to your saved directories to automatically scan and browse your PDF library.'
                    : 'No documents match your current filter or search criteria.'}
                </p>
              </div>
              <button
                onClick={handleAddDirectory}
                className="btn-primary py-2 px-4"
              >
                <FolderPlus className="w-4 h-4" />
                <span>Add Folder to Library</span>
              </button>
            </div>
          ) : (
            <div className="library-document-list pb-12" aria-label="PDF library documents">
              {filteredItems.map((item) => (
                <div
                  key={item.id || item.filePath}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedPdfIds.includes(itemKey(item))}
                  data-pair-selected={selectedPdfIds.includes(itemKey(item)) || undefined}
                  onClick={(event) => handleItemClick(event, item)}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && selectedPdfIds.length !== 2) {
                      event.preventDefault();
                      setSelectedPdfIds([]);
                      void handleOpenItem(item);
                    }
                  }}
                  className="library-document-list-item group"
                >
                  <div className="library-document-list-icon relative shrink-0" aria-hidden="true">
                    <FileText className="w-4 h-4" />
                    {selectedPdfIds.includes(itemKey(item)) && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-semibold text-white shadow-sm">
                        {selectedPdfIds.indexOf(itemKey(item)) + 1}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate text-[13px] font-medium text-zinc-200 group-hover:text-white" title={item.fileName}>
                        {item.fileName}
                      </span>
                      {item.annotationCount !== undefined && item.annotationCount > 0 && (
                        <span className="macos-annotation-count shrink-0">
                          {item.annotationCount} note{item.annotationCount === 1 ? '' : 's'}
                        </span>
                      )}
                      {item.availability && item.availability !== 'available' && (
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${item.availability === 'missing' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                          {item.availability === 'missing' ? 'Missing · click to locate' : 'Changed'}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-x-2 gap-y-0.5 overflow-hidden text-[11px] text-zinc-500">
                      <span className="truncate max-w-[22rem]">{item.directoryPath || item.filePath || 'Local document'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0 tabular-nums">{item.fileSize ? `${(item.fileSize / 1024 / 1024).toFixed(2)} MB` : 'Unknown size'}</span>
                      {item.numPages !== undefined && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="shrink-0 tabular-nums">
                            {item.numPages} {item.numPages === 1 ? 'page' : 'pages'}
                          </span>
                        </>
                      )}
                      {item.lastReadPage && <span className="shrink-0">Last read · Page {item.lastReadPage}</span>}
                    </div>
                  </div>
                  <button
                    onClick={(event) => handleToggleFavorite(item.id || item.filePath, event)}
                    className={`library-document-list-favorite ${item.isFavorite ? 'is-favorite' : ''}`}
                    title={item.isFavorite ? 'Remove Favorite' : 'Mark as Favorite'}
                    aria-label={item.isFavorite ? `Remove ${item.fileName} from favorites` : `Add ${item.fileName} to favorites`}
                  >
                    <Star className={`w-3.5 h-3.5 ${item.isFavorite ? 'fill-current' : ''}`} />
                  </button>
                  {isTauri() && (
                    <button
                      onClick={(event) => void handleRemoveDocument(item.id, event)}
                      className="library-document-list-favorite"
                      title="Remove from library (the PDF file is kept)"
                      aria-label={`Remove ${item.fileName} from library`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <ArrowRight className="library-document-list-arrow w-4 h-4 shrink-0" aria-hidden="true" />
                </div>
              ))}
            </div>
          )}

          {selectedPdfIds.length > 0 && (
            <div
              className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full border border-[var(--border)] bg-[var(--popover)]/95 px-4 py-2 text-xs text-[var(--foreground)] shadow-xl backdrop-blur-xl"
              role="status"
              aria-live="polite"
            >
              {selectedPdfIds.length === 1 ? (
                <span>1 selected · Shift-click one more PDF</span>
              ) : (
                <span>{isOpeningPair ? 'Opening both PDFs…' : '2 selected · Press Enter to read together · Esc to clear'}</span>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Floating Circular Resume Reading Button (Bottom Right) */}
      {hasActiveDoc && (
        <button
          onClick={onResumeReading || onSwitchToReader}
          className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full flex items-center justify-center text-white bg-gradient-to-b from-[#3b99ff] to-[#0066eb] shadow-xl hover:scale-108 active:scale-95 transition-all cursor-pointer border border-white/25 group"
          title={`Resume Reading: ${activeDocName}`}
          aria-label={`Resume Reading: ${activeDocName}`}
        >
          <BookOpen className="w-5 h-5 transition-transform group-hover:scale-110" />
        </button>
      )}

      {/* Segmented Settings Panel Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        themeSettings={themeSettings}
        onSelectTheme={onSelectTheme}
        onUpdateThemeSetting={onUpdateThemeSetting}
        onResetThemeFilters={onResetThemeFilters}
        viewMode={viewMode}
        onChangeViewMode={onChangeViewMode}
      />
    </div>
  );
};
