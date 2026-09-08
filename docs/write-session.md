# Write-session lifecycle — implementation phase one

**Status:** component implemented, 2026-09-08. The implementation is
[`src/crdt/writeSession.ts`](../src/crdt/writeSession.ts), exported through the CRDT module.
It implements the permission/lifetime boundary of [SC-03](./storage-contract.md#sc-03--writer-lifetime-and-local-activation).
The [recorded execution](./storage-conformance-runs/2026-09-08-write-session.md) covers the component in
Chromium tabs and dedicated workers. Application wiring, factor custody and encrypted admission are
subsequent phases; none of the three earlier candidate implementations is changed by this component.

## Ownership and acquisition

`openWriteSession(slotId, options)` acquires a shared Web Lock before invoking `initialize` and returns
only after initialization succeeds. The exact slot identity produces `done/slot-writer/` followed by its
JSON string encoding. Every workspace and participating worker in that slot uses this same name. Content
and custody format versions do not enter it. This module coordinates a caller-supplied slot; the caller
must establish the slot's authority before loading its resources.

Each acquisition has a new session and task capabilities. `initialize` must reread durable state and
load the currently authorized keys on every acquisition. When initialization is supplied, `dispose` is
required by both the TypeScript interface and the runtime check. Hooks are captured at acquisition;
later edits to the options object cannot replace the cleanup callback. Disposal must also handle partial
initialization. The following illustrates the ownership pattern; the custody implementation is next:

```ts
let custody: Custody | null = null;
const session = await openWriteSession(slotId, {
  initialize: async task => {
    custody = await task.wait(() => loadCurrentCustody(slotId));
  },
  dispose: () => {
    custody = null;
  },
});
```

A missing/denied LockManager or insecure context refuses before initialization. An aborted acquisition
does not fall back to uncoordinated writes. This is feature refusal, not a complete supported-browser
policy: activation in the product still requires the lifecycle/platform validation and participating-version
cutover required by SC-03.

## Work and shutdown

`session.write(effect)` is the synchronous entry point for a future journal append. It checks the live
session before calling the effect and makes no lock request per edit. `session.run(operation)` creates
a task whose authority expires when the operation settles. Within it:

- `task.step(effect)` checks the session and task immediately before a synchronous effect.
- `task.wait(start)` checks before starting asynchronous work and after it settles. Native work stays
  registered until settlement, including when a caller forgets to await the returned promise.
- `task.signal` allows native operations to cooperate with shutdown. Cancellation never makes an
  unfinished operation count as quiesced.

TypeScript rejects async callbacks to `write` and `step`; JavaScript callers must follow the same rule.
Every side effect after an asynchronous boundary must use these checks. Raw keys, transactions and
unguarded callbacks must not escape their owning implementation. This component does not sandbox
same-origin code that deliberately bypasses the capability API.

`close()` invalidates synchronously, before dispatching abort listeners. New work and stale callbacks
then refuse. Its promise resolves only after outstanding work settles, `dispose` finishes, and the
native lock request completes its release. Repeated calls share the same completion and do not repeat
cleanup. Call close from the lifecycle owner; do not await it inside a task that close itself must drain.

The normal lifecycle is `opening → active → closing → closed`. Failed initialization also drains and
disposes before rejecting open and releasing its permit. **Failed cleanup enters `failed`, keeps all
write guards disabled, rejects close, and retains the native permit.** This implementation supplies no
timeout, forced release or cleanup retry that could falsely claim cached capabilities are gone; closing
the runtime destroys that holder. Logical cache disposal does not claim forensic memory zeroization.

A freeze retains the shared permit. `pagehide` invalidates the session so a restored document cannot
reuse it; it must reacquire and initialize afresh. The recorded navigation case created a new document,
so actual BFCache restoration remains unverified. Renderer/worker death releases the native holder
without depending on an application cleanup handler running.

## Exclusive access

The initiating writer first awaits `session.close()`, then calls
`withExclusiveSlot(slotId, operation, options)`. There is no in-place upgrade. Other writers can still
delay acquisition, including indefinitely while frozen. Read current transition state and any future
carrier census inside the exclusive operation, after the permit is granted; an earlier read is stale.

The exclusive helper uses the same task guards, initialization/disposal hooks and drain boundary. It
disposes and releases on an ordinary operation error. It supplies exclusion only: transition authority,
durable progress, complete opener coverage and retirement conditions belong to their later owners.
After release, ordinary writing requires a fresh shared session and another durable-state read.

## Verification and phase boundary

Run `pnpm storage:session`, or `node scripts/write-session/run.mjs`. This command is included in
`pnpm check`. It runs 13 real-browser component schedules and five isolated source mutants. Output goes
to a fresh ignored `test-results/write-session/` directory; `--output` selects another fresh directory,
`--case C04.stale-task` selects a subcase, and `--no-mutants` is available for investigation. Chromium
and project dependencies must already be installed. The fixture uses loopback port 5175, refuses a
conflicting listener, blocks external browser requests, and never opens the user's browser profile.

The runner freezes an immutable copy of the current component, records source/harness/dependency hashes,
retains assertions and browser observations, and applies mutants only to disposable copies. It reuses
the shared conformance reporter's inventory and mutation-crediting checks. A mutant counts only when
the original case passes and the mutant fails the named assertion; unrelated errors are not detection.

The fixtures hold real WebCrypto keys in a synthetic cache and make guarded localStorage probe writes.
Their generation value is test metadata. They do not implement or certify factor custody, encrypted
records, remote admission, a generation transition or opener retirement. Dedicated-worker tests exercise
the same production lifecycle module and namespace. Chromium evidence on this host does not establish
the full browser/authenticator support population, and no release debt is paid by the component result.

The next phase is mandatory-factor custody attached to this lifecycle, with its own bounded acceptance
criteria. Editor/receive admission and the complete storage/transition composition follow separately.
