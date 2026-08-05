/**
 * The menu (PRD §7.3).
 *
 * Calendar picker and search belong to Phase 4, so what is here is what Phase 1
 * has to say: whether the browser has promised to keep the data, which actor
 * this client is, and which device it is acting through. The first is a
 * requirement — a local-first app that can be silently evicted should say so
 * (TRD §6.1).
 */

import type { ActorContext, StoragePersistence } from '../crdt';

const STORAGE_LABEL: Record<StoragePersistence, string> = {
  granted: 'Persistent',
  denied: 'Best-effort',
  unsupported: 'Unknown',
  unknown: 'Not yet asked',
};

const STORAGE_NOTE: Record<StoragePersistence, string> = {
  granted: 'The browser has agreed not to evict this data on its own.',
  denied:
    'The browser may evict this data under storage pressure. Export is the backup story until sync exists.',
  unsupported: 'This browser does not report whether storage is durable.',
  unknown: 'Durable storage is requested on your first edit.',
};

export interface MenuProps {
  actor: ActorContext;
  storage: StoragePersistence;
  /** The shell measures the panel to turn a drag into a fraction of its width. */
  ref?: React.Ref<HTMLElement>;
}

export const Menu = ({ actor, storage, ref }: MenuProps): React.ReactElement => (
  <aside className="menu" id="menu" aria-label="Menu" ref={ref}>
    <section className="menu-section">
      <h2 className="menu-heading">Storage</h2>
      <div className="menu-row">
        <span>Local data</span>
        <span className="menu-value">{STORAGE_LABEL[storage]}</span>
      </div>
      <p className="menu-note">{STORAGE_NOTE[storage]}</p>
    </section>

    <section className="menu-section">
      <h2 className="menu-heading">This client</h2>
      <div className="menu-row">
        <span>Actor</span>
        <span className="menu-value">
          <span
            className="actor-swatch"
            style={{ '--actor-color': actor.actor.color } as React.CSSProperties}
          />
          {actor.actor.name}
        </span>
      </div>
      <div className="menu-row">
        <span>Device</span>
        <span className="menu-value">{actor.device.name}</span>
      </div>
    </section>

    <section className="menu-section">
      <h2 className="menu-heading">Phase 1</h2>
      <p className="menu-note">
        The editor, one document, local storage. No sync, no days, no cards — those are Phase 2 and
        Phase 3.
      </p>
    </section>
  </aside>
);
