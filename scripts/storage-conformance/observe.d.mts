import type { Page } from '@playwright/test';
export function waitForState<A, R>(
  page: Page,
  predicate: (arg: A) => R | Promise<R>,
  arg: A,
  timeoutMs: number,
): Promise<Awaited<R>>;
