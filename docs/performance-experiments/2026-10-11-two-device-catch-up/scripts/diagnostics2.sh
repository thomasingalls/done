#!/bin/bash
S="$(cd "$(dirname "$0")/.." && pwd)"
while ! grep -q CHAIN-DONE "$S/diagnostics.out" 2>/dev/null; do sleep 3; done
"$S/scripts/run2.sh" DF-fresh-profile base base CATCHUP_PHASES=120 CATCHUP_MAX_CATCH_S=300 CATCHUP_PROFILE_PHASE=0 CATCHUP_PROFILE_SECONDS=25
"$S/scripts/run2.sh" DB-sticky-publisher varB base CATCHUP_PHASES=120 CATCHUP_MAX_CATCH_S=300
echo CHAIN2-DONE
