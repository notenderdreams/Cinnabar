import { describe, expect, test } from 'bun:test';
import {
  ZOOM_GESTURE_SETTLE_MS,
  ZoomGestureController,
  type ZoomSettlement,
} from '../src/lib/pdf/zoomGestureController';

function createHarness(initialZoom = 1) {
  let now = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  let nextId = 0;
  const settlements: ZoomSettlement[] = [];
  const controller = new ZoomGestureController({
    initialZoom,
    schedule: (callback, delayMs) => {
      const id = nextId++;
      timers.set(id, { at: now + delayMs, callback });
      return () => timers.delete(id);
    },
    onSettle: (settlement) => settlements.push(settlement),
  });
  const advance = (ms: number) => {
    now += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) {
        timers.delete(id);
        timer.callback();
      }
    }
  };
  return { controller, settlements, advance };
}

describe('ZoomGestureController', () => {
  test('a burst of inputs settles exactly once after the quiet period', () => {
    const { controller, settlements, advance } = createHarness();

    controller.input(1.1, { x: 10, y: 20 });
    advance(ZOOM_GESTURE_SETTLE_MS - 20);
    controller.input(1.2, { x: 10, y: 20 });
    advance(ZOOM_GESTURE_SETTLE_MS - 20);
    controller.input(1.3, { x: 10, y: 20 });
    expect(settlements).toHaveLength(0);

    advance(ZOOM_GESTURE_SETTLE_MS);
    advance(ZOOM_GESTURE_SETTLE_MS * 5);
    expect(settlements).toHaveLength(1);
  });

  test('reports the live zoom during a gesture and settles on the last one', () => {
    const { controller, settlements, advance } = createHarness(1);
    expect(controller.liveZoom).toBe(1);
    expect(controller.settledZoom).toBe(1);

    controller.input(1.25, { x: 0, y: 0 });
    controller.input(1.6, { x: 0, y: 0 });
    expect(controller.liveZoom).toBe(1.6);
    expect(controller.settledZoom).toBe(1);

    advance(ZOOM_GESTURE_SETTLE_MS);
    expect(settlements[0].zoom).toBe(1.6);
    expect(controller.settledZoom).toBe(1.6);
    expect(controller.liveZoom).toBe(1.6);
  });

  test('a gesture started before settling continues from the live zoom', () => {
    const { controller, settlements, advance } = createHarness(1);

    controller.input(controller.liveZoom * 1.5, { x: 5, y: 5 });
    advance(ZOOM_GESTURE_SETTLE_MS - 1);
    expect(controller.isActive).toBe(true);
    controller.input(controller.liveZoom * 1.5, { x: 5, y: 5 });

    expect(controller.liveZoom).toBeCloseTo(2.25);
    advance(ZOOM_GESTURE_SETTLE_MS);
    expect(settlements).toHaveLength(1);
    expect(settlements[0].zoom).toBeCloseTo(2.25);
    expect(controller.isActive).toBe(false);
  });

  test('keeps the anchor from the start of the gesture through the settle', () => {
    const { controller, settlements, advance } = createHarness();

    controller.input(1.2, { x: 100, y: 200 });
    controller.input(1.4, { x: 300, y: 400 });
    expect(controller.anchor).toEqual({ x: 100, y: 200 });

    advance(ZOOM_GESTURE_SETTLE_MS);
    expect(settlements[0].anchor).toEqual({ x: 100, y: 200 });
    expect(controller.anchor).toEqual({ x: 100, y: 200 });

    controller.input(1.6, { x: 7, y: 8 });
    expect(controller.anchor).toEqual({ x: 7, y: 8 });
  });

  test('teardown cancels a pending settle', () => {
    const { controller, settlements, advance } = createHarness();

    controller.input(1.5, { x: 0, y: 0 });
    controller.dispose();
    advance(ZOOM_GESTURE_SETTLE_MS * 3);

    expect(settlements).toHaveLength(0);
    expect(controller.isActive).toBe(false);
  });
});
