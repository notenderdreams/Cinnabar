import { commands } from '../../lib/bindings';

/** Notebook files use native Tauri dialogs. */
export async function saveNotebookFile(content: string, title: string): Promise<boolean> {
  const name = `${title.trim().replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 100) || 'Notebook'}.cinnabar.json`;
  return (await commands.saveNotebookDialog(content, name)).success;
}

export async function openNotebookFile(): Promise<string | null> {
  const file = await commands.openNotebookDialog();
  if (!file) return null;
  return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(file.data));
}
