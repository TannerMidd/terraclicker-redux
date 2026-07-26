/**
 * IN · Installations.
 *
 * Upgrades first, because they are one-off, permanent, and never the wrong
 * purchase — the only decision in the drawer that cannot be regretted. Then
 * the installations themselves, one full-width row each with the cost on the
 * right where a column of costs can actually be compared.
 *
 * Exactly one locked tier is ever teased. Two would be a roadmap, and a
 * roadmap tells you what to want instead of letting you find out.
 */
import { useState } from 'react';
import { actions, useGame } from '../../../state/store';
import { BUILDINGS } from '../../../content/buildings';
import { UPGRADES } from '../../../content/upgrades';
import { bulkCost, maxAffordable, upgradeVisible } from '../../../engine/economy';
import { format } from '../../../engine/num';
import * as audio from '../../audio/audio';
import { AspectGlyph, buildingIcon, upgradeIcon } from '../../assets';

const QTYS = [1, 10, 100, 'max'] as const;

export function Installations() {
  const rev = useGame((g) => g.rev);
  void rev;
  const [qty, setQty] = useState<(typeof QTYS)[number]>(1);
  const { s, d } = useGame.getState();

  const upgrades = UPGRADES.filter((u) => upgradeVisible(u, s, d)).slice(0, 4);
  const affordableUpgrades = upgrades.filter((u) => s.tu.gte(u.cost)).length;
  let lockedShown = 0;

  return (
    <>
      {upgrades.length > 0 && (
        <>
          <div className="dr-sec">
            <span className="dr-sec-k" style={{ color: 'var(--improbable)' }}>Upgrades</span>
            <span className="dr-rule" />
            <span className="dr-sec-note">{affordableUpgrades} AVAILABLE</span>
          </div>
          <div className="dr-upgrades">
            {upgrades.map((u) => {
              const afford = s.tu.gte(u.cost);
              return (
                <button
                  key={u.id}
                  className={`dr-upgrade${afford ? ' on' : ''}`}
                  disabled={!afford}
                  title={u.guide}
                  onClick={() => {
                    actions.buyUpgrade(u.id);
                    audio.upgradeSting();
                  }}
                >
                  <img src={upgradeIcon(u.id)} alt="" aria-hidden />
                  <span>
                    <b>{u.name}</b>
                    <span className="dr-upgrade-cost">{format(u.cost)} TU</span>
                    <span className="dr-upgrade-desc">{u.guide}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="dr-sec">
        <span className="dr-sec-k" style={{ color: 'var(--bio)' }}>Installations</span>
        <span className="dr-rule" />
        <span className="dr-qty">
          {QTYS.map((q) => (
            <button
              key={String(q)}
              className={q === qty ? 'on' : ''}
              onClick={() => setQty(q)}
            >
              {q === 'max' ? 'MAX' : `×${q}`}
            </button>
          ))}
        </span>
      </div>

      {BUILDINGS.map((b, tier) => {
        const owned = s.buildings[b.id] ?? 0;
        const unlocked = s.run.tuEarned.gte(b.unlockAtTu) || owned > 0;
        if (!unlocked) {
          if (lockedShown++ > 0) return null;
          return (
            <div key={b.id} className="dr-row locked" aria-hidden>
              <span className="dr-row-icon dashed">?</span>
              <span className="dr-row-copy">
                <span className="dr-row-name"><b>?????</b></span>
                <span className="dr-chips">Keep terraforming to reveal.</span>
              </span>
              <span className="dr-row-cost">
                <b>{format(b.baseCost)}</b>
                <span>TU</span>
              </span>
            </div>
          );
        }

        const uniqueOwned = b.unique && owned >= 1;
        const n = uniqueOwned
          ? 0
          : qty === 'max'
            ? Math.max(1, maxAffordable(b.id, owned, s.tu, d))
            : qty;
        const cost = bulkCost(b.id, owned, b.unique ? 1 : n, d);
        const afford = !uniqueOwned && s.tu.gte(cost);
        const frac = uniqueOwned ? 1 : Math.min(1, cost.lte(0) ? 1 : s.tu.div(cost).toNumber());

        return (
          <button
            key={b.id}
            className={`dr-row${afford ? ' on' : ''}`}
            disabled={!afford}
            title={b.guide}
            onClick={() => {
              actions.buyBuilding(b.id, qty === 'max' ? 'max' : qty);
              audio.purchaseMotif(tier);
            }}
          >
            <img className="dr-row-icon" src={buildingIcon(b.id)} alt="" aria-hidden />
            <span className="dr-row-copy">
              <span className="dr-row-name">
                <b>{b.name}</b>
                <i>×{owned}</i>
              </span>
              <span className="dr-chips">
                {b.tuPerSec > 0 && <span>{format(b.tuPerSec)} TU/s</span>}
                {b.aspects.thermal && (
                  <span style={{ color: 'var(--thermal)' }}><AspectGlyph aspect="thermal" />{format(b.aspects.thermal)}</span>
                )}
                {b.aspects.atmo && (
                  <span style={{ color: 'var(--atmo)' }}><AspectGlyph aspect="atmo" />{format(b.aspects.atmo)}</span>
                )}
                {b.aspects.hydro && (
                  <span style={{ color: 'var(--hydro)' }}><AspectGlyph aspect="hydro" />{format(b.aspects.hydro)}</span>
                )}
                {b.aspects.bio && (
                  <span style={{ color: 'var(--bio)' }}><AspectGlyph aspect="bio" />{format(b.aspects.bio)}</span>
                )}
                {b.sciencePerSec && (
                  <span style={{ color: 'var(--atmo)' }}><i className="science-mark">S</i>{format(b.sciencePerSec)}</span>
                )}
                {b.special === 'marvin' && <span>auto-click, reluctantly</span>}
              </span>
            </span>
            <span className="dr-row-cost">
              <b style={{ color: afford ? 'var(--bio)' : 'var(--ink-dim)' }}>
                {uniqueOwned ? 'EMPLOYED' : format(cost)}
              </b>
              <span>{uniqueOwned ? 'THE ONLY ONE' : n > 1 ? `TU · ×${n}` : 'TU'}</span>
            </span>
            {/* How close the next one is, read along the bottom edge. */}
            <span className="dr-row-meter" style={{ transform: `scaleX(${frac.toFixed(3)})` }} />
          </button>
        );
      })}
    </>
  );
}
