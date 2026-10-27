# Phase88 — Goals navigation

The root word Goals owns the full outline without an icon. Its following caret lists H1s; each
heading's following caret lists its children, including authored skipped levels, with no sibling
fallback. Choosing a row scrolls and drills into it without closing the menu or moving the editor
selection. Leaf menus explicitly report no subsections. Escape, outside dismissal, stale-document
refusal, duplicate positions and narrow layouts retain their guards.

Controls use the former outline indicator's24px centered geometry and2px corners. Words remain
transparent until hover, retaining existing hover colors. Existing header alignment is retained.

The cumulative development build passed22 navigation browser cases (desktop plus Android emulation)
and7 heading-helper cases; the same browser invocation passed8 card cases recorded in phase89.
Two preceding attempts failed only on old icon/close/spacing fixture expectations; both logs are
retained. Icon expectations changed to the requested absence; spacing, pinned scroll, caret position,
keyboard and stale-destination assertions remain. The final run is30/30, no retries/skips.

No publication, signing or qualification is authorized. Real-phone interaction is not established.
