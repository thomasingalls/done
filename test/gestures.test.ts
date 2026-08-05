/**
 * PRD §7.2 / TRD §8.4. The decision table, tested without a device.
 *
 * The device still has to confirm it — "the swipe-vs-select gesture model works
 * on a real Android device" is a Phase 1 exit criterion and no unit test
 * discharges it. What this holds down is that the rules are the rules that were
 * written down, so a device session is spent on feel rather than on logic.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GESTURE_CONFIG,
  GestureRecognizer,
  shouldCommit,
  type GestureAction,
} from '../src/gestures/recognizer';

const types = (actions: GestureAction[]): string[] => actions.map((action) => action.type);

const down = (recognizer: GestureRecognizer, pointer: 'touch' | 'mouse' = 'touch') =>
  recognizer.handle({ kind: 'down', x: 100, y: 100, time: 0, pointer });

describe('swipe navigates', () => {
  it('becomes navigation once the movement threshold is crossed', () => {
    const recognizer = new GestureRecognizer();
    down(recognizer);
    expect(types(recognizer.handle({ kind: 'move', x: 104, y: 100, time: 20 }))).toEqual([]);
    expect(types(recognizer.handle({ kind: 'move', x: 130, y: 102, time: 40 }))).toEqual([
      'navigation-start',
      'navigation-move',
    ]);
    expect(recognizer.state).toBe('navigating');
  });

  it('locks to the dominant axis and stays there', () => {
    const recognizer = new GestureRecognizer({ navigable: ['x', 'y'] });
    down(recognizer);
    recognizer.handle({ kind: 'move', x: 130, y: 105, time: 30 });
    expect(recognizer.lockedAxis).toBe('x');

    // A later drift downwards does not re-decide the axis.
    const actions = recognizer.handle({ kind: 'move', x: 132, y: 260, time: 60 });
    expect(actions).toEqual([{ type: 'navigation-move', axis: 'x', delta: 32 }]);
  });

  it('hands back a drag along an axis with nowhere to go', () => {
    const recognizer = new GestureRecognizer({ navigable: ['x'] });
    down(recognizer);
    expect(types(recognizer.handle({ kind: 'move', x: 101, y: 160, time: 30 }))).toEqual(['native']);
    expect(recognizer.state).toBe('native');
  });

  it('reports a velocity so a flick can beat the distance threshold', () => {
    const recognizer = new GestureRecognizer();
    down(recognizer);
    recognizer.handle({ kind: 'move', x: 120, y: 100, time: 10 });
    recognizer.handle({ kind: 'move', x: 160, y: 100, time: 20 });
    const [end] = recognizer.handle({ kind: 'up', x: 200, y: 100, time: 30 });
    expect(end).toMatchObject({ type: 'navigation-end', axis: 'x', delta: 100 });
    expect((end as { velocity: number }).velocity).toBeGreaterThan(0);
  });
});

describe('long press selects', () => {
  it('enters selection mode when the timer fires without movement', () => {
    const recognizer = new GestureRecognizer();
    down(recognizer);
    expect(types(recognizer.handle({ kind: 'longpress', time: 400 }))).toEqual(['selection-start']);
    expect(recognizer.state).toBe('selecting');
  });

  it('does not fire once the gesture is already navigating', () => {
    const recognizer = new GestureRecognizer();
    down(recognizer);
    recognizer.handle({ kind: 'move', x: 140, y: 100, time: 30 });
    expect(recognizer.handle({ kind: 'longpress', time: 400 })).toEqual([]);
    expect(recognizer.state).toBe('navigating');
  });

  it('stops reporting a pending long press once the gesture resolves', () => {
    const recognizer = new GestureRecognizer();
    down(recognizer);
    expect(recognizer.awaitingLongPress).toBe(true);
    recognizer.handle({ kind: 'move', x: 140, y: 100, time: 30 });
    expect(recognizer.awaitingLongPress).toBe(false);
  });

  it('does not select during a drag that started as one', () => {
    const recognizer = new GestureRecognizer();
    down(recognizer);
    recognizer.handle({ kind: 'longpress', time: 400 });
    // Now dragging: that is the selection extending, not navigation.
    expect(recognizer.handle({ kind: 'move', x: 200, y: 100, time: 500 })).toEqual([]);
  });
});

describe('tap', () => {
  it('is a press and release with no movement and no hold', () => {
    const recognizer = new GestureRecognizer();
    down(recognizer);
    expect(types(recognizer.handle({ kind: 'up', x: 100, y: 100, time: 90 }))).toEqual([
      'tap',
      'reset',
    ]);
    expect(recognizer.state).toBe('idle');
  });

  it('survives a few pixels of finger wobble', () => {
    const recognizer = new GestureRecognizer();
    down(recognizer);
    recognizer.handle({ kind: 'move', x: 103, y: 102, time: 40 });
    expect(types(recognizer.handle({ kind: 'up', x: 104, y: 103, time: 80 }))).toContain('tap');
  });
});

describe('a mouse is left alone', () => {
  it('resolves to native on press, so drag still selects on desktop', () => {
    const recognizer = new GestureRecognizer();
    expect(types(down(recognizer, 'mouse'))).toEqual(['native']);
    expect(types(recognizer.handle({ kind: 'move', x: 300, y: 100, time: 40 }))).toEqual([]);
  });
});

describe('cancellation', () => {
  it('resets on pointercancel', () => {
    const recognizer = new GestureRecognizer();
    down(recognizer);
    recognizer.handle({ kind: 'move', x: 200, y: 100, time: 30 });
    expect(types(recognizer.handle({ kind: 'cancel' }))).toEqual(['reset']);
    expect(recognizer.state).toBe('idle');
    expect(recognizer.lockedAxis).toBe(null);
  });
});

describe('commit threshold', () => {
  const extent = 272;

  it('commits a long slow drag', () => {
    expect(shouldCommit(extent * 0.5, 0, extent)).toBe(true);
  });

  it('does not commit a short slow drag', () => {
    expect(shouldCommit(extent * 0.1, 0.05, extent)).toBe(false);
  });

  it('commits a short fast flick', () => {
    expect(shouldCommit(extent * 0.1, 1.2, extent)).toBe(true);
  });

  it('treats both directions the same', () => {
    expect(shouldCommit(-extent * 0.5, 0, extent)).toBe(true);
    expect(shouldCommit(-extent * 0.1, -1.2, extent)).toBe(true);
  });
});

describe('defaults match what was specified', () => {
  it('is a ~400 ms hold and a ~10 px threshold', () => {
    expect(DEFAULT_GESTURE_CONFIG.longPressMs).toBe(400);
    expect(DEFAULT_GESTURE_CONFIG.moveThresholdPx).toBe(10);
  });
});
