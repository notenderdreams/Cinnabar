import { expect, test } from 'bun:test';
import {
  buildLibraryFolderTree,
  findLibraryFolder,
  isInLibraryFolder,
} from '../src/lib/library/folderTree';

test('builds nested PDF branches with descendant counts and isolates sibling roots', () => {
  const roots = buildLibraryFolderTree(
    [{ id: 'books', name: 'Books', path: '/Books', addedAt: 0 }],
    [
      '/Books/a.pdf',
      '/Books/Science/Physics/b.pdf',
      '/Books/Science/c.pdf',
      '/Bookshelf/d.pdf',
    ].map((filePath) => ({
      id: filePath,
      filePath,
      fileName: filePath,
      fileSize: 1,
      modifiedTimestamp: 0,
    })),
  );
  expect(roots[0]?.count).toBe(3);
  const science = roots[0]?.children[0];
  expect(science?.name).toBe('Science');
  expect(science?.count).toBe(2);
  expect(science?.children[0]?.name).toBe('Physics');
  expect(findLibraryFolder(roots, science?.id ?? '')).toBe(science);
  expect(findLibraryFolder(roots, 'missing')).toBeUndefined();
});

test('matches Windows separators, trailing separators, and filesystem roots', () => {
  expect(isInLibraryFolder('C:\\Books\\Science\\a.pdf', 'C:\\Books\\')).toBe(true);
  expect(isInLibraryFolder('/Bookshelf/a.pdf', '/Books')).toBe(false);
  expect(isInLibraryFolder('/Books/a.pdf', '/')).toBe(true);
});
