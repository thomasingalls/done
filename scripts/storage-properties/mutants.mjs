import { mutants as trim } from '../content-trim/catalog.mjs';
export const mutants = [
  ...trim.filter((m) =>
    [
      'range-delete',
      'partial-disk-union',
      'merge-incomplete-content',
      'early-delete-receipt',
    ].includes(m.id),
  ),
  {
    id: 'clear-journal-before-commit',
    file: 'journalStore.ts',
    from: '        contentReceipts.push(',
    to: '        for (const e of batch) { try { storage().removeItem(e.key); } catch {} }\n        contentReceipts.push(',
  },
];
