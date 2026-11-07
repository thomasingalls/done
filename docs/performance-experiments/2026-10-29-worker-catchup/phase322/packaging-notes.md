# Packaging failures retained

A final-check script had an unterminated checkpoint string. The following freezer command nevertheless ran because the shell lacked fail-fast behavior. No benchmark or source operation was started. The unregistered patch failed its exact forward/reverse replay check: Git normalized the new human-readable CSV's 155 CRLF line endings to LF. Every other file matched. The failed patch is retained at `/private/tmp/done-queue-pipeline-lab-20261031/packaging-attempt1.patch`, SHA-256 `b48686a1680588902b2051ca50aad96922cc53281e26f6adcadd2603289069e8`. It was never registered.

The human-readable CSV copy now uses LF. Its numbers are unchanged, and the original CRLF raw CSV remains byte-exact in the evidence gzip and private lab. Original runtime failures and gate verdicts are unchanged. The final source/record check is rerun before the new candidate is frozen. No registered patch is modified.
