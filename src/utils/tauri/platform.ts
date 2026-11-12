import { commands } from '../../lib/bindings';

export async function openExternalUrl(url: string): Promise<void> {
  if (!(await commands.openUrl(url))) throw new Error('Could not open the external URL.');
}
