import type { BlockChoice, BlockChoiceKind } from '@cinnabar/notebook/editor';
import { tauriListLibrary } from '../../utils/tauriBridge';
import { listLocalNotebooks } from './storage';
import type { SnippetEntry } from '../types';

export async function loadNotebookBlockChoices(kind: BlockChoiceKind): Promise<BlockChoice[]> {
  if (kind === 'notebook')
    return (await listLocalNotebooks()).map((item) => ({
      id: item.id,
      label: item.title || 'Untitled notebook',
      content: [
        {
          type: 'reference',
          attrs: { kind, target: item.id, label: item.title || 'Untitled notebook', page: 1 },
        },
      ],
    }));
  const { documents } = await tauriListLibrary();
  if (kind === 'pdf')
    return documents.map((item) => ({
      id: item.id,
      label: item.fileName,
      maxPage: item.numPages,
      content: [
        {
          type: 'reference',
          attrs: { kind, target: item.filePath, label: item.fileName, page: 1 },
        },
      ],
    }));
  const choices: BlockChoice[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < localStorage.length && choices.length < 200; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('pdfuck_snippets_')) continue;
    try {
      const entries = JSON.parse(localStorage.getItem(key) ?? '[]') as SnippetEntry[];
      if (!Array.isArray(entries)) continue;
      const identity = key.slice('pdfuck_snippets_'.length);
      const source = documents.find((item) =>
        [item.id, item.filePath, `${item.fileName}_${item.numPages}_${item.fileSize}`].includes(
          identity,
        ),
      );
      for (const entry of entries) {
        if (choices.length >= 200) break;
        if (
          entry.type !== 'image' ||
          seen.has(entry.id) ||
          !/^data:image\/(png|jpeg|webp|gif);base64,/.test(entry.dataUrl) ||
          !Number.isFinite(entry.width) ||
          !Number.isFinite(entry.height)
        )
          continue;
        seen.add(entry.id);
        const label = `${entry.label || source?.fileName || 'Saved snippet'} · p. ${entry.pageNumber}`;
        choices.push({
          id: entry.id,
          label,
          content: [
            {
              type: 'image',
              attrs: {
                src: entry.dataUrl,
                width: Math.min(entry.width, 500),
                height: null,
                caption: label,
                alt: label,
              },
            },
            ...(source
              ? [
                  {
                    type: 'reference',
                    attrs: {
                      kind: 'pdf',
                      target: source.filePath,
                      label: source.fileName,
                      page: entry.pageNumber,
                    },
                  },
                ]
              : []),
          ],
        });
      }
    } catch {
      /* Ignore invalid legacy snippet records. */
    }
  }
  return choices;
}
