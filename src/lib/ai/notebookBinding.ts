import { notebookText, type NotebookFile, type NotebookDocument } from '@cinnabar/notebook';
import type { AiNotebookContext, AiNotebookWrite } from './notebookActions';
import {
  applyNotebookEdits,
  notebookBlockIndex,
  type AiBlockContent,
  type AiNotebookReferenceOption,
} from './notebookEdits';

export interface AiNotebookBinding {
  context: AiNotebookContext;
  write: (key: string, write: AiNotebookWrite, canApply: () => boolean) => Promise<string>;
}
export const emptyAiBlockContent = (kind: AiBlockContent['kind']): AiBlockContent => ({
  kind,
  text: null,
  title: null,
  columns: null,
  attachmentId: null,
  referenceId: null,
});
export function independentNotebookContext(
  file: NotebookFile,
  pageCount: number,
  currentPage: number,
  references: AiNotebookReferenceOption[],
): AiNotebookContext {
  return {
    docKey: `notebook:${file.id}`,
    revision: file.revision,
    title: file.title,
    text: notebookText(file.document.content).slice(0, 16_000),
    pageCount,
    currentPage,
    blocks: notebookBlockIndex(file.document),
    references,
  };
}
export function applyAiNotebookWrite(
  document: NotebookDocument,
  write: AiNotebookWrite,
  references: AiNotebookReferenceOption[],
): NotebookDocument {
  if (write.type === 'edits')
    return applyNotebookEdits(document, write.edits, write.images, references);
  if (write.type === 'text')
    return applyNotebookEdits(document, [
      {
        op: 'append',
        targetId: null,
        anchorId: null,
        style: null,
        content: { ...emptyAiBlockContent('markdown'), text: write.text },
      },
    ]);
  const heading = document.content.content?.find(
    (node) => node.type === 'heading' && node.attrs?.level === 1,
  );
  const targetId: unknown = heading?.attrs?.id;
  if (write.action.placement === 'after_title' && typeof targetId !== 'string')
    throw new Error('Add a title before placing an image below it.');
  return applyNotebookEdits(
    document,
    [
      {
        op: write.action.placement === 'after_title' ? 'insert_after' : 'append',
        targetId:
          write.action.placement === 'after_title' && typeof targetId === 'string'
            ? targetId
            : null,
        anchorId: null,
        style: null,
        content: { ...emptyAiBlockContent('image'), attachmentId: write.image.id },
      },
    ],
    [write.image],
  );
}
