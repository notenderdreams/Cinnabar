import { useState, useCallback, useRef } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { pdfjsLib } from '../utils/pdfWorker';

export interface UseCompanionPDFOptions {
  primaryFileName?: string;
  onOpenCompanion?: () => void;
  showToast?: (text: string, isError?: boolean) => void;
}

export function useCompanionPDF({
  primaryFileName,
  onOpenCompanion,
  showToast,
}: UseCompanionPDFOptions = {}) {
  const companionLoadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const companionPdfRef = useRef<PDFDocumentProxy | null>(null);
  const [companionPdfDoc, setCompanionPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [companionFileName, setCompanionFileName] = useState<string | null>(null);
  const [companionCurrentPage, setCompanionCurrentPage] = useState<number>(1);
  const [companionZoom, setCompanionZoom] = useState<number>(1.15);
  const [activeReaderPane, setActiveReaderPane] = useState<'primary' | 'companion'>('primary');

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

  const loadCompanionPdf = useCallback(
    async (data: Uint8Array, fileName: string): Promise<boolean> => {
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
        onOpenCompanion?.();
        showToast?.(`Reading ${primaryFileName || 'PDF'} with ${fileName}`);
        return true;
      } catch (error) {
        if (companionLoadingTaskRef.current === loadingTask) {
          companionLoadingTaskRef.current = null;
          console.error('Failed to load companion PDF:', error);
          showToast?.(`Could not open ${fileName}.`, true);
        }
        return false;
      }
    },
    [primaryFileName, onOpenCompanion, showToast]
  );

  return {
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
  };
}
