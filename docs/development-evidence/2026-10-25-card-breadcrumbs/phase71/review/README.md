# Phase71 read-only UI challenge

Scope: useBrowserBoolean/useGentleContext/useCardGoalsContext, Goals transfer capture, App display
providers, Card display, Menu checkbox and cards.css. No repository edits, browser profile use,
additional runtime changes or broad suites were performed by this reviewer.

No material defect found in the reviewed wiring:

- Both fixed-key switches default on and honor the existing explicit `0` off value. Storage refusal
  applies the requested value to the visit and exposes the persistence warning. Cross-tab storage
  listeners filter their exact key/storage area and are cleaned up on unmount.
- Only switch booleans enter plaintext browser preferences. Heading ancestry is captured into the
  already-reviewed workspace command payload, independently of whether its display is hidden. The
  display switch neither deletes retained context nor stops subsequent capture.
- Goals derives context at the selected source row positions in the current editor state. Copy keeps
  positional array alignment; Move attaches each path inside its row object before the model sorts
  rows. The header/viewport breadcrumb is not used as the source of metadata.
- Context providers retain stable component types/positions. Card reads the boolean with useContext;
  no key, editor lifetime effect dependency, Undo command, stored body or rendering helper changes.
  The existing `editor`/`static` surface keys remain intact. Unfiled cards receive the same preference.
- The path is joined into ordinary escaped React text, without a leading curved arrow, HTML parser,
  navigation action, inferred task identity, new server request or clear routing field.
- The new CSS applies only to the context paragraph. It adds/wraps that line between writing and
  actions; existing card-surface typography, padding, first-line treatment and editor/static geometry
  rules remain unchanged. Toggling visibility intentionally changes the card's total height, not its
  writing representation.

Remaining limits, rather than observed defects:

- A useful narrow browser case would toggle display from another tab while the first tab's card
  editor is mounted, checking editor instance identity, caret/selection, pending writing and Undo.
  Existing screenshot/geometry tests that click the local setting also intentionally blur the editor
  and do not establish the active-editor case. Physical IME/composition behavior is not established by
  this source review.
- useBrowserBoolean's `key` argument is not a dynamic preference selector: state initialization runs
  once. Current callers always pass stable constants, so no current bug follows. A future caller that
  changes keys must define/reset that lifecycle explicitly.
- Cross-tab writes synchronize browser presentation, not account settings across devices. The Menu
  accurately says “in this browser.” Removing a preference restores the default; it does not erase
  workspace metadata.

Source hashes in `source-observation.json` identify this read-only observation. The parent owns the
affected unit/built-browser checks and any ensuing repairs or additional evidence.
