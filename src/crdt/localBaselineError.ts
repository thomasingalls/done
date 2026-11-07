/** Closed refusal codes only; diagnostic consumers must never copy the message or data. */
export class LocalBaselineError extends Error {
  override readonly name = 'LocalBaselineError';
  constructor(readonly reason: 'scope' | 'integrity' | 'ineligible' | 'history-required') {
    super('Local baseline refused: ' + reason);
  }
}
