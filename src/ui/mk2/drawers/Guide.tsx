/**
 * GD · The Guide.
 *
 * The old panel was one enormous scroll: the current world, then the channel,
 * then the Deep Field, then an atlas that runs to hundreds of worlds deep in a
 * commission, then the entries. Anything below the atlas was, in practice,
 * unreachable.
 *
 * So Mk II files it in four tabs, in the order you actually want them: where
 * you are, how the thing works, what you have earned, and what the universe
 * has been saying. Nothing is nested more than one level deep, because a Guide
 * you have to navigate is a Guide nobody reads.
 */
import { useState } from 'react';
import { actions, useGame } from '../../../state/store';
import { ACHIEVEMENTS } from '../../../content/achievements';
import { PLANET_TYPE_BY_ID } from '../../../content/planetTypes';
import { QUIRK_BY_ID } from '../../../content/quirks';
import { SURVEY_BY_ID } from '../../../content/surveys';
import { DEEP_FIELD } from '../../../content/deepField';
import { C } from '../../../content/constants';
import type { AspectId } from '../../../engine/types';
import { formatDuration } from '../../../engine/num';
import { guideIllustration } from '../../assets';
import { FieldManual } from '../../panels/FieldManual';
import { worldBiography, worldRecord, worldTraits } from '../../../engine/worldRecords';
import { standingOf } from '../../../engine/situations';

const TABS = ['world', 'manual', 'entries', 'channel'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  world: 'WORLD',
  manual: 'MANUAL',
  entries: 'ENTRIES',
  channel: 'CHANNEL',
};

const ASPECT_LABEL: Record<AspectId, string> = {
  thermal: 'Thermal',
  atmo: 'Atmospheric',
  hydro: 'Hydrologic',
  bio: 'Biotic',
};

const ASPECT_COLOR: Record<AspectId, string> = {
  thermal: 'var(--thermal)',
  atmo: 'var(--atmo)',
  hydro: 'var(--hydro)',
  bio: 'var(--bio)',
};

