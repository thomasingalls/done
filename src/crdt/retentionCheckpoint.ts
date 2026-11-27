import { decodeHistoryInstall } from './historyInstall';
import { RetiredHistoryRequired, type RetiredCut } from './retainedHistory';
import { captureError } from './sourceCapture';
import type { LocalBaseline } from './localBaselineRecord';
import type { HistoryHead } from '../../account-protocol/historyCheckpoint';

/** Locally authenticated retained evidence only. Never learn an old expected link from a reply.
 * A cut below a retained frontier with no pin needs `verified`: the accepted chain from that exact
 * cut read up to that exact frontier. Returns every retired cut so authenticated, by publisher. */
export function checkRetainedCheckpointCuts(
  b: LocalBaseline,
  heads: readonly HistoryHead[],
  installed?: ReadonlyMap<string, { position: number; link: string }>,
  verified?: ReadonlyMap<string, RetiredCut>,
) {
  const cuts = b.history ? decodeHistoryInstall(b.history.bytes).checkpoint.heads : [];
  const known = new Map<string, { position: number; link: string }>(),
    needs: RetiredCut[] = [];
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
    if (pin) {
      if (pin.link !== cut.link) captureError('History cut differs from retained evidence');
    } else {
      const v = verified?.get(cut.credentialId);
      const need = {
        credentialId: cut.credentialId,
        cut: { position: cut.position, link: cut.link },
        through: { position: s.position, link: s.link },
      };
      if (
        v?.cut.position !== need.cut.position ||
        v.cut.link !== need.cut.link ||
        v.through.position !== need.through.position ||
        v.through.link !== need.through.link
      ) {
        needs.push(need);
        continue;
      }
    }
    known.set(cut.credentialId, { position: cut.position, link: cut.link });
  }
  if (needs.length) throw new RetiredHistoryRequired(needs);
  return known;
}
