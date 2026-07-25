import { actions, useGame } from '../../state/store';
import { format, formatDuration } from '../../engine/num';
import { forecastSituation } from '../../engine/situations';
import { Num } from '../bits';
import { enactedStatutes, statuteOffers, universeStage } from '../../engine/statutes';
import { hasBooked, reservationStatus } from '../../engine/reservation';
import { RESERVATION_TEXT } from '../../content/reservation';
import { PARA_BREAK } from './reservationText';

/**
 * The law, and what may still be passed.
 *
 * Lives in the Vortex because this is the panel about scale, and a statute is
 * the only thing in the game that applies at every scale at once. Enacted acts
 * are listed permanently — a law you cannot see is indistinguishable from a
 * bug.
 */
function Statutes() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const stage = universeStage(s);
  const enacted = enactedStatutes(s);
  const offers = statuteOffers(s);
  if (stage === 0 && enacted.length === 0) return null;

  return (
    <div className="statutes">
      <div className="panel-h">Statutes of the Universe</div>
      {enacted.length > 0 && (
        <div className="st-enacted">
          {enacted.map((def) => (
            <div key={def.id} className="st-law">
              <b>{def.name}</b>
              <em>{def.terms}</em>
            </div>
          ))}
        </div>
      )}
      {offers.length > 0 ? (
        <>
          <p className="panel-sub">
            The house will hear one act per stage. It cannot be repealed afterwards, on
            the grounds that you will be living in it.
          </p>
          {offers.map((def) => (
            <button
              key={def.id}
              className="st-offer"
              onClick={() => actions.enactStatute(def.id)}
            >
              <b>{def.name}</b>
              <p>{def.text}</p>
              <em>{def.terms}</em>
            </button>
          ))}
        </>
      ) : (
        enacted.length > 0 && (
          <p className="panel-sub">
            Nothing further is before the house until the universe is larger.
          </p>
        )
      )}
    </div>
  );
}

/**
 * The booking at the end of the universe.
 *
 * Shown only once the party is close enough for it to mean something — a list
 * of unmet conditions presented from the first minute would be a checklist,
 * and this is deliberately not a checklist. Every clause is something a player
 * who played the whole game has already done; the finale asks you to look back
 * rather than grind forward.
 */

