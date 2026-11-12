import { isTauri } from './runtime';
import { commands } from '../../lib/bindings';

/** File access stays behind the native bridge; browsers download the same portable JSON. */
export async function saveNotebookFile(content: string, title: string): Promise<boolean> {
  const name = `${title.trim().replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 100) || 'Notebook'}.cinnabar.json`;
  if (isTauri()) return (await commands.saveNotebookDialog(content, name)).success;
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export async function openNotebookFile(): Promise<string | null> {
  if (!isTauri()) return null;
  const file = await commands.openNotebookDialog();
  if (!file) return null;
  return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(file.data));
}
