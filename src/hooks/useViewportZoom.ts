import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { ZoomGestureController } from '../lib/pdf/zoomGestureController';
import { MAX_ZOOM } from '../lib/pdf/zoomLimits';

export type ZoomPane = 'main' | 'companion' | 'note' | 'notebook';
export type ZoomStepRequest = { id: number; pane: ZoomPane; delta: number; min: number };

const STEP_TRANSITION = 'transform 100ms ease-out';
/** Fallback if a settled zoom never reaches the layout effect (e.g. the parent rejects it). */
const COMMIT_TIMEOUT_MS = 400;

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
  stepRequest: ZoomStepRequest | null = null,
) {
  const anchor = useRef<Anchor | null>(null);
  const previousZoom = useRef(zoom);
  const frame = useRef<number | null>(null);
  const committing = useRef(false);
  const commitTimer = useRef<number | null>(null);
  const pendingInputs = useRef<Array<() => void>>([]);
  const finishCommit = useRef<() => void>(() => undefined);
  const gesture = useRef<ZoomGestureController | null>(null);
  const stack = useRef<HTMLElement | null>(null);
  const stepZoom = useRef<((delta: number, min: number) => void) | null>(null);
  const lastStepId = useRef(stepRequest?.id ?? 0);
  const latest = useRef({ onZoomChange, onActivate, zoom });
  latest.current = { onZoomChange, onActivate, zoom };

  const clearLiveZoom = () => {
    const element = stack.current;
    if (!element) return;
    element.style.transform = '';
    element.style.transformOrigin = '';
    element.style.transition = '';
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
    const committed = previousZoom.current !== zoom && committing.current;
    previousZoom.current = zoom;
    if (frame.current === null && !gesture.current?.isActive) capture();
    if (committed) finishCommit.current();
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    anchor.current = null;
    capture();
    const scroll = () => {
      if (!gesture.current?.isActive && !committing.current) capture();
    };
    finishCommit.current = () => {
      if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
      commitTimer.current = null;
      committing.current = false;
      const replay = pendingInputs.current;
      pendingInputs.current = [];
      for (const input of replay) input();
    };
    gesture.current = new ZoomGestureController({
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
        if (settled === latest.current.zoom) {
          clearLiveZoom();
          return;
        }
        // Inputs arriving before React commits this zoom are replayed afterwards, not lost.
        committing.current = true;
        commitTimer.current = window.setTimeout(finishCommit.current, COMMIT_TIMEOUT_MS);
        latest.current.onZoomChange?.(settled);
      },
    });
    const applyLiveZoom = () => {
      frame.current = null;
      const element = stack.current;
      const controller = gesture.current;
      if (element && controller) {
        element.style.transform = `scale(${controller.liveZoom / latest.current.zoom})`;
      }
    };
    /** Feeds one zoom input into the gesture; the first input of a gesture fixes the anchor. */
    const feedGesture = (
      nextZoom: (base: number) => number,
      clientX: number,
      clientY: number,
      transition: string,
    ): boolean => {
      const controller = gesture.current;
      if (!controller) return false;
      if (committing.current) {
        pendingInputs.current.push(() => feedGesture(nextZoom, clientX, clientY, transition));
        return true;
      }
      if (!controller.isActive) {
        clearLiveZoom();
        stack.current = container.querySelector<HTMLElement>(selector)?.parentElement ?? null;
      }
      const element = stack.current;
      if (!element) return false;
      const bounds = container.getBoundingClientRect();
      const x = clientX - bounds.left;
      const y = clientY - bounds.top;
      if (!controller.isActive) {
        capture(x, y);
        const stackRect = element.getBoundingClientRect();
        element.style.transformOrigin = `${clientX - stackRect.left}px ${clientY - stackRect.top}px`;
        element.style.willChange = 'transform';
      }
      element.style.transition = transition;
      const base = controller.isActive ? controller.liveZoom : latest.current.zoom;
      controller.input(nextZoom(base), { x, y });
      frame.current ??= requestAnimationFrame(applyLiveZoom);
      return true;
    };
    stepZoom.current = (delta, min) => {
      if (!latest.current.onZoomChange) return;
      latest.current.onActivate?.();
      const bounds = container.getBoundingClientRect();
      feedGesture(
        (base) => Math.min(MAX_ZOOM, Math.max(min, base + delta)),
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
        STEP_TRANSITION,
      );
    };
    const wheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || !latest.current.onZoomChange) return;
      event.preventDefault();
      latest.current.onActivate?.();
      const pixels =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
      feedGesture(
        (base) => Math.min(MAX_ZOOM, Math.max(0.3, base * Math.exp(-pixels * 0.002))),
        event.clientX,
        event.clientY,
        '',
      );
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
      stepZoom.current = null;
      if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
      commitTimer.current = null;
      committing.current = false;
      pendingInputs.current = [];
      clearLiveZoom();
      stack.current = null;
      anchor.current = null;
    };
  }, [containerRef, documentKey, layoutKey, selector]);

  useEffect(() => {
    if (!stepRequest || stepRequest.id === lastStepId.current) return;
    lastStepId.current = stepRequest.id;
    stepZoom.current?.(stepRequest.delta, stepRequest.min);
  }, [stepRequest]);

  return useCallback((delta: number, min: number) => stepZoom.current?.(delta, min), []);
}
