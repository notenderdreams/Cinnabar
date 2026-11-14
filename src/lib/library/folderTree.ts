import type { DashboardPdfItem, SavedDirectory } from '../types/dashboard';

export interface LibraryFolderNode {
  id: string;
  name: string;
  path: string;
  rootId: string;
  count: number;
  children: LibraryFolderNode[];
}

const normalize = (path: string) => path.replaceAll('\\', '/').replace(/\/$/, '');

export function isInLibraryFolder(filePath: string, folderPath: string): boolean {
  return normalize(filePath).startsWith(`${normalize(folderPath)}/`);
}

export function buildLibraryFolderTree(
  directories: SavedDirectory[],
  documents: DashboardPdfItem[],
): LibraryFolderNode[] {
  return directories.map((directory) => {
    const root: LibraryFolderNode = {
      id: directory.id,
      name: directory.name,
      path: normalize(directory.path),
      rootId: directory.id,
      count: 0,
      children: [],
    };
    const nodes = new Map<string, LibraryFolderNode>([[root.path, root]]);
    for (const document of documents) {
      if (!isInLibraryFolder(document.filePath, root.path)) continue;
      root.count++;
      const parts = normalize(document.filePath)
        .slice(root.path.length + 1)
        .split('/');
      parts.pop();
      let parent = root;
      for (const name of parts) {
        const path = `${parent.path}/${name}`;
        let node = nodes.get(path);
        if (!node) {
          node = {
            id: `subfolder:${directory.id}:${path}`,
            name,
            path,
            rootId: root.id,
            count: 0,
            children: [],
          };
          nodes.set(path, node);
          parent.children.push(node);
        }
        node.count++;
        parent = node;
      }
    }
    for (const node of nodes.values()) node.children.sort((a, b) => a.name.localeCompare(b.name));
    return root;
  });
}

export function findLibraryFolder(
  nodes: LibraryFolderNode[],
  id: string,
): LibraryFolderNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findLibraryFolder(node.children, id);
    if (child) return child;
  }
}
