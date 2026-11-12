import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { commands } from '../src/lib/bindings';
import { openExternalUrl, readClipboardText, saveImageFile } from '../src/utils/tauriBridge';

afterEach(() => mock.restore());

describe('native desktop bridge', () => {
  test('preserves native image dialog cancellation', async () => {
    const save = spyOn(commands, 'saveImageDialog').mockResolvedValue({ status: 'ok', data: { success: false, file_path: null } });
    expect(await saveImageFile('data:image/png;base64,abc', 'page.png')).toBe(false);
    expect(save).toHaveBeenCalledWith('data:image/png;base64,abc', 'page.png');
  });
  test('reads native clipboard text and handles empty clipboard', async () => {
    const read = spyOn(commands, 'readTextFromClipboard').mockResolvedValue({ status: 'ok', data: 'hello' });
    expect(await readClipboardText()).toBe('hello');
    read.mockResolvedValue({ status: 'ok', data: null });
    expect(await readClipboardText()).toBeNull();
  });
  test('opens external URLs through the native command', async () => {
    const open = spyOn(commands, 'openUrl').mockResolvedValue(true);
    await openExternalUrl('https://example.com');
    expect(open).toHaveBeenCalledWith('https://example.com');
    open.mockResolvedValue(false);
    await expect(openExternalUrl('https://example.com')).rejects.toThrow('Could not open');
  });
});
