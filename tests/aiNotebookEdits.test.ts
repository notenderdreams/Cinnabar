import { expect, test } from 'bun:test';
import {
  createNotebook,
  editNotebook,
  openNotebookSession,
  undoNotebook,
  parseNotebookFile,
  serializeNotebook,
} from '@cinnabar/notebook';
import {
  applyNotebookEdits,
  notebookBlockIndex,
  parseNotebookEdits,
  type AiNotebookEdit,
} from '../src/lib/ai/notebookEdits';
import { emptyAiBlockContent, independentNotebookContext } from '../src/lib/ai/notebookBinding';
import { parseNotebookReply, notebookInstructions } from '../src/lib/ai/notebookActions';

const append = (text: string): AiNotebookEdit => ({
  op: 'append',
  targetId: null,
  anchorId: null,
  style: null,
  content: { ...emptyAiBlockContent('markdown'), text },
});

test('AI markdown becomes editable math, tables, tasks, formatting and code without corrupting literals', () => {
  const document = applyNotebookEdits(createNotebook().document, [
    append(
      String.raw`# Study notes

Inline \(x^2 + y^2 = z^2\) and **key terms**.

\[
\frac{a}{b} = c
\]

- [ ] Review the proof
- [x] Read the example

| Term | Value |
| --- | --- |
| Speed | $v$ |

` + '\n`\\(keep this literal\\)`',
    ),
  ]);
  const serialized = JSON.stringify(document.content);
  expect(serialized).toContain('inlineMath');
  expect(serialized).toContain('blockMath');
  expect(serialized).toContain('taskList');
  expect(serialized).toContain('table');
  expect(serialized).toContain('bold');
  expect(serialized).toContain('keep this literal');
  expect(serialized).toContain('code');
});

test('widget batches remain editable and portable and undo as a single change', () => {
  const file = createNotebook();
  const edits: AiNotebookEdit[] = [
    {
      ...append('Important $E=mc^2$'),
      content: { ...emptyAiBlockContent('callout'), text: 'Important $E=mc^2$' },
    },
    {
      ...append(''),
      content: {
        ...emptyAiBlockContent('toggle'),
        title: 'Derivation',
        text: 'The steps go here.',
      },
    },
    {
      ...append(''),
      content: {
        ...emptyAiBlockContent('columns'),
        columns: ['## Theory\n\n$x$', '## Practice\n\n- [ ] Exercise'],
      },
    },
    { ...append(''), content: emptyAiBlockContent('contents') },
  ];
  const document = applyNotebookEdits(file.document, edits);
  const session = editNotebook(openNotebookSession(file), { document });
  expect(parseNotebookFile(serializeNotebook(session.present))).toEqual(session.present);
  expect(undoNotebook(session).present.document).toEqual(file.document);
  expect(JSON.stringify(document.content)).toContain('columns');
});

test('targeted replace, move, format and delete preserve other IDs and content', () => {
  const initial = applyNotebookEdits(createNotebook().document, [
    append('First\n\nSecond\n\nThird'),
  ]);
  const blocks = initial.content.content!.filter((node) => node.content?.length);
  const [a, b, c] = blocks.map((node) => String(node.attrs!.id));
  const document = applyNotebookEdits(initial, [
    { ...append('Updated'), op: 'replace', targetId: b },
    { op: 'move_before', targetId: c, anchorId: a, content: null, style: null },
    {
      op: 'format',
      targetId: a,
      anchorId: null,
      content: null,
      style: { fontSize: 18, color: '#123456', background: null, textAlign: 'center' },
    },
    { op: 'delete', targetId: b, anchorId: null, content: null, style: null },
  ]);
  const meaningful = document.content.content!.filter((node) => node.content?.length);
  expect(meaningful.map((node) => node.attrs!.id)).toEqual([c, a]);
  expect(meaningful[1].attrs).toMatchObject({
    fontSize: 18,
    color: '#123456',
    textAlign: 'center',
  });
  expect(JSON.stringify(initial)).toContain('Second');
});

