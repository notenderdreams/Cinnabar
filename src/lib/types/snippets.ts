export interface SnippetImageEntry {
  id: string;
  type: 'image';
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
  aspectRatio: number;
  createdAt: number;
  label?: string;
}

export interface SnippetDividerEntry {
  id: string;
  type: 'divider';
  label?: string;
  style?: 'solid' | 'dashed' | 'thick';
  createdAt: number;
}

export type SnippetEntry = SnippetImageEntry | SnippetDividerEntry;

export interface StitchOptions {
  backgroundColor?: string;
  dividerColor?: string;
  padding?: number;
  gap?: number;
  includePageBadges?: boolean;
}