/** Where you are, and every world this commission has already filed. */
function World() {
  const { s } = useGame.getState();
  const p = s.planet;
  const typeDef = PLANET_TYPE_BY_ID[p.type];

  return (
    <>
      <div className="dr-card lit">
        <span className="dr-sec-k" style={{ color: 'var(--atmo)' }}>Current world</span>
        <div className="dr-card-name">{p.name}</div>
        <div className="dr-card-body">
          {typeDef?.label} · {p.size} · planet #{p.lifetimeIndex} of your career
        </div>
        {p.quirks.map((q) => (
          <div key={q} className="dr-card-note">{QUIRK_BY_ID[q]?.text ?? q}</div>
        ))}
        {p.survey && (
          <div className="dr-card-note" style={{ color: 'var(--atmo)' }}>
            Survey: {SURVEY_BY_ID[p.survey]?.name} — {SURVEY_BY_ID[p.survey]?.text}
          </div>
        )}
        <div className="dr-card-body" style={{ marginTop: 8 }}>{typeDef?.guide}</div>
      </div>

      {s.run.completedPlanets.length > 0 && (
        <>
          <div className="dr-sec">
            <span className="dr-sec-k">Commission atlas</span>
            <span className="dr-rule" />
            <span className="dr-sec-note">{s.run.completedPlanets.length} FILED</span>
          </div>
          <p className="dr-note">
            Designate one world for heritage review before selling this commission. You may
            change the candidate freely; the selected world is archived at prestige.
          </p>
          {[...s.run.completedPlanets].reverse().map((world) => {
            const isCandidate =
              s.operations.heritageCandidateLifetimeIndex === world.lifetimeIndex;
            const isArchived = s.operations.heritageWorlds.some(
              (h) => h.lifetimeIndex === world.lifetimeIndex,
            );
            const record = worldRecord(s, world.lifetimeIndex);
            const standing = standingOf(s, world.lifetimeIndex);
            const traits = record ? worldTraits(record, standing) : [];
            return (
              <div key={`${world.lifetimeIndex}-${world.seed}`} className="dr-world">
                <div className="dr-world-head">
                  <b>{world.name}</b>
                  <span>WORLD #{world.lifetimeIndex}</span>
                </div>
                <div className="dr-chips">
                  <span style={{ color: ASPECT_COLOR[world.bottleneck] }}>
                    {ASPECT_LABEL[world.bottleneck].toUpperCase()} BOTTLENECK
                  </span>
                  {traits.map((t) => <span key={t}>{t}</span>)}
                </div>
                {record && <p className="dr-world-bio">{worldBiography(record, standing)}</p>}
                <div className="dr-world-foot">
                  {isCandidate && <span className="dr-chip" style={{ borderColor: 'rgba(90,215,232,.4)', color: 'var(--atmo)' }}>CURRENT CANDIDATE</span>}
                  {isArchived && <span className="dr-chip">HERITAGE WORLD</span>}
                  {!isArchived && (
                    <button
                      className="dr-btn"
                      onClick={() => actions.designateHeritage(world.lifetimeIndex)}
                    >
                      {isCandidate ? 'DESIGNATED' : 'DESIGNATE'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
      <div style={{ height: 20 }} />
    </>
  );
}

/** What you have earned, and what has not been written yet. */
function Entries() {
  const { s } = useGame.getState();
  const unlocked = Object.keys(s.achievements).length;

  return (
    <>
      <div className="dr-sec">
        <span className="dr-sec-k" style={{ color: 'var(--improbable)' }}>Guide entries</span>
        <span className="dr-rule" />
        <span className="dr-sec-note">{unlocked} / {ACHIEVEMENTS.length}</span>
      </div>
      <p className="dr-note">
        Each entry improves production by {Math.round(C.ACHIEVEMENT_BONUS * 100)}%. The Guide
        considers this a rounding error and you a delight.
      </p>
      {ACHIEVEMENTS.map((a) => {
        const got = s.achievements[a.id] !== undefined;
        if (!got && a.hidden) return null;
        return (
          <div key={a.id} className={`dr-entry${got ? ' on' : ''}`}>
            <img src={guideIllustration(a.id)} alt="" aria-hidden />
            <span>
              <b>{got ? a.name : '?????'}</b>
              <em>{got ? a.guide : 'Entry not yet written.'}</em>
            </span>
          </div>
        );
      })}
      <div style={{ height: 20 }} />
    </>
  );
}

/** The open channel, and the catalogue of what is out there. */
function Channel() {
  const { s } = useGame.getState();
  const log = s.subEtha.log;
  const ago = (atMs: number) => {
    const delta = Math.max(0, s.gameTimeMs - atMs);
    return delta < 60_000 ? 'just now' : `${formatDuration(delta)} ago`;
  };

  const scannedCount = Object.keys(s.expedition.discovered).length;

  return (
    <>
      <div className="dr-sec">
        <span className="dr-sec-k">The Sub-Etha</span>
        <span className="dr-rule" />
        <span className="dr-sec-note">{log.length} FILED</span>
      </div>
      <p className="dr-note">
        Open channel. Colonial traffic, editorial revisions, Vogon administration, and
        unverified sightings. It keeps filing while you are away.
      </p>
      {log.length === 0 ? (
        <p className="dr-note">
          The channel is open and carrying nothing. This is normal, and will not last.
        </p>
      ) : (
        [...log].reverse().map((entry) => (
          <div key={entry.id} className="dr-log">
            <span className="dr-log-when">{ago(entry.atMs)}</span>
            <span className="dr-log-body">
              {entry.text}
              {entry.site && s.expedition.discovered[entry.site] !== undefined && (
                <i> · found</i>
              )}
            </span>
          </div>
        ))
      )}

      <div className="dr-sec">
        <span className="dr-sec-k" style={{ color: 'var(--atmo)' }}>The Deep Field</span>
        <span className="dr-rule" />
        <span className="dr-sec-note">{scannedCount} / {DEEP_FIELD.length}</span>
      </div>
      <p className="dr-note">
        Everything the sensors have resolved. An entry is written when you scan it, and
        annotated when you go aboard.
      </p>
      {DEEP_FIELD.map((def) => {
        const scanned = s.expedition.discovered[def.id] !== undefined;
        const boarded = s.expedition.boarded[def.id] !== undefined;
        return (
          <div key={def.id} className={`dr-df${scanned ? ' on' : ''}`}>
            <div className="dr-df-head">
              <b>{scanned ? def.name : def.contact}</b>
              {boarded && <span className="dr-chip">BOARDED</span>}
            </div>
            {scanned ? (
              <>
                <p className="dr-world-bio">{def.entry}</p>
                {boarded && <p className="dr-world-bio" style={{ color: 'var(--bio)' }}>{def.boarding}</p>}
              </>
            ) : (
              <p className="dr-world-bio" style={{ opacity: .6 }}>
                Unwritten. Fly out and hold engage on it.
              </p>
            )}
          </div>
        );
      })}
      <div style={{ height: 20 }} />
    </>
  );
}

export function Guide() {
  const rev = useGame((g) => g.rev);
  void rev;
  const [tab, setTab] = useState<Tab>('world');

  return (
    <>
      <div className="dr-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`dr-tab${tab === t ? ' on' : ''}`}
            onClick={() => setTab(t)}
            aria-selected={tab === t}
            role="tab"
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      {tab === 'world' && <World />}
      {tab === 'manual' && <FieldManual />}
      {tab === 'entries' && <Entries />}
      {tab === 'channel' && <Channel />}
    </>
  );
}
