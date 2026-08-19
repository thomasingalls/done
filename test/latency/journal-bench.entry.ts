/**
 * Bundle entry for the journal benchmark, kept separate so `journal-bench.ts`
 * has no side effect on import and can be type-checked as an ordinary module.
 */

import { bench } from './journal-bench';

window.journalBench = bench();
