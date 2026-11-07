import { describe, expect, test } from 'bun:test';
import { degrees, PDFDocument } from 'pdf-lib';
import {
  addBlankPageBelow,
  reindexAfterPageInsertion,
} from '../src/lib/pdf/pageExtractor';

const projectFile = (path: string) => Bun.file(new URL(`../${path}`, import.meta.url)).text();

describe('page insertion', () => {
  test('inserts a new blank page below the specified page with identical dimensions', async () => {
    const source = await PDFDocument.create();
    source.addPage([150, 250]); // Page 1
    source.addPage([300, 450]); // Page 2
    source.addPage([500, 700]); // Page 3

    const sourceBytes = await source.save();

    // Insert below page 2 -> new page should become page 3 with size 300x450
    const updatedBytes = await addBlankPageBelow(sourceBytes, 2);
    const updated = await PDFDocument.load(updatedBytes);

    expect(updated.getPageCount()).toBe(4);

    // Page 1: original 150x250
    expect(updated.getPage(0).getWidth()).toBe(150);
    expect(updated.getPage(0).getHeight()).toBe(250);

    // Page 2: original 300x450
    expect(updated.getPage(1).getWidth()).toBe(300);
    expect(updated.getPage(1).getHeight()).toBe(450);

    // Page 3: newly inserted blank page matching Page 2's dimensions
    expect(updated.getPage(2).getWidth()).toBe(300);
    expect(updated.getPage(2).getHeight()).toBe(450);

    // Page 4: shifted original Page 3 (500x700)
    expect(updated.getPage(3).getWidth()).toBe(500);
    expect(updated.getPage(3).getHeight()).toBe(700);
  });

  test('inserts below the first page', async () => {
    const source = await PDFDocument.create();
    source.addPage([200, 400]); // Page 1
    source.addPage([600, 800]); // Page 2

    const updatedBytes = await addBlankPageBelow(await source.save(), 1);
    const updated = await PDFDocument.load(updatedBytes);

    expect(updated.getPageCount()).toBe(3);
    // Page 1
    expect(updated.getPage(0).getWidth()).toBe(200);
    expect(updated.getPage(0).getHeight()).toBe(400);
    // Page 2 (inserted blank page)
    expect(updated.getPage(1).getWidth()).toBe(200);
    expect(updated.getPage(1).getHeight()).toBe(400);
    // Page 3 (shifted original Page 2)
    expect(updated.getPage(2).getWidth()).toBe(600);
    expect(updated.getPage(2).getHeight()).toBe(800);
  });

  test('inserts below the last page', async () => {
    const source = await PDFDocument.create();
    source.addPage([100, 200]); // Page 1
    source.addPage([350, 550]); // Page 2

    const updatedBytes = await addBlankPageBelow(await source.save(), 2);
    const updated = await PDFDocument.load(updatedBytes);

    expect(updated.getPageCount()).toBe(3);
    expect(updated.getPage(0).getWidth()).toBe(100);
    expect(updated.getPage(1).getWidth()).toBe(350);
    // Page 3 (newly appended page with Page 2's dimensions)
    expect(updated.getPage(2).getWidth()).toBe(350);
    expect(updated.getPage(2).getHeight()).toBe(550);
  });

  test('preserves page rotation on the newly added page', async () => {
    const source = await PDFDocument.create();
    const p1 = source.addPage([400, 600]);
    p1.setRotation(degrees(90));

    const updatedBytes = await addBlankPageBelow(await source.save(), 1);
    const updated = await PDFDocument.load(updatedBytes);

    expect(updated.getPageCount()).toBe(2);
    const newPage = updated.getPage(1);
    expect(newPage.getWidth()).toBe(400);
    expect(newPage.getHeight()).toBe(600);
    expect(newPage.getRotation().angle).toBe(90);
  });

  test('throws error for invalid page numbers', async () => {
    const source = await PDFDocument.create();
    source.addPage([100, 100]);
    const bytes = await source.save();

    await expect(addBlankPageBelow(bytes, 0)).rejects.toThrow('Page 0 does not exist.');
    await expect(addBlankPageBelow(bytes, -1)).rejects.toThrow('Page -1 does not exist.');
    await expect(addBlankPageBelow(bytes, 2)).rejects.toThrow('Page 2 does not exist.');
    await expect(addBlankPageBelow(bytes, 1.5)).rejects.toThrow('Page 1.5 does not exist.');
  });

  test('reindexes annotations and snippets when inserting a page below', () => {
    const entries = [
      { id: 'page1_entry', pageNumber: 1 },
      { id: 'divider_no_page' },
      { id: 'page2_entry', pageNumber: 2 },
      { id: 'page3_entry', pageNumber: 3 },
    ];

    // Insert below page 1 -> page 1 stays, pages 2 & 3 shift by +1
    expect(reindexAfterPageInsertion(entries, 1)).toEqual([
      { id: 'page1_entry', pageNumber: 1 },
      { id: 'divider_no_page' },
      { id: 'page2_entry', pageNumber: 3 },
      { id: 'page3_entry', pageNumber: 4 },
    ]);

    // Insert below page 2 -> pages 1 & 2 stay, page 3 shifts by +1
    expect(reindexAfterPageInsertion(entries, 2)).toEqual([
      { id: 'page1_entry', pageNumber: 1 },
      { id: 'divider_no_page' },
      { id: 'page2_entry', pageNumber: 2 },
      { id: 'page3_entry', pageNumber: 4 },
    ]);

    // Insert below page 3 -> all existing entries stay unchanged
    expect(reindexAfterPageInsertion(entries, 3)).toEqual([
      { id: 'page1_entry', pageNumber: 1 },
      { id: 'divider_no_page' },
      { id: 'page2_entry', pageNumber: 2 },
      { id: 'page3_entry', pageNumber: 3 },
    ]);
  });

  test('wires "Add page below" in context menu, PDFPage, and PDFViewer', async () => {
    const [contextMenuSource, pageSource, viewerSource, appSource] = await Promise.all([
      projectFile('src/components/viewer/PageContextMenu.tsx'),
      projectFile('src/components/viewer/PDFPage.tsx'),
      projectFile('src/components/viewer/PDFViewer.tsx'),
      projectFile('src/App.tsx'),
    ]);

    expect(contextMenuSource).toContain('Add page below');
    expect(contextMenuSource).toContain('onAddPageBelow');
    expect(pageSource).toContain('onAddPageBelow');
    expect(viewerSource).toContain('onAddPageBelow');
    expect(appSource).toContain('handleAddPageBelow');
    expect(appSource).toContain('usePdfPageMutations({');
    const mutationSource = await projectFile('src/hooks/usePdfPageMutations.ts');
    expect(mutationSource).toContain('addBlankPageBelow');
  });
});
