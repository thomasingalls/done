import test from 'node:test';
import assert from 'node:assert/strict';
import { load, f, promotions, carriers, l, json, decode, report } from './helpers.mjs';
import { fixture, encode, submissionWireParts } from '../account-transport-contract/oracle.mjs';
const real = await load();
for (const family of ['promotion', 'admission', 'source', 'spool', 'delivery', 'submission'])
  test(family + ' omission control rescues its rejected malformed input', async () => {
    const faulty = await load(family);
    let run;
    if (family === 'promotion') {
      const input = structuredClone(promotions[1]);
      input.stage = [input.stage];
      run = (h) => h.parsePromotion(input);
    } else if (family === 'admission') {
      run = (h) => h.parseAdmissionRequest({ ...f.admission.request, v: 2 });
    } else if (family === 'submission') {
      const wire = encode(submissionWireParts(fixture().submissions[0]));
      const input = new Uint8Array([...wire, 0]);
      run = (h) => h.decodeSubmission(input);
    } else {
      const d = carriers.find(
        (d) => d.family === family && (family !== 'spool' || d.input.type === 'position'),
      );
      const v = structuredClone(d.values);
      if (family === 'source') v[3] = 'ff'.repeat(16);
      else if (family === 'spool') v[9][2] = [v[9][2]];
      else v[10] = 0;
      run = (h) => decode(h, d, json(v));
    }
    assert.throws(() => run(real));
    const rescued = run(faulty);
    assert.ok(rescued);
    if (family === 'promotion') assert.deepEqual(rescued.stage, ['prepared']);
    if (family === 'spool') assert.ok(Array.isArray(rescued.source.hash));
    if (family === 'source') assert.notEqual(rescued.workspace, l.route.workspace);
    if (family === 'delivery') assert.equal(rescued.position, 0);
    report('control-' + family, {
      real: 'refused',
      omitted: 'accepted',
      scope:
        family === 'submission'
          ? 'both complete-consumption and re-encoding guards removed'
          : 'single guard removed',
    });
  });

for (const field of ['credentials', 'actors', 'wraps', 'promotionId', 'requestDigest', 'epochHead'])
  test(field + ' strictness repair has an effective omission control', async () => {
    const faulty = await load(field),
      input = structuredClone(promotions[12]);
    if (field === 'credentials') delete input.credentials[1];
    else if (field === 'actors') delete input.genesis.actors[1];
    else if (field === 'wraps') delete input.genesis.wraps[1];
    else input.handoff.destination.account[field] = [input.handoff.destination.account[field]];
    assert.throws(() => real.parsePromotion(input));
    const accepted = faulty.parsePromotion(input);
    assert.ok(accepted);
    report('control-' + field, { real: 'refused', omitted: 'accepted', malformed: field });
  });
