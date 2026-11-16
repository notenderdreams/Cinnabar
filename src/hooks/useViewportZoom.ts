import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { ZoomGestureController } from '../lib/pdf/zoomGestureController';

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
  smooth = false,
) {
  const anchor = useRef<Anchor | null>(null);
  const previousZoom = useRef(zoom);
  const targetZoom = useRef(zoom);
  const frame = useRef<number | null>(null);
  const gesture = useRef<ZoomGestureController | null>(null);
  const stack = useRef<HTMLElement | null>(null);
  const latest = useRef({ onZoomChange, onActivate, zoom });
  latest.current = { onZoomChange, onActivate, zoom };

  const clearLiveZoom = () => {
    const element = stack.current;
    if (!element) return;
    element.style.transform = '';
    element.style.transformOrigin = '';
    element.style.willChange = '';
  };

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
    // The committed zoom replaces the live transform; measure only after it is gone.
    if (previousZoom.current !== zoom && !gesture.current?.isActive) clearLiveZoom();
    if (container && previousZoom.current !== zoom && point && container.contains(point.element)) {
      const bounds = container.getBoundingClientRect();
      const rect = point.element.getBoundingClientRect();
      container.scrollLeft += rect.left + point.x * rect.width - bounds.left - point.screenX;
      container.scrollTop += rect.top + point.y * rect.height - bounds.top - point.screenY;
    }
    if (previousZoom.current !== zoom) targetZoom.current = zoom;
    previousZoom.current = zoom;
    if (frame.current === null && !gesture.current?.isActive) capture();
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    anchor.current = null;
    targetZoom.current = latest.current.zoom;
    capture();
    const scroll = () => {
      if (!gesture.current?.isActive) capture();
    };
    gesture.current = smooth
      ? new ZoomGestureController({
          initialZoom: latest.current.zoom,
          schedule: (callback, delayMs) => {
            const id = window.setTimeout(callback, delayMs);
            return () => window.clearTimeout(id);
          },
          onSettle: ({ zoom: settled }) => {
            if (frame.current !== null) {
              cancelAnimationFrame(frame.current);
              frame.current = null;
            }
            if (settled === latest.current.zoom) clearLiveZoom();
            else latest.current.onZoomChange?.(settled);
          },
        })
      : null;
    const applyLiveZoom = () => {
      frame.current = null;
      const element = stack.current;
      const controller = gesture.current;
      if (element && controller) {
        element.style.transform = `scale(${controller.liveZoom / latest.current.zoom})`;
      }
    };
    const wheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || !latest.current.onZoomChange) return;
      event.preventDefault();
      latest.current.onActivate?.();
      const bounds = container.getBoundingClientRect();
      const pixels =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
      const controller = gesture.current;
      if (controller && !controller.isActive) {
        clearLiveZoom();
        stack.current = container.querySelector<HTMLElement>(selector)?.parentElement ?? null;
      }
      const element = stack.current;
      if (controller && element) {
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;
        if (!controller.isActive) {
          capture(x, y);
          const stackRect = element.getBoundingClientRect();
          element.style.transformOrigin = `${event.clientX - stackRect.left}px ${event.clientY - stackRect.top}px`;
          element.style.willChange = 'transform';
        }
        const base = controller.isActive ? controller.liveZoom : latest.current.zoom;
        controller.input(Math.min(3.5, Math.max(0.3, base * Math.exp(-pixels * 0.002))), { x, y });
        frame.current ??= requestAnimationFrame(applyLiveZoom);
        return;
      }
      capture(event.clientX - bounds.left, event.clientY - bounds.top);
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
      gesture.current?.dispose();
      gesture.current = null;
      clearLiveZoom();
      stack.current = null;
      anchor.current = null;
    };
  }, [containerRef, documentKey, layoutKey, selector, smooth]);
}
