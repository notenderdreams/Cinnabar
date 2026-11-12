export type ToolType =
  | 'select'
  | 'highlight-text'
  | 'highlight-pen'
  | 'highlight-line'
  | 'highlight-rect'
  | 'pen'
  | 'image'
  | 'text'
  | 'sticky-note'
  | 'eraser'
  | 'snip'
  | 'ai-box';

export type ViewMode = 'continuous' | 'single' | 'spread';

export type AppScreen = 'dashboard' | 'reader';

export interface DocumentBookmark {
  id: string;
  pageNumber: number;
  title: string;
  createdAt: number;
}

export interface PDFOutlineItem {
  title: string;
  pageNumber: number;
  children?: PDFOutlineItem[];
}

export interface DocumentInfo {
  fileName: string;
  numPages: number;
  fileSize?: number;
  filePath?: string;
  fingerprint?: string;
  title?: string;
  author?: string;
  libraryId?: string;
}

export interface SearchMatch {
  pageNumber: number;
  matchIndex: number;
  snippet: string;
  start: { itemIndex: number; offset: number };
  end: { itemIndex: number; offset: number };
}
