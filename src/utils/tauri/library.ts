import type { LibrarySnapshot as NativeLibrarySnapshot } from '../../lib/bindings';
import type { DashboardPdfItem, SavedDirectory } from '../../lib/types';
import { commands } from '../../lib/bindings';
import { isTauri, unwrapNativeResult } from './runtime';

export interface LibrarySnapshot {
  directories: SavedDirectory[];
  documents: DashboardPdfItem[];
}

const normalizeLibrarySnapshot = (
  snapshot: NativeLibrarySnapshot,
): LibrarySnapshot => {
  const folderPaths = new Map(snapshot.folders.map((folder) => [folder.id, folder.path]));
  return {
    directories: snapshot.folders.map((folder) => ({
      id: folder.id,
      path: folder.path,
      name: folder.name,
      addedAt: folder.importedAt ?? 0,
      pdfCount: folder.pdfCount,
    })),
    documents: snapshot.documents.map((document) => ({
      id: document.id,
      fileName: document.fileName,
      filePath: document.filePath,
      fileSize: document.fileSize ?? 0,
      modifiedTimestamp: document.modifiedAt ?? 0,
      lastOpenedAt: document.lastOpenedAt ?? undefined,
      lastReadPage: document.lastReadPage ?? undefined,
      annotationCount: document.annotationCount ?? undefined,
      numPages: document.numPages ?? undefined,
      isFavorite: document.favorite,
      availability: document.availability,
      sourceType: document.sourceType,
      folderId: document.folderId ?? undefined,
      folderIds: document.folderIds,
      directoryPath: document.folderId ? folderPaths.get(document.folderId) : undefined,
    })),
  };
};

export async function tauriListLibrary(): Promise<LibrarySnapshot> {
  if (!isTauri()) return { directories: [], documents: [] };
  return normalizeLibrarySnapshot(unwrapNativeResult(await commands.listLibrary()));
}

export async function tauriImportLibraryPdf(): Promise<DashboardPdfItem | null> {
  if (!isTauri()) return null;
  const document = unwrapNativeResult(await commands.importLibraryPdfDialog());
  if (!document) return null;
  return normalizeLibrarySnapshot({ folders: [], documents: [document] }).documents[0];
}
export async function tauriImportLibraryFolder(): Promise<LibrarySnapshot | null> {
  if (!isTauri()) return null;
  const snapshot = unwrapNativeResult(await commands.importLibraryFolderDialog());
  return snapshot ? normalizeLibrarySnapshot(snapshot) : null;
}

export async function tauriRefreshLibrary(): Promise<LibrarySnapshot> {
  if (!isTauri()) return { directories: [], documents: [] };
  return normalizeLibrarySnapshot(unwrapNativeResult(await commands.refreshLibrary()));
}

export async function tauriRemoveLibraryFolder(folderId: string, keepDocuments = true): Promise<LibrarySnapshot> {
  if (!isTauri()) return { directories: [], documents: [] };
  return normalizeLibrarySnapshot(unwrapNativeResult(await commands.removeLibraryFolder(folderId, keepDocuments)));
}

export async function tauriRemoveLibraryDocument(documentId: string): Promise<void> {
  if (!isTauri()) return;
  unwrapNativeResult(await commands.removeLibraryDocument(documentId));
}

export async function tauriSetLibraryFavorite(documentId: string, favorite: boolean): Promise<void> {
  if (!isTauri()) return;
  unwrapNativeResult(await commands.setLibraryFavorite(documentId, favorite));
}

export async function tauriTouchLibraryDocument(documentId: string, lastReadPage?: number, annotationCount?: number): Promise<void> {
  if (!isTauri()) return;
  unwrapNativeResult(await commands.touchLibraryDocument(documentId, lastReadPage ?? null, annotationCount ?? null));
}

export async function tauriUpdateLibraryDocumentState(documentId: string, lastReadPage: number, annotationCount: number): Promise<void> {
  if (!isTauri()) return;
  unwrapNativeResult(await commands.updateLibraryDocumentState(documentId, lastReadPage, annotationCount));
}

export async function tauriRelinkLibraryDocument(documentId: string): Promise<DashboardPdfItem | null> {
  if (!isTauri()) return null;
  const document = unwrapNativeResult(await commands.relinkLibraryDocument(documentId));
  if (!document) return null;
  return normalizeLibrarySnapshot({ folders: [], documents: [document] }).documents[0];
}
