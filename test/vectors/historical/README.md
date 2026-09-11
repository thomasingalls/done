# Historical recovery evidence

`recovery-code.scalar-only.json` is the unchanged scalar-only corpus from commit `43b42b1`:

- Original path: `test/vectors/recovery-code.json`
- File SHA256: `08900f54013d8211462f3e38af161a163423c2d62d6925eebc439bc9da972a19`
- Original generator: `scripts/generate-recovery-vectors.mjs` at `43b42b1`
- Generator SHA256: `bfb284b1632b69da67510cd4f5928d85b5471c7d014f641ec6ab6f92cfe57785`

Its 32-byte plaintext / 48-byte ciphertext is historical evidence, not a current positive or a supported
alternate private v1 layout. Current tests open it independently and require the runtime parser to refuse
it. The current generator preserves encoding, normalization and replacement step-up coverage while
sealing the complete 96-byte payload. Reconstruct the historical generator from the pinned commit;
it is deliberately not part of current vector generation.
