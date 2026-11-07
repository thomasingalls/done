# Exact-replay preparation failure

The first phase-323 freeze passed reverse replay but failed the final exact forward-byte comparison. Every cumulative file matched except the new phase323/README.md: 19,482 requested bytes versus 19,481 after Git applied its whitespace policy. Both were LF-only; one extra blank EOF line was removed. No runtime, result, old test or old record prefix differed.

The unregistered patch is retained in the private lab as unregistered-freeze-attempt1.patch; its SHA and mismatch hashes are in freeze-attempt1.json. PATCHES.json remained at322. The new report ending is normalized and this note appended by the inert finalize-eof-replay.py recipe. The registered successor must pass the same exact cumulative, forward and reverse checks. This is artifact preparation, not a test or gate rerun.
