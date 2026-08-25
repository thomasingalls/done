---
schema: 1
kind: finding
id: f-4259822-recovery-replacement-payload-bytes-unbound
status: candidate
type: implementation-hazard
severity: medium
confidence: high
introduced_by: 4259822828060fe2b9592fa525cd9a17170af285
work_item: X-04
created_by: /root
updated: 2026-08-25
challenged_by: none
superseded_by: none
---

# The published replacement intent does not bind the replacement envelope or generation-wrap bytes

## Affected requirement or guarantee

Recovery replacement must atomically install one matching set: new `R_pub`, every required generation wrap, and
the code-sealed new `R_priv` envelope. A verified winning outcome is supposed to mean that exact client-produced set
won, not merely that a replacement counter advanced.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md` §7.6 requires atomic replacement of the public key,
wraps, and sealed envelope (`OC-034`). The same SHA's TRD row 15 leaves interrupted behavior open.

## End-state source

`4259822828060fe2b9592fa525cd9a17170af285:scripts/generate-transition-vectors.mjs`, unchanged at the pinned tip,
computes the exact `replace-recovery` payload digest from only two strings:
`new-recovery-public-key` and `rewrapped-generations = 1|2|3|4|5`. It does not include the new recovery-envelope
bytes, any per-generation wrap bytes or their digests, or a complete serialized replacement-set digest. The row-15
record says only “the kind's own parts”; the generated vector publishes no `payload_parts` for replacement.

## First introduction and propagation

`4259822828060fe2b9592fa525cd9a17170af285` selects the generic signed `payload_digest` and closes the atomic-
replace half of row 14 with the incomplete concrete replacement example. `ff0b48f8ce7f1878ac6abb9c849380800b55370c`
binds the WebAuthn step-up to that intent id, which transitively inherits rather than repairs its payload coverage.
The exact omission survives in tip prose, generator, vector, and row-20 closure.

## Reachable consequence

An honest service can receive a correctly signed replacement intent/assertion alongside a mismatched, replayed, or
corrupted sealed envelope or generation wrap. Changing those bytes while retaining the new public key and generation
names leaves the signed intent id unchanged under the published construction. The service can commit the set and
return a valid signed winning outcome, after which the old recovery set is no longer live. The newly confirmed code
then fails during later total-device-loss recovery, or one generation cannot be opened. A surviving content-holding
device can repair the state by replacing again; after total device loss the availability failure is permanent.

## Supporting evidence

The rotate example binds its cutoff, excluded set, recovery-wrap bytes, and reader-wrap map in `payload_parts`.
The replacement example instead binds only the public key and a list of generation numbers, showing the omission is
specific rather than an inherent limitation of the generic digest. The exact-tip transition and recovery generators
pass `--check`; neither mutates a replacement envelope or wrap while holding the signed intent fixed.

## Counterevidence and disconfirmation attempt

The abstract phrase “the kind's own parts” could be implemented to mean the complete canonical replacement set,
which would close the path. That benign reading is not defined by a field registry, canonical serialization, or
vector, while the executable example that row 20 treats as closure selects fewer fields. This finding concerns that
missing exact payload definition, not the generic digest construction.

## Validation procedure

1. Build the published replacement intent and its step-up assertion.
2. Keep `R_pub` and the generation-id list fixed while changing one sealed-envelope byte, then one wrap byte for
   each generation.
3. Submit the modified set with the unchanged signed intent.
4. Require service verification to reject every modification before committing an outcome.
5. Define one canonical complete payload and add field/byte-isolating negatives so eliding any envelope or wrap
   rescues exactly one failure.

## Disposition

Reopen the replacement payload definition. Bind the exact envelope and every exact wrap (or a canonical digest of
the complete set) inside the signed intent and step-up id before treating atomic replacement as selected.
