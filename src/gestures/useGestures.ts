/**
 * Binds the recognizer to Pointer Events (TRD §8.4).
 *
 * The only file that knows about the DOM side of gestures. It never calls
 * `preventDefault` on `pointerdown` — CodeMirror places the cursor from the
 * compatibility mouse events that follow, and suppressing those breaks tapping
 * into text. During navigation the pointer is captured instead, which stops
 * those events at the source, which is the behaviour that was wanted anyway.
 */

import { useCallback, useEffect, useRef, useState, type RefCallback } from 'react';
import {
  type Axis,
  type Direction,
  type GestureAction,
  type GestureConfig,
  GestureRecognizer,
  type PointerKind,
} from './recognizer';

/**
 * The nearest ancestor that actually scrolls vertically. TRD §8.4: "vertical
 * drags inside a scrollable region scroll it, and navigate only at a scroll
 * extent with continued motion in that direction." Asked once, at the press, so
 * a drag that begins mid-scroll stays a scroll for its whole life rather than
 * turning into navigation the moment it reaches the end.
 */
const scrollableAt = (x: number, y: number): HTMLElement | null => {
  let element = document.elementFromPoint(x, y) as HTMLElement | null;
  while (element) {
    const style = getComputedStyle(element);
    const scrolls = /auto|scroll|overlay/.test(style.overflowY);
    if (scrolls && element.scrollHeight > element.clientHeight + 1) return element;
    element = element.parentElement;
  }
  return null;
};

/** Which vertical directions the plane may take, given where the press landed. */
export const verticalRoom = (x: number, y: number): { up: boolean; down: boolean } => {
  const region = scrollableAt(x, y);
  if (!region) return { up: true, down: true };
  const atTop = region.scrollTop <= 0;
  const atBottom = region.scrollTop + region.clientHeight >= region.scrollHeight - 1;
  // Dragging down reveals what is above, so it needs the region to be at its top.
  return { up: atBottom, down: atTop };
};

export interface GestureHandlers {
  onNavigationStart?: (axis: Axis) => void;
  onNavigationMove?: (axis: Axis, delta: number) => void;
  onNavigationEnd?: (axis: Axis, delta: number, velocity: number) => void;
  onNavigationCancel?: (axis: Axis) => void;
  onSelectionStart?: () => void;
  onTap?: (x: number, y: number) => void;
}

const pointerKind = (event: PointerEvent): PointerKind =>
  event.pointerType === 'touch' || event.pointerType === 'pen'
    ? (event.pointerType as PointerKind)
    : 'mouse';

/**
 * A hold only resolves the shared gesture into selection when the press began
 * on something that can actually select or edit text. Guarded Done cards join
 * that set because their own matching hold mounts an editor under the pointer.
 * Everywhere else, holding is inert and a later drag may still navigate.
 */
export const startsTextInteraction = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  return (
    target.closest(
      [
        '[contenteditable="true"]',
        'textarea',
        'input:not([type])',
        'input[type="email"]',
        'input[type="number"]',
        'input[type="password"]',
        'input[type="search"]',
        'input[type="tel"]',
        'input[type="text"]',
        'input[type="url"]',
        '.card[data-guarded="true"]',
      ].join(', '),
    ) !== null
  );
};

export interface UseGesturesOptions {
  handlers: GestureHandlers;
  config?: Partial<GestureConfig>;
  /**
   * False where nothing lies in any navigable direction — at the wide
   * breakpoint the menu is already a visible panel. The pointer is then left
   * entirely alone rather than intercepted and handed back, which matters
   * because handing it back still costs a `preventDefault` on the way.
   */
  enabled?: boolean;
  /**
   * Whether a direction leads anywhere from the point the press landed on.
   * Combined with the scroll-extent rule above, which the hook applies itself
   * because it is a property of the DOM rather than of the app's state.
   */
  canNavigate?: (direction: Direction) => boolean;
}

