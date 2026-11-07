import { afterEach, describe, expect, mock, test } from 'bun:test';
import { listenToNativeMenuEvents } from '../src/utils/tauri/shortcuts';

let deliver: (event: { payload: string }) => void;
let resolveListen: (unlisten: () => void) => void;
const listen = mock((_name: string, callback: typeof deliver) => {
  deliver = callback;
  return new Promise<() => void>((resolve) => { resolveListen = resolve; });
});
mock.module('@tauri-apps/api/event', () => ({ listen }));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const originalWindow = globalThis.window;
afterEach(() => {
  globalThis.window = originalWindow;
  listen.mockClear();
});

describe('native menu subscription lifetime', () => {
  test('releases the shared listener when the final subscription ends', async () => {
    globalThis.window = { __TAURI_INTERNALS__: {} } as unknown as Window & typeof globalThis;
    const handler = mock(() => {});
    const first = listenToNativeMenuEvents(handler);
    const second = listenToNativeMenuEvents(handler);
    await flush();
    const unlisten = mock(() => {});
    resolveListen(unlisten);
    await flush();
    expect(listen).toHaveBeenCalledTimes(1);
    first();
    first();
    deliver({ payload: 'open_pdf' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(unlisten).not.toHaveBeenCalled();
    second();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  test('releases a listener that finishes registering after unmount', async () => {
    globalThis.window = { __TAURI_INTERNALS__: {} } as unknown as Window & typeof globalThis;
    const stop = listenToNativeMenuEvents(() => {});
    await flush();
    stop();
    const unlisten = mock(() => {});
    resolveListen(unlisten);
    await flush();
    expect(unlisten).toHaveBeenCalledTimes(1);

    const stopAgain = listenToNativeMenuEvents(() => {});
    await flush();
    expect(listen).toHaveBeenCalledTimes(2);
    resolveListen(() => {});
    await flush();
    stopAgain();
  });
});
