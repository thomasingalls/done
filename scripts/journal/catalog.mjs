export const cases = [
  [
    'C01.synchronous-crash',
    'Append is synchronous and survives actual renderer death before flush',
  ],
  [
    'C01.remote-basis',
    'Content-carried remote dependency plus journalled local edit recover offline',
  ],
  ['C03.refusals', 'Oversize, quota and unavailable append cannot return saved receipts'],
  ['C03.watermark', 'Pressure counts UTF-16 key/value characters and rescans after cleanup'],
  ['C03.actual-quota', 'Real localStorage quota refusal preserves acknowledged entries'],
  [
    'C09.unreadable',
    'Bad tag/version/generation/moved-key entries refuse whole recovery and flush',
  ],
  ['C09.enumeration-change', 'A disappearing captured entry refuses a partial journal snapshot'],
  ['C11.abort-flush', 'Failed content transaction retains every journal entry'],
  [
    'C11.crash-before-cleanup',
    'Crash after content completion before journal deletion replays duplicates safely',
  ],
  ['C11.changed-entry', 'Changed exact entry bytes survive cleanup after content completion'],
  ['C11.cleanup-refused', 'Failed cleanup retains WAL despite a successful content receipt'],
  [
    'C01.handoff-race',
    'Journal-first recovery survives another tab flushing between carrier reads',
  ],
  [
    'C04.close-and-keys',
    'Close drains a pending flush, excludes transition and clears WASM memory',
  ],
  [
    'C04.frozen-writer',
    'Frozen journal writer retains its permit and late append remains recoverable',
  ],
  [
    'C04.concurrent-writers',
    'Independent writers append during a flush without losing the late suffix',
  ],
  [
    'C11.chunked-flush',
    'A captured set larger than one content batch clears only completed chunks',
  ],
  ['C03.host-smoke', 'Full append path measured on this host without a supported-population claim'],
].map(([id, title]) => ({ id, title }));
export const mutants = [
  {
    id: 'skip-storage-append',
    file: 'journalStore.ts',
    case: 'C01.synchronous-crash',
    assertion: 'receipt-already-has-carrier',
    from: 's.setItem(storageKey, value);',
    to: 'void value;',
  },
  {
    id: 'acknowledge-refusal',
    file: 'journalStore.ts',
    case: 'C03.refusals',
    assertion: 'unavailable-does-not-acknowledge',
    from: "        return {\n          status: 'refused',\n          reason:\n            cause instanceof DOMException && cause.name === 'QuotaExceededError'\n              ? 'quota'\n              : 'unavailable',\n        };",
    to: "        return Object.freeze({status:'journalled',key:storageKey,generation});",
  },
  {
    id: 'remove-changed-entry',
    file: 'journalStore.ts',
    case: 'C11.changed-entry',
    assertion: 'changed-entry-retained',
    from: 'if (current !== entry.value) {',
    to: 'if (false) {',
  },
  {
    id: 'cleanup-before-commit',
    file: 'journalStore.ts',
    case: 'C11.abort-flush',
    assertion: 'aborted-flush-retains-journal',
    from: 'const batch = entries.slice(offset, offset + 256);',
    to: 'const batch = entries.slice(offset, offset + 256); for (const entry of batch) storage().removeItem(entry.key);',
  },
  {
    id: 'reread-journal-after-content',
    file: 'custody.ts',
    case: 'C01.handoff-race',
    assertion: 'handoff-cannot-fall-between-reads',
    from: 'records = await owner.carrier.load(task);',
    to: 'records = await owner.carrier.load(task); eraseJournalSnapshot(snapshot); snapshot = owner.journal.snapshot();',
  },
  {
    id: 'skip-wasm-disposal',
    file: 'journalCodec.ts',
    case: 'C04.close-and-keys',
    assertion: 'close-erases-wasm-instance',
    from: 'wasm.dispose();',
    to: 'void wasm;',
  },
];
