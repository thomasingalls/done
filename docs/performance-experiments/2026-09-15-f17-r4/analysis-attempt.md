# Premature analysis invocation

During the Unicode campaign, the root agent invoked `node /private/tmp/done-f17-exploration-r4/analyze.mjs` to inspect the already completed ordinary-text comparison. This helper reads every result directory without skipping incomplete sessions. It exited 1 because the first Unicode session directory existed but its final result did not yet exist:

```text
Error: ENOENT: no such file or directory, open '/private/tmp/done-f17-exploration-r4/results/unicode-0-selected/result.json'
```

The key error and missing path above are transcribed from the tool output; the full original stack remains in the task transcript. This is an analysis orchestration error, not a failed browser session or missing final measurement. No input, timing, helper or output was changed to bypass it. Analysis is deferred until all sessions finish; the final command and output are preserved separately. No screen session is rerun on account of this error.
