/**
 * CH · The Chart.
 *
 * Deliberately a filterable list rather than a map: the universe is a
 * five-band log-scale hierarchy and any 2D projection of it would be a lie at
 * four of the five scales. What a pilot needs is not a picture, it is a name
 * and a bearing — and the bearing is drawn in the cockpit, against the actual
 * horizon, where it can be flown.
 *
 * The pin is the only stateful thing in the drawer, so it is the only thing
 * that lights: one row at a time, in atmo, and it says so in words.
 */
import { useMemo, useState } from 'react';
import { useGame, actions } from '../../../state/store';
import { waypoints, type Waypoint, type WaypointKind } from '../../../engine/waypoints';

const GROUPS: { id: WaypointKind | 'all'; label: string }[] = [
  { id: 'all', label: 'EVERYTHING' },
  { id: 'world', label: 'WORLDS' },
  { id: 'system', label: 'SYSTEMS' },
  { id: 'landmark', label: 'CHARTED' },
  { id: 'rig', label: 'RIGS' },
  { id: 'job', label: 'FREIGHT' },
];

const KIND_COLOR: Record<string, string> = {
  world: 'var(--bio)',
  system: 'var(--improbable)',
  landmark: 'var(--atmo)',
  rig: 'var(--thermal)',
  job: 'var(--magrathea)',
  seam: 'var(--thermal)',
};

export function Chart() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const [group, setGroup] = useState<WaypointKind | 'all'>('all');
  const [query, setQuery] = useState('');

  const all = useMemo(() => waypoints(s), [s, rev]);
  const pinned = s.expedition.pinned;

  const shown = all.filter((w) => {
    if (group !== 'all' && w.kind !== group) return false;
    if (group === 'all' && w.kind === 'seam') return true;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return w.label.toLowerCase().includes(q) || w.detail.toLowerCase().includes(q);
  });

  const setPin = (w: Waypoint) => actions.setWaypoint(pinned === w.id ? null : w.id);

  return (
    <>
      <p className="dr-note">
        Everywhere the Guide is presently willing to admit exists. Pin one and the cockpit
        will carry a bearing to it. The department accepts no responsibility for what is
        actually there on arrival.
      </p>

      <div className="dr-filters">
        <div className="dr-filter-row">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              className={`dr-filter${group === g.id ? ' on' : ''}`}
              onClick={() => setGroup(g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>
        <input
          className="dr-search"
          value={query}
          placeholder="filter by name…"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter waypoints"
        />
      </div>

      {shown.length === 0 && (
        <p className="dr-note">
          Nothing under that heading. The chart is provisional; so, frequently, is the universe.
        </p>
      )}

      {shown.map((w) => (
        <button
          key={w.id}
          className={`dr-wp${pinned === w.id ? ' on' : ''}`}
          onClick={() => setPin(w)}
          aria-pressed={pinned === w.id}
        >
          <span className="dr-wp-copy">
            <b>{w.label}</b>
            <em>{w.detail}</em>
          </span>
          <span className="dr-wp-kind" style={{ color: KIND_COLOR[w.kind] ?? 'var(--ink-faint)' }}>
            {w.kind}
          </span>
          <span className="dr-wp-pin">{pinned === w.id ? 'PINNED' : 'PIN'}</span>
        </button>
      ))}
      <div style={{ height: 20 }} />
    </>
  );
}
