# Client admission history — chunk C1

2026-09-16, after signed service owner `7bf78813`. Read-only protocol foundation for client replay;
no browser installation, content coverage or current-head persistence is claimed. Release validation
remains paused. The fixed oracle signs opaque synthetic envelope bodies, not decryptable Yjs writing.

```
node --test --test-timeout=30000 test/account-successor/history.test.mjs test/account-successor/history-controls.test.mjs test/account-successor/protocol.test.mjs test/account-successor/controls.test.mjs test/account-first-authority/formats.test.mjs test/account-first-authority/registry.test.mjs
```

**39 passed:** 11 new history cases/controls, ten successor protocol/controls, six first-authority
formats and 12 registry cases. Typecheck, scoped oxlint/oxfmt and reviewed runtime census also pass
(175 sources, 96 labels/templates, 24 groups, 14 manual entrypoints). No existing vectors changed.

New cases cover detached immutable verified contexts, exact head/key/credential binding, unchanged
old envelope bytes, historical acceptance versus post-admission acceptance, old permanent refusals,
zero/nonzero prefix, omissions/order/duplicates/wrong signed prefix, caller mutation and concurrent
verification invalidation. Eighty shrinking cases (seed 16091603) compare prefix and issuance epochs
with an independently encoded model. Existing sibling/rollback verification remains required.

Two copied-production omission controls retain real signature checks. Removing the issuance-boundary
check accepts a valid old-epoch signature beyond the parent's accepted boundary. Removing the final
prefix-link check permits a different device-signed prefix of the same length. Each ordinary verifier
rejects its corresponding case; the mutant's forbidden output is explicitly checked.

`inputs.json` pins exercised files. The prefix verifier retains only one bounded envelope plus running
position/link; it verifies signature, digest and route but does not decrypt, prove source coverage or
install a head. Native lifecycle installation, late replies, cold recovery and private HTTP integration
remain chunks C2/D; new construction qualification remains open.
