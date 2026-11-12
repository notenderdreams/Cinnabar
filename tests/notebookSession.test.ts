import { describe, expect, test } from 'bun:test';
import { createNotebook, editNotebook, openNotebookSession, parseNotebookFile, serializeNotebook,
  undoNotebook, redoNotebook, type NotebookDocument } from '@cinnabar/notebook';

function writing(text: string): NotebookDocument {
  const document = createNotebook().document;
  document.content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
  return document;
}

describe('independent notebook sessions', () => {
  test('creates independent identities and portable structured documents without a PDF', () => {
    const first = createNotebook('Handnotes');
    const second = createNotebook('Other');
    expect(first.id).not.toBe(second.id);
    const session = editNotebook(openNotebookSession(first), { document: writing('First paragraph') });
    const reopened = parseNotebookFile(serializeNotebook(session.present));
    expect(reopened).toEqual(session.present);
    expect(second.document.content.content?.[0].content).toBeUndefined();
  });

  test('groups typing while preserving separate formatting undo and monotonic state identity', () => {
    let session = openNotebookSession(createNotebook());
    session = editNotebook(session, { document: writing('Hello') }, 'typing');
    const id = session.present.document.content.content![0].attrs!.id;
    const next = structuredClone(session.present.document);
    next.content.content![0].content![0].text = 'Hello world';
    session = editNotebook(session, { document: next }, 'typing');
    expect(session.past).toHaveLength(1);
    expect(session.present.document.content.content![0].attrs!.id).toBe(id);
    session = editNotebook(session, { document: { ...session.present.document, styles: { ...session.present.document.styles, fontSize: 18 } } });
    const undone = undoNotebook(session);
    expect(undone.present.document.styles.fontSize).toBe(13);
    expect(undone.present.document.content.content![0].content![0].text).toBe('Hello world');
    expect(undone.present.revision).not.toBe(session.present.revision);
    const redone = redoNotebook(undone);
    expect(redone.present.document.styles.fontSize).toBe(18);
    expect(undoNotebook(undone).present.document.content.content![0].content).toBeUndefined();
  });

  test('rejects invalid imports and operation batches without changing accepted content', () => {
    const session = openNotebookSession(createNotebook());
    const before = serializeNotebook(session.present);
    const invalid = { ...session.present.document, content: { type: 'unknown' } };
    expect(() => editNotebook(session, { document: invalid })).toThrow();
    expect(serializeNotebook(session.present)).toBe(before);
    expect(() => parseNotebookFile(JSON.stringify({ ...session.present, version: 2 }))).toThrow('supported');
    expect(() => parseNotebookFile(JSON.stringify({ ...session.present, document: { ...session.present.document, styles: { ...session.present.document.styles, fontSize: Infinity } } }))).toThrow();
  });

  test('an accepted edit after undo discards redo without modifying another session', () => {
    const file = createNotebook();
    const first = editNotebook(openNotebookSession(file), { document: writing('Original') });
    const other = openNotebookSession(first.present);
    const undone = undoNotebook(first);
    const revised = editNotebook(undone, { document: writing('Replacement') });
    expect(revised.future).toHaveLength(0);
    expect(other.present.document.content.content![0].content![0].text).toBe('Original');
  });
});
