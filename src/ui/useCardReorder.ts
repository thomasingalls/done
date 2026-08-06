/**
 * Pointer-driven reordering for one collection.
 *
 * Cards own activation because touch and mouse deliberately use different
 * affordances. The collection owns geometry because it is the only component
 * that knows the authoritative order. Nothing is written while the pointer is
 * moving: release produces one discrete CRDT operation and therefore one undo
 * step.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { cardId, reorderCard, type Card, type Ref, type Workspace } from '../crdt';

export interface ReorderRectangle {
  top: number;
  height: number;
}

/** The final insertion index after the dragged card has been removed. */
export const insertionIndexAt = (
  midpoint: number,
  rectangles: readonly ReorderRectangle[],
): number => {
  const before = rectangles.findIndex((rect) => midpoint < rect.top + rect.height / 2);
  return before < 0 ? rectangles.length : before;
};

export interface CardReorderDrag {
  id: string;
  from: number;
  to: number;
  offsetY: number;
  indicatorY: number;
}

interface ReorderSession {
  id: string;
  from: number;
  to: number;
  startY: number;
  lastY: number;
  initialScrollTop: number;
  list: HTMLDivElement;
  scroller: HTMLElement | null;
}

export interface UseCardReorderOptions {
  workspace: Workspace;
  ref: Ref;
  cards: readonly Card[];
  enabled: boolean;
}

export interface CardReorderController {
  listRef: RefObject<HTMLDivElement | null>;
  drag: CardReorderDrag | null;
  enabled: boolean;
  start: (id: string, clientY: number) => boolean;
  move: (clientY: number) => void;
  finish: (commit: boolean) => void;
  cancel: () => void;
  moveBy: (id: string, offset: number) => void;
}

const cardElements = (list: HTMLDivElement): HTMLElement[] =>
  Array.from(list.querySelectorAll<HTMLElement>('.card[data-card]'));

const elementFor = (list: HTMLDivElement, id: string): HTMLElement | undefined =>
  cardElements(list).find((element) => element.dataset['card'] === id);

export const useCardReorder = ({
  workspace,
  ref,
  cards,
  enabled,
}: UseCardReorderOptions): CardReorderController => {
  const listRef = useRef<HTMLDivElement>(null);
  const session = useRef<ReorderSession | null>(null);
  const autoScrollFrame = useRef<number | null>(null);
  const autoScrollDirection = useRef<-1 | 0 | 1>(0);
  const [drag, setDrag] = useState<CardReorderDrag | null>(null);

  const stopAutoScroll = useCallback((): void => {
    autoScrollDirection.current = 0;
    if (autoScrollFrame.current !== null) {
      cancelAnimationFrame(autoScrollFrame.current);
      autoScrollFrame.current = null;
    }
  }, []);

  const updateView = useCallback((clientY: number): void => {
    const active = session.current;
    if (!active) return;
    active.lastY = clientY;

    const remaining = cardElements(active.list).filter(
      (element) => element.dataset['card'] !== active.id,
    );
    const rectangles = remaining.map((element) => element.getBoundingClientRect());
    const to = insertionIndexAt(clientY, rectangles);
    active.to = to;

    const listRect = active.list.getBoundingClientRect();
    const gap = Number(getComputedStyle(active.list).rowGap) || 0;
    const target = rectangles[to];
    const indicatorY = target
      ? target.top - listRect.top - gap / 2
      : rectangles.length > 0
        ? (rectangles.at(-1)?.bottom ?? listRect.top) - listRect.top + gap / 2
        : 0;
    const scrollDelta =
      (active.scroller?.scrollTop ?? active.initialScrollTop) - active.initialScrollTop;

    setDrag((current) => {
      const next: CardReorderDrag = {
        id: active.id,
        from: active.from,
        to,
        offsetY: clientY - active.startY + scrollDelta,
        indicatorY,
      };
      return current &&
        current.id === next.id &&
        current.to === next.to &&
        current.offsetY === next.offsetY &&
        current.indicatorY === next.indicatorY
        ? current
        : next;
    });
  }, []);

  const startAutoScroll = useCallback((): void => {
    if (autoScrollFrame.current !== null) return;

    const tick = (): void => {
      autoScrollFrame.current = null;
      const active = session.current;
      const direction = autoScrollDirection.current;
      const scroller = active?.scroller;
      if (!active || !scroller || direction === 0) return;

      const before = scroller.scrollTop;
      scroller.scrollTop += direction * 10;
      if (scroller.scrollTop === before) {
        autoScrollDirection.current = 0;
        return;
      }

      updateView(active.lastY);
      autoScrollFrame.current = requestAnimationFrame(tick);
    };

    autoScrollFrame.current = requestAnimationFrame(tick);
  }, [updateView]);

  const start = useCallback(
    (id: string, clientY: number): boolean => {
      if (!enabled || session.current) return false;
      const list = listRef.current;
      const index = cards.findIndex((card) => cardId(card) === id);
      if (!list || index < 0) return false;

      const element = elementFor(list, id);
      if (!element) return false;
      const scroller = list.closest<HTMLElement>('[data-scroll="day"]');
      session.current = {
        id,
        from: index,
        to: index,
        startY: clientY,
        lastY: clientY,
        initialScrollTop: scroller?.scrollTop ?? 0,
        list,
        scroller,
      };
      updateView(clientY);
      return true;
    },
    [cards, enabled, updateView],
  );

  const move = useCallback(
    (clientY: number): void => {
      const active = session.current;
      if (!active) return;
      updateView(clientY);

      const scroller = active.scroller;
      if (!scroller) {
        stopAutoScroll();
        return;
      }

      const rect = scroller.getBoundingClientRect();
      const edge = Math.min(56, rect.height / 4);
      const maximum = scroller.scrollHeight - scroller.clientHeight;
      const direction: -1 | 0 | 1 =
        clientY < rect.top + edge && scroller.scrollTop > 0
          ? -1
          : clientY > rect.bottom - edge && scroller.scrollTop < maximum - 1
            ? 1
            : 0;

      if (direction === 0) {
        stopAutoScroll();
        return;
      }
      autoScrollDirection.current = direction;
      startAutoScroll();
    },
    [startAutoScroll, stopAutoScroll, updateView],
  );

  const cancel = useCallback((): void => {
    stopAutoScroll();
    session.current = null;
    setDrag(null);
  }, [stopAutoScroll]);

  const finish = useCallback(
    (commit: boolean): void => {
      const completed = session.current;
      stopAutoScroll();
      session.current = null;
      setDrag(null);
      if (commit && completed && completed.to !== completed.from) {
        reorderCard(workspace, ref, completed.id, completed.to);
      }
    },
    [ref, stopAutoScroll, workspace],
  );

  const moveBy = useCallback(
    (id: string, offset: number): void => {
      if (!enabled || offset === 0) return;
      const from = cards.findIndex((card) => cardId(card) === id);
      const to = Math.min(Math.max(from + offset, 0), cards.length - 1);
      if (from < 0 || from === to) return;
      reorderCard(workspace, ref, id, to);
    },
    [cards, enabled, ref, workspace],
  );

  useEffect(() => {
    if (!enabled && session.current) cancel();
  }, [cancel, enabled]);

  useEffect(
    () => () => {
      stopAutoScroll();
      session.current = null;
    },
    [stopAutoScroll],
  );

  return { listRef, drag, enabled, start, move, finish, cancel, moveBy };
};
