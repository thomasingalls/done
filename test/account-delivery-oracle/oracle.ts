/** Test-only constraint interpretation. No imports from the production reducer or verifier. */
export interface ProofEvent {
  kind: 'accepted' | 'refused' | 'conflict';
  position: number;
  final: boolean;
  id: string;
}
export function reference(events: readonly ProofEvent[]) {
  const positions = [...new Set(events.map((e) => e.position))];
  const outcomes = [
    'accepted',
    'unaccepted',
    ...new Set(events.filter((e) => e.kind === 'refused').map((e) => 'refused:' + e.id)),
  ];
  const domains = positions.map((position) => ({
    position,
    possible: outcomes.filter((outcome) =>
      events.every((e) => {
        if (e.kind === 'conflict') return false;
        if (e.kind === 'refused') return position !== e.position || outcome === 'refused:' + e.id;
        if (position <= e.position) return outcome === 'accepted';
        return !e.final || outcome !== 'accepted';
      }),
    ),
  }));
  const conflict = domains.some((d) => !d.possible.length);
  const acceptances = events.filter((e) => e.kind === 'accepted');
  const closures = events.filter((e) => e.kind === 'refused');
  const refusals: [number, string][] = closures
    .filter((e, i) => closures.findIndex((other) => other.position === e.position) === i)
    .map((e) => [e.position, e.id]);
  const finalThrough = acceptances.find((e) => e.final)?.position ?? null;
  return {
    acceptedThrough: Math.max(0, ...acceptances.map((e) => e.position)),
    finalThrough,
    refusals,
    conflict,
    publication: conflict
      ? 'conflict'
      : refusals.length
        ? 'closed'
        : finalThrough !== null
          ? 'finalized'
          : 'ready',
  };
}
export interface FoldState {
  acceptedThrough: number;
  finalThrough: number | null;
  refusals: Map<number, string>;
  conflict: boolean;
  submissions: Map<number, Uint8Array>;
  responses: Map<number, Uint8Array[]>;
}
export const observed = (s: FoldState, publication: string) => ({
  acceptedThrough: s.acceptedThrough,
  finalThrough: s.finalThrough,
  refusals: [...s.refusals],
  conflict: s.conflict,
  publication,
  submissions: [...s.submissions].map(([n, b]) => [n, [...b]]),
  responses: [...s.responses].map(([n, bs]) => [n, bs.map((b) => [...b])]),
});
export const expected = (
  events: readonly ProofEvent[],
  retained = { submissions: [], responses: [] } as Pick<
    ReturnType<typeof observed>,
    'submissions' | 'responses'
  >,
) => ({ ...reference(events), ...structuredClone(retained) });
