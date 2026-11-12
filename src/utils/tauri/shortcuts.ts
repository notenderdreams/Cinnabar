type NativeMenuHandler = (action: string) => void;
const nativeMenuHandlers = new Set<NativeMenuHandler>();
let globalNativeMenuUnlisten: (() => void) | null = null;
let isSettingUpNativeMenu = false;

export function listenToNativeMenuEvents(handler: NativeMenuHandler): () => void {
  // Each subscription owns its entry, even when callers reuse a callback.
  const subscription: NativeMenuHandler = (action) => handler(action);
  nativeMenuHandlers.add(subscription);

  if (!globalNativeMenuUnlisten && !isSettingUpNativeMenu) {
    isSettingUpNativeMenu = true;
    import('@tauri-apps/api/event')
      .then(({ listen }) => {
        return listen<string>('native-menu-action', (event) => {
          nativeMenuHandlers.forEach((h) => {
            try {
              h(event.payload);
            } catch (err) {
              console.error('Menu handler dispatch error:', err);
            }
          });
        });
      })
      .then((unlisten) => {
        isSettingUpNativeMenu = false;
        if (nativeMenuHandlers.size === 0) {
          unlisten();
        } else {
          globalNativeMenuUnlisten = unlisten;
        }
      })
      .catch((err) => {
        isSettingUpNativeMenu = false;
        console.warn('Failed to listen to native menu events:', err);
      });
  }

  return () => {
    nativeMenuHandlers.delete(subscription);
    if (nativeMenuHandlers.size === 0 && globalNativeMenuUnlisten) {
      const unlisten = globalNativeMenuUnlisten;
      globalNativeMenuUnlisten = null;
      unlisten();
    }
  };
}
