export type ThumbnailRenderPriority = 'high' | 'normal';

type IdleScheduler = (callback: () => void) => () => void;
type QueueJob = {
  cancelled: boolean;
  cancelSchedule?: () => void;
  render: () => Promise<void> | void;
  slotReserved: boolean;
  started: boolean;
};

const scheduleDuringIdle: IdleScheduler = (callback) => {
  const idleWindow = window as Window & {
    cancelIdleCallback?: (id: number) => void;
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  };
  if (typeof idleWindow.requestIdleCallback === 'function') {
    const id = idleWindow.requestIdleCallback(() => callback(), { timeout: 120 });
    return () => idleWindow.cancelIdleCallback?.(id);
  }

  const timeoutId = globalThis.setTimeout(callback, 16);
  return () => globalThis.clearTimeout(timeoutId);
};

/**
 * Keeps PDF thumbnail rasterization out of interaction-heavy frames. PDF.js
 * still parses in its own worker; this queue prevents many canvas renders from
 * competing for the UI thread at once.
 */
export class ThumbnailRenderQueue {
  private readonly schedule: IdleScheduler;
  private readonly concurrency: number;
  private activeCount = 0;
  private readonly jobs: QueueJob[] = [];

  constructor(options: { schedule?: IdleScheduler; concurrency?: number } = {}) {
    this.schedule = options.schedule ?? scheduleDuringIdle;
    this.concurrency = options.concurrency ?? 1;
  }

  enqueue(render: QueueJob['render'], priority: ThumbnailRenderPriority = 'normal') {
    const job: QueueJob = { cancelled: false, render, slotReserved: false, started: false };
    if (priority === 'high') {
      this.jobs.unshift(job);
    } else {
      this.jobs.push(job);
    }
    this.pump();

    return () => {
      if (job.cancelled) return;
      job.cancelled = true;
      job.cancelSchedule?.();
      job.cancelSchedule = undefined;

      if (job.slotReserved && !job.started) {
        job.slotReserved = false;
        this.activeCount -= 1;
        this.pump();
      }
    };
  }

  private pump() {
    while (this.activeCount < this.concurrency && this.jobs.length > 0) {
      const job = this.jobs.shift();
      if (!job || job.cancelled) continue;

      this.activeCount += 1;
      job.slotReserved = true;
      job.cancelSchedule = this.schedule(() => {
        job.cancelSchedule = undefined;
        if (job.cancelled) {
          this.releaseSlot(job);
          return;
        }

        job.started = true;
        Promise.resolve(job.render())
          .catch(() => undefined)
          .finally(() => {
            this.releaseSlot(job);
          });
      });
    }
  }

  private releaseSlot(job: QueueJob) {
    if (!job.slotReserved) return;
    job.slotReserved = false;
    this.activeCount -= 1;
    this.pump();
  }
}
