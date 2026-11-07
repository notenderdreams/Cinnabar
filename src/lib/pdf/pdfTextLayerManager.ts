/**
 * Manages PDF.js textLayer selection behavior and WebKit/Blink empty-space selection handling.
 *
 * In WebKit and Blink (Chrome, Safari, macOS WebKit in Tauri), dragging text selection
 * across absolute-positioned textLayer spans into empty space causes the browser to reset
 * the selection anchor/focus to child offset 0 (the top-left of the page), unexpectedly
 * selecting all text above the starting point.
 *
 * This manager implements the canonical Mozilla PDF.js endOfContent synchronization:
 * 1. An endOfContent element is appended to each active textLayer.
 * 2. On mouse drag, endOfContent expands to cover the page with z-index 0 (under text spans).
 * 3. On selectionchange, endOfContent is positioned immediately adjacent to the active selection endpoint.
 * 4. Drags into empty space hit endOfContent rather than resetting to child 0 at the top of the container.
 */

const textLayers = new Map<HTMLElement, HTMLElement>();
let selectionAbortController: AbortController | null = null;
let isPointerDown = false;
let prevRange: Range | null = null;
let isFirefoxCached: boolean | null = null;

function resetLayer(endDiv: HTMLElement, textLayerDiv: HTMLElement) {
  textLayerDiv.append(endDiv);
  endDiv.style.width = '';
  endDiv.style.height = '';
  textLayerDiv.classList.remove('selecting');
}

function enableGlobalSelectionListener() {
  if (selectionAbortController) return;
  if (typeof document === 'undefined') return;

  selectionAbortController = new AbortController();
  const { signal } = selectionAbortController;

  document.addEventListener(
    'pointerdown',
    () => {
      isPointerDown = true;
    },
    { signal }
  );

  document.addEventListener(
    'pointerup',
    () => {
      isPointerDown = false;
      textLayers.forEach(resetLayer);
    },
    { signal }
  );

  window.addEventListener(
    'blur',
    () => {
      isPointerDown = false;
      textLayers.forEach(resetLayer);
    },
    { signal }
  );

  document.addEventListener(
    'keyup',
    () => {
      if (!isPointerDown) {
        textLayers.forEach(resetLayer);
      }
    },
    { signal }
  );

  document.addEventListener(
    'selectionchange',
    () => {
      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) {
        textLayers.forEach(resetLayer);
        return;
      }

      const activeTextLayers = new Set<HTMLElement>();
      for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        for (const textLayerDiv of textLayers.keys()) {
          if (!activeTextLayers.has(textLayerDiv) && range.intersectsNode(textLayerDiv)) {
            activeTextLayers.add(textLayerDiv);
          }
        }
      }

      for (const [textLayerDiv, endDiv] of textLayers) {
        if (activeTextLayers.has(textLayerDiv)) {
          textLayerDiv.classList.add('selecting');
        } else {
          resetLayer(endDiv, textLayerDiv);
        }
      }

      const firstEntry = textLayers.values().next().value;
      if (!firstEntry) return;

      if (isFirefoxCached === null) {
        isFirefoxCached =
          typeof getComputedStyle !== 'undefined' &&
          getComputedStyle(firstEntry).getPropertyValue('-moz-user-select') === 'none';
      }
      if (isFirefoxCached) return;

      const range = selection.getRangeAt(0);
      const modifyStart = Boolean(
        prevRange &&
          (range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0 ||
            range.compareBoundaryPoints(Range.START_TO_END, prevRange) === 0)
      );

      let anchor: Node | null = modifyStart ? range.startContainer : range.endContainer;
      if (anchor && anchor.nodeType === Node.TEXT_NODE) {
        anchor = anchor.parentNode;
      }

      const parentTextLayer = (anchor as HTMLElement | null)?.parentElement?.closest(
        '.textLayer'
      ) as HTMLElement | null;
      const endDiv = parentTextLayer ? textLayers.get(parentTextLayer) : null;
      if (endDiv && parentTextLayer && anchor && anchor.parentElement) {
        endDiv.style.width = parentTextLayer.style.width;
        endDiv.style.height = parentTextLayer.style.height;
        anchor.parentElement.insertBefore(endDiv, modifyStart ? anchor : anchor.nextSibling);
      }
      prevRange = range.cloneRange();
    },
    { signal }
  );
}

/**
 * Binds an active text layer container for smooth selection across fragmented spans and margins.
 * Returns an unbind function to clean up when the page unmounts or re-renders.
 */
export function bindTextLayerSelection(textLayerDiv: HTMLElement): () => void {
  let endDiv = textLayerDiv.querySelector<HTMLDivElement>(':scope > .endOfContent');
  if (!endDiv) {
    endDiv = document.createElement('div');
    endDiv.className = 'endOfContent';
    textLayerDiv.append(endDiv);
  }

  const handleMouseDown = () => {
    textLayerDiv.classList.add('selecting');
  };
  textLayerDiv.addEventListener('mousedown', handleMouseDown);

  textLayers.set(textLayerDiv, endDiv);
  enableGlobalSelectionListener();

  return () => {
    textLayerDiv.removeEventListener('mousedown', handleMouseDown);
    textLayers.delete(textLayerDiv);
    endDiv?.remove();
    if (textLayers.size === 0) {
      selectionAbortController?.abort();
      selectionAbortController = null;
      prevRange = null;
      isFirefoxCached = null;
    }
  };
}
