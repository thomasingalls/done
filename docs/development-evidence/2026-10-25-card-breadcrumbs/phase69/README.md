# Phase69 — breadcrumb menu affordance

2026-10-25 · bounded visual follow-up after immutable68.

The operator found the final text caret visually out of place. Move each existing local-menu target
into the leading breadcrumb separator, using a small consistent SVG chevron. The heading text stays
a direct jump, the root stays the full outline, and no trailing glyph follows the final heading.
Existing menu labels, keyboard behavior and touch targets remain. No card or content changes yet.

All20 existing breadcrumb/navigation browser checks pass across desktop and Android emulation.
TypeScript and the rebuilt frontend pass. Reports and source hashes are retained; no new test merely
mirrors a low-impact styling rule. This is not physical-device or release qualification. No real
profile, preview8443, index staging, commit or deployment. Card context follows in bounded phases.