function Reservation() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const status = reservationStatus(s);
  const booked = hasBooked(s);
  // Nothing until the universe is old enough for the joke to land.
  if (!booked && status.progress < 0.25) return null;

  if (booked) {
    return (
      <div className="reservation booked">
        <div className="panel-h">Milliways — Table Confirmed</div>
        {RESERVATION_TEXT.split(PARA_BREAK).map((para, i) => (
          <p key={i} className="rv-text">{para}</p>
        ))}
      </div>
    );
  }

  return (
    <div className="reservation">
      <div className="panel-h">Milliways — Reservation, Pending</div>
      <p className="panel-sub">
        The Restaurant at the End of the Universe books retrospectively: the table is
        reserved once the meal has been eaten. The booking below is therefore not a list
        of things to do. It is a list of things that will turn out to have happened.
      </p>
      <div className="rv-clauses">
        {status.clauses.map(({ clause, met, progress }) => (
          <div key={clause.id} className={`rv-clause${met ? ' met' : ''}`}>
            <span className="rv-mark" aria-hidden>{met ? '✓' : '·'}</span>
            <span className="rv-line">{clause.text}</span>
            {!met && <span className="rv-pct">{Math.floor(progress * 100)}%</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function VortexPanel() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s, d } = useGame.getState();
  const pct = 100 * (1 - Math.exp(-s.lifetime.bestGalaxies / 6));
  const hasForecast = s.research.completed.includes('sens-o-matic');
  const forecast = hasForecast ? forecastSituation(s, d) : null;
  const driveCount = s.buildings['heartOfGold'] ?? 0;

  return (
    <div>
      <div className="panel-h">Total Perspective Vortex</div>
      <p className="panel-sub">
        The one machine no mind survives unhumbled. Yours reads, in full:
      </p>
      <div className="vortex-progress">
        <div className="vortex-pct num">{pct < 0.01 ? '0.000' : pct.toFixed(pct < 1 ? 3 : 1)}%</div>
        <div className="progress-track">
          <div
            className="progress-bar"
            style={{ width: `${Math.max(0.5, pct)}%`, background: 'var(--magrathea)' }}
          />
        </div>
        <div className="vortex-caption">of the universe terraformed. You are here. ↑</div>
      </div>
      <div className="panel-h">Local Improbability</div>
      <div className="stat-grid">
        <div className="stat">
          <div className="s-v num">
            {d.improbability < 0.01 ? '0.000' : d.improbability.toFixed(d.improbability < 1 ? 2 : 1)}%
          </div>
          <div className="s-k">
            local anomaly pressure | {driveCount} Heart of Gold {driveCount === 1 ? 'drive' : 'drives'}
          </div>
        </div>
        <div className="stat">
          <div className="s-v">{forecast?.name ?? 'Forecast unresolved'}</div>
          <div className="s-k">
            {forecast
              ? `expected in ~${formatDuration(Math.max(0, s.timers.nextSituationMs))}`
              : 'Sub-Etha Sens-O-Matic research required'}
          </div>
        </div>
      </div>
      <p className="panel-sub">
        Anomaly pressure governs how often the universe asks you something, and the quality
        of what drifts past while it waits for an answer.
      </p>


      <Statutes />
      <Reservation />

      <div className="panel-h">The Record</div>
      <div className="stat-grid">
        <div className="stat">
          <div className="s-v num">
            <Num v={s.lifetime.tuEarned} />
          </div>
          <div className="s-k">lifetime TU</div>
        </div>
        <div className="stat">
          <div className="s-v num">
            <Num v={s.lifetime.clicks} />
          </div>
          <div className="s-k">manual terraforms</div>
        </div>
        <div className="stat">
          <div className="s-v num">
            <Num v={s.lifetime.planetsCompleted} />
          </div>
          <div className="s-k">planets completed</div>
        </div>
        <div className="stat">
          <div className="s-v num">
            <Num v={s.lifetime.systems} />
          </div>
          <div className="s-k">systems formed</div>
        </div>
        <div className="stat">
          <div className="s-v num">
            <Num v={s.lifetime.galaxies} />
          </div>
          <div className="s-k">galaxies formed</div>
        </div>
        <div className="stat">
          <div className="s-v num">
            <Num v={s.lifetime.bubblesCaught} />
          </div>
          <div className="s-k">bubbles caught</div>
        </div>
        <div className="stat">
          <div className="s-v num">
            <Num v={s.lifetime.vogonShipsRepelled} />
          </div>
          <div className="s-k">vogon ships repelled</div>
        </div>
        <div className="stat">
          <div className="s-v num">
            <Num v={s.lifetime.prestiges} />
          </div>
          <div className="s-k">magrathean commissions</div>
        </div>
        <div className="stat">
          <div className="s-v num">{formatDuration(s.gameTimeMs)}</div>
          <div className="s-k">simulated career</div>
        </div>
        <div className="stat">
          <div className="s-v num">
            run {s.run.number} · {format(s.run.tuEarned)} TU
          </div>
          <div className="s-k">current commission</div>
        </div>
      </div>

      <p className="panel-sub" style={{ marginTop: 14 }}>
        This run: {s.run.planetsCompleted} planets · {s.run.systems} systems · {s.run.galaxies}{' '}
        galaxies. Universe stage:{' '}
        {['Local System', 'Early Galaxy Age', 'Cluster Age', 'Supercluster Age', 'Cosmic Web Age'][
          s.lifetime.bestGalaxies >= 10
            ? 4
            : s.lifetime.bestGalaxies >= 6
              ? 3
              : s.lifetime.bestGalaxies >= 3
                ? 2
                : s.lifetime.bestGalaxies >= 1
                  ? 1
                  : 0
        ]}
        .
      </p>
    </div>
  );
}
