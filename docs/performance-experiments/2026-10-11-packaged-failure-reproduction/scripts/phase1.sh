#!/bin/bash
# Fixed before start: 6 runs each of A (ordinary/reference) and B (incremental), ABBA-interleaved.
S="$(cd "$(dirname "$0")/.." && pwd)"
i=0
for arm in A B B A A B B A A B B A; do
  i=$((i+1))
  "$S/scripts/run-one.sh" "$arm" "P1-$arm-$i"
done
echo PHASE1-DONE
