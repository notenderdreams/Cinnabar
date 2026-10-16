export interface DashboardPdfItem {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  modifiedTimestamp: number;
  directoryPath?: string;
  lastOpenedAt?: number;
  lastReadPage?: number;
  annotationCount?: number;
  numPages?: number;
  isFavorite?: boolean;
  availability?: 'available' | 'missing' | 'changed';
  sourceType?: 'file' | 'folder';
  folderId?: string;
  folderIds?: string[];
}

export interface SavedDirectory {
  id: string;
  path: string;
  name: string;
  addedAt: number;
  pdfCount?: number;
}
