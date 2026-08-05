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
 *   - the roster lives in `meta.actors`, and syncs
 *   - which actor this client is lives in localStorage, and does not
 *   - device identity lives in localStorage, and does not
 */

import { newId } from '../lib/id';
import { newMap, transact, type YDoc, type YMap } from './yjs';

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

/** Distinguishable at a glance and legible on both themes. */
const COLORS = ['#e0662f', '#3f8fd6', '#5aab63', '#b45cc4', '#c9a227', '#3fa9a3'];

/** The system actor is a constant: it is the app, and it is the same app everywhere. */
export const SYSTEM_ACTOR_ID: ActorId = 'system';

const readLocal = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // Private mode, disabled storage. A generated id still works for the session.
  }
};

const writeLocal = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* see readLocal */
  }
};

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
  const stored = readLocal(DEVICE_KEY);
  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && 'id' in parsed && 'name' in parsed) {
        return parsed as Device;
      }
    } catch {
      /* fall through and regenerate */
    }
  }
  const device: Device = { id: newId(8), name: guessDeviceName() };
  writeLocal(DEVICE_KEY, JSON.stringify(device));
  return device;
};

const actorRoster = (doc: YDoc): YMap<Actor> => doc.getMap('meta').get('actors') as YMap<Actor>;

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

/**
 * Resolves the local actor, creating one on first run, and makes sure both it
 * and the system actor are in the synced roster.
 */
export const resolveActor = (doc: YDoc, meta: YMap<unknown>): ActorContext => {
  const device = localDevice();

  let id = readLocal(ACTOR_KEY);
  if (!id) {
    id = newId(8);
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
    if (!meta.has('actors')) meta.set('actors', newMap<Actor>());
  });

  const roster = actorRoster(doc);

  const existing = roster.get(id);
  const actor: Actor = existing ?? {
    kind: 'human',
    name: 'You',
    color: COLORS[Math.floor(Math.random() * COLORS.length)] as string,
  };

  transact(doc, systemOrigin, () => {
    if (!existing) roster.set(id as ActorId, actor);
    if (!roster.has(SYSTEM_ACTOR_ID)) {
      roster.set(SYSTEM_ACTOR_ID, { kind: 'system', name: 'done', color: '#8a8a8a' });
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
  const roster = actorRoster(doc);
  if (!roster) return [];
  return [...roster.entries()].map(([id, actor]) => ({ id, ...actor }));
};
