# Phase137 — close the serializer input before a new baseline attempt

The136 runner stopped before any test body/browser/container/timed typing: seed-profile imports
the pinned Playwright serializer text, which was omitted when relocating the lab. ENOENT and the
failed runner are retained. Copy the exact already pinned serializer from133, include it in the
manifest, and freeze fresh baseline-repair-* attempt names before dispatch. All runtime/assets,
gates, input/cold/native/resource checks, order and conditional decision rules remain136's. The
original failed directory and136 patch stay immutable. No product/old-test edits or activation.
