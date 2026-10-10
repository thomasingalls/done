#!/bin/bash
# Follow-up on 95923cd8, fixed before start: 6 runs alternating ordinary (E) and incremental (F), no reruns.
S="$(cd "$(dirname "$0")/.." && pwd)"
i=0
for arm in E F E F E F; do
  i=$((i+1))
  if [ "$arm" = "E" ]; then "$S/scripts/run-one.sh" E "R-E-ordinary-$i"; else "$S/scripts/run-one.sh" F "R-F-incremental-$i"; fi
done
echo PHASE3-DONE
