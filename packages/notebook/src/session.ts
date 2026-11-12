import { getSchema } from '@tiptap/core';
import { emptyNotebook, identifyBlocks, type NotebookDocument } from './document';
import { notebookExtensions } from './extensions';

export interface NotebookFile {
  format: 'cinnabar-notebook';
  version: 1;
  id: string;
  title: string;
  revision: string;
  updatedAt: number;
  document: NotebookDocument;
}

export interface NotebookSession {
  present: NotebookFile;
  past: NotebookFile[];
  future: NotebookFile[];
  group?: string;
}

const schema = getSchema(notebookExtensions(false));
const imageSource = /^data:image\/(png|jpeg|webp|gif);base64,/;

export function validateDocument(value: NotebookDocument): void {
  if (!value || value.version !== 1 || !Number.isSafeInteger(value.minimumSheets) || value.minimumSheets < 1 || value.minimumSheets > 10000 || !value.assets || !value.styles) {
    throw new Error('Invalid notebook document.');
  }
  const styles = value.styles;
  if (![styles.fontSize, styles.lineHeight, styles.paragraphSpacing].every(Number.isFinite) ||
      styles.fontSize < 8 || styles.fontSize > 72 || styles.lineHeight < 1 || styles.lineHeight > 4 || styles.paragraphSpacing < 0 || styles.paragraphSpacing > 100 ||
      typeof styles.fontFamily !== 'string' || styles.fontFamily.length > 200 ||
      ![styles.color, styles.background].every(color => typeof color === 'string' && /^#[\da-f]{6}$/i.test(color))) {
    throw new Error('Invalid notebook appearance.');
  }
  const node = schema.nodeFromJSON(value.content);
  node.check();
  if (node.type.name !== 'doc') throw new Error('A notebook must contain a document.');
  node.descendants(child => {
    if (child.type.name === 'image' && !imageSource.test(child.attrs.src)) throw new Error('Notebook images must be embedded.');
    if (child.type.name === 'text' && child.marks.some(mark => mark.type.name === 'link' && !/^(https?:|mailto:)/i.test(mark.attrs.href))) {
      throw new Error('Unsupported notebook link.');
    }
  });
  for (const asset of Object.values(value.assets)) {
    if (!asset || !imageSource.test(asset.dataUrl) || !Number.isFinite(asset.width) || !Number.isFinite(asset.height) || asset.width <= 0 || asset.height <= 0) {
      throw new Error('Invalid notebook image.');
    }
  }
}

export function createNotebook(title = 'Untitled notebook'): NotebookFile {
  return { format: 'cinnabar-notebook', version: 1, id: crypto.randomUUID(), title,
    revision: crypto.randomUUID(), updatedAt: Date.now(), document: emptyNotebook() };
}

export function parseNotebookFile(text: string): NotebookFile {
  if (text.length > 50_000_000) throw new Error('Notebook exceeds the 50 MB file limit.');
  const value = JSON.parse(text) as NotebookFile;
  if (!value || value.format !== 'cinnabar-notebook' || value.version !== 1) throw new Error('Select a supported Cinnabar notebook file.');
  if (typeof value.id !== 'string' || !value.id || typeof value.title !== 'string' || value.title.length > 200 ||
      typeof value.revision !== 'string' || !value.revision || !Number.isFinite(value.updatedAt)) throw new Error('Invalid notebook identity.');
  validateDocument(value.document);
  value.document.content = identifyBlocks(value.document.content);
  return value;
}

export function serializeNotebook(file: NotebookFile): string {
  validateDocument(file.document);
  return JSON.stringify(file, null, 2);
}

export function openNotebookSession(file: NotebookFile): NotebookSession {
  return { present: structuredClone(file), past: [], future: [] };
}

export function editNotebook(session: NotebookSession, changes: { document?: NotebookDocument; title?: string }, group?: string): NotebookSession {
  if (changes.document) validateDocument(changes.document);
  const present = { ...session.present, ...changes, revision: crypto.randomUUID(), updatedAt: Date.now() };
  if (changes.document) present.document = { ...changes.document, content: identifyBlocks(changes.document.content) };
  const past = group && group === session.group ? session.past : [...session.past, session.present].slice(-100);
  return { present, past, future: [], group };
}

export function undoNotebook(session: NotebookSession): NotebookSession {
  const previous = session.past.at(-1);
  if (!previous) return session;
  return { present: { ...previous, revision: crypto.randomUUID(), updatedAt: Date.now() },
    past: session.past.slice(0, -1), future: [session.present, ...session.future] };
}

export function redoNotebook(session: NotebookSession): NotebookSession {
  const next = session.future[0];
  if (!next) return session;
  return { present: { ...next, revision: crypto.randomUUID(), updatedAt: Date.now() },
    past: [...session.past, session.present], future: session.future.slice(1) };
}
