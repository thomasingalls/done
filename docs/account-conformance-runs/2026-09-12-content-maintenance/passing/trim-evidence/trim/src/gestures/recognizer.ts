/**
 * Swipe navigates; long-press-then-drag selects (PRD §7.2, TRD §8.4).
 *
 * This prioritises the frequent action over the rare one, which is right for a
 * phone and wrong for a mouse — on desktop, drag-to-select is what everyone
 * expects and the app is keyboard-first anyway. So the model applies to touch
 * and pen; a mouse pointer resolves to `native` immediately and the browser
 * does what it always did.
 *
 * A pure state machine, so the decision table is testable without a device.
 * `useGestures` is the only thing that knows about the DOM.
 */

export type Axis = 'x' | 'y';
export type Direction = 'left' | 'right' | 'up' | 'down';

export const directionOf = (axis: Axis, delta: number): Direction => {
  if (axis === 'x') return delta > 0 ? 'right' : 'left';
  return delta > 0 ? 'down' : 'up';
};

export interface GestureConfig {
  /** Hold this long without moving and the gesture becomes a selection. */
  longPressMs: number;
  /** Move this far before that and the gesture becomes navigation. */
  moveThresholdPx: number;
  /** Axes that can lead anywhere at all. An axis with nowhere to go is `native`. */
  navigable: readonly Axis[];
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  longPressMs: 400,
  moveThresholdPx: 10,
  navigable: ['x'],
};

export type PointerKind = 'touch' | 'pen' | 'mouse';

export type GestureInput =
  | { kind: 'down'; x: number; y: number; time: number; pointer: PointerKind }
  | { kind: 'move'; x: number; y: number; time: number }
  | { kind: 'up'; x: number; y: number; time: number }
  | { kind: 'cancel' }
  | { kind: 'longpress'; time: number };

export type GestureAction =
  /** Take the pointer, stop text selection, start translating the container. */
  | { type: 'navigation-start'; axis: Axis }
  | { type: 'navigation-move'; axis: Axis; delta: number }
  | { type: 'navigation-end'; axis: Axis; delta: number; velocity: number }
  /** Hand the pointer back and re-enable selection. */
  | { type: 'selection-start' }
  /** Nothing was a gesture; let the editor and the browser have it. */
  | { type: 'native' }
  | { type: 'tap'; x: number; y: number }
  | { type: 'reset' };

export type GestureState = 'idle' | 'pending' | 'navigating' | 'selecting' | 'native';

interface Sample {
  position: number;
  time: number;
}

export class GestureRecognizer {
  state: GestureState = 'idle';

  /**
   * Whether a particular direction leads anywhere *right now*. Set per press by
   * the DOM half, which is the only thing that can answer it: at the wide
   * breakpoint the menu is already a panel, and a downward drag inside a
   * scrolled region belongs to the region rather than to the plane (TRD §8.4).
   * Evaluated at the moment the axis is chosen, because that is the first
   * moment the direction is known.
   */
  canNavigate: (direction: Direction) => boolean = () => true;

  private config: GestureConfig;
  private originX = 0;
  private originY = 0;
  private originTime = 0;
  private axis: Axis | null = null;
  private last: Sample | null = null;
  private previous: Sample | null = null;

  constructor(config: Partial<GestureConfig> = {}) {
    this.config = { ...DEFAULT_GESTURE_CONFIG, ...config };
  }

  /** Whether a long-press timer should currently be running. */
  get awaitingLongPress(): boolean {
    return this.state === 'pending';
  }

  get lockedAxis(): Axis | null {
    return this.axis;
  }

  handle(input: GestureInput): GestureAction[] {
    switch (input.kind) {
      case 'down':
        return this.onDown(input);
      case 'move':
        return this.onMove(input);
      case 'up':
        return this.onUp(input);
      case 'longpress':
        return this.onLongPress();
      case 'cancel':
        return this.reset();
    }
  }

  private onDown(input: Extract<GestureInput, { kind: 'down' }>): GestureAction[] {
    this.originX = input.x;
    this.originY = input.y;
    this.originTime = input.time;
    this.axis = null;
    this.last = null;
    this.previous = null;

    if (input.pointer === 'mouse') {
      this.state = 'native';
      return [{ type: 'native' }];
    }

    this.state = 'pending';
    return [];
  }

  private onMove(input: Extract<GestureInput, { kind: 'move' }>): GestureAction[] {
    const dx = input.x - this.originX;
    const dy = input.y - this.originY;

    if (this.state === 'pending') {
      if (Math.hypot(dx, dy) < this.config.moveThresholdPx) return [];

      const axis: Axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      const delta = axis === 'x' ? dx : dy;
      if (!this.config.navigable.includes(axis) || !this.canNavigate(directionOf(axis, delta))) {
        // Nothing lies that way. Hand it back rather than swallowing the drag.
        this.state = 'native';
        return [{ type: 'native' }];
      }

      this.state = 'navigating';
      this.axis = axis;
      this.track(delta, input.time);
      return [
        { type: 'navigation-start', axis },
        { type: 'navigation-move', axis, delta },
      ];
    }

    if (this.state === 'navigating' && this.axis) {
      const delta = this.axis === 'x' ? dx : dy;
      this.track(delta, input.time);
      return [{ type: 'navigation-move', axis: this.axis, delta }];
    }

    return [];
  }

  private onUp(input: Extract<GestureInput, { kind: 'up' }>): GestureAction[] {
    const state = this.state;
    const axis = this.axis;

    if (state === 'pending') {
      this.reset();
      return [{ type: 'tap', x: input.x, y: input.y }, { type: 'reset' }];
    }

    if (state === 'navigating' && axis) {
      const delta = axis === 'x' ? input.x - this.originX : input.y - this.originY;
      const velocity = this.velocity(delta, input.time);
      this.reset();
      return [{ type: 'navigation-end', axis, delta, velocity }, { type: 'reset' }];
    }

    return this.reset();
  }

  private onLongPress(): GestureAction[] {
    if (this.state !== 'pending') return [];
    this.state = 'selecting';
    return [{ type: 'selection-start' }];
  }

  private track(position: number, time: number): void {
    this.previous = this.last;
    this.last = { position, time };
  }

  /** px/ms over the last movement pair; used to let a flick beat the threshold. */
  private velocity(delta: number, time: number): number {
    const reference = this.previous ?? this.last ?? { position: 0, time: this.originTime };
    const elapsed = time - reference.time;
    if (elapsed <= 0) return 0;
    return (delta - reference.position) / elapsed;
  }

  private reset(): GestureAction[] {
    this.state = 'idle';
    this.axis = null;
    this.last = null;
    this.previous = null;
    return [{ type: 'reset' }];
  }
}

/**
 * Whether a completed drag should land on the neighbouring view.
 * A short flick counts as much as a long slow drag.
 */
export const shouldCommit = (
  delta: number,
  velocity: number,
  extent: number,
  { distanceRatio = 0.35, velocityPxPerMs = 0.5 } = {},
): boolean => Math.abs(delta) > extent * distanceRatio || Math.abs(velocity) > velocityPxPerMs;
