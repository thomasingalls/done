---
schema: 1
kind: finding
id: f-tip-prd-stale-selection-status
status: validated
type: contradiction
severity: low
confidence: high
introduced_by: a073574fcb90f9f2a70fa1be2bae5dc1d9c364f3
work_item: F-02
created_by: /root/f_02
updated: 2026-08-26
challenged_by: root-v01-20260826
superseded_by: none
---

# `The current PRD says three TRD selections remain open after the current TRD selects them`

## Affected requirement or guarantee

The PRD says every subsection stands alone and its closing `TRD` line accurately names what the companion still leaves open. Implementers and reviewers therefore need selection status in those lines to agree with the current TRD register.

## Original source

At `c6116669030eedeea3d599bca0da3547114e6930`, `docs/PRD.md` §§6.3, 6.5, and 7.6 and `docs/TRD.md` §15 rows 11, 5, and 14 consistently left the enrollment ceremony, finalization shape, and recovery-code/step-up/confirmation construction open. This original state is independently extracted as OC-073, OC-067, and OC-076 in `docs/review/analysis/original-contract.md`.

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/PRD.md`:

- lines 1133–1137 say the enrollment ceremony “remains an open selection” and that TRD §15 carries it open;
- lines 1248–1253 say the finalization choice remains open; and
- lines 2024–2029 say step-up authentication and confirmation UX remain open.

At the same commit, `docs/TRD.md` §13.6 and §15 row 11 (lines 2202–2212 and 2866) select committed-nonce five-symbol SAS with QR only as an accelerator; §15 row 5 (line 2865) selects the accepted-link-chain finalization; and §13.8/§15 row 14 (lines 2433–2449 and 2864) select nonce-bound step-up while leaving only confirmation copy/UX outside that construction.

## First introduction and propagation

The first divergence is `a073574fcb90f9f2a70fa1be2bae5dc1d9c364f3`: it adds the row-5 accepted chain and row-11
committed-nonce typed SAS, marks both selected in TRD §15, and creates their selection/vector artifacts without
modifying PRD §§6.5 or 6.3. Commit `992bc9113093fe04d20df0247aa118d0f8ba365f` later amends row 11 with the epoch
head but still does not update the PRD. B-01 locates the third divergence at
`ff0b48f8ce7f1878ac6abb9c849380800b55370c`, which closes row 14's nonce/transition step-up in TRD §13.8/§15 and
its selection/vector without updating PRD §7.6. At the tip the contradiction therefore propagates into three
standalone PRD lifecycle subsections while the TRD construction sections, current register, selection records,
generators, and vectors carry the selected answers.

## Reachable consequence

An implementer following one standalone PRD subsection can reopen an already selected protocol choice, choose an incompatible candidate, or send reviewers a scope that conflicts with the generated artifacts. The likely impact is review/rework and inconsistent implementation guidance, not a demonstrated runtime failure: the target protocol is not integrated at this snapshot and the detailed TRD provides the selected construction. Severity is therefore low.

## Supporting evidence

The PRD header calls v9 current and normative. Its reading instructions (`9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/PRD.md` lines 12–29) say each subsection stands alone, a closing `TRD` line names what the companion still leaves open, the two documents land together, and current truth belongs in the normative documents rather than the historical decision record. The three present-tense open claims are therefore status assertions, not merely preserved historical alternatives.

The TRD likewise calls v8 current and normative (`9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/TRD.md` lines 1–3) and says its register states what is currently selected (line 2855). The selected register and construction prose directly contradict the PRD status assertions above.

## Counterevidence and disconfirmation attempt

I tested whether the PRD paragraphs could be read as historical rationale. That reading conflicts with the PRD's explicit standalone/current instructions and the phrases “remains,” “leaves,” and “remain open.” I also tested whether row 14 remains wholly open because confirmation wording is still a product question. That explains only the confirmation-UX half: the PRD also says step-up remains open even though §13.8 and row 14 select the bound challenge. No equivalent partial-opening explanation fits rows 5 or 11.

## Validation procedure

1. During the reverse commit walk, identify the commit that selected each row and determine whether its propagation checklist intended to update the three PRD paragraphs.
2. Compare the tip PRD standalone claims with TRD §§13.6, 13.8, and 15 and the row 5, 11, and 14 selection records.
3. Ask a challenger to try to derive a consistent current selection state without treating either normative document as stale.
4. If no consistent reading survives, validate the contradiction and inspect adjacent PRD `TRD` lines for the same propagation class.

## Disposition

Validated by `V-01`. Update the PRD to name the selected constructions and leave only genuinely open confirmation UX, or explicitly reopen the affected TRD rows and propagate that reopening to their records, artifacts, and review scopes.
