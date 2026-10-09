export const cases = [
  ['shared-scope', 'Shared writers coexist; another slot remains independent'],
  [
    'freeze-barrier',
    'Frozen and remaining writers block exclusivity and subsequent initialization',
  ],
  ['drain-cleanup', 'Close invalidates immediately and waits for work and cache cleanup'],
  ['detached-work', 'Native work remains pinned even when its caller forgot to await it'],
  ['stale-task', 'Finished task callbacks cannot write; reacquisition reads fresh state'],
  ['cancel-queued', 'Cancelled queued acquisition never initializes'],
  ['cancel-initialize', 'Cancellation during initialization drains and disposes before release'],
  ['initialize-error', 'Failed initialization cleans partial resources and releases'],
  ['cleanup-error', 'Failed cleanup retains exclusion until actual context death'],
  ['renderer-death', 'Renderer death releases the permit without application disposal'],
  ['worker-lifetime', 'Dedicated workers participate in the same slot barrier'],
  ['exclusive-error', 'Exclusive operation failure releases through the same cleanup boundary'],
  ['navigation', 'Navigation never revives a writable pre-navigation session'],
].map(([id, title]) => ({ id: `C04.${id}`, title }));

export const mutants = [
  {
    id: 'split-coordination-domain',
    case: 'C04.freeze-barrier',
    assertion: 'frozen-writer-blocks-exclusive',
    from: 'const name = slotPermitName(slotId);',
    to: "const name = slotPermitName(slotId) + (mode === 'exclusive' ? '/split' : '');",
  },
  {
    id: 'ignore-session-invalidation',
    case: 'C04.drain-cleanup',
    assertion: 'closing-callback-cannot-write',
    from: "if (state !== 'active' && !(initializing && state === 'opening')) throw inactive();",
    to: 'void initializing; // removed session validity check',
  },
  {
    id: 'release-before-drain',
    case: 'C04.detached-work',
    assertion: 'detached-work-precedes-disposal',
    from: 'await drain();',
    to: 'void drain; // removed drain boundary',
  },
  {
    id: 'skip-cache-cleanup',
    case: 'C04.drain-cleanup',
    assertion: 'cache-cleared-before-exclusive',
    from: 'if (granted) await dispose?.();',
    to: 'void granted; // removed cache cleanup',
  },
  {
    id: 'reuse-finished-task',
    case: 'C04.stale-task',
    assertion: 'finished-task-cannot-write',
    from: 'if (!live) throw inactive();',
    to: 'void live; // removed task validity check',
  },
];
