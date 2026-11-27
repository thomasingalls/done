/** One action's size refusal, shared by the workspace adapter and the UI. No imports, so the UI
 * can name it without loading the workspace. */

/** Business result of an action whose single change would exceed the admission update limit and
 * that cannot be split. The action is not applied; the queue and sync continue. */
export const TOO_LARGE_FOR_ONE_ACTION = 'too-large-for-one-action';
export const TOO_LARGE_FOR_ONE_ACTION_MESSAGE =
  'That text is too long for one action. Split it into smaller cards, or paste it into a card in parts.';
/** Thrown before admission when one action's input could never be queued; its message is the
 * sentence the person sees. Nothing is queued and nothing changes. */
export class ActionTooLarge extends Error {
  override readonly name = 'ActionTooLarge';
  constructor() {
    super(TOO_LARGE_FOR_ONE_ACTION_MESSAGE);
  }
}
/** Longest text one compose or paste may carry, in UTF-16 units (the existing paste bound). */
export const MAX_ACTION_TEXT_UNITS = 1024 * 1024;
