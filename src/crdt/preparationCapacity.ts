/** A bounded auxiliary preparation refusal, never an integrity or storage failure. */
export class PreparationCapacity extends Error {
  override readonly name = 'PreparationCapacity';
  constructor() {
    super('Preparation receipt budget exceeded');
  }
}
