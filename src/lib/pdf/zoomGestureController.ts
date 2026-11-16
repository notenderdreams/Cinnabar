export const ZOOM_GESTURE_SETTLE_MS = 120;

export interface ZoomAnchor {
  x: number;
  y: number;
}

export interface ZoomSettlement {
  zoom: number;
  anchor: ZoomAnchor | null;
}

interface ZoomGestureControllerOptions {
  initialZoom: number;
  /** Runs `callback` after `delayMs`; returns a function that cancels it. */
  schedule: (callback: () => void, delayMs: number) => () => void;
  onSettle: (settlement: ZoomSettlement) => void;
}

/** Models a run of zoom input that settles once input has been quiet for a short period. */
export class ZoomGestureController {
  private readonly options: ZoomGestureControllerOptions;
  private cancelSettle: (() => void) | null = null;
  private live: number;
  private settled: number;
  private gestureAnchor: ZoomAnchor | null = null;

  constructor(options: ZoomGestureControllerOptions) {
    this.options = options;
    this.live = options.initialZoom;
    this.settled = options.initialZoom;
  }

  get liveZoom(): number {
    return this.live;
  }

  get settledZoom(): number {
    return this.settled;
  }

  get anchor(): ZoomAnchor | null {
    return this.gestureAnchor;
  }

  get isActive(): boolean {
    return this.cancelSettle !== null;
  }

  input(targetZoom: number, anchor: ZoomAnchor | null = null): void {
    if (!this.isActive) this.gestureAnchor = anchor;
    this.live = targetZoom;
    this.cancelSettle?.();
    this.cancelSettle = this.options.schedule(() => {
      this.cancelSettle = null;
      this.settled = this.live;
      this.options.onSettle({ zoom: this.settled, anchor: this.gestureAnchor });
    }, ZOOM_GESTURE_SETTLE_MS);
  }

  dispose(): void {
    this.cancelSettle?.();
    this.cancelSettle = null;
  }
}
