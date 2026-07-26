/**
 * SO · Standing Orders, Revision 3.
 *
 * A form, not a dashboard — the player is filing instructions with a
 * department that will follow them exactly and take no initiative whatsoever.
 * Mk II keeps that literal: a master switch in its own lit box, then plain
 * ruled rows, because a form that looks like a control panel invites people to
 * believe it is being clever on their behalf.
 */
import { useGame, actions } from '../../../state/store';
import { BUILDINGS } from '../../../content/buildings';
import { RESEARCH } from '../../../content/research';
import { standingOrdersUnlocked, type StandingOrders } from '../../../engine/standingOrders';

export function Orders() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const orders = s.standingOrders;

  const set = (patch: Partial<StandingOrders>) => actions.setStandingOrders({ ...orders, ...patch });
  const toggleIn = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  if (!standingOrdersUnlocked(s)) {
    return (
      <>
        <p className="dr-note">
          The department does not accept standing instructions from anyone who has not
          completed a commission unassisted. This is not a rule about competence. It is a
          rule about knowing what you are asking for.
        </p>
        <p className="dr-note">Sell one portfolio to Magrathea and the forms will be released.</p>
      </>
    );
  }

  return (
    <>
      <p className="dr-note">
        Instructions to be followed exactly and without initiative. Nothing filed here will
        ever answer a question on your behalf — situations, petitions and surveys remain
        yours, on the grounds that they are the interesting part.
      </p>

      <label className={`dr-master${orders.enabled ? ' on' : ''}`}>
        <input
          type="checkbox"
          checked={orders.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        <span>
          <b>Orders are in force</b>
          <em>The master switch. Everything below still has to be switched on individually.</em>
        </span>
      </label>

      <div className="dr-sec">
        <span className="dr-sec-k">Purchasing</span>
        <span className="dr-rule" />
      </div>

      <label className="dr-check">
        <input
          type="checkbox"
          checked={orders.autoBuild}
          onChange={(e) => set({ autoBuild: e.target.checked })}
        />
        <span>
          <b>Buy installations</b>
          <em>
            In your priority order below. With no order given, best value per TU — which is
            what you would have done anyway.
          </em>
        </span>
      </label>

      <label className="dr-check">
        <input
          type="checkbox"
          checked={orders.autoUpgrade}
          onChange={(e) => set({ autoUpgrade: e.target.checked })}
        />
        <span>
          <b>Buy upgrades</b>
          <em>One-off, permanent, never the wrong purchase.</em>
        </span>
      </label>

      <div className="dr-slider">
        <label htmlFor="so-reserve">
          <b>Hold back</b>
          <span>{orders.reserveSeconds === 0 ? 'nothing' : `${orders.reserveSeconds}s of income`}</span>
        </label>
        <input
          id="so-reserve"
          type="range"
          min={0}
          max={300}
          step={5}
          value={orders.reserveSeconds}
          onChange={(e) => set({ reserveSeconds: Number(e.target.value) })}
        />
        <em>
          Automation stops spending below this. Stops the department emptying the account one
          second before you wanted it.
        </em>
      </div>

      <div className="dr-sec">
        <span className="dr-sec-k">Priority order</span>
        <span className="dr-rule" />
        <span className="dr-sec-note">
          {orders.buildPriority.length === 0 ? 'BEST VALUE' : `${orders.buildPriority.length} SET`}
        </span>
      </div>
      <div className="dr-chipwrap">
        {BUILDINGS.map((b) => {
          const at = orders.buildPriority.indexOf(b.id);
          return (
            <button
              key={b.id}
              className={`dr-chip pick${at >= 0 ? ' on' : ''}`}
              onClick={() => set({ buildPriority: toggleIn(orders.buildPriority, b.id) })}
            >
              {at >= 0 && <b>{at + 1}</b>}
              {b.name}
            </button>
          );
        })}
      </div>

      <div className="dr-sec">
        <span className="dr-sec-k">Research</span>
        <span className="dr-rule" />
      </div>
      <label className="dr-check">
        <input
          type="checkbox"
          checked={orders.autoResearch}
          onChange={(e) => set({ autoResearch: e.target.checked })}
        />
        <span>
          <b>Work the queue</b>
          <em>
            Started in the order you set, as each becomes possible. Anything not yet unlocked
            is stepped over rather than waited on.
          </em>
        </span>
      </label>
      <div className="dr-chipwrap">
        {RESEARCH.map((r) => {
          const at = orders.researchQueue.indexOf(r.id);
          const done = s.research.completed.includes(r.id);
          return (
            <button
              key={r.id}
              className={`dr-chip pick${at >= 0 ? ' on' : ''}${done ? ' done' : ''}`}
              onClick={() => set({ researchQueue: toggleIn(orders.researchQueue, r.id) })}
            >
              {at >= 0 && <b>{at + 1}</b>}
              {r.name}
            </button>
          );
        })}
      </div>

      <div className="dr-sec">
        <span className="dr-sec-k">Interruptions</span>
        <span className="dr-rule" />
      </div>
      <label className="dr-check">
        <input
          type="checkbox"
          checked={orders.pauseOnSituation}
          onChange={(e) => set({ pauseOnSituation: e.target.checked })}
        />
        <span>
          <b>Stop everything when something is asked</b>
          <em>
            While a situation is open, no order is executed. Recommended: the whole point of a
            question is that somebody is waiting for you specifically.
          </em>
        </span>
      </label>
      <div style={{ height: 20 }} />
    </>
  );
}
