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

test('resizable splits preserve arbitrary pane counts and widths through save and undo', () => {
  const file = createNotebook();
  const split = {
    type: 'split',
    attrs: { widths: [0.1, 0.2, 0.1, 0.2, 0.1, 0.1, 0.2] },
    content: Array.from({ length: 7 }, (_, i) => ({
      type: 'column',
      content: [paragraph(`Pane ${i + 1}`)],
    })),
  };
  const next = editNotebook(openNotebookSession(file), {
    document: { ...file.document, content: { type: 'doc', content: [split] } },
  });
  const restored = parseNotebookFile(serializeNotebook(next.present));
  expect(restored.document.content.content?.[0].content).toHaveLength(7);
  expect(restored.document.content.content?.[0].attrs?.widths).toEqual(split.attrs.widths);
  expect(undoNotebook(next).present.document).toEqual(file.document);
  for (const widths of [[0.5], [-1, 2], [NaN, 0.5]]) {
    const invalid = createNotebook();
    invalid.document.content.content = [
      {
        type: 'split',
        attrs: { widths },
        content: [
          { type: 'column', content: [paragraph('Left')] },
          { type: 'column', content: [paragraph('Right')] },
        ],
      },
    ];
    expect(() => serializeNotebook(invalid)).toThrow('Invalid split pane widths');
  }
});
