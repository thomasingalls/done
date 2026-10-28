# Read scheduling investigation — 2026-10-27

[98: observed read productivity, profiles and qualified metadata coverage](phase98/README.md) →
[99: production-source falsifiers, prior evidence and next repair contract](phase99/README.md).

Five unchanged publishers each return257 empty pages during1024-position catch-up;49 native capacity
refusals are followed by~49s of retry gaps. Existing self-poll suppression depends on publisher order.
Keep caps/security/latency gates unchanged; repair that narrow self-read case before changing peer polling.
No release preparation or runtime change.
