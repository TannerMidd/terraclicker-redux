/**
 * MG · Magrathea.
 *
 * The offer for the portfolio is the headline, because it is the only decision
 * in the drawer that ends the commission. Everything below it is what you keep
 * afterwards, in the order you will care about it: the articles a formed system
 * wants signed, the brief this commission is running under, the standing
 * holdings, and then the catalogue.
 *
 * Articles come before briefs because a Charter is about five worlds you have
 * already delivered and a brief is about worlds you have not met yet. The
 * concrete thing goes first.
 */
import { useState } from 'react';
import { actions, useGame } from '../../../state/store';
import { BRANCH_LABELS, CATALOGUE, type PerkBranch } from '../../../content/catalogue';
import { C } from '../../../content/constants';
import { format } from '../../../engine/num';
import { DOSSIER_BY_ID } from '../../../content/dossiers';
import { CHARTER_BY_ID } from '../../../content/charters';

const BRANCHES: PerkBranch[] = ['construction', 'improbability', 'bureaucracy'];

function CharterArticles() {
  const { s } = useGame.getState();
  const pending = Object.entries(s.run.charterOffers);
  if (pending.length === 0) return null;

  return (
    <>
      <div className="dr-sec">
        <span className="dr-sec-k" style={{ color: 'var(--brass-lit)' }}>Articles for signature</span>
        <span className="dr-rule" />
      </div>
      <p className="dr-note">
        Five worlds delivered together have views about what they now are. The articles
        available depend on how the five were treated, which is the only way this department
        knows how to be fair.
      </p>
      {pending.map(([index, ids]) => (
        <div key={index}>
          <div className="dr-subhead">System {Number(index) + 1}</div>
          {ids.map((id) => {
            const def = CHARTER_BY_ID[id];
            if (!def) return null;
            return (
              <button
                key={id}
                className="dr-card offer brass"
                onClick={() => actions.signCharter(Number(index), id)}
              >
                <div className="dr-card-name">{def.name}</div>
                <div className="dr-card-body">{def.text}</div>
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

function DossierBriefs() {
  const { s } = useGame.getState();
  const active = s.run.dossier ? DOSSIER_BY_ID[s.run.dossier] : null;

  if (active) {
    return (
      <div className="dr-card">
        <span className="dr-sec-k">This commission</span>
        <div className="dr-card-name">{active.name}</div>
        <div className="dr-card-body">{active.terms}</div>
      </div>
    );
  }
  if (s.run.dossierOffers.length === 0) return null;

  return (
    <>
      <div className="dr-sec">
        <span className="dr-sec-k">Briefs on file</span>
        <span className="dr-rule" />
        <span className="dr-sec-note">{s.run.dossierOffers.length}</span>
      </div>
      <p className="dr-note">
        Magrathea has filed three. Accept one and it holds for the whole commission. Accepting
        none is also a filing, and is processed identically.
      </p>
      {s.run.dossierOffers.map((id) => {
        const def = DOSSIER_BY_ID[id];
        if (!def) return null;
        return (
          <button key={id} className="dr-card offer" onClick={() => actions.acceptDossier(id)}>
            <div className="dr-card-name">{def.name}</div>
            <div className="dr-card-body">{def.brief}</div>
            <div className="dr-card-note" style={{ color: 'var(--magrathea)' }}>{def.terms}</div>
          </button>
        );
      })}
      <button className="dr-card offer standard" onClick={() => actions.declineDossier()}>
        <div className="dr-card-name">Standard Commission</div>
        <div className="dr-card-body">
          File no special brief. No production, cost, science, completion, or appraisal rule changes.
        </div>
        <div className="dr-card-note">CLOSE THE BRIEF TRAY FOR THIS COMMISSION</div>
      </button>
    </>
  );
}

export function Magrathea() {
  const rev = useGame((g) => g.rev);
  void rev;
  const [confirming, setConfirming] = useState(false);
  const { s, d } = useGame.getState();
  const can = d.prestigeEligible;
  const remaining = Math.max(
    0,
    d.prestigeRequiredSystems * C.PLANETS_PER_SYSTEM - s.run.planetsCompleted,
  );

  return (
    <>
      <CharterArticles />
      <DossierBriefs />

      <div className="dr-sec">
        <span className="dr-sec-k" style={{ color: 'var(--magrathea)' }}>The commission</span>
        <span className="dr-rule" />
      </div>
      <div className={`dr-offer${can ? ' on' : ''}`}>
        <div className="dr-offer-bp">
          {can ? '+' : 'provisional +'}
          {d.prestigeBp} BP
        </div>
        <p>
          Magrathea’s current offer for this portfolio ({s.run.planetsCompleted} planets,{' '}
          {format(s.run.tuEarned)} TU of demonstrated work). Selling resets the run; Blueprints,
          Guide entries, and completed Deep Thought metaprojects are yours forever.
        </p>
        {!can && (
          <p>
            This commission requires {d.prestigeRequiredSystems} complete systems ({remaining}{' '}
            world{remaining === 1 ? '' : 's'} remaining). Each sale raises future expectations.
          </p>
        )}
        <button className="dr-sell" disabled={!can} onClick={() => setConfirming(true)}>
          {can ? 'SELL THE PORTFOLIO TO MAGRATHEA' : `COMPLETE PORTFOLIO · ${remaining} REMAINING`}
        </button>
      </div>

      <div className="dr-sec">
        <span className="dr-sec-k">Holdings</span>
        <span className="dr-rule" />
      </div>
      <div className="dr-pairs">
        <div>
          <b style={{ color: 'var(--magrathea)' }}>{s.prestige.bp}</b>
          <span>BLUEPRINTS TO SPEND</span>
        </div>
        <div>
          <b>+{Math.round(s.prestige.bpEarned * C.BP_PASSIVE * 100)}%</b>
          <span>PASSIVE BONUS · {s.prestige.bpEarned} BP EARNED</span>
        </div>
      </div>

      {BRANCHES.map((br) => (
        <div key={br}>
          <div className="dr-sec">
            <span className="dr-sec-k">{BRANCH_LABELS[br]}</span>
            <span className="dr-rule" />
          </div>
          {CATALOGUE.filter((p) => p.branch === br).map((p) => {
            const rank = s.prestige.catalogue[p.id] ?? 0;
            const maxed = rank >= p.maxRank;
            const cost = maxed ? null : p.costs[rank];
            const afford = cost !== null && cost !== undefined && s.prestige.bp >= cost;
            return (
              <button
                key={p.id}
                className={`dr-perk${afford ? ' on' : ''}${maxed ? ' maxed' : ''}`}
                disabled={!afford}
                onClick={() => actions.buyPerk(p.id)}
              >
                <span className="dr-perk-copy">
                  <span className="dr-row-name"><b>{p.name}</b></span>
                  <span className="dr-row-desc">{p.guide}</span>
                  <span className="dr-pips">
                    {Array.from({ length: p.maxRank }, (_, i) => (
                      <i key={i} className={i < rank ? 'on' : ''} />
                    ))}
                  </span>
                </span>
                <span className="dr-row-cost">
                  <b style={{ color: maxed ? 'var(--bio)' : afford ? 'var(--magrathea)' : 'var(--ink-dim)' }}>
                    {maxed ? 'MAX' : cost}
                  </b>
                  <span>{maxed ? `RANK ${rank}` : 'BP'}</span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
      <div style={{ height: 20 }} />

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
              <button className="btn" onClick={() => setConfirming(false)}>Not yet</button>
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
    </>
  );
}
