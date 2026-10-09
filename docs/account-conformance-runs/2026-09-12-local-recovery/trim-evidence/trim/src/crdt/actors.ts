/**
 * Actors (PRD §11, TRD §4.8).
 *
 * One user is not one actor. In Phase 1 two actors exist — the human, and the
 * system actor that will perform compaction, import and bulk operations. No
 * system operation exists yet, but the origin plumbing does, because undo
 * scoping is what the actor model is for and retrofitting an origin through a
 * write path afterwards is how the compaction-reverts-on-undo bug happens.
 *
 * Storage split per TRD §4.8:
 *   - the roster lives in mergeable `meta[actor:<id>]` entries, and syncs
 *   - which actor this client is lives in localStorage, and does not
 *   - device identity lives in localStorage, and does not
 */

import { newId } from '../lib/id';
import { readLocal, readLocalJson, writeLocal, writeLocalJson } from '../lib/localStore';
import { Y, transact, type YDoc, type YMap } from './yjs';

export type ActorKind = 'human' | 'agent' | 'system';
export type ActorId = string;

export interface Actor {
  kind: ActorKind;
  name: string;
  color: string;
}

/**
 * A transaction origin. Identity matters: `Y.UndoManager` matches
 * `trackedOrigins` by object identity, so each actor has exactly one origin
 * instance that every one of its writes reuses.
 */
export interface Origin {
  readonly actor: ActorId;
  readonly kind: ActorKind;
  readonly device: string;
}

const ACTOR_KEY = 'done.actor';
const DEVICE_KEY = 'done.device';
const ACTOR_PREFIX = 'actor:';

/** Distinguishable at a glance and legible on both themes. */
const COLORS = ['#e0662f', '#3f8fd6', '#5aab63', '#b45cc4', '#c9a227', '#3fa9a3'];

/** The system actor is a constant: it is the app, and it is the same app everywhere. */
export const SYSTEM_ACTOR_ID: ActorId = 'system';

const guessDeviceName = (): string => {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad/i.test(ua)) return 'iOS';
  if (/Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'this device';
};

export interface Device {
  id: string;
  name: string;
}

export const localDevice = (): Device => {
  const stored = readLocalJson(DEVICE_KEY);
  if (typeof stored?.['id'] === 'string' && typeof stored['name'] === 'string') {
    return { id: stored['id'], name: stored['name'] };
  }
  const device: Device = { id: newId(), name: guessDeviceName() };
  writeLocalJson(DEVICE_KEY, device);
  return device;
};

/**
 * The device's friendly name, editable in settings. It is the label that shows
 * up on the *other* device as "last synced from ⟨device⟩" (PRD §11.3), so it is
 * worth being able to change from "Android" to something you recognise.
 */
export const renameLocalDevice = (name: string): Device | null => {
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  const device: Device = { ...localDevice(), name: trimmed };
  writeLocalJson(DEVICE_KEY, device);
  return device;
};

const actorKey = (id: ActorId): string => `${ACTOR_PREFIX}${id}`;

const isActor = (value: unknown): value is Actor => {
  if (!value || typeof value !== 'object') return false;
  const actor = value as Record<string, unknown>;
  return (
    (actor['kind'] === 'human' || actor['kind'] === 'agent' || actor['kind'] === 'system') &&
    typeof actor['name'] === 'string' &&
    typeof actor['color'] === 'string'
  );
};

/**
 * Schema-v2 stored a nested `Y.Map` at `meta.actors`. Two fresh replicas could
 * concurrently create different maps at that one key, and Yjs would retain one
 * whole map rather than merge the entries inside them. Actor entries are flat
 * values in `meta` now, so distinct ids are distinct CRDT keys and merge.
 */
const migrateLegacyRoster = (meta: YMap<unknown>): void => {
  const legacy = meta.get('actors');
  if (!(legacy instanceof Y.Map)) return;
  for (const [id, value] of legacy.entries()) {
    if (isActor(value) && !meta.has(actorKey(id))) meta.set(actorKey(id), value);
  }
};

const actorFrom = (meta: YMap<unknown>, id: ActorId): Actor | undefined => {
  const value = meta.get(actorKey(id));
  if (isActor(value)) return value;

  // Read old documents before their migration transaction has run.
  const legacy = meta.get('actors');
  const old = legacy instanceof Y.Map ? legacy.get(id) : undefined;
  return isActor(old) ? old : undefined;
};

/**
 * The set of actors the local human can see. Phase 1 shows none of this;
 * it exists so the roster is populated correctly from the first write.
 */
