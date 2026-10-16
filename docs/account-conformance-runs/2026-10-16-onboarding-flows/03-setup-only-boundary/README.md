# Phase 3 — narrow setup-only erasure to pre-registration metadata

Review of the phase-1/2 composition found a missing refusal: without custody/index identity, a later registration record cannot establish that there is no encrypted content to erase. Do not infer absence from a routing hint. Admit the newly supported metadata-only removal only for the existing v1 fresh attempt with null view and proof. Mismatched routing already refuses; registered, non-fresh or malformed hints now also refuse before creating an intent or changing metadata.

The three new counterexamples all resolve successfully on phase 2, contradicting their required refusal. After repair they and all 36 preceding affected unit cases pass (39 total), with source/key/index preservation and valid pending-attempt removal retained. Typecheck passes. Final packaged composition follows in phase 4. This tightens deletion presentation/completeness, grants no opening authority, and changes no crypto format.

Base remains `1849721ee612`; this is an unsigned sequential overlay. Source pins and normalized logs are preserved. Aggregate qualification, publication and preview updates remain outside scope.
