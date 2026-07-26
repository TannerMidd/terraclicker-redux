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
import { useEffect, useRef, useState } from 'react';
import { actions, useGame } from '../../../state/store';
import { format, formatDuration } from '../../../engine/num';
import { forecastSituation } from '../../../engine/situations';
import { enactedStatutes, statuteOffers, universeStage } from '../../../engine/statutes';
import { hasBooked, reservationStatus } from '../../../engine/reservation';
import { RESERVATION_TEXT } from '../../../content/reservation';
import { PARA_BREAK } from '../../panels/reservationText';

const STAGES = ['Local System', 'Early Galaxy Age', 'Cluster Age', 'Supercluster Age'];

function Statutes() {
  const { s } = useGame.getState();
  const stage = universeStage(s);
  const enacted = enactedStatutes(s);
  const offers = statuteOffers(s);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pending = pendingId ? offers.find((offer) => offer.id === pendingId) ?? null : null;
  const offerStages = [...new Set(offers.map((offer) => offer.stage))].sort((a, b) => a - b);

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  if (stage === 0 && enacted.length === 0) return null;

  return (
    <>
      {offers.length > 0 ? (
        <>
          <div className="dr-sec">
            <span className="dr-sec-k" style={{ color: 'var(--brass-lit)' }}>Acts before the house</span>
            <span className="dr-rule" />
            <span className="dr-sec-note">{offerStages.length} STAGE{offerStages.length === 1 ? '' : 'S'}</span>
          </div>
          <p className="dr-note">
            Choose one act for each open stage. Enactment costs no currency, survives every
            commission sale, and cannot be repealed.
          </p>
          {offerStages.map((offerStage) => (
            <section className="dr-statute-stage" key={offerStage}>
              <div className="dr-subhead">
                {STAGES[offerStage] ?? `Stage ${offerStage}`} / choose one
              </div>
              {offers.filter((offer) => offer.stage === offerStage).map((def) => (
                <button
                  key={def.id}
                  className="dr-card offer"
                  onClick={() => setPendingId(def.id)}
                >
                  <div className="dr-card-name">{def.name}</div>
                  <div className="dr-card-body">{def.text}</div>
                  <div className="dr-card-note" style={{ color: 'var(--magrathea)' }}>{def.terms}</div>
                  <span className="dr-card-cta">REVIEW PERMANENT ACT</span>
                </button>
              ))}
            </section>
          ))}
        </>
      ) : (
        enacted.length > 0 && (
          <p className="dr-note">Nothing further is before the house until the universe is larger.</p>
        )
      )}

      {enacted.length > 0 && (
        <details className="dr-disclosure">
          <summary>
            <span>Enacted statutes</span>
            <b>{enacted.length}</b>
          </summary>
          <div className="dr-disclosure-body">
            {enacted.map((def) => (
              <div key={def.id} className="dr-law">
                <b>{def.name}</b>
                <em>{def.terms}</em>
              </div>
            ))}
          </div>
        </details>
      )}

      {pending && (
        <div className="modal-veil" onClick={() => setPendingId(null)}>
          <div
            className="modal dr-statute-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="statute-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="dr-sec-k">Permanent statute / {STAGES[pending.stage] ?? `Stage ${pending.stage}`}</span>
            <h2 id="statute-confirm-title">Enact {pending.name}?</h2>
            <p className="m-body">{pending.text}</p>
            <p className="dr-statute-terms">{pending.terms}</p>
            <ul className="dr-statute-warning">
              <li>No currency is spent.</li>
              <li>This chooses the law for its stage.</li>
              <li>It survives every commission sale.</li>
              <li>It cannot be repealed.</li>
            </ul>
            <div className="m-actions">
              <button ref={cancelRef} className="btn" onClick={() => setPendingId(null)}>Not yet</button>
              <button
                className="btn dr-enact"
                onClick={() => {
                  const id = pending.id;
                  setPendingId(null);
                  actions.enactStatute(id);
                }}
              >
                Enact permanently
              </button>
            </div>
          </div>
        </div>
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
