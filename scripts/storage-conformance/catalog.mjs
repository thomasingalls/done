export const candidates = [
  {
    id: 'codex',
    branch: 'codex/L1-items-3-to-6',
    revision: 'd306b49e9c3246c8512725e4696f9981c62f6549',
  },
  {
    id: 'contract',
    branch: 'claude/l1-contract-pass',
    revision: '6330412897dcac665741e1a928b497e5f2dd7266',
  },
  {
    id: 'encrypted',
    branch: 'claude/l1-encrypted-store',
    revision: 'a3ab893880262027e94c41a7a50690cf42538862',
  },
];
// Subcases do not discharge the larger Cxx obligation. Missing production APIs
// remain explicit rows, and the command cannot turn a subset into conformance.
export const cases = [
  ['C01.receive-order', 'C01', 'Receive must commit before editor promotion'],
  [
    'C01.offline-replay',
    'C01',
    'Dependent local input recovers without redelivery after renderer crash',
  ],
  [
    'C01.large-remote-offline',
    'C01',
    'Remote update beyond the journal ceiling followed by dependent input and crash',
  ],
  ['C02.delete-order', 'C02', 'Deletion-only receive must commit before promotion'],
  [
    'C03.pending-input',
    'C03',
    'First refusal and later input stay out of editor/export/undo/transport',
  ],
  ['C04.writer-lifetime', 'C04', 'Write-key holder retains a shared permit while frozen'],
  ['C07.late-reservation', 'C07', 'Late sequence survives between state commit and trim deletion'],
  ['C08.other-writer', 'C08', 'Trim recovers the union of independently committed writers'],
  ['C09.corrupt-open', 'C09', 'Corrupt content refuses normal open and preserves carriers'],
  ['C09.version-open', 'C09', 'Unsupported content refuses normal open and preserves carriers'],
  ['C09.corrupt-trim', 'C09', 'Unreadable input refuses the entire trim'],
  ['C09.changed-trim-input', 'C09', 'Trim refuses deletion if an observed record changed'],
  ['C09.corrupt-journal', 'C09', 'Unreadable journal refuses normal open after crash'],
  ['C10.partial-metadata', 'C10', 'Missing metadata beside ciphertext refuses without reminting'],
  ['C11.clear-refusal', 'C11', 'Content deletion refusal preserves journal and content'],
  ['C11.clear-success', 'C11', 'Completed destructive clear removes the target journal'],
  ['C12.factor-genesis', 'C12', 'Persistent genesis cannot acknowledge without a confirmed factor'],
  ['C13.copied-profile', 'C13', 'A full copied browser profile cannot reopen without a factor'],
  ['C16.legacy-routing', 'C16', 'Default startup preserves the selected legacy installation'],
].map(([id, requirement, title]) => ({ id, requirement, title }));
export const pending = [
  [
    'C01',
    'Encrypted wire admission and accepted-head ordering require the future integrated transport.',
  ],
  [
    'C02',
    'Unresolved structs and pending delete-set compositions beyond the executed deletion case.',
  ],
  [
    'C03',
    'Native IME composition, paste slicing and every undo/export action under interrupted admission.',
  ],
  [
    'C04',
    'No candidate exposes an integrated exclusive retirement worker or supported-version cutover.',
  ],
  [
    'C05',
    'No candidate exposes the integrated generation/custody actor with interruption/resume phases.',
  ],
  ['C06', 'No integrated all-reference census/checkpoint/package/fallback retirement path exists.'],
  ['C07', 'Repeated concurrent trims and the complete writer/transition composition.'],
  [
    'C09',
    'Typed repair UI, unrelated-store isolation and the complete malformed carrier inventory.',
  ],
  ['C10', 'Every genesis phase, two competing creators/factors and verified Account binding.'],
  [
    'C11',
    'Complete ClearIntent/resume, journal-deletion failure, terminal marker and shared-key isolation.',
  ],
  [
    'C12',
    'No candidate has mandatory factor genesis/unlock; valid-code and wrong-code controls are unavailable.',
  ],
  [
    'C13',
    'Supported browser/authenticator population, future receivers and valid-factor positive controls are absent.',
  ],
  ['C14', 'No integrated legacy receiver replacement/certified generation activation path exists.'],
  [
    'C15',
    'No selected writable import or per-root custody-seal reservation implementation exists.',
  ],
  ['C16', 'The full application initialization/repair/import interruption matrix remains owed.'],
].map(([requirement, reason]) => ({
  id: `${requirement}.remaining`,
  requirement,
  title: 'Remaining production obligation',
  reason,
}));
export const mutants = [
  {
    id: 'trim-own-document',
    candidate: 'contract',
    case: 'C08.other-writer',
    assertion: 'replay-union',
    path: 'src/crdt/contentStore.ts',
    from: "await writeRecords([Y.mergeUpdates(updates)], 'state');",
    to: "await writeRecords([Y.encodeStateAsUpdate(doc)], 'state');",
  },
  {
    id: 'trim-by-range',
    candidate: 'contract',
    case: 'C07.late-reservation',
    assertion: 'late-record-survives',
    path: 'src/crdt/contentStore.ts',
    from: 'for (const record of covered) content.delete(record.seq);',
    to: 'content.delete(IDBKeyRange.upperBound(Math.max(...covered.map(record => record.seq))));',
  },
  {
    id: 'trim-skips-unreadable',
    candidate: 'contract',
    case: 'C09.corrupt-trim',
    assertion: 'whole-trim-preserves-input',
    path: 'src/crdt/contentStore.ts',
    from: 'if (!opened.opened) throw new Error(`A content record will not open: ${opened.refusal}.`);',
    to: 'if (!opened.opened) continue;',
  },
];
