export type HighlightStyle = 'box' | 'stroke' | 'underline';
export type LineHighlightStyle = 'highlight' | 'underline';

export interface StrokePoint {
  x: number; // Normalized 0..1 relative to page width
  y: number; // Normalized 0..1 relative to page height
}

export interface DrawingAnnotation {
  id: string;
  pageNumber: number;
  type: 'pen' | 'highlight-pen';
  points: StrokePoint[];
  color: string;
  strokeWidth: number; // in relative units or pt
  opacity: number;
  createdAt: number;
  text?: string;
}

export interface LineHighlightAnnotation {
  id: string;
  pageNumber: number;
  type: 'highlight-line';
  startX: number; // Normalized 0..1
  startY: number; // Normalized 0..1
  endX: number; // Normalized 0..1
  endY: number; // Normalized 0..1
  color: string;
  strokeWidth: number;
  opacity: number;
  style?: LineHighlightStyle;
  createdAt: number;
  text?: string;
}

export interface RectHighlightAnnotation {
  id: string;
  pageNumber: number;
  type: 'highlight-rect';
  x: number; // Normalized 0..1
  y: number; // Normalized 0..1
  width: number; // Normalized 0..1
  height: number; // Normalized 0..1
  color: string;
  opacity: number;
  createdAt: number;
  style?: HighlightStyle;
  text?: string;
}

export interface TextHighlightAnnotation {
  id: string;
  pageNumber: number;
  type: 'highlight-text';
  rects: { x: number; y: number; width: number; height: number }[]; // Normalized 0..1
  text: string;
  color: string;
  opacity: number;
  createdAt: number;
  style?: 'box' | 'underline';
}

export interface AttachedImageAnnotation {
  id: string;
  pageNumber: number;
  type: 'image';
  dataUrl: string;
  x: number; // Normalized 0..1
  y: number; // Normalized 0..1
  width: number; // Normalized 0..1
  height: number; // Normalized 0..1
  rotation: number; // degrees
  opacity: number;
  aspectRatio: number;
  name: string;
  createdAt: number;
  attachedInInvertedMode?: boolean; // True if attached while in Dark/Invert theme
  invertInLightMode?: boolean; // Invert image colors when viewed or saved in Light/Normal mode
  extractedText?: string; // Optional extracted raw text from rasterized region or OCR
}

export interface TextNoteAnnotation {
  id: string;
  pageNumber: number;
  type: 'text-note';
  kind?: 'plain' | 'sticky';
  /** Absent on existing notes, which retain their original plain-text rendering. */
  format?: 'plain' | 'markdown';
  x: number; // Normalized 0..1
  y: number; // Normalized 0..1
  width?: number; // Normalized 0..1
  text: string;
  color: string;
  fontSize: number; // in pt
  fontFamily?: 'sans' | 'serif' | 'mono' | string;
  align?: 'left' | 'center' | 'right';
  createdAt: number;
}

export interface AiExplanationAnnotation {
  id: string;
  pageNumber: number;
  type: 'ai-explanation';
  x: number;
  y: number;
  width: number;
  height: number;
  prompt: string;
  response: string;
  provider?: 'codex' | 'external' | 'chatgpt' | 'claude' | 'gemini' | 'deepseek' | string;
  createdAt: number;
  updatedAt: number;
  cardX?: number;
  cardY?: number;
  isOpen?: boolean;
}

export type Annotation =
  | DrawingAnnotation
  | LineHighlightAnnotation
  | RectHighlightAnnotation
  | TextHighlightAnnotation
  | AttachedImageAnnotation
  | TextNoteAnnotation
  | AiExplanationAnnotation;
