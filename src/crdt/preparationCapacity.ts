/** A bounded auxiliary preparation refusal, never an integrity or storage failure. */
export class PreparationCapacity extends Error {
  override readonly name = 'PreparationCapacity';
  /** Which bound refused, with sizes in bytes where known (phase 543). Presentation only. */
  readonly detail:
    | {
        readonly cause: 'resume-progress' | 'resume-index' | 'resume-history';
        readonly needed?: number;
        readonly allowed?: number;
      }
    | undefined;
  constructor(detail?: PreparationCapacity['detail']) {
    super('Preparation receipt budget exceeded');
    this.detail = detail && Object.freeze({ ...detail });
  }
}
