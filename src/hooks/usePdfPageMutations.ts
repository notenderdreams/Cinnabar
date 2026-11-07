import { useState, useCallback } from 'react';
import {
  addBlankPageBelow,
  deletePageFromPdf,
  reindexAfterPageInsertion,
  reindexAfterPageDeletion,
} from '../lib/pdf/pageExtractor';
import { idbSaveActivePdf } from '../lib/storage/storage';
import { isTauri, tauriWritePdf } from '../utils/tauriBridge';
import type { usePDFDocument } from './usePDFDocument';
import type { useAnnotations } from './useAnnotations';
import type { useSnippets } from './useSnippets';

type PageMutationOptions = Pick<ReturnType<typeof usePDFDocument>, 'pdfDoc' | 'rawPdfBytes' | 'docInfo' | 'docKey' | 'loadPdf'> &
  Pick<ReturnType<typeof useAnnotations>, 'annotations' | 'replaceAnnotations'> &
  Pick<ReturnType<typeof useSnippets>, 'snippets' | 'replaceSnippets'> & {
    onPageChanged: (page: number) => void;
    showToast: (message: string, isError?: boolean) => void;
  };

/** Synchronizes page edits with PDF persistence, annotations, snippets, and navigation. */
export function usePdfPageMutations({
  pdfDoc,
  rawPdfBytes,
  docInfo,
  docKey,
  loadPdf,
  annotations,
  replaceAnnotations,
  snippets,
  replaceSnippets,
  onPageChanged,
  showToast,
}: PageMutationOptions) {
  const [pagePendingDeletion, setPagePendingDeletion] = useState<number | null>(null);
  const [isDeletingPage, setIsDeletingPage] = useState(false);

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
        onPageChanged(nextPage);
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
      onPageChanged,
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
        onPageChanged(newPageNumber);
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
      onPageChanged,
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


  return {
    pagePendingDeletion,
    setPagePendingDeletion,
    isDeletingPage,
    requestDeletePage,
    handleDeletePage,
    handleAddPageBelow,
  };
}
