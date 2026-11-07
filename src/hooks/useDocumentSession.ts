import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react';
import type { AppScreen } from '../lib/types';
import {
  idbLoadActivePdf,
  idbSaveActivePdf,
  loadLastActiveDoc,
  saveLastActiveDoc,
  recordRecentDoc,
  type LastActiveDocument,
} from '../lib/storage/storage';
import {
  isTauri,
  tauriImportLibraryPdf,
  tauriReadFile,
  tauriTouchLibraryDocument,
} from '../utils/tauriBridge';
import type { usePDFDocument } from './usePDFDocument';
import type { useCompanionPDF } from './useCompanionPDF';

type DocumentSessionOptions = Pick<ReturnType<typeof usePDFDocument>, 'pdfDoc' | 'docInfo' | 'currentPage' | 'loadPdf'> &
  Pick<ReturnType<typeof useCompanionPDF>, 'closeCompanionPdf' | 'loadCompanionPdf'> & {
    onScreenChange: (screen: AppScreen) => void;
    showToast: (message: string, isError?: boolean) => void;
  };

/** Owns document opening, read-together startup, and persisted session resumption. */
export function useDocumentSession({
  pdfDoc,
  docInfo,
  currentPage,
  loadPdf,
  closeCompanionPdf,
  loadCompanionPdf,
  onScreenChange,
  showToast,
}: DocumentSessionOptions) {
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
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
      const loaded = await loadPdf(data, fileName, filePath, initialPage, documentId);
      if (loaded) {
        void idbSaveActivePdf(bytes, fileName);
        onScreenChange('reader');
      }
      else showToast(`Could not open ${fileName}.`, true);
      return loaded;
    },
    [closeCompanionPdf, loadPdf, showToast, onScreenChange]
  );

  const handleResumeReading = useCallback(async () => {
    if (pdfDoc) {
      onScreenChange('reader');
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
  }, [pdfDoc, lastActiveDoc, openPdfInReader, showToast, onScreenChange]);

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

  const handlePdfInputChange = (e: ChangeEvent<HTMLInputElement>) => {
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


  return {
    lastActiveDoc,
    pdfInputRef,
    openPdfInReader,
    openPdfPairInReader,
    handleResumeReading,
    handleOpenPdf,
    handlePdfInputChange,
  };
}
