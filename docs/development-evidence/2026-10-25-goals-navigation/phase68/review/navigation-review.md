# Phase67 read-only navigation challenge

The targeted observer `navigation-focus-touch.mjs` launches a fresh disposable headless Chromium
context against the built application at loopback53921. It writes fictional Markdown only in that
ephemeral context. It does not connect to a real browser profile or production/account workspace.

## Preserved observations

- `navigation-focus-touch-attempt1.json`: the initial 12-lines-per-section fixture could not put the
  final heading at the top of the editor and timed out waiting for that breadcrumb path. This was
  insufficient tail content for top-aligned scrolling, not an observed navigation exception. No
  page error occurred. The source observer was then changed to 40 lines per section.
- `navigation-focus-touch-attempt2.json` and `navigation-focus-touch-attempt2.log`: the focused
  destination was a BUTTON; activating it with Enter closed the menu and left document focus on BODY
  in the pre-repair build. No page error occurred.
- The same attempt used Chromium CDP touch input on a six-heading path at a 360px viewport. Native
  horizontal swiping moved the breadcrumb trail from scrollLeft563 to463, with160px visible of723px
  total. Goals remained open. The header's computed touch-action:none did not prevent native scrolling
  of the nearest horizontal overflow container in this observation. No gesture repair was justified.

The original sandboxed browser launch aborted before a context opened. The permitted retry used an
ephemeral profile. The observer and JSON are narrow browser observations, not physical-phone,
Firefox/iOS, broad accessibility, admission, encryption or performance qualification.

## Source challenge and subsequent repairs

The parent repaired focus after successful menu navigation by restoring the stable Goals root button;
Escape still restores the originating trigger. The root remains mounted when sibling navigation
removes a leaf crumb, and preventScroll preserves the requested reading location. Stale-document
navigation remains a refusal. Read-only review of this repaired flow found no material remaining issue.

The parent also removed repeated headingPathFrom(all, heading.from) calls from each local-menu row.
All entries share the clicked heading's ancestry prefix (or its parent's prefix for sibling menus), so
deriving that prefix once on open avoids the former quadratic path traversal. The new rendering
retains each row's own title and source line; it does not create a second document authority.

The proposed gesture interception was removed after the actual native swipe passed. No generic gesture
code or application source was edited by the reviewing agent. The parent's final built-browser rerun
is separate evidence for its repaired source; this observer result intentionally preserves the earlier
focus failure.
