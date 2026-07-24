import { useState } from 'react';
import { actions, useGame } from '../../state/store';
import { BUILDINGS } from '../../content/buildings';
import { UPGRADES } from '../../content/upgrades';
import { bulkCost, maxAffordable, upgradeVisible } from '../../engine/economy';
import { format } from '../../engine/num';
import * as audio from '../audio/audio';

const QTYS = [1, 10, 100, 'max'] as const;

export function ShopPanel() {
  const rev = useGame((g) => g.rev);
  void rev;
  const [qty, setQty] = useState<(typeof QTYS)[number]>(1);
  const { s, d } = useGame.getState();

  const visibleUpgrades = UPGRADES.filter((u) => upgradeVisible(u, s, d)).slice(0, 4);

  let lockedShown = 0;

  return (
    <div>
      {visibleUpgrades.length > 0 && (
        <>
          <div className="panel-h">Upgrades</div>
          <div className="upgrade-strip">
            {visibleUpgrades.map((u) => {
              const affordable = s.tu.gte(u.cost);
              return (
                <button
                  key={u.id}
                  className="upgrade-card"
                  disabled={!affordable}
                  title={u.guide}
                  onClick={() => {
                    actions.buyUpgrade(u.id);
                    audio.upgradeSting();
                  }}
                >
                  <div className="u-name">{u.name}</div>
                  <div className="u-cost">{format(u.cost)} TU</div>
                  <div className="u-desc">{u.guide}</div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="panel-h">Installations</div>
      <div className="qty-row">
        {QTYS.map((q) => (
          <button
            key={String(q)}
            className={`qty-btn${q === qty ? ' active' : ''}`}
            onClick={() => setQty(q)}
          >
            {q === 'max' ? 'Max' : `×${q}`}
          </button>
        ))}
      </div>

      {BUILDINGS.map((b, tier) => {
        const owned = s.buildings[b.id] ?? 0;
        const unlocked = s.run.tuEarned.gte(b.unlockAtTu) || owned > 0;
        if (!unlocked) {
          if (lockedShown++ > 0) return null; // tease exactly one locked tier
          return (
            <div key={b.id} className="shop-item locked" aria-hidden>
              <div className="row1">
                <span className="b-name">?????</span>
                <span className="b-cost">{format(b.baseCost)} TU</span>
              </div>
              <div className="row2">
                <span>Keep terraforming to reveal.</span>
              </div>
            </div>
          );
        }
        const uniqueOwned = b.unique && owned >= 1;
        const n = uniqueOwned ? 0 : qty === 'max' ? Math.max(1, maxAffordable(b.id, owned, s.tu, d)) : qty;
        const cost = bulkCost(b.id, owned, b.unique ? 1 : n, d);
        const affordable = !uniqueOwned && s.tu.gte(cost);
        const frac = uniqueOwned ? 1 : Math.min(1, cost.lte(0) ? 1 : s.tu.div(cost).toNumber());
        return (
          <button
            key={b.id}
            className={`shop-item${affordable ? ' affordable' : ''}`}
            disabled={!affordable}
            title={b.guide}
            onClick={() => {
              actions.buyBuilding(b.id, qty === 'max' ? 'max' : qty);
              audio.purchaseMotif(tier);
            }}
          >
            <div className="fill" style={{ transform: `scaleX(${frac.toFixed(3)})` }} />
            <div className="row1">
              <span className="b-name">
                {b.name} <span className="b-owned">×{owned}</span>
              </span>
              <span className="b-cost">
                {uniqueOwned ? 'employed' : `${format(cost)} TU${n > 1 ? ` (×${n})` : ''}`}
              </span>
            </div>
            <div className="row2">
              <span className="b-asp">
                {b.tuPerSec > 0 && <span>{format(b.tuPerSec)} TU/s</span>}
                {b.aspects.thermal && <span className="asp-th">🔥{format(b.aspects.thermal)}</span>}
                {b.aspects.atmo && <span className="asp-at">🌫{format(b.aspects.atmo)}</span>}
                {b.aspects.hydro && <span className="asp-hy">💧{format(b.aspects.hydro)}</span>}
                {b.aspects.bio && <span className="asp-bi">🌱{format(b.aspects.bio)}</span>}
                {b.sciencePerSec && <span className="asp-sc">🧪{format(b.sciencePerSec)}</span>}
                {b.special === 'marvin' && <span>auto-click, reluctantly</span>}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
