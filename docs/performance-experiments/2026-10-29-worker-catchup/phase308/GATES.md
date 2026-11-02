# Original-gate challenge — all thirty journeys

One failed replicate fails its cell. Every lab run earns no credit. Goals paragraph rAF is a diagnostic, not the16ms mutation gate.

|Journey|Functional|Original predicates|Input p95 ms|Peer p95 ms|Worst marker ms|Deep ms / overlap keys|Failure|
|---|---|---|---:|---:|---:|---|---|
|gate-r1-native-context|pass|pass|-|-|-|-||
|gate-r1-native-resumable|pass|pass|-|-|-|-||
|gate-r1-native-deep|pass|pass|-|-|-|19221.034423828125||
|gate-r1-late-normal|pass|pass|3.736|1003.512|1002.882|None||
|gate-r1-late-withheld|pass|pass|3.602|2445.753|1235.146|None||
|gate-r1-old-maintenance-normal|pass|FAIL|3.827|815.864|732.272|42|atLeast60KeysDuringCatchup|
|gate-r1-old-maintenance-withheld|pass|FAIL|3.173|2344.507|2108.550|26|atLeast60KeysDuringCatchup|
|gate-r1-fairness|pass|pass|3.200|680.600|-|-||
|gate-r1-goals-desktop|pass|pass|-|-|-|-||
|gate-r1-goals-mobile4x|pass|pass|-|-|-|-||
|gate-r2-native-context|pass|pass|-|-|-|-||
|gate-r2-native-resumable|pass|pass|-|-|-|-||
|gate-r2-native-deep|pass|pass|-|-|-|19627.509033203125||
|gate-r2-late-normal|pass|pass|3.628|1023.538|910.702|None||
|gate-r2-late-withheld|pass|pass|4.300|2395.446|1154.853|None||
|gate-r2-old-maintenance-normal|pass|FAIL|3.508|814.573|726.641|40|atLeast60KeysDuringCatchup|
|gate-r2-old-maintenance-withheld|pass|FAIL|3.840|2350.805|1637.298|27|atLeast60KeysDuringCatchup|
|gate-r2-fairness|pass|pass|6.100|1093.300|-|-||
|gate-r2-goals-desktop|pass|pass|-|-|-|-||
|gate-r2-goals-mobile4x|pass|pass|-|-|-|-||
|gate-r3-native-context|pass|pass|-|-|-|-||
|gate-r3-native-resumable|pass|pass|-|-|-|-||
|gate-r3-native-deep|pass|pass|-|-|-|23255.82763671875||
|gate-r3-late-normal|pass|pass|5.367|1176.110|1040.385|None||
|gate-r3-late-withheld|pass|pass|6.431|2366.055|2139.643|None||
|gate-r3-old-maintenance-normal|pass|pass|6.271|1001.349|892.680|77||
|gate-r3-old-maintenance-withheld|pass|FAIL|6.638|2418.231|1188.592|44|atLeast60KeysDuringCatchup|
|gate-r3-fairness|pass|pass|14.700|1353.200|-|-||
|gate-r3-goals-desktop|pass|pass|-|-|-|-||
|gate-r3-goals-mobile4x|pass|pass|-|-|-|-||
