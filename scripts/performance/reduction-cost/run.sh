#!/bin/sh
# Phase 556 matrix: one process per history size, each running every arm in ARMS on a fresh store
# seeded from the same history, bounded by a timeout. Results stay outside git.
# Usage: ARMS=uncached,sliced,sliced@500 run.sh <out-dir> <label> [pairs...]
set -u
out=$1
label=$2
shift 2
mkdir -p "$out"
for pairs in "${@:-128 256 512 1024 2048}"; do
  PAIRS=$pairs REPS=${REPS:-1} ARMS=${ARMS:-uncached,sliced} OUTDIR=$out LABEL=$label timeout "${CELL_TIMEOUT:-2400}" \
    pnpm exec vitest run --config scripts/performance/reduction-cost/vitest.config.ts \
    >"$out/$label-$pairs.log" 2>&1
  echo "$label pairs=$pairs exit=$?"
  grep -h '^REDUCTION' "$out/$label-$pairs.log"
done
