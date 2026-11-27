#!/bin/sh
# Phase 559 matrix: every cell in its own process, RUNS times, each bounded by a timeout.
# Results stay outside git.
# Usage: run.sh <out-dir> [routines|final|legacy|codec|all]
set -u
out=$1
what=${2:-all}
runs=${RUNS:-3}
mkdir -p "$out"
here=$(dirname "$0")
if [ "$what" = all ] || [ "$what" = routines ]; then
  for run in $(seq "$runs"); do
    for bytes in 16 32 1024 65536 1048576 8388608 33554432; do
      for routine in none reference-hex custody-hex protocol-hex option-byte-textdecoder \
        option-chunked-fromcharcode floor-tohex lowerhexbytes unhex \
        option-encodeinto-lowerhexbytes floor-fromhex; do
        timeout "${CELL_TIMEOUT:-300}" node "$here/routines.mjs" "$routine" "$bytes" 5 \
          >>"$out/routines.jsonl" 2>>"$out/routines.err" || echo "routine $routine $bytes exit $?"
      done
    done
  done
fi
if [ "$what" = all ] || [ "$what" = final ]; then
  # The routines as finally built (join below HEX_SLOTS_FROM, slots from it) against the base,
  # at sizes either side of the threshold as well as the large ones.
  for run in $(seq "$runs"); do
    for bytes in 1 8 12 16 20 24 32 48 63 64 128 1024 65536 1048576 8388608 33554432; do
      for routine in reference-hex custody-hex protocol-hex; do
        timeout "${CELL_TIMEOUT:-300}" node "$here/routines.mjs" "$routine" "$bytes" 5 \
          >>"$out/final.jsonl" 2>>"$out/final.err" || echo "final $routine $bytes exit $?"
      done
    done
  done
fi
if [ "$what" = all ] || [ "$what" = legacy ]; then
  for run in $(seq "$runs"); do
    for bytes in 16 32 1024 65536 1048576 8388608 16777216; do
      for routine in legacy-source-hex custody-hex; do
        timeout "${CELL_TIMEOUT:-300}" node "$here/routines.mjs" "$routine" "$bytes" 3 \
          >>"$out/legacy.jsonl" 2>>"$out/legacy.err" || echo "legacy $routine $bytes exit $?"
      done
    done
  done
fi
if [ "$what" = all ] || [ "$what" = codec ]; then
  for run in $(seq "$runs"); do
    for cell in encode:8 decode:8 auth:8 decode:32 auth:32; do
      for arm in reference current floor; do
        OP=${cell%%:*} MIB=${cell##*:} ARM=$arm OUT="$out/codec.jsonl" timeout "${CELL_TIMEOUT:-300}" \
          pnpm exec vitest run --config "$here/vitest.config.ts" >>"$out/codec.log" 2>&1 ||
          echo "codec $arm $cell exit $?"
      done
    done
  done
fi
