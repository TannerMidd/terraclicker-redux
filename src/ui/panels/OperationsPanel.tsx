import {
  CONTRACT_TEMPLATE_META,
  FACTION_META,
  SPECIALTIES,
  SPECIALTY_META,
  contractRewardText,
  objectiveRule,
  objectiveTarget,
  objectiveText,
} from '../../content/contracts';
import { C } from '../../content/constants';
import { formatDuration } from '../../engine/num';
import { specialtiesForSystem } from '../../engine/operations';
import type {
  HeritageWorldRecord,
  SystemSpecialty,
} from '../../engine/types';
import { actions, useGame } from '../../state/store';
import { AspectGlyph } from '../assets';
import { FieldOperationsSection, FreightSection, MegaprojectSection, RigSection } from './ExpansionSections';

const ASPECT_CLASS = {
  thermal: 'asp-th',
  atmo: 'asp-at',
  hydro: 'asp-hy',
  bio: 'asp-bi',
} as const;

function specialtyProfileReason(specialty: SystemSpecialty): string {
  const meta = SPECIALTY_META[specialty];
  if (meta.aspect) {
    return `Unavailable: no world in this system recorded ${meta.label} as its bottleneck.`;
  }
  if (specialty === 'science') {
    return 'Unavailable: Science requires at least two surveyed worlds in this system.';
  }
  return 'Unavailable for this system profile.';
}

function SpecialtyMark({ specialty }: { specialty: SystemSpecialty }) {
  const meta = SPECIALTY_META[specialty];
  if (meta.aspect) {
    return <AspectGlyph aspect={meta.aspect} label={`${meta.label} specialty`} />;
  }
  return (
    <span className="specialty-symbol" aria-hidden>
      {specialty === 'science' ? 'Σ' : '×'}
    </span>
  );
}

function HeritageRecord({ world, isActive }: { world: HeritageWorldRecord; isActive: boolean }) {
  return (
    <article className={`heritage-record ${ASPECT_CLASS[world.bottleneck]}${isActive ? '' : ' inactive'}`}>
      <AspectGlyph aspect={world.bottleneck} />
      <div className="heritage-head">
        <div className="heritage-name">{world.name}</div>
        <div className="heritage-meta">COMMISSION {world.commissionNumber} / WORLD #{world.lifetimeIndex}</div>
      </div>
      <div className="heritage-effect">
        {isActive
          ? `+1% ${SPECIALTY_META[world.bottleneck].label} output`
          : 'Filed for history; outside the eight active heritage records.'}
      </div>
    </article>
  );
}

