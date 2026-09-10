# Row 21 — the author's development cutover

**Selected by the author, 2026-09-10.** There is no deployed instance or external user. The only migration
is the author's development installation. The author explicitly accepts the existing private importer.

Use `markdown-system-v1`: preserve master/Goals text, day files, section and visible order, all frozen dates,
uncapped imported collections and unfiled bodies. Give cards fresh IDs, system attribution, null origin and
the import timestamp. Actor/device/settings metadata and CRDT history are not restored. A full fidelity
archive and a general user-facing Markdown ZIP importer remain separate work.

The current private importer accepts a verified diagnostic recovery packet and a source/policy binding.
The raw packet is plaintext backup material; it is not the portable encrypted archive. A Markdown ZIP or
relay `.ydoc` is useful recovery material but cannot simply be passed to this API or substituted for source
authentication and cleanup authority. Import slices, fresh key/counter scope, dependency checks, cold
selection and exact authenticated cleanup retain their existing contracts.

The author controls all browser interactions and can stop editing and disconnect the sole old client.
Use a documented operator-assisted capture/recovery/import procedure. Stop the automatic migration-host
research (including the Linux VM, managed browser policy and protocol-reader parity) as active cutover work;
preserve its evidence as a bounded experiment, not a product dependency. Any remaining old-source deletion
needs its actual preconditions; this scope decision alone is not proof that old writers cannot return.

Readable Markdown and older/newer relay snapshots were backed up outside the repository. Offline replay of
the newly synced snapshot reproduced all 24 files in the author's pre-sync export byte-for-byte and had no
pending Yjs dependencies. The temporary relay was shut down and its Tailscale route removed, restoring the
prior configuration. Private backup contents and identifiers are not checked in. This was backup validation,
not import, active selection or source cleanup.

The next implementation is application integration: first Local startup/code confirmation/unlock, then all
editor mutation surfaces through admission, then rehearse the actual private import and cutover. Existing
conformance debts and independent review requirements remain; this decision pays no technical debt.
