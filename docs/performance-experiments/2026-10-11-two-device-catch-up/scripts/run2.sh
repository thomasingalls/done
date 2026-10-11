#!/bin/bash
# usage: run2.sh <label> <client-arm> <service-arm> [ENV=VALUE ...]   (scratch only; private ports)
set -u
S="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="$1"; ARM="$2"; SVC="$3"; shift 3
PORT=53781; SPORT=53782
SEQ=$(printf '%02d' $(( $(ls "$S/results" | wc -l) + 1 )))
OUT="$S/results/$SEQ-$LABEL"; mkdir -p "$OUT"
mine() { lsof -nP -iTCP:$PORT -iTCP:$SPORT -sTCP:LISTEN 2>/dev/null | tail -n +2 | wc -l | tr -d ' '; }
foreign() { lsof -nP -iTCP:53221 -iTCP:53222 -sTCP:LISTEN 2>/dev/null | tail -n +2 | wc -l | tr -d ' '; }
if [ "$(mine)" != "0" ]; then echo "$SEQ $LABEL ABORT own ports busy"; exit 9; fi
( while true; do echo "{\"t\":$(($(date +%s)*1000)),\"load\":\"$(sysctl -n vm.loadavg | tr -d '{}' | xargs)\",\"foreignListeners\":$(foreign)}"; sleep 5; done ) > "$OUT/sampler.jsonl" 2>/dev/null &
SAMPLER=$!
T0=$(date +%s)
( cd "$S/probe" && env "$@" DONE_CATCHUP_LOG="$OUT/service.jsonl" DONE_CATCHUP_PORT=$PORT DONE_CATCHUP_SERVICE_PORT=$SPORT \
    CATCHUP_SOURCE="$S/$SVC" CATCHUP_DIST="$S/$ARM/dist" CATCHUP_OUTPUT="$OUT" \
    node "$S/node_modules/@playwright/test/cli.js" test --config "$S/probe/playwright.config.ts" ) > "$OUT/run.log" 2>&1
CODE=$?
T1=$(date +%s)
kill $SAMPLER 2>/dev/null; wait $SAMPLER 2>/dev/null
sleep 1
printf '{"seq":"%s","label":"%s","clientArm":"%s","serviceArm":"%s","env":"%s","exit":%d,"seconds":%d,"start":%d,"ownPortsLeftListening":%s}\n' "$SEQ" "$LABEL" "$ARM" "$SVC" "$*" "$CODE" "$((T1-T0))" "$T0" "$(mine)" > "$OUT/meta.json"
echo "$SEQ $LABEL exit=$CODE $((T1-T0))s"
