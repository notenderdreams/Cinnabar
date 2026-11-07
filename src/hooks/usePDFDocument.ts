import { useState, useCallback, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pdfjsLib } from '../lib/pdf/pdfWorker';
import type { DocumentInfo, PDFOutlineItem, SearchMatch } from '../lib/types/index';
import {
  loadLastPageForDoc,
  saveLastActiveDoc,
  saveLastPageForDoc,
  updateRecentDocPageCount,
} from '../lib/storage/storage';

export function usePDFDocument() {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [rawPdfBytes, setRawPdfBytes] = useState<Uint8Array | null>(null);
  const [docInfo, setDocInfo] = useState<DocumentInfo | null>(null);
  const [outline, setOutline] = useState<PDFOutlineItem[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [docKey, setDocKey] = useState<string>('');
  
  // Search state
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(-1);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  const activeDocRef = useRef<PDFDocumentProxy | null>(null);

  const loadPdf = useCallback(
    async (
      data: Uint8Array | ArrayBuffer,
      fileName: string = 'document.pdf',
      filePath?: string,
      initialPageNumber?: number,
      documentKeyOverride?: string,
      documentFingerprintOverride?: string,
      silent: boolean = false
    ) => {
      if (!silent) setIsLoading(true);
      setError(null);
      try {
        // Clean up previous active document if one was loaded
        if (activeDocRef.current) {
          try {
            activeDocRef.current.cleanup();
            void activeDocRef.current.destroy();
          } catch {}
          activeDocRef.current = null;
        }

        // PDF.js may transfer its input buffer to the worker. Keep an owned copy
        // for export and page editing, and give the worker a separate copy.
        const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0));

        const loadingTask = pdfjsLib.getDocument({
          data: bytes.slice(),
          cMapUrl: 'https://unpkg.com/pdfjs-dist@4.0.379/cmaps/',
          cMapPacked: true,
        });

        const loadedDoc = await loadingTask.promise;

        const key = documentKeyOverride || `${fileName}_${loadedDoc.numPages}_${bytes.length}`;

        // Fetch metadata and outline BEFORE updating any state so all document state updates synchronously and atomically together
        const [metadata, rawOutline] = await Promise.all([
          loadedDoc.getMetadata().catch(() => ({ info: {} })),
          loadedDoc.getOutline().catch(() => null),
        ]);
        const infoObj = ((metadata as { info?: unknown })?.info || {}) as Record<string, string>;
        const fingerprint =
          documentFingerprintOverride ||
          (loadedDoc as unknown as { fingerprint?: string }).fingerprint ||
          key;

        const nextDocInfo: DocumentInfo = {
          fileName,
          filePath,
          numPages: loadedDoc.numPages,
          fileSize: bytes.byteLength,
          title: infoObj.Title || fileName,
          author: infoObj.Author || undefined,
          libraryId: documentKeyOverride,
          fingerprint,
        };

        // Outline / Table of Contents
        const parsedOutline: PDFOutlineItem[] = [];
        if (rawOutline && rawOutline.length > 0) {
          for (const item of rawOutline) {
            let pageNum = 1;
            if (item.dest) {
              try {
                let explicitDest: unknown = item.dest;
                if (typeof item.dest === 'string') {
                  explicitDest = await loadedDoc.getDestination(item.dest);
                }
                if (Array.isArray(explicitDest) && explicitDest[0]) {
                  const pageIndex = await loadedDoc.getPageIndex(
                    explicitDest[0] as Parameters<typeof loadedDoc.getPageIndex>[0]
                  );
                  pageNum = pageIndex + 1;
                }
              } catch {}
            }
            parsedOutline.push({
              title: item.title || 'Untitled Section',
              pageNumber: pageNum,
            });
          }
        }

        // Restore last saved page or explicit initialPageNumber
        const savedPage =
          initialPageNumber || loadLastPageForDoc(key, filePath || fileName);
        const initialPage = savedPage && savedPage <= loadedDoc.numPages ? savedPage : 1;

        // Atomically commit all document states in a single batch
        activeDocRef.current = loadedDoc;
        setRawPdfBytes(bytes);
        setPdfDoc(loadedDoc);
        setDocKey(key);
        setDocInfo(nextDocInfo);
        setOutline(parsedOutline);
        setCurrentPage(initialPage);
        setSearchResults([]);
        setCurrentMatchIndex(-1);
        setIsSearching(false);

        updateRecentDocPageCount(filePath || fileName, loadedDoc.numPages);
        saveLastPageForDoc(key, initialPage, fileName, filePath);
        saveLastActiveDoc({
          documentId: documentKeyOverride,
          fileName,
          filePath,
          lastReadPage: initialPage,
          numPages: loadedDoc.numPages,
          timestamp: Date.now(),
        });
        return true;
      } catch (err: unknown) {
        console.error('Error loading PDF:', err);
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
        return false;
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    []
  );

  const changePage = useCallback(
    (newPage: number) => {
      if (!pdfDoc) return;
      const clamped = Math.max(1, Math.min(newPage, pdfDoc.numPages));
      setCurrentPage(clamped);
      saveLastPageForDoc(docKey, clamped, docInfo?.fileName, docInfo?.filePath);
      saveLastActiveDoc({
        documentId: docInfo?.libraryId,
        fileName: docInfo?.fileName || 'document.pdf',
        filePath: docInfo?.filePath,
        lastReadPage: clamped,
        numPages: pdfDoc.numPages,
        timestamp: Date.now(),
      });
    },
    [pdfDoc, docKey, docInfo]
  );

  const searchSequenceRef = useRef(0);

  // Full-Text Search
  const searchInDocument = useCallback(async (query: string) => {
    const currentSearchId = ++searchSequenceRef.current;

    if (!pdfDoc || !query.trim()) {
      setSearchResults([]);
      setCurrentMatchIndex(-1);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const results: SearchMatch[] = [];
    const lowerQuery = query.toLowerCase();

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      if (searchSequenceRef.current !== currentSearchId) {
        return;
      }

      try {
        const page = await pdfDoc.getPage(pageNum);
        if (searchSequenceRef.current !== currentSearchId) {
          try {
            page.cleanup();
          } catch {}
          return;
        }

        const textContent = await page.getTextContent();
        let fullPageText = '';
        const items = textContent.items;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if ('str' in item && item.str) {
            fullPageText += (fullPageText.length > 0 ? ' ' : '') + item.str;
          }
        }

        let matchPos = 0;
        const lowerPageText = fullPageText.toLowerCase();
        let occurrence = 0;

        while ((matchPos = lowerPageText.indexOf(lowerQuery, matchPos)) !== -1) {
          const start = Math.max(0, matchPos - 30);
          const end = Math.min(fullPageText.length, matchPos + lowerQuery.length + 30);
          const snippet =
            (start > 0 ? '...' : '') +
            fullPageText.slice(start, end) +
            (end < fullPageText.length ? '...' : '');

          results.push({
            pageNumber: pageNum,
            matchIndex: occurrence,
            snippet,
          });
          occurrence++;
          matchPos += lowerQuery.length;
        }

        try {
          page.cleanup();
        } catch {}
      } catch (err) {
        console.warn(`Search failed on page ${pageNum}:`, err);
      }
    }

    if (searchSequenceRef.current === currentSearchId) {
      setSearchResults(results);
      setCurrentMatchIndex(results.length > 0 ? 0 : -1);
      setIsSearching(false);
    }
  }, [pdfDoc]);

  const nextSearchResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % searchResults.length;
    setCurrentMatchIndex(nextIdx);
    changePage(searchResults[nextIdx].pageNumber);
  }, [searchResults, currentMatchIndex, changePage]);

  const prevSearchResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentMatchIndex(prevIdx);
    changePage(searchResults[prevIdx].pageNumber);
  }, [searchResults, currentMatchIndex, changePage]);

  return {
    pdfDoc,
    rawPdfBytes,
    docInfo,
    outline,
    currentPage,
    isLoading,
    error,
    docKey,
    loadPdf,
    changePage,
    searchResults,
    currentMatchIndex,
    isSearching,
    searchInDocument,
    nextSearchResult,
    prevSearchResult,
  };
}
