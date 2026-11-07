import { describe, expect, test } from 'bun:test';
import { ThumbnailRenderQueue } from '../src/lib/pdf/thumbnailRenderQueue';

describe('ThumbnailRenderQueue', () => {
  test('starts one thumbnail at a time and only after an idle turn', async () => {
    const idleCallbacks: Array<() => void> = [];
    const queue = new ThumbnailRenderQueue({
      schedule: (callback) => {
        idleCallbacks.push(callback);
        return () => undefined;
      },
    });
    const started: number[] = [];
    let finishFirst: (() => void) | undefined;

    queue.enqueue(() => {
      started.push(1);
      return new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
    });
    queue.enqueue(async () => {
      started.push(2);
    });

    expect(started).toEqual([]);
    idleCallbacks.shift()?.();
    expect(started).toEqual([1]);

    finishFirst?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual([1]);

    idleCallbacks.shift()?.();
    expect(started).toEqual([1, 2]);
  });

  test('releases a cancelled off-screen thumbnail so the next preview can render', () => {
    const idleCallbacks = new Set<() => void>();
    const queue = new ThumbnailRenderQueue({
      schedule: (callback) => {
        idleCallbacks.add(callback);
        return () => idleCallbacks.delete(callback);
      },
    });
    const started: number[] = [];

    const cancel = queue.enqueue(() => started.push(1));
    queue.enqueue(() => started.push(2));
    cancel();

    expect(started).toEqual([]);
    const nextCallback = idleCallbacks.values().next().value as (() => void) | undefined;
    nextCallback?.();
    expect(started).toEqual([2]);
  });
});
