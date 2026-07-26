/**
 * VX · Total Perspective Vortex.
 *
 * The drawer about scale, so it is the one place in Mk II where a number is
 * allowed to be enormous and unhelpful. The headline percentage is the whole
 * point of the machine: it is always essentially zero, and it is always
 * honestly computed.
 *
 * The statutes live here rather than in Operations because a statute is the
 * only thing in the game that applies at every scale at once, and an enacted
 * law is listed permanently — a law you cannot see is indistinguishable from
 * a bug.
 */
import { actions, useGame } from '../../../state/store';
import { format, formatDuration } from '../../../engine/num';
import { forecastSituation } from '../../../engine/situations';
import { enactedStatutes, statuteOffers, universeStage } from '../../../engine/statutes';
import { hasBooked, reservationStatus } from '../../../engine/reservation';
import { RESERVATION_TEXT } from '../../../content/reservation';
import { PARA_BREAK } from '../../panels/reservationText';

const STAGES = ['Local System', 'Early Galaxy Age', 'Cluster Age', 'Supercluster Age', 'Cosmic Web Age'];

function Statutes() {
  const { s } = useGame.getState();
  const stage = universeStage(s);
  const enacted = enactedStatutes(s);
  const offers = statuteOffers(s);
  if (stage === 0 && enacted.length === 0) return null;

  return (
    <>
      <div className="dr-sec">
        <span className="dr-sec-k">Statutes of the universe</span>
        <span className="dr-rule" />
        <span className="dr-sec-note">{enacted.length} ENACTED</span>
      </div>
      {enacted.map((def) => (
        <div key={def.id} className="dr-law">
          <b>{def.name}</b>
          <em>{def.terms}</em>
        </div>
      ))}
      {offers.length > 0 ? (
        <>
          <p className="dr-note">
            The house will hear one act per stage. It cannot be repealed afterwards, on the
            grounds that you will be living in it.
          </p>
          {offers.map((def) => (
            <button key={def.id} className="dr-card offer" onClick={() => actions.enactStatute(def.id)}>
              <div className="dr-card-name">{def.name}</div>
              <div className="dr-card-body">{def.text}</div>
              <div className="dr-card-note" style={{ color: 'var(--magrathea)' }}>{def.terms}</div>
            </button>
          ))}
        </>
      ) : (
        enacted.length > 0 && (
          <p className="dr-note">Nothing further is before the house until the universe is larger.</p>
        )
      )}
    </>
  );
}

function Reservation() {
  const { s } = useGame.getState();
  const status = reservationStatus(s);
  const booked = hasBooked(s);
  if (!booked && status.progress < 0.25) return null;

  if (booked) {
    return (
      <>
        <div className="dr-sec">
          <span className="dr-sec-k" style={{ color: 'var(--brass-lit)' }}>Milliways — table confirmed</span>
          <span className="dr-rule" />
        </div>
        {RESERVATION_TEXT.split(PARA_BREAK).map((para, i) => (
          <p key={i} className="dr-note" style={{ color: 'var(--ink-2)' }}>{para}</p>
        ))}
      </>
    );
  }

  return (
    <>
      <div className="dr-sec">
        <span className="dr-sec-k" style={{ color: 'var(--brass-lit)' }}>Milliways — reservation, pending</span>
        <span className="dr-rule" />
        <span className="dr-sec-note">{Math.floor(status.progress * 100)}%</span>
      </div>
      <p className="dr-note">
        The Restaurant at the End of the Universe books retrospectively: the table is reserved
        once the meal has been eaten. The booking below is therefore not a list of things to
        do. It is a list of things that will turn out to have happened.
      </p>
      {status.clauses.map(({ clause, met, progress }) => (
        <div key={clause.id} className={`dr-clause${met ? ' met' : ''}`}>
          <span aria-hidden>{met ? '✓' : '·'}</span>
          <span>{clause.text}</span>
          {!met && <b>{Math.floor(progress * 100)}%</b>}
        </div>
      ))}
    </>
  );
}

export function Vortex() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s, d } = useGame.getState();
  const pct = 100 * (1 - Math.exp(-s.lifetime.bestGalaxies / 6));
  const forecast = s.research.completed.includes('sens-o-matic') ? forecastSituation(s, d) : null;
  const drives = s.buildings['heartOfGold'] ?? 0;

  const record: [string, string][] = [
    ['LIFETIME TU', format(s.lifetime.tuEarned)],
    ['MANUAL TERRAFORMS', format(s.lifetime.clicks)],
    ['PLANETS COMPLETED', String(s.lifetime.planetsCompleted)],
    ['SYSTEMS FORMED', String(s.lifetime.systems)],
    ['GALAXIES FORMED', String(s.lifetime.galaxies)],
    ['BUBBLES CAUGHT', String(s.lifetime.bubblesCaught)],
    ['VOGON SHIPS REPELLED', String(s.lifetime.vogonShipsRepelled)],
    ['MAGRATHEAN COMMISSIONS', String(s.lifetime.prestiges)],
    ['SIMULATED CAREER', formatDuration(s.gameTimeMs)],
    ['THIS COMMISSION', `${format(s.run.tuEarned)} TU`],
  ];

  return (
    <>
      <p className="dr-note">The one machine no mind survives unhumbled. Yours reads, in full:</p>
      <div className="dr-vortex">
        <div className="dr-vortex-pct">{pct < 0.01 ? '0.000' : pct.toFixed(pct < 1 ? 3 : 1)}%</div>
        <div className="dr-meter">
          <i style={{ width: `${Math.max(0.5, pct)}%`, background: 'var(--magrathea)' }} />
        </div>
        <div className="dr-vortex-cap">of the universe terraformed. You are here. ↑</div>
      </div>

      <div className="dr-sec">
        <span className="dr-sec-k">Local improbability</span>
        <span className="dr-rule" />
      </div>
      <div className="dr-pairs">
        <div>
          <b style={{ color: 'var(--magrathea)' }}>
            {d.improbability < 0.01 ? '0.000' : d.improbability.toFixed(d.improbability < 1 ? 2 : 1)}%
          </b>
          <span>ANOMALY PRESSURE · {drives} HEART OF GOLD {drives === 1 ? 'DRIVE' : 'DRIVES'}</span>
        </div>
        <div>
          <b>{forecast?.name ?? 'Forecast unresolved'}</b>
          <span>
            {forecast
              ? `EXPECTED IN ~${formatDuration(Math.max(0, s.timers.nextSituationMs))}`
              : 'SUB-ETHA SENS-O-MATIC REQUIRED'}
          </span>
        </div>
      </div>
      <p className="dr-note">
        Anomaly pressure governs how often the universe asks you something, and the quality of
        what drifts past while it waits for an answer.
      </p>

      <Statutes />
      <Reservation />

      <div className="dr-sec">
        <span className="dr-sec-k">The record</span>
        <span className="dr-rule" />
        <span className="dr-sec-note">{STAGES[universeStage(s)] ?? STAGES[0]}</span>
      </div>
      <div className="dr-record">
        {record.map(([k, v]) => (
          <div key={k}>
            <b>{v}</b>
            <span>{k}</span>
          </div>
        ))}
      </div>
      <div style={{ height: 20 }} />
    </>
  );
}
