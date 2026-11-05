/** Real accepted streams and a newly signed rotation cut; no authority/test seam. */
import { Y, genesisCoverage, genesisCoverageParts } from '../../src/crdt/yjs';
import { createContentCheckpoint } from '../../src/crdt/contentCheckpoint';
import { contentCheckpointHash } from '../../account-protocol/contentCheckpoint';
import { verifyMembershipChain } from '../../account-protocol/membershipLocator';
import { historyMembership } from '../../account-protocol/admissionHistory';
import { verifyMembershipRotation, membershipState } from '../../account-protocol/membership';
import { referenceBytes } from './fixtures';
// @ts-expect-error Independent genuine source oracle, with one supplied client brand.
import { sourceFixture } from '../account-membership/replacement-source-fixture.mjs';
// @ts-expect-error Independent Node signature/hash oracle.
import { signed, hash } from '../account-membership/fixtures.mjs';
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const json = (v: unknown) => new Uint8Array(Buffer.from(JSON.stringify(v)));
const clientRoot = {
  Y,
  genesisCoverage,
  genesisCoverageParts,
  createContentCheckpoint,
  verifyMembershipChain,
  historyMembership,
};
export async function replacementPageFixture(cutAt = 8, client = clientRoot) {
  const f = await sourceFixture({ client });
  const docs: InstanceType<typeof Y.Doc>[] = [];
  try {
    const streams = f.entries.map((original: (typeof f.entries)[number], owner: number) => {
      const doc = new client.Y.Doc({ gc: false });
      docs.push(doc);
      doc.clientID = 5001 + owner;
      client.Y.applyUpdate(doc, client.Y.encodeStateAsUpdate(f.root));
      let previous = '00'.repeat(32);
      const entries = Array.from({ length: 8 }, (_, index) => {
        const vector = client.Y.encodeStateVector(doc);
        doc.getText('master').insert(doc.getText('master').length, `${owner}:${index + 1}\n`);
        const update = new Uint8Array(client.Y.encodeStateAsUpdate(doc, vector));
        const e = f.entry(
          original.publisher,
          owner === 0 ? f.x.f.keys.existing : f.x.f.keys.new,
          update,
          70 + owner * 10 + index,
          { position: index + 1, previous },
        );
        previous = e.link;
        return { ...e, update };
      });
      return { publisher: original.publisher, entries, doc };
    });
    const cutoff = streams
      .map((s: (typeof streams)[number]) => ({
        credentialId: s.publisher,
        position: cutAt,
        link: s.entries[cutAt - 1]!.link,
      }))
      .sort((a: { credentialId: string }, b: { credentialId: string }) =>
        a.credentialId.localeCompare(b.credentialId),
      );
    const x = f.x,
      rotation = x.rotate(
        x.request({ preparation: x.prep({ cutoff }), payload: { ...x.payload, cutoff } }),
      );
    const rotated = await verifyMembershipRotation(rotation, x.parent);
    const admission = x.f.admit(membershipState(rotated));
    const proofs = { ...x.proofs, continuations: [...x.proofs.continuations, rotation, admission] };
    const { history } = await client.verifyMembershipChain(proofs, f.input.authority.base);
    const parent = client.historyMembership(history);
    const input = {
      ...f.input,
      inboundReceiptVersion: 1 as const,
      history,
      candidate: admission.epoch.preparation.context.candidate.credentialId,
    };
    const baseline = await contentCheckpointHash(f.input.checkpoint);
    const packet = (s: (typeof streams)[number], selected = s.entries) => {
      const first = selected[0]!,
        last = selected.at(-1)!;
      const r = [
        'done/private-read/v2',
        2,
        f.input.authority.base.pin.serviceId,
        f.input.authority.base.pin.origin,
        history.current.workspace,
        input.producer,
        s.publisher,
        history.current.lineage,
        history.current.head,
        history.current.tip,
        first.position - 1,
        selected.length,
        '45'.repeat(32),
        30000,
      ];
      const request = json([...r, signed(f.x.f.keys.existing, json(r))]);
      const p = [
        'done/private-read-page/v2',
        2,
        hash(request),
        8,
        last.position,
        selected.map((e: typeof first) => [hex(e.envelope), hex(e.proof)]),
      ];
      return { request, page: json([...p, signed(f.x.f.f.keys.acceptance, json(p))]) };
    };
    const raws = streams.map((s: (typeof streams)[number]) => {
      const wire = packet(s);
      return referenceBytes({
        baseline,
        lineage: history.current.lineage,
        head: history.current.head,
        reader: input.producer,
        publisher: s.publisher,
        firstPosition: 1,
        previous: '00'.repeat(32),
        lastLink: s.entries[cutAt - 1]!.link,
        firstEntry: 0,
        entryCount: cutAt,
        ...wire,
      });
    });
    return {
      f,
      input,
      parent,
      streams,
      raws,
      packet,
      cutAt,
      cleanup() {
        for (const d of docs) d.destroy();
        f.cleanup();
      },
    };
  } catch (cause) {
    for (const d of docs) d.destroy();
    f.cleanup();
    throw cause;
  }
}
