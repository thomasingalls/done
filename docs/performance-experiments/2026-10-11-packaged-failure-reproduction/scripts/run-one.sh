#!/bin/bash
# usage: run-one.sh <arm-dir> <label> [ENV=VALUE ...]
# One packaged history run (two journeys) with fresh disposable state on private ports.
set -u
S="$(cd "$(dirname "$0")/.." && pwd)"
ARM="$1"; LABEL="$2"; shift 2
PORT=53781; SPORT=53782
SEQ=$(printf '%02d' $(( $(ls "$S/results" | wc -l) + 1 )))
OUT="$S/results/$SEQ-$LABEL"; mkdir -p "$OUT"
mine() { lsof -nP -iTCP:$PORT -iTCP:$SPORT -sTCP:LISTEN 2>/dev/null | tail -n +2 | wc -l | tr -d ' '; }
foreign() { lsof -nP -iTCP:53221 -iTCP:53222 -sTCP:LISTEN 2>/dev/null | tail -n +2 | wc -l | tr -d ' '; }
if [ "$(mine)" != "0" ]; then echo "{\"label\":\"$LABEL\",\"error\":\"own ports busy\"}" > "$OUT/meta.json"; echo "$SEQ $LABEL ABORT own ports busy"; exit 9; fi
# Wait (bounded) for a moment when no other session's packaged service is listening.
WAITED=0
while [ "$(foreign)" != "0" ] && [ $WAITED -lt 180 ]; do sleep 3; WAITED=$((WAITED+3)); done
FOREIGN_AT_START=$(foreign)
( while true; do echo "{\"t\":$(($(date +%s)*1000)),\"load\":\"$(sysctl -n vm.loadavg | tr -d '{}' | xargs)\",\"foreignListeners\":$(foreign)}"; sleep 5; done ) > "$OUT/sampler.jsonl" 2>/dev/null &
SAMPLER=$!
LOAD_START="$(sysctl -n vm.loadavg | tr -d '{}' | xargs)"
T0=$(date +%s)
( cd "$S/$ARM" && env "$@" DONE_FLAKE_LOG="$OUT/service.jsonl" DONE_FLAKE_PORT=$PORT DONE_FLAKE_SERVICE_PORT=$SPORT \
    node node_modules/@playwright/test/cli.js test --config playwright.packaged-account.config.ts \
    test/packaged-account/history.spec.ts --grep 'two native device owners|returning editor' ) > "$OUT/run.log" 2>&1
CODE=$?
T1=$(date +%s)
kill $SAMPLER 2>/dev/null; wait $SAMPLER 2>/dev/null
LOAD_END="$(sysctl -n vm.loadavg | tr -d '{}' | xargs)"
cp "$S/$ARM/test-results/packaged-account/results.json" "$OUT/results.json" 2>/dev/null
if [ $CODE -ne 0 ]; then
  mkdir -p "$OUT/artifacts"
  # keep failure context, page snapshots and service state of the failed run (disposable test accounts only)
  (cd "$S/$ARM/test-results/packaged-account/artifacts" 2>/dev/null && tar -cf - . 2>/dev/null) | (cd "$OUT/artifacts" && tar -xf - 2>/dev/null)
fi
sleep 1
LEFT=$(mine)
printf '{"seq":"%s","label":"%s","arm":"%s","env":"%s","exit":%d,"seconds":%d,"start":%d,"loadStart":"%s","loadEnd":"%s","waitedForForeign":%d,"foreignAtStart":%s,"ownPortsLeftListening":%s}\n' \
  "$SEQ" "$LABEL" "$ARM" "$*" "$CODE" "$((T1-T0))" "$T0" "$LOAD_START" "$LOAD_END" "$WAITED" "$FOREIGN_AT_START" "$LEFT" > "$OUT/meta.json"
echo "$SEQ $LABEL exit=$CODE ${T1}-${T0}=$((T1-T0))s load=$LOAD_START->$LOAD_END waited=$WAITED foreignAtStart=$FOREIGN_AT_START"
