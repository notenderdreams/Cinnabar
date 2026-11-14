import { expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import { notebookExtensions } from '@cinnabar/notebook/extensions';
import {
  createNotebook,
  editNotebook,
  openNotebookSession,
  parseNotebookFile,
  serializeNotebook,
  undoNotebook,
  redoNotebook,
  notebookText,
} from '@cinnabar/notebook';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
test('nested widgets, columns, closed toggles and source references survive saving and undo', () => {
  const file = createNotebook();
  const document = {
    ...file.document,
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Study notes' }] },
        { type: 'contents' },
        { type: 'callout', content: [paragraph('Remember this')] },
        {
          type: 'toggle',
          attrs: { open: false },
          content: [
            { type: 'toggleTitle', content: [{ type: 'text', text: 'Details' }] },
            { type: 'toggleBody', content: [paragraph('Hidden evidence')] },
          ],
        },
        {
          type: 'columns',
          content: [
            { type: 'column', content: [paragraph('Left')] },
            { type: 'column', content: [{ type: 'callout', content: [paragraph('Right')] }] },
          ],
        },
        {
          type: 'reference',
          attrs: { kind: 'pdf', target: '/books/source.pdf', label: 'Source', page: 4 },
        },
        {
          type: 'reference',
          attrs: { kind: 'notebook', target: 'other-notebook', label: 'Related notes', page: 1 },
        },
      ],
    },
  };
  const session = editNotebook(openNotebookSession(file), { document });
  const restored = parseNotebookFile(serializeNotebook(session.present));
  expect(restored).toEqual(session.present);
  expect(restored.document.content.content?.[3].attrs?.open).toBe(false);
  expect(notebookText(restored.document.content)).toContain('Source · p. 4');
  expect(undoNotebook(session).present.document).toEqual(file.document);
  expect(redoNotebook(undoNotebook(session)).present.document).toEqual(session.present.document);
});

test('rejects incomplete columns and malformed source references', () => {
  const schema = getSchema(notebookExtensions(false));
  expect(() =>
    schema
      .nodeFromJSON({
        type: 'doc',
        content: [
          { type: 'columns', content: [{ type: 'column', content: [paragraph('Only one')] }] },
        ],
      })
      .check(),
  ).toThrow();
  const file = createNotebook();
  file.document.content = {
    type: 'doc',
    content: [
      { type: 'reference', attrs: { kind: 'pdf', target: '/book.pdf', label: 'Book', page: -1 } },
    ],
  };
  expect(() => serializeNotebook(file)).toThrow('Invalid notebook reference');
});
