import { actions, useGame } from '../../state/store';
import { format, formatDuration } from '../../engine/num';
import { forecastSituation } from '../../engine/situations';
import { Num } from '../bits';
import { enactedStatutes, statuteOffers, universeStage } from '../../engine/statutes';

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
