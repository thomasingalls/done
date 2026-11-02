# Phase 317 — 3,072-position index and reader preparation diagnostic

**Lab only; evidence and documentation only. No acceptance credit or hardening.** All four predeclared cells use the same real 3,072-position fictional server cohort and initial behind reader. The reader writes the selected receipt format during each run. G8, range4, R1000, S1Y1, V0, D0, quiet750, existing logical rate/fairness limits and service automation off. No rebuild since phase313. External CPU/top-executable logs every5s; no concurrent build, heavy analysis or freezer.

The public reader journey keeps its600s backlog and120s maintenance observation. This is the declared diagnostic, not a replacement for the original native30s deep gate. A functional child exit0 with maintenance halted/timed out does not mean maintenance passed. Cold runs only after completion; not reached is untested.

|Run|P|Drain s|First index fallback after observed positions|Fallback charge bytes|Reader attempts / completions / capacity throws|Peak map bytes|Peak saved payload bytes|Cold|
|---|---:|---:|---:|---:|---|---:|---:|---|
|index3072-01-P0|0|556.308|not observed|—|2 / 0 / 1|33545153|22942564|not reached|
|index3072-02-P1|1|82.819|not observed|—|12 / 0 / 0|27886589|25562515|not reached|
|index3072-03-P1|1|80.780|not observed|—|11 / 1 / 0|27886589|25569703|exact|
|index3072-04-P0|0|476.685|not observed|—|2 / 0 / 1|33545153|25507072|not reached|

## Journal families, every run

Map accounting includes receipt payload, slot and per-entry overhead against33,554,432bytes; it is not encrypted IndexedDB size. Saved payload totals describe durable preparation deltas, not post-cleanup physical disk size. Every attempt and family snapshot remains in the analysis and CSV. The peak disposed snapshot below is not extrapolated past the observed work.

### index3072-01-P0

```json
{
  "attempt": 2,
  "journal": 2,
  "mapBytes": 33545153,
  "cap": 33554432,
  "families": {
    "opened": {
      "entries": 5557,
      "bytes": 33545153
    }
  },
  "entries": 5557,
  "newMisses": 781
}
```

Outcome: maintenance-halted; stages ['opening']; last attempt {'kind': 'threw', 'name': 'Error'}. Observed logical positions 1256, scalar 3072, overflow 1075647; timeline complete=False. Host busy median/max 34.42509612493768/62.23595057791949% (test and system work included).

### index3072-02-P1

```json
{
  "attempt": 11,
  "journal": 11,
  "mapBytes": 27886589,
  "cap": 33554432,
  "families": {
    "opened": {
      "entries": 3894,
      "bytes": 5650845
    },
    "witness": {
      "entries": 783,
      "bytes": 128302
    },
    "admission-prefix": {
      "entries": 1,
      "bytes": 81
    },
    "spool": {
      "entries": 1,
      "bytes": 72
    },
    "delivery": {
      "entries": 2,
      "bytes": 1209
    },
    "link": {
      "entries": 1,
      "bytes": 136
    },
    "inbound": {
      "entries": 3081,
      "bytes": 21680628
    },
    "coverage": {
      "entries": 3082,
      "bytes": 425316
    }
  },
  "entries": 10845,
  "newMisses": 673
}
```

Outcome: maintenance-timeout; stages ['coverage', 'opening', 'verifying']; last attempt {'kind': 'skipped', 'reason': 'activity-or-journal'}. Observed logical positions 1552, scalar 3072, overflow 675578; timeline complete=False. Host busy median/max 29.90430622009569/59.52238805970149% (test and system work included).

### index3072-03-P1

```json
{
  "attempt": 10,
  "journal": 10,
  "mapBytes": 27886589,
  "cap": 33554432,
  "families": {
    "opened": {
      "entries": 3894,
      "bytes": 5650845
    },
    "witness": {
      "entries": 783,
      "bytes": 128302
    },
    "admission-prefix": {
      "entries": 1,
      "bytes": 81
    },
    "spool": {
      "entries": 1,
      "bytes": 72
    },
    "delivery": {
      "entries": 2,
      "bytes": 1209
    },
    "link": {
      "entries": 1,
      "bytes": 136
    },
    "inbound": {
      "entries": 3081,
      "bytes": 21680628
    },
    "coverage": {
      "entries": 3082,
      "bytes": 425316
    }
  },
  "entries": 10845,
  "newMisses": 671
}
```

Outcome: passed; stages ['complete', 'coverage', 'verifying']; last attempt {'kind': 'removed'}. Observed logical positions 1552, scalar 3072, overflow 690028; timeline complete=False. Host busy median/max 29.797784740356356/49.960063897763575% (test and system work included).

### index3072-04-P0

