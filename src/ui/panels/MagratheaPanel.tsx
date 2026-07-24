import { useState } from 'react';
import { actions, useGame } from '../../state/store';
import { BRANCH_LABELS, CATALOGUE, type PerkBranch } from '../../content/catalogue';
import { C } from '../../content/constants';
import { format } from '../../engine/num';

export function MagratheaPanel() {
  const rev = useGame((g) => g.rev);
  void rev;
  const [confirming, setConfirming] = useState(false);
  const { s, d } = useGame.getState();
  const canPrestige = d.prestigeBp >= 1;

  const branches: PerkBranch[] = ['construction', 'improbability', 'bureaucracy'];

  return (
    <div>
      <div className="panel-h">The Commission</div>
      <div className="magrathea-offer">
        <div className="m-bp num">+{d.prestigeBp} BP</div>
        <div className="m-sub">
          Magrathea&rsquo;s current offer for this portfolio ({s.run.planetsCompleted} planets,{' '}
          {format(s.run.tuEarned)} TU of demonstrated work). Selling resets the run; Blueprints,
          Guide entries, and the Answer are yours forever.
        </div>
        <button
          className="btn-prestige"
          disabled={!canPrestige}
          onClick={() => setConfirming(true)}
        >
          {canPrestige
            ? 'Sell the portfolio to Magrathea'
            : 'Magrathea is not yet impressed (need ≥ 1 BP)'}
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