export const useGestures = <T extends HTMLElement>({
  handlers,
  config,
  enabled = true,
  canNavigate,
}: UseGesturesOptions): RefCallback<T> => {
  /*
   * The gesture surface is absent while IndexedDB is opening. A one-shot effect
   * over an object ref runs too early in that case and never sees the real
   * shell. A callback ref makes the DOM node state, so binding follows the
   * element's actual mount/unmount lifetime.
   */
  const [element, setElement] = useState<T | null>(null);
  const ref = useCallback<RefCallback<T>>((node) => {
    setElement(node);
  }, []);
  const latest = useRef(handlers);
  latest.current = handlers;
  const isEnabled = useRef(enabled);
  isEnabled.current = enabled;
  const allows = useRef(canNavigate);
  allows.current = canNavigate;

  useEffect(() => {
    if (!element) return () => {};

    const recognizer = new GestureRecognizer(config);
    let timer: number | undefined;
    let activePointer: number | null = null;

    const clearTimer = (): void => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    /**
     * `user-select` is suppressed only from the moment a touch or pen lands,
     * and is *not* restored on release — switching it back mid-selection would
     * strand the selection the user just made. The next press resets it.
     *
     * It starts allowed and stays allowed for a mouse, so desktop keeps its
     * ordinary drag-to-select and `Ctrl-A` behaviour. The swipe-versus-select
     * trade is a phone trade (PRD §7.2); imposing it on a pointer that has
     * never needed it would only take something away.
     */
    const allowSelection = (allowed: boolean): void => {
      element.dataset['select'] = allowed ? 'on' : 'off';
    };
    allowSelection(true);

    const apply = (actions: GestureAction[], event: PointerEvent): void => {
      for (const action of actions) {
        switch (action.type) {
          case 'navigation-start':
            allowSelection(false);
            try {
              if (activePointer !== null) element.setPointerCapture(activePointer);
            } catch {
              // The pointer can have gone away between the move and here, and
              // capture is an optimisation — the listeners are on the element
              // either way.
            }
            latest.current.onNavigationStart?.(action.axis);
            break;
          case 'navigation-move':
            event.preventDefault();
            latest.current.onNavigationMove?.(action.axis, action.delta);
            break;
          case 'navigation-end':
            latest.current.onNavigationEnd?.(action.axis, action.delta, action.velocity);
            break;
          case 'selection-start':
            allowSelection(true);
            latest.current.onSelectionStart?.();
            break;
          case 'native':
            allowSelection(true);
            break;
          case 'tap':
            latest.current.onTap?.(action.x, action.y);
            break;
          case 'reset':
            try {
              if (activePointer !== null && element.hasPointerCapture(activePointer)) {
                element.releasePointerCapture(activePointer);
              }
            } catch {
              /* see navigation-start */
            }
            activePointer = null;
            clearTimer();
            break;
        }
      }
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (!isEnabled.current || !event.isPrimary || activePointer !== null) return;
      activePointer = event.pointerId;

      const pointer = pointerKind(event);
      allowSelection(pointer === 'mouse');

      const room = verticalRoom(event.clientX, event.clientY);
      recognizer.canNavigate = (direction) => {
        if (allows.current?.(direction) === false) return false;
        if (direction === 'up') return room.up;
        if (direction === 'down') return room.down;
        return true;
      };

      apply(
        recognizer.handle({
          kind: 'down',
          x: event.clientX,
          y: event.clientY,
          time: event.timeStamp,
          pointer,
        }),
        event,
      );

      if (recognizer.awaitingLongPress && startsTextInteraction(event.target)) {
        clearTimer();
        timer = window.setTimeout(() => {
          timer = undefined;
          apply(recognizer.handle({ kind: 'longpress', time: performance.now() }), event);
        }, config?.longPressMs ?? 400);
      }
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== activePointer) return;
      const before = recognizer.state;
      const actions = recognizer.handle({
        kind: 'move',
        x: event.clientX,
        y: event.clientY,
        time: event.timeStamp,
      });
      if (before === 'pending' && recognizer.state !== 'pending') clearTimer();
      apply(actions, event);
    };

    const onPointerUp = (event: PointerEvent): void => {
      if (event.pointerId !== activePointer) return;
      clearTimer();
      apply(
        recognizer.handle({
          kind: 'up',
          x: event.clientX,
          y: event.clientY,
          time: event.timeStamp,
        }),
        event,
      );
    };

    const onPointerCancel = (event: PointerEvent): void => {
      if (event.pointerId !== activePointer) return;
      clearTimer();
      const axis = recognizer.state === 'navigating' ? recognizer.lockedAxis : null;
      apply(recognizer.handle({ kind: 'cancel' }), event);
      if (axis) latest.current.onNavigationCancel?.(axis);
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerCancel);

    return () => {
      clearTimer();
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerCancel);
    };
    // `config` is read once for each actual DOM binding. Inline option objects
    // must not tear down an active pointer sequence on every React render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element]);

  return ref;
};
