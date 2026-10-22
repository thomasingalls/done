/** Authenticate a single custody snapshot, including ordinary-use interlocks. */
import { parseLocalClaim, localClaimKey, slotCustodyRows } from './localGenesisRecord';
import { parseLocalClear, localClearKey } from './localClearState';
import { importClaimKey } from './legacyImportState';
import { stopStartup } from './startupState';

export type AccountAuthorityRows = NonNullable<Awaited<ReturnType<typeof slotCustodyRows>>>;
export const authorityClaim = (rows: AccountAuthorityRows, slotId: string) => {
  const find = (key: string[]) => rows.find((row) => indexedDB.cmp(row.key, key) === 0);
  const clearing = find(localClearKey(slotId));
  if (clearing) {
    const record = parseLocalClear(clearing.value, slotId);
    stopStartup(
      record.stage === 'cleared' ? 'cleared' : 'clearing',
      'local-clear-blocks-normal-use',
    );
  }
  if (find(importClaimKey(slotId)))
    stopStartup('migration-required', 'pre-active-import-needs-owner');
  const claim = find(localClaimKey(slotId));
  return claim ? parseLocalClaim(claim.value, slotId) : null;
};
