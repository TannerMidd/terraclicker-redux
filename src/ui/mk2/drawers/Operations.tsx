/**
 * OP · Operations.
 *
 * Four separate businesses shared one scroll in Mk I — filings, monuments,
 * routes and the heritage registry — and the monuments in the middle meant
 * nobody ever reached the registry at the bottom. Mk II gives each its own
 * tab, in the order they matter: what is filed now, what is being built over
 * days, where the routes are pointed, and what will outlive all of it.
 *
 * The ledger stays above the tabs, because faction standing is the one number
 * that governs all four.
 */
import { useState } from 'react';
import { actions, useGame } from '../../../state/store';
import {
  CONTRACT_TEMPLATE_META,
  FACTION_META,
  SPECIALTIES,
  SPECIALTY_META,
  contractRewardText,
  objectiveRule,
  objectiveTarget,
  objectiveText,
} from '../../../content/contracts';
import { specialtiesForSystem } from '../../../engine/operations';
import { C } from '../../../content/constants';
import { formatDuration } from '../../../engine/num';
import { AspectGlyph } from '../../assets';
import { MegaprojectSection, FreightSection, RigSection } from '../../panels/ExpansionSections';

const TABS = ['filings', 'works', 'dispatch', 'heritage'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  filings: 'FILINGS',
  works: 'WORKS',
  dispatch: 'DISPATCH',
  heritage: 'HERITAGE',
};

const FACTION_COLOR: Record<string, string> = {
  magrathea: 'var(--magrathea)',
  mice: 'var(--improbable)',
  vogon: 'var(--vogon, #8a8f5a)',
};

