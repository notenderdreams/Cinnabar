import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

type Anchor = { element: HTMLElement; x: number; y: number; screenX: number; screenY: number };

/** Keep the viewed content steady and combine high-frequency pinch events per frame. */
export function useViewportZoom(
  containerRef: RefObject<HTMLElement | null>,
  zoom: number,
  onZoomChange: ((zoom: number) => void) | undefined,
  documentKey: unknown,
  layoutKey: unknown,
  selector: string,
  onActivate?: () => void,
) {
  const anchor = useRef<Anchor | null>(null);
  const previousZoom = useRef(zoom);
  const targetZoom = useRef(zoom);
  const frame = useRef<number | null>(null);
  const latest = useRef({ onZoomChange, onActivate, zoom });
  latest.current = { onZoomChange, onActivate, zoom };

  const capture = (screenX?: number, screenY?: number) => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const x = screenX ?? bounds.width / 2;
    const y = screenY ?? bounds.height / 2;
    let closest: HTMLElement | null = null;
    let distance = Infinity;
    for (const element of container.querySelectorAll<HTMLElement>(selector)) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const next = Math.max(rect.top - bounds.top - y, bounds.top + y - rect.bottom, 0);
      if (next < distance) {
        closest = element;
        distance = next;
      }
      if (rect.bottom >= bounds.top + y) break;
    }
    if (!closest) return;
    const rect = closest.getBoundingClientRect();
    anchor.current = {
      element: closest,
      x: (bounds.left + x - rect.left) / rect.width,
      y: (bounds.top + y - rect.top) / rect.height,
      screenX: x,
      screenY: y,
    };
  };

  useLayoutEffect(() => {
    const container = containerRef.current;
    const point = anchor.current;
    if (container && previousZoom.current !== zoom && point && container.contains(point.element)) {
      const bounds = container.getBoundingClientRect();
      const rect = point.element.getBoundingClientRect();
      container.scrollLeft += rect.left + point.x * rect.width - bounds.left - point.screenX;
      container.scrollTop += rect.top + point.y * rect.height - bounds.top - point.screenY;
    }
    if (previousZoom.current !== zoom) targetZoom.current = zoom;
    previousZoom.current = zoom;
    if (frame.current === null) capture();
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    anchor.current = null;
    targetZoom.current = latest.current.zoom;
    capture();
    const scroll = () => capture();
    const wheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || !latest.current.onZoomChange) return;
      event.preventDefault();
      latest.current.onActivate?.();
      const bounds = container.getBoundingClientRect();
      capture(event.clientX - bounds.left, event.clientY - bounds.top);
      const pixels =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
      targetZoom.current = Math.min(
        3.5,
        Math.max(0.3, targetZoom.current * Math.exp(-pixels * 0.002)),
      );
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        latest.current.onZoomChange?.(targetZoom.current);
      });
    };
    container.addEventListener('scroll', scroll, { passive: true });
    container.addEventListener('wheel', wheel, { passive: false });
    return () => {
      container.removeEventListener('scroll', scroll);
      container.removeEventListener('wheel', wheel);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      anchor.current = null;
    };
  }, [containerRef, documentKey, layoutKey, selector]);
}
