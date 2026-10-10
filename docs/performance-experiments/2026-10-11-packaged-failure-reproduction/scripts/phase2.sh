#!/bin/bash
# usage: phase2.sh <arm for diagnostics>
# Fixed before start: D1 x6 (request budgets unlimited), D2 x6 (delivery assertion 120 s), then C x6 (4500d9b6 incremental).
S="$(cd "$(dirname "$0")/.." && pwd)"
ARM="$1"
for i in 1 2 3 4 5 6; do "$S/scripts/run-one.sh" "$ARM" "D1-$ARM-unlimited-$i" DONE_FLAKE_UNLIMITED=1; done
for i in 1 2 3 4 5 6; do "$S/scripts/run-one.sh" "$ARM" "D2-$ARM-deadline120-$i" DONE_FLAKE_DELIVERY_TIMEOUT=120000 DONE_FLAKE_TEST_TIMEOUT=360000; done
echo PHASE2-D-DONE
for i in 1 2 3 4 5 6; do "$S/scripts/run-one.sh" C "C-prev-incremental-$i"; done
echo PHASE2-DONE
