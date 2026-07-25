import { useState } from 'react';
import { actions, useGame } from '../../state/store';
import { BRANCH_LABELS, CATALOGUE, type PerkBranch } from '../../content/catalogue';
import { C } from '../../content/constants';
import { format } from '../../engine/num';
import { DOSSIER_BY_ID } from '../../content/dossiers';

/**
 * Three briefs, one commission.
 *
 * Shown only while a choice is outstanding — once accepted, the brief becomes
 * a line in the commission summary rather than a decision that keeps asking to
 * be re-made. There is no "decide later" button because there is no hurry: the
 * commission simply runs unbriefed until you pick, which is a legitimate way
 * to play and is what every commission before this feature did.
 */
function DossierBriefs() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const offers = s.run.dossierOffers;
  const active = s.run.dossier ? DOSSIER_BY_ID[s.run.dossier] : null;

  if (active) {
    return (
      <div className="dossier-active">
        <div className="do-kicker">this commission</div>
        <b>{active.name}</b>
        <em>{active.terms}</em>
      </div>
    );
  }
  if (offers.length === 0) return null;

  return (
    <div className="dossier-offers">
      <div className="panel-h">Briefs on File</div>
      <p className="panel-sub">
        Magrathea has filed three. Accept one and it holds for the whole commission.
        Accepting none is also a filing, and is processed identically.
      </p>
      {offers.map((id) => {
        const def = DOSSIER_BY_ID[id];
        if (!def) return null;
        return (
          <button key={id} className="dossier-card" onClick={() => actions.acceptDossier(id)}>
            <b>{def.name}</b>
            <p>{def.brief}</p>
            <em>{def.terms}</em>
          </button>
        );
      })}
    </div>
  );
}

export function MagratheaPanel() {
  const rev = useGame((g) => g.rev);
  void rev;
  const [confirming, setConfirming] = useState(false);
  const { s, d } = useGame.getState();
  const canPrestige = d.prestigeEligible;
  const requiredWorlds = d.prestigeRequiredSystems * C.PLANETS_PER_SYSTEM;
  const worldsRemaining = Math.max(0, requiredWorlds - s.run.planetsCompleted);

  const branches: PerkBranch[] = ['construction', 'improbability', 'bureaucracy'];

  return (
    <div>
      <DossierBriefs />
      <div className="panel-h">The Commission</div>
      <div className="magrathea-offer">
        <div className="m-bp num">
          {canPrestige ? '+' : 'provisional +'}
          {d.prestigeBp} BP
        </div>
        <div className="m-sub">
          Magrathea&rsquo;s current offer for this portfolio ({s.run.planetsCompleted} planets,{' '}
          {format(s.run.tuEarned)} TU of demonstrated work). Selling resets the run; Blueprints,
          Guide entries, and completed Deep Thought metaprojects are yours forever.
        </div>
        {!canPrestige && (
          <div className="m-sub" style={{ marginTop: 8 }}>
            This commission requires {d.prestigeRequiredSystems} complete systems
            ({worldsRemaining} world{worldsRemaining === 1 ? '' : 's'} remaining). Each sale raises future expectations.
          </div>
        )}
        <button
          className="btn-prestige"
          disabled={!canPrestige}
          onClick={() => setConfirming(true)}
        >
          {canPrestige
            ? 'Sell the portfolio to Magrathea'
            : `Complete portfolio (${worldsRemaining} remaining)`}
        </button>
      </div>

      <div className="panel-h">Holdings</div>
      <div className="stat-grid">
        <div className="stat">
          <div className="s-v num">{s.prestige.bp}</div>
          <div className="s-k">blueprints to spend</div>
        </div>
        <div className="stat">
          <div className="s-v num">+{Math.round(s.prestige.bpEarned * C.BP_PASSIVE * 100)}%</div>
          <div className="s-k">passive bonus ({s.prestige.bpEarned} BP earned)</div>
        </div>
      </div>

      {branches.map((br) => (
        <div key={br}>
          <div className="panel-h">{BRANCH_LABELS[br]}</div>
          {CATALOGUE.filter((p) => p.branch === br).map((p) => {
            const rank = s.prestige.catalogue[p.id] ?? 0;
            const maxed = rank >= p.maxRank;
            const cost = maxed ? null : p.costs[rank];
            const affordable = cost !== null && cost !== undefined && s.prestige.bp >= cost;
            return (
              <button
                key={p.id}
                className="perk"
                disabled={!affordable}
                onClick={() => actions.buyPerk(p.id)}
              >
                <div className="p-row">
                  <span className="p-name">{p.name}</span>
                  <span className="p-cost">{maxed ? 'MAX' : `${cost} BP`}</span>
                </div>
                <div className="p-guide">{p.guide}</div>
                <div className="p-rank">
                  rank <b>{rank}</b> / {p.maxRank}
                </div>
              </button>
            );
          })}
        </div>
      ))}

      {confirming && (
        <div className="modal-veil" onClick={() => setConfirming(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Sell to Magrathea?</h2>
            <p className="m-body">
              The mice will take everything: planets, installations, upgrades, unfinished
              research. You keep <b>+{d.prestigeBp} Blueprints</b>, every Guide entry, and
              anything Deep Thought finished thinking.
            </p>
            <p className="m-body" style={{ marginTop: 8 }}>
              A fresh Terra Prima is already being wheeled out of the workshop.
            </p>
            <div className="m-actions">
              <button className="btn" onClick={() => setConfirming(false)}>
                Not yet
              </button>
              <button
                className="btn"
                style={{ borderColor: 'var(--magrathea)', color: 'var(--magrathea)' }}
                onClick={() => {
                  setConfirming(false);
                  actions.prestige();
                }}
              >
                So Long, and Thanks for All the Fish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
