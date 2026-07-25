import { useMemo, useState } from 'react';
import { useGame, actions } from '../../state/store';
import { waypoints, type Waypoint, type WaypointKind } from '../../engine/waypoints';

/**
 * The chart. One list of everywhere you could go, and a pin that points the
 * cockpit at one of them.
 *
 * Deliberately a plain filterable list rather than a map: the universe is a
 * five-band log-scale hierarchy and any 2D projection of it would be a lie at
 * four of the five scales. What a pilot needs is not a picture, it is a name
 * and a bearing — and the bearing is drawn in the cockpit, where it belongs,
 * against the actual horizon.
 */

const GROUPS: { id: WaypointKind | 'all'; label: string }[] = [
  { id: 'all', label: 'everything' },
  { id: 'world', label: 'worlds' },
  { id: 'system', label: 'systems' },
  { id: 'landmark', label: 'charted' },
  { id: 'rig', label: 'rigs' },
  { id: 'job', label: 'freight' },
];

function KindChip({ kind }: { kind: WaypointKind }) {
  return <span className={`cp-kind cp-${kind}`}>{kind}</span>;
}

export function ChartPanel() {
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

  const setPin = (w: Waypoint) => {
    actions.setWaypoint(pinned === w.id ? null : w.id);
  };

  return (
    <div>
      <div className="panel-h">Civil Navigation, Provisional</div>
      <p className="panel-sub">
        Everywhere the Guide is presently willing to admit exists. Pin one and the cockpit
        will carry a bearing to it. The department accepts no responsibility for what is
        actually there on arrival.
      </p>

      <div className="cp-controls">
        <div className="cp-groups">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              className={`cp-group${group === g.id ? ' on' : ''}`}
              onClick={() => setGroup(g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>
        <input
          className="cp-search"
          value={query}
          placeholder="filter by name…"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter waypoints"
        />
      </div>

      {shown.length === 0 && (
        <p className="panel-sub">
          Nothing under that heading. The chart is provisional; so, frequently, is the
          universe.
        </p>
      )}

      <div className="cp-list">
        {shown.map((w) => (
          <button
            key={w.id}
            className={`cp-row${pinned === w.id ? ' pinned' : ''}`}
            onClick={() => setPin(w)}
            aria-pressed={pinned === w.id}
          >
            <span className="cp-main">
              <b>{w.label}</b>
              <em>{w.detail}</em>
            </span>
            <KindChip kind={w.kind} />
            <span className="cp-pin">{pinned === w.id ? 'pinned' : 'pin'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