export function OperationsPanel() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s, d } = useGame.getState();
  const operations = s.operations;
  const completedCount = operations.completed.length;
  const dispatchSlots = d.dispatchSlots;
  const assignedCount = d.dispatchesUsed;
  const availableSlots = Math.max(0, dispatchSlots - assignedCount);
  const candidate = operations.heritageCandidateLifetimeIndex === null
    ? null
    : s.run.completedPlanets.find(
        (world) => world.lifetimeIndex === operations.heritageCandidateLifetimeIndex,
      ) ?? null;

  return (
    <div>
      <div className="panel-h">Operations Ledger</div>
      <div className="operations-ledger" aria-label="Faction reputation">
        {(['magrathea', 'mice', 'vogon'] as const).map((faction) => (
          <div className="stat" key={faction}>
            <div className="s-v tabular">{operations.reputation[faction]}</div>
            <div className="s-k">{FACTION_META[faction].label}</div>
          </div>
        ))}
      </div>
      <p className="panel-sub">
        Every {C.CONTRACT_REPUTATION_PER_BP} reputation with a faction adds +1 BP to its newly
        generated offers, up to +{C.CONTRACT_REPUTATION_BP_CAP} BP.
      </p>

      {operations.active ? (
        <>
          <div className="panel-h">Active Contract</div>
          {(() => {
            const active = operations.active;
            const offer = active.offer;
            const template = CONTRACT_TEMPLATE_META[offer.templateId];
            const faction = FACTION_META[offer.faction];
            const target = objectiveTarget(offer.objective);
            const pct = target > 0 ? Math.min(100, (active.progress / target) * 100) : 100;
            const remaining = active.deadlineAtGameMs === null
              ? null
              : Math.max(0, active.deadlineAtGameMs - s.gameTimeMs);
            return (
              <article className="contract-active" aria-label={`Active contract: ${template.name}`}>
                <div className="contract-head">
                  <div className="contract-kicker">Accepted filing</div>
                  <div className="contract-faction" data-faction={offer.faction}>{faction.label}</div>
                </div>
                <div className="contract-title">{template.name}</div>
                <div className="contract-objective">{objectiveText(offer.objective)}</div>
                <div className="contract-progress-row">
                  <b>{active.progress} / {target}</b>
                  <span className="contract-deadline">
                    {remaining === null ? 'No deadline' : `${formatDuration(remaining)} remaining`}
                  </span>
                </div>
                <div
                  className="progress-track contract-progress"
                  role="progressbar"
                  aria-label="Contract progress"
                  aria-valuemin={0}
                  aria-valuemax={target}
                  aria-valuenow={active.progress}
                >
                  <div className="progress-bar" style={{ width: `${pct}%` }} />
                </div>
                <div className="contract-reward-row">
                  <span>{objectiveRule(offer.objective)}</span>
                  <span className="contract-reward">
                    {contractRewardText(offer.rewardBp, offer.rewardReputation)}
                  </span>
                </div>
                <div className="contract-failure-rule">
                  A missed deadline or commission reset closes the file unpaid. You may also
                  withdraw this filing at any time. No TU, BP, or reputation is deducted.
                </div>
                <button
                  className="contract-withdraw"
                  onClick={() => actions.abandonContract()}
                  title="Forfeit this filing's progress without any resource or reputation penalty"
                >
                  Withdraw filing
                </button>
              </article>
            );
          })()}
        </>
      ) : (
        <>
          <div className="panel-h">Acceptance Board</div>
          <p className="panel-sub">
            Three deterministic offers. Accepting one removes the others until the filing is
            completed or closed.
          </p>
          <div className="contract-board">
            {operations.offers.length === 0 ? (
              <div className="contract-empty">The board is being stamped. This is not a metaphor.</div>
            ) : (
              operations.offers.map((offer) => {
                const template = CONTRACT_TEMPLATE_META[offer.templateId];
                const faction = FACTION_META[offer.faction];
                const timedWindow = offer.objective.kind === 'timed'
                  ? ` Filing window: ${formatDuration(offer.objective.durationMs)}.`
                  : '';
                return (
                  <article className="contract-offer" key={offer.id}>
                    <div className="contract-head">
                      <div className="contract-faction" data-faction={offer.faction}>{faction.label}</div>
                      <div className="contract-reward">
                        {contractRewardText(offer.rewardBp, offer.rewardReputation)}
                      </div>
                    </div>
                    <div className="contract-title">{template.name}</div>
                    <div className="contract-objective">
                      {objectiveText(offer.objective)}{timedWindow}
                    </div>
                    <div className="contract-failure-rule">{objectiveRule(offer.objective)}</div>
                    <button
                      className="contract-accept"
                      onClick={() => actions.acceptContract(offer.id)}
                      aria-label={`Accept ${template.name} from ${faction.label}`}
                    >
                      Accept filing
                    </button>
                  </article>
                );
              })
            )}
          </div>
          <div className="operations-rule-row">
            <p className="panel-sub">
              One board reissue at each system count. Count {s.run.systems}:{' '}
              {operations.rerolledAtSystem === s.run.systems ? 'used' : 'available'}.
            </p>
            <button
              className="btn contract-reroll"
              disabled={operations.rerolledAtSystem === s.run.systems}
              onClick={() => actions.rerollContracts()}
            >
              Reissue
            </button>
          </div>
        </>
      )}

      <FieldOperationsSection />
      <MegaprojectSection />
      <FreightSection />
      <RigSection />
      <div className="panel-h">System Dispatch</div>
      <div className="dispatch-head">
        <p className="panel-sub">
          {availableSlots} available / {dispatchSlots} total {dispatchSlots === 1 ? 'route' : 'routes'}
        </p>
        <span className="heritage-meta">{completedCount} contracts filed</span>
      </div>
      <div className="dispatch-rule">
        Start with one route; every {C.CONTRACTS_PER_DISPATCH_SLOT} completed contracts adds one,
        to a maximum of {C.CONTRACT_DISPATCH_MAX}. Aspect routes grant +8%, Science +10%, and
        Production +4% to all output. Assignments may be changed without cost.
      </div>
      <div className="dispatch-profile-rule">
        System profile: recorded bottlenecks unlock matching aspect routes; Science requires two
        surveyed worlds; Production is always available. Recovered legacy profiles remain unrestricted.
      </div>
      <div className="dispatch-list">
        {s.run.systems === 0 ? (
          <div className="contract-empty">
            No formed systems. {C.PLANETS_PER_SYSTEM} completed worlds usually persuade gravity to file one.
          </div>
        ) : (
          Array.from({ length: s.run.systems }, (_, systemIndex) => {
            const current = operations.systemSpecialties[String(systemIndex)] ?? null;
            const canAssign = current !== null || assignedCount < dispatchSlots;
            const eligibleSpecialties = specialtiesForSystem(s, systemIndex);
            return (
              <section className="dispatch-row" key={systemIndex}>
                <div className="dispatch-head">
                  <div className="dispatch-name">System {systemIndex + 1}</div>
                  <div className="dispatch-current">
                    {current ? `${SPECIALTY_META[current].label} route` : 'Unassigned'}
                  </div>
                </div>
                <div className="dispatch-specialties" role="group" aria-label={`System ${systemIndex + 1} specialty`}>
                  {SPECIALTIES.map((specialty) => {
                    const meta = SPECIALTY_META[specialty];
                    const selected = current === specialty;
                    const routeEligible = eligibleSpecialties.includes(specialty);
                    const unavailableReason = selected
                      ? null
                      : !routeEligible
                        ? specialtyProfileReason(specialty)
                        : !canAssign
                          ? 'Unavailable: no dispatch slot is open. Complete more contracts or clear another route.'
                          : null;
                    return (
                      <button
                        key={specialty}
                        className={`specialty-btn ${specialty}${selected ? ' active' : ''}`}
                        disabled={unavailableReason !== null}
                        aria-pressed={selected}
                        aria-label={`${meta.label}: ${unavailableReason ?? meta.rule}`}
                        title={unavailableReason ?? meta.rule}
                        onClick={() => actions.assignSystemSpecialty(systemIndex, specialty)}
                      >
                        <SpecialtyMark specialty={specialty} />
                        <b>{meta.label}</b>
                        <span>{meta.shortBonus}</span>
                      </button>
                    );
                  })}
                </div>
                {current && (
                  <button
                    className="dispatch-clear"
                    onClick={() => actions.assignSystemSpecialty(systemIndex, null)}
                  >
                    Clear route
                  </button>
                )}
              </section>
            );
          })
        )}
      </div>

      <div className="panel-h">Heritage Registry</div>
      <div className="heritage-rule">
        Designate one completed world in Guide → Commission Atlas before selling the commission.
        The newest {C.HERITAGE_ACTIVE_LIMIT} archived worlds each grant +1% output to their recorded bottleneck aspect.
      </div>
      {candidate ? (
        <div className={`heritage-candidate ${ASPECT_CLASS[candidate.bottleneck]}`}>
          <div className="heritage-head">
            <div>
              <span className="heritage-badge candidate">Current candidate</span>
              <div className="heritage-name">{candidate.name}</div>
            </div>
            <AspectGlyph aspect={candidate.bottleneck} label={`${candidate.bottleneck} bottleneck`} />
          </div>
          <div className="heritage-meta">
            World #{candidate.lifetimeIndex} will enter the registry when this commission is sold.
          </div>
        </div>
      ) : (
        <div className="contract-empty">
          No candidate designated. The Guide is prepared to remember nothing with great accuracy.
        </div>
      )}
      <div className="heritage-registry">
        {[...operations.heritageWorlds].reverse().map((world, index) => (
          <HeritageRecord
            key={`${world.lifetimeIndex}-${world.seed}`}
            world={world}
            isActive={index < C.HERITAGE_ACTIVE_LIMIT}
          />
        ))}
        {operations.heritageWorlds.length === 0 && (
          <div className="contract-empty">No heritage worlds archived across prior commissions.</div>
        )}
      </div>
    </div>
  );
}