function Filings() {
  const { s } = useGame.getState();
  const ops = s.operations;

  if (ops.active) {
    const active = ops.active;
    const offer = active.offer;
    const template = CONTRACT_TEMPLATE_META[offer.templateId];
    const faction = FACTION_META[offer.faction];
    const target = objectiveTarget(offer.objective);
    const pct = target > 0 ? Math.min(100, (active.progress / target) * 100) : 100;
    const remaining =
      active.deadlineAtGameMs === null
        ? null
        : Math.max(0, active.deadlineAtGameMs - s.gameTimeMs);

    return (
      <>
        <div className="dr-card lit">
          <div className="dr-card-head">
            <span className="dr-sec-k" style={{ color: 'var(--atmo)' }}>Accepted filing</span>
            <span className="dr-sec-k" style={{ color: FACTION_COLOR[offer.faction] }}>
              {faction.label}
            </span>
          </div>
          <div className="dr-card-name">{template.name}</div>
          <div className="dr-card-body">{objectiveText(offer.objective)}</div>
          <div className="dr-card-head" style={{ marginTop: 11 }}>
            <b className="dr-card-clock" style={{ color: 'var(--ink)' }}>
              {active.progress} / {target}
            </b>
            <span className="dr-card-clock" style={{ color: 'var(--improbable)' }}>
              {remaining === null ? 'No deadline' : `${formatDuration(remaining)} remaining`}
            </span>
          </div>
          <div className="dr-meter"><i style={{ width: `${pct}%` }} /></div>
          <div className="dr-card-head" style={{ marginTop: 11 }}>
            <span className="dr-card-clock" style={{ color: 'var(--improbable)' }}>
              {contractRewardText(offer.rewardBp, offer.rewardReputation)}
            </span>
            <button className="dr-btn" onClick={() => actions.abandonContract()}>WITHDRAW</button>
          </div>
        </div>
        <p className="dr-note">
          {objectiveRule(offer.objective)} A missed deadline or commission reset closes the file
          unpaid. You may also withdraw at any time. No TU, BP, or reputation is deducted.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="dr-sec">
        <span className="dr-sec-k">Acceptance board</span>
        <span className="dr-rule" />
        <button
          className="dr-btn"
          disabled={ops.rerolledAtSystem === s.run.systems}
          onClick={() => actions.rerollContracts()}
        >
          REISSUE
        </button>
      </div>
      <p className="dr-note">
        Three deterministic offers. Accepting one removes the others until the filing is
        completed or closed.
      </p>
      {ops.offers.length === 0 ? (
        <p className="dr-note">The board is being stamped. This is not a metaphor.</p>
      ) : (
        ops.offers.map((offer) => {
          const template = CONTRACT_TEMPLATE_META[offer.templateId];
          const faction = FACTION_META[offer.faction];
          const window =
            offer.objective.kind === 'timed'
              ? ` Filing window: ${formatDuration(offer.objective.durationMs)}.`
              : '';
          return (
            <button
              key={offer.id}
              className="dr-offer-row"
              onClick={() => actions.acceptContract(offer.id)}
              aria-label={`Accept ${template.name} from ${faction.label}`}
            >
              <span className="dr-card-head">
                <span className="dr-sec-k" style={{ color: FACTION_COLOR[offer.faction] }}>
                  {faction.label}
                </span>
                <span className="dr-card-clock" style={{ color: 'var(--improbable)', fontWeight: 600 }}>
                  {contractRewardText(offer.rewardBp, offer.rewardReputation)}
                </span>
              </span>
              <b>{template.name}</b>
              <em>{objectiveText(offer.objective)}{window}</em>
              <i>{objectiveRule(offer.objective)}</i>
            </button>
          );
        })
      )}
      <div style={{ height: 20 }} />
    </>
  );
}

function Dispatch() {
  const { s, d } = useGame.getState();
  const ops = s.operations;
  const used = d.dispatchesUsed;
  const slots = d.dispatchSlots;

  return (
    <>
      <div className="dr-sec">
        <span className="dr-sec-k">System dispatch</span>
        <span className="dr-rule" />
        <span className="dr-sec-note">
          {Math.max(0, slots - used)} / {slots} FREE
        </span>
      </div>
      <p className="dr-note">
        A system can only run routes its history justifies: an aspect route needs a member world
        with that recorded bottleneck, Science needs two surveyed worlds, and Production is
        always legal, like paperwork. Assignments may be changed without cost.
      </p>

      {s.run.systems === 0 ? (
        <p className="dr-note">
          No formed systems. {C.PLANETS_PER_SYSTEM} completed worlds usually persuade gravity to
          file one.
        </p>
      ) : (
        Array.from({ length: s.run.systems }, (_, i) => {
          const current = ops.systemSpecialties[String(i)] ?? null;
          const canAssign = current !== null || used < slots;
          const eligible = specialtiesForSystem(s, i);
          return (
            <section className="dr-system" key={i}>
              <div className="dr-world-head">
                <b style={{ fontFamily: 'var(--sans)', fontSize: 13 }}>System {i + 1}</b>
                <span style={{ color: current ? 'var(--atmo)' : 'var(--ink-label)' }}>
                  {current ? `${SPECIALTY_META[current].label.toUpperCase()} ROUTE` : 'UNASSIGNED'}
                </span>
              </div>
              <div className="dr-routes" role="group" aria-label={`System ${i + 1} specialty`}>
                {SPECIALTIES.map((sp) => {
                  const meta = SPECIALTY_META[sp];
                  const selected = current === sp;
                  const ok = eligible.includes(sp);
                  const blocked = !selected && (!ok || !canAssign);
                  return (
                    <button
                      key={sp}
                      className={`dr-route${selected ? ' on' : ''}`}
                      disabled={blocked}
                      aria-pressed={selected}
                      title={meta.rule}
                      onClick={() => actions.assignSystemSpecialty(i, sp)}
                    >
                      <b>{meta.label}</b>
                      <span>{meta.shortBonus}</span>
                    </button>
                  );
                })}
              </div>
              {current && (
                <button
                  className="dr-btn"
                  style={{ marginTop: 8 }}
                  onClick={() => actions.assignSystemSpecialty(i, null)}
                >
                  CLEAR ROUTE
                </button>
              )}
            </section>
          );
        })
      )}
      <div style={{ height: 20 }} />
    </>
  );
}

function Heritage() {
  const { s } = useGame.getState();
  const ops = s.operations;
  const candidate =
    ops.heritageCandidateLifetimeIndex === null
      ? null
      : s.run.completedPlanets.find(
          (w) => w.lifetimeIndex === ops.heritageCandidateLifetimeIndex,
        ) ?? null;

  return (
    <>
      <p className="dr-note">
        Designate one completed world in Guide → Commission Atlas before selling the commission.
        The newest {C.HERITAGE_ACTIVE_LIMIT} archived worlds each grant +1% output to their
        recorded bottleneck aspect, across every commission that follows.
      </p>

      {candidate ? (
        <div className="dr-card lit">
          <span className="dr-sec-k" style={{ color: 'var(--atmo)' }}>Current candidate</span>
          <div className="dr-card-name">{candidate.name}</div>
          <div className="dr-card-note">
            World #{candidate.lifetimeIndex} enters the registry when this commission is sold.
          </div>
        </div>
      ) : (
        <p className="dr-note">
          No candidate designated. The Guide is prepared to remember nothing with great accuracy.
        </p>
      )}

      <div className="dr-sec">
        <span className="dr-sec-k">Heritage registry</span>
        <span className="dr-rule" />
        <span className="dr-sec-note">
          {Math.min(ops.heritageWorlds.length, C.HERITAGE_ACTIVE_LIMIT)} / {C.HERITAGE_ACTIVE_LIMIT} ACTIVE
        </span>
      </div>
      {ops.heritageWorlds.length === 0 ? (
        <p className="dr-note">No heritage worlds archived across prior commissions.</p>
      ) : (
        [...ops.heritageWorlds].reverse().map((world, index) => (
          <div
            key={`${world.lifetimeIndex}-${world.seed}`}
            className="dr-heritage"
            style={{ opacity: index < C.HERITAGE_ACTIVE_LIMIT ? 1 : .42 }}
          >
            <AspectGlyph aspect={world.bottleneck} label={`${world.bottleneck} bottleneck`} />
            <span>
              <b>{world.name}</b>
              <em>WORLD #{world.lifetimeIndex}</em>
            </span>
            <span className="dr-heritage-effect">
              {index < C.HERITAGE_ACTIVE_LIMIT ? `+1% ${world.bottleneck}` : 'superseded'}
            </span>
          </div>
        ))
      )}
      <div style={{ height: 20 }} />
    </>
  );
}

export function Operations() {
  const rev = useGame((g) => g.rev);
  void rev;
  const [tab, setTab] = useState<Tab>('filings');
  const { s } = useGame.getState();

  return (
    <>
      {/* Standing governs all four businesses, so it sits above the tabs. */}
      <div className="dr-pairs three" aria-label="Faction reputation">
        {(['magrathea', 'mice', 'vogon'] as const).map((f) => (
          <div key={f}>
            <b style={{ color: FACTION_COLOR[f] }}>{s.operations.reputation[f]}</b>
            <span>{FACTION_META[f].label.toUpperCase()}</span>
          </div>
        ))}
      </div>

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

      {tab === 'filings' && <Filings />}
      {tab === 'works' && (
        <>
          <MegaprojectSection />
          <FreightSection />
          <RigSection />
        </>
      )}
      {tab === 'dispatch' && <Dispatch />}
      {tab === 'heritage' && <Heritage />}
    </>
  );
}
