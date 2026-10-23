import { decodeHistoryInstall } from './historyInstall';
import { RetiredHistoryRequired } from './retainedHistory';
import { captureError } from './sourceCapture';
import type { LocalBaseline } from './localBaselineRecord';
import type { HistoryHead } from '../../account-protocol/historyCheckpoint';

/** Locally authenticated retained evidence only. Never learn an old expected link from a reply. */
export function checkRetainedCheckpointCuts(
  b: LocalBaseline,
  heads: readonly HistoryHead[],
  installed?: ReadonlyMap<string, { position: number; link: string }>,
) {
  const cuts = b.history ? decodeHistoryInstall(b.history.bytes).checkpoint.heads : [];
  for (const cut of heads) {
    if (cut.position === 0) {
      if (cut.link !== '0'.repeat(64)) captureError('History zero cut differs');
      continue;
    }
    const s = b.streams.find((s) => s.publisher === cut.credentialId);
    if (!s || cut.position > s.position) continue; // Normal suffix / checkpoint checks still required.
    const pin =
      cut.position === s.position
        ? s
        : s.startingPoint?.position === cut.position
          ? s.startingPoint
          : installed?.get(cut.credentialId)?.position === cut.position
            ? installed.get(cut.credentialId)
            : cuts.find((h) => h.credentialId === cut.credentialId && h.position === cut.position);
    if (!pin) throw new RetiredHistoryRequired();
    if (pin.link !== cut.link) captureError('History cut differs from retained evidence');
  }
}