```json
{
  "attempt": 2,
  "journal": 2,
  "mapBytes": 33545153,
  "cap": 33554432,
  "families": {
    "opened": {
      "entries": 5557,
      "bytes": 33545153
    }
  },
  "entries": 5557,
  "newMisses": 593
}
```

Outcome: maintenance-halted; stages ['opening']; last attempt {'kind': 'threw', 'name': 'Error'}. Observed logical positions 1256, scalar 3072, overflow 1074852; timeline complete=False. Host busy median/max 38.365791698592815/74.87586891757697% (test and system work included).

## Index boundary and timing

The first fallback is the first recorded `indexBudget.fits=false`, paired with the number of preceding observed native logical commits. Its logical ledger count, physical rows, charge and last sequence are retained exactly in the analysis. An absent event is not silently filled from arithmetic. Expanded charge is a bounded-work charge, not heap size. Full prefix comparison stays on; the32MiB index limit and logical audit frequency stay unchanged.

[Per100-position timing](./index3072-per100.csv) reports the curve around the boundary without interpolation. The first bin mixes the pre-existing Node/Worker epoch and is qualified; later bins are Worker-to-Worker. Scalar comparison totals, physical rows/bytes per position, duplicate page stores and any event truncation are in[analysis](./index3072-analysis.json). No missing events or uncompleted cold checks are manufactured.

## Observed boundary bend and instrumentation limit

All four event buffers overflowed:1,075,647 /675,578 /690,028 /1,074,852 dropped events. The retained native timeline stops after1,256positions for P0 and1,552for P1, before the predicted limit. **The first fallback position is not measured in any of these four runs.** Do not interpret null as no fallback, and do not substitute the predicted2,460position. That requested exact measurement remains open; no guard, gate or buffer limit was changed to hide it.

The uncapped scalars show77full ledger checks in each P0run versus1in each P1run. The uncapped request trace crosses the whole3,072positions and shows a sharp bend between2,400and2,600P0positions, consistent with but not proof of the proposed index explanation. Native prefix-comparison totals are83.27/10.26/9.81/80.36s. Request-cursor timing is not native apply time and cannot assign the exact fallback.

|Run|2,300–2,400 request ms/position|2,400–2,500|2,500–2,600|2,900–3,000|Full drain s|
|---|---:|---:|---:|---:|---:|
|01 P0|140.66|264.08|635.74|729.40|556.308|
|02 P1|33.86|28.41|33.58|32.95|82.819|
|03 P1|28.01|32.15|30.56|33.18|80.780|
|04 P0|125.66|242.42|512.01|590.60|476.685|

[Uncapped network cursor curve](./index3072-network-per100.csv) retains every bin; it supplements, rather than repairs, the censored native curve. Both P0maps exhaust capacity in opened-record receipts alone at33,545,153bytes. Both P1maps peak at27,886,589bytes, below the predicted29–30MB, and fit: opened5,650,845; inbound21,680,628; coverage425,316; witness128,302; delivery1,209; link136; admission-prefix81; spool72bytes. One P1reader still times out after12attempts; the other completes after11and cold-opens exactly. Fitting at3,072does not establish the future3,450–3,560capacity boundary.

## Capacity correction and reopen

PreparationCapacity currently escapes the preparation path and is caught by automaticLocalRetention as owner-error, setting the live controller halted. It does **not** reach skipped/capacity or the parked path. No fix was built. Mapping only this refusal to skipped/capacity is an explicit **S landing requirement**, with integrity/storage/authority failures preserved.

The halted flag is process-local. A new owner starts a fresh controller and can retry after eligibility/quiet checks. It loads the saved journal, authenticates/decrypts deltas and checks generation, context and prefix before importing ready receipts. Stale or invalid proofs are not reused. Capacity is not the PreparationPause persistence path: unsaved work from the failing attempt is disposed; earlier saved slices remain. Reopening does not increase the cap and can hit the same refusal again. This is a static source trace, not a new measured reopen of a halted profile. The exact source paths and reading are preserved in OPERATOR-ADDITIONS-317.md.

## Next declared work

The eight normal runs—three Doff/on pairs plus two Roff/Doff controls—were declared before any D pair started. Roff uses10001, selectedR1000/Doff10101, Don10111; no rebuild. Same private1024 fixture, mixed order. Report tokens, quiet reads, overall/post-drain peerp95 and H1/H2 drains against Doff arms; retain normal R cost and variability. Then every original gate three times, plus grown normal/withheld three times separately. Each grown owner needs interruption reasons, scheduled retry clocks and actual waits. A failed replicate fails its cell. Any actual no-F cold failure stops immediately.

No lab source or build lands. V is comparison only, C reserve, F never. Range writer remains default off outside explicit lab; v2 development-only; P format and hardening remain operator decisions. Every unfavorable result and host-load log is retained. [Evidence index](./evidence-index.json),[copy check](./evidence-check.json).
