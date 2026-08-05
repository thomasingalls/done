/**
 * Binds the recognizer to Pointer Events (TRD §8.4).
 *
 * The only file that knows about the DOM side of gestures. It never calls
 * `preventDefault` on `pointerdown` — CodeMirror places the cursor from the
 * compatibility mouse events that follow, and suppressing those breaks tapping
 * into text. During navigation the pointer is captured instead, which stops
 * those events at the source, which is the behaviour that was wanted anyway.
 */

import { useEffect, useRef, type RefObject } from 'react';
import {
  type Axis,
  type GestureAction,
  type GestureConfig,
  GestureRecognizer,
  type PointerKind,
} from './recognizer';

export interface GestureHandlers {
  onNavigationStart?: (axis: Axis) => void;
  onNavigationMove?: (axis: Axis, delta: number) => void;
  onNavigationEnd?: (axis: Axis, delta: number, velocity: number) => void;
  onSelectionStart?: () => void;
  onTap?: (x: number, y: number) => void;
}

const pointerKind = (event: PointerEvent): PointerKind =>
  event.pointerType === 'touch' || event.pointerType === 'pen'
    ? (event.pointerType as PointerKind)
    : 'mouse';

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
}

export const useGestures = <T extends HTMLElement>({
  handlers,
  config,
  enabled = true,
}: UseGesturesOptions): RefObject<T | null> => {
  const ref = useRef<T>(null);
  const latest = useRef(handlers);
  latest.current = handlers;
  const isEnabled = useRef(enabled);
  isEnabled.current = enabled;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

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

      if (recognizer.awaitingLongPress) {
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
      apply(recognizer.handle({ kind: 'cancel' }), event);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config is read once per binding
  }, []);

  return ref;
};
