# F-15 investigation and candidate review

Base: ec889d9. Scope: reservation durability and invocation accounting, current private protocol.

The fresh read-only investigator independently traced custody creation/resumption, promotion,
content append/activation/final publication, network attempt events, compaction, genesis and import.
Parent inspection agreed: making allocation alone strict would miss the network grant. Promotion already
requested strict; neither common helper checked the reported capability. An initial claim is not a
fallback budget. Shared content compare/write plus custody writes are the narrow reservation boundary;
checking explicit strict requests also covers promotion. No blanket read/write default was changed.

The investigator identified a lifecycle constraint: install handlers before capability inspection and
retain refusal if completion wins an abort race. The patch and native tests cover both terminal events.
No capability failure uses StorageCompatibilityError, which promotion can intentionally bypass.

One fresh candidate reviewer independently inspected the patch and direct/indirect callers after focused
checks. It reported no concrete surviving F-15 bypass or legitimate regression. It identified that native
transaction-construction throws preserve their raw exception shape, while the draft documentation
claimed every refusal was a storage-failed error. Source inspection confirmed this; documentation now
states the distinction. Those throws allocate no transaction, run no body and admit no AES. No runtime
change was needed for that observation. No second review cycle was performed.

Both agents were read-only; the parent owns implementation and executable verification. Their conclusions
are source review, not physical persistence measurements or an independent whole-protocol certification.