export interface ActorContext {
  id: ActorId;
  actor: Actor;
  device: Device;
  /** Origin for changes the human makes. Tracked by undo. */
  origin: Origin;
  /** Origin for changes the app makes on the human's behalf. Never tracked by undo. */
  systemOrigin: Origin;
}

/** Identity comes from the owning application, before private document preparation. */
export interface WorkspaceActorIdentity {
  readonly id: ActorId;
  readonly actor: Actor;
  readonly device: Device;
}
export const registerWorkspaceActor = (
  doc: YDoc,
  identity: WorkspaceActorIdentity,
): ActorContext => {
  if (
    !identity.id ||
    identity.id === SYSTEM_ACTOR_ID ||
    identity.actor.kind !== 'human' ||
    !identity.actor.name.trim() ||
    !/^#[0-9a-f]{6}$/iu.test(identity.actor.color) ||
    !identity.device.id
  )
    throw Error('A valid human workspace actor is required.');
  const meta = doc.getMap('meta'),
    device = { ...identity.device };
  const systemOrigin: Origin = Object.freeze({
    actor: SYSTEM_ACTOR_ID,
    kind: 'system',
    device: device.id,
  });
  transact(doc, systemOrigin, () => {
    migrateLegacyRoster(meta);
    const existing = actorFrom(meta, identity.id);
    if (existing && existing.kind !== 'human')
      throw Error('Workspace actor kind conflicts with local identity.');
    if (!existing) meta.set(actorKey(identity.id), { ...identity.actor });
    if (!actorFrom(meta, SYSTEM_ACTOR_ID))
      meta.set(actorKey(SYSTEM_ACTOR_ID), { kind: 'system', name: 'done', color: '#8a8a8a' });
  });
  return {
    id: identity.id,
    actor: { ...actorFrom(meta, identity.id)! },
    device,
    origin: Object.freeze({ actor: identity.id, kind: 'human', device: device.id }),
    systemOrigin,
  };
};

/**
 * Resolves the local actor, creating one on first run, and makes sure both it
 * and the system actor are in the synced roster.
 */
export const resolveActor = (doc: YDoc, meta: YMap<unknown>): ActorContext => {
  const device = localDevice();

  let id = readLocal(ACTOR_KEY);
  if (!id) {
    id = newId();
    writeLocal(ACTOR_KEY, id);
  }

  const systemOrigin: Origin = Object.freeze({
    actor: SYSTEM_ACTOR_ID,
    kind: 'system' as const,
    device: device.id,
  });

  // Roster registration is bookkeeping, not something the human typed, so it
  // is attributed to the system actor and stays out of the undo stack.
  transact(doc, systemOrigin, () => {
    migrateLegacyRoster(meta);
  });

  const existing = actorFrom(meta, id);
  const actor: Actor = existing ?? {
    kind: 'human',
    name: 'You',
    color: COLORS[Math.floor(Math.random() * COLORS.length)] as string,
  };

  transact(doc, systemOrigin, () => {
    if (!existing) meta.set(actorKey(id as ActorId), actor);
    if (!actorFrom(meta, SYSTEM_ACTOR_ID)) {
      meta.set(actorKey(SYSTEM_ACTOR_ID), {
        kind: 'system',
        name: 'done',
        color: '#8a8a8a',
      });
    }
  });

  return {
    id,
    actor,
    device,
    origin: Object.freeze({ actor: id, kind: 'human' as const, device: device.id }),
    systemOrigin,
  };
};

export const listActors = (doc: YDoc): Array<{ id: ActorId } & Actor> => {
  const meta = doc.getMap('meta');
  return [...meta.entries()].flatMap(([key, value]) => {
    if (!key.startsWith(ACTOR_PREFIX) || !isActor(value)) return [];
    return [{ id: key.slice(ACTOR_PREFIX.length), ...value }];
  });
};

export const actorById = (doc: YDoc, id: ActorId): Actor | undefined =>
  actorFrom(doc.getMap('meta'), id);

export const updateActor = (
  doc: YDoc,
  origin: Origin,
  id: ActorId,
  patch: Partial<Pick<Actor, 'name' | 'color'>>,
): Actor | null => {
  const meta = doc.getMap('meta');
  const current = actorFrom(meta, id);
  if (!current || current.kind !== 'human') return null;

  const name = patch.name ?? current.name;
  const color = patch.color ?? current.color;
  if (name.trim().length === 0 || !/^#[0-9a-f]{6}$/iu.test(color)) return null;

  const next = { ...current, name, color };
  transact(doc, origin, () => meta.set(actorKey(id), next));
  return next;
};
