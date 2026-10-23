# Sidebar overflow and density — 2026-10-23

Bounded phase53 follows cumulative patches37–52. Runtime changes are confined to
`src/styles/shell.css`: intrinsic day-label sizing and wrapping, a viewport width cap,
nonshrinking sidebar sections/icons, smaller gaps between collapsed sections, and
wrapping/sizing rules for expanded controls. No component, action, lifecycle, editor,
data-format, authorization or sync code changes.

## Counterexample and outcome

The old three equal day columns left only51px of content space for roughly60px labels.
A whole-menu scrollWidth check missed text painting into each button’s padding. Added
geometry cases inspect actual text rectangles inside controls. All8 baseline cases
fail, including enlarged-text cases where the panel exceeded the viewport and actions
were clipped. Existing sidebar assertions remain intact.

Final source checks:50 Chromium desktop/mobile-emulation cases,9 actual headless
Firefox cases,18 built-frontend cases and10 inventory tests pass. TypeScript, build,
budget (232.7/350kB initial JS gzip), origin isolation and focused lint/format pass.
Widths include280/320/360/1280px, light/dark themes,16/24/32px root text, long user names,
expanded disclosures and scrolling to removal/install actions. Root font changes test
layout at enlarged text sizes; they do not establish physical Android text scaling or
native Firefox text-only zoom behavior. No physical mobile walkthrough is claimed.

The inventory refresh changes only this existing test file’s hash and static declaration
count1→2. Formal qualification remains paused/blocked at891 obligations/347 unresolved;
the file remains uncredited. Static declarations are not runtime case denominators.

## Preserved limitations and failed attempts

- The first ad-hoc preview probe used a missing module import, then measured during
  the opening animation; its JSONL is retained but is not used for the regression claim.
- The first candidate run passed text fitting but strict IntersectionObserver ratio1
  failed at a fractional scroll edge (0.9971). The new test now checks all button edges
  within one CSS pixel. No pre-existing assertion was changed or removed.
- The first inventory review assumed the declaration count would remain unchanged.
  It failed; the final review explicitly checks the single added declaration and proves
  all other declarations, dispositions, counts and fields remain unchanged.
- The first HTTPS smoke measured before the sidebar’s opening animation finished.
  The corrected probe waits for the panel to reach its visible position. Its final four
  disposable-context cases pass with no page errors.

## Preview and source identity

Local HTTPS8443 serves worker`d541133789ab`, Version`c4a66c79-dirty`. Only the frontend
 gateway restarted (PID29351); API PID52585, its public service identity, routes and data
were retained. All60 non-map build assets and two deep links match over normal TLS.
Four fresh-context smoke cases use no existing browser profile or real account.
`checks/build-identity.json` records the exact input tree and110 build-file hashes;
`summary.json` and preview receipts distinguish this from deployment. Existing sealed
evidence packets are unchanged. No staging, commit, push, merge or production deployment.

Scratch reproduction paths in the retained configs/scripts identify the original run.
To repeat elsewhere, change only those paths/ports and preserve isolated reference and
candidate outputs. Baseline runtime is exported from prior tree
`d56027b40bb81bda057dadd6f7b305e8eff50a8c`; the new spec runs against that runtime.
