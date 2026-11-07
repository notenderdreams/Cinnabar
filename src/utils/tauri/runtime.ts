export function unwrapNativeResult<T, E>(result: { status: 'ok'; data: T } | { status: 'error'; error: E }): T {
  if (result.status === 'error') {
    throw new Error(typeof result.error === 'string' ? result.error : 'The native command could not be completed.');
  }
  return result.data;
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