test('an invalid batch is atomic; unknown blocks, unsafe links and model-generated image URLs cannot write', () => {
  const initial = createNotebook().document;
  const snapshot = JSON.stringify(initial);
  for (const edits of [
    [
      append('Valid prefix'),
      { op: 'delete', targetId: 'missing', anchorId: null, content: null, style: null },
    ],
    [append('[unsafe](javascript:alert(1))')],
    [append('![remote](https://example.com/picture.png)')],
    [append('   ')],
  ])
    expect(() => applyNotebookEdits(initial, edits as AiNotebookEdit[])).toThrow();
  expect(JSON.stringify(initial)).toBe(snapshot);
  expect(() => parseNotebookEdits([{ ...append('x'), op: 'run_shell' }])).toThrow();
  expect(() => parseNotebookEdits(Array.from({ length: 31 }, () => append('x')))).toThrow();
});

test('images and references resolve only from application supplied sources', () => {
  const initial = createNotebook().document;
  const imageEdit = {
    ...append(''),
    content: { ...emptyAiBlockContent('image'), attachmentId: 'clip' },
  };
  const refEdit = {
    ...append(''),
    content: { ...emptyAiBlockContent('reference'), referenceId: 'book' },
  };
  expect(() => applyNotebookEdits(initial, [imageEdit])).toThrow();
  expect(() => applyNotebookEdits(initial, [refEdit])).toThrow();
  const document = applyNotebookEdits(
    initial,
    [imageEdit, refEdit],
    [{ id: 'clip', type: 'image', dataUrl: 'data:image/png;base64,AAAA', width: 100, height: 80 }],
    [{ id: 'book', kind: 'pdf', target: '/books/source.pdf', label: 'Source', page: 4 }],
  );
  expect(Object.keys(document.assets)).toHaveLength(1);
  expect(JSON.stringify(document.content)).toContain('/books/source.pdf');
});

test('context exposes block IDs and revision; ordinary replies and mixed action types remain distinct', () => {
  const file = createNotebook();
  const context = independentNotebookContext(file, 1, 1, []);
  expect(context.revision).toBe(file.revision);
  expect(context.blocks).toEqual(notebookBlockIndex(file.document));
  expect(notebookInstructions(context)).toContain('replace/delete/format');
  expect(
    parseNotebookReply(
      JSON.stringify({
        message: 'Explanation',
        notebookText: null,
        notebookImage: null,
        notebookEdits: null,
      }),
    ).notebookEdits,
  ).toBeNull();
  expect(() =>
    parseNotebookReply(
      JSON.stringify({ message: 'x', notebookText: 'x', notebookEdits: [append('y')] }),
    ),
  ).toThrow();
});

test('AI block context preserves formatting and equations without sending embedded image data', () => {
  const file = createNotebook();
  file.document = applyNotebookEdits(file.document, [append('**Keep this** and $x^2$')]);
  const context = independentNotebookContext(file, 1, 1, []);
  const rich = context.blocks?.find((block) => block.text.includes('Keep this'));
  expect(JSON.stringify(rich?.content)).toContain('bold');
  expect(JSON.stringify(rich?.content)).toContain('inlineMath');
  expect(
    notebookInstructions({ ...context, selection: { blockIds: [rich!.id], text: 'Keep this' } }),
  ).toContain('"text":"Keep this"');
  file.document.content.content!.push({
    type: 'image',
    attrs: { id: 'image', src: 'data:image/png;base64,PRIVATE_IMAGE', assetId: 'asset' },
  });
  expect(JSON.stringify(notebookBlockIndex(file.document))).not.toContain('PRIVATE_IMAGE');
  file.document.content.content!.push({
    type: 'paragraph',
    attrs: { id: 'large' },
    content: [{ type: 'text', text: 'x'.repeat(7000) }],
  });
  expect(
    notebookBlockIndex(file.document).find((block) => block.id === 'large')?.content,
  ).toBeUndefined();
});
