import type { ReactNode } from 'react';
import { C } from '../../content/constants';
import { FACTION_META } from '../../content/contracts';

/**
 * The Guide's practical entry on playing the game. Every number is read from
 * the constants file, so the manual re-balances itself alongside the game.
 */

const pct = (mult: number) => `${Math.round((mult - 1) * 100)}%`;
const minutes = (ms: number) => Math.round(ms / 60_000);

function Entry({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="manual-entry">
      <summary>{title}</summary>
      <div className="manual-body">{children}</div>
    </details>
  );
}

export function FieldManual() {
  return (
    <>
      <div className="panel-h">Field Manual</div>
      <p className="panel-sub">
        Everything the Guide knows about running a planetary construction business, filed
        under mostly harmless. Tap an entry to expand it.
      </p>
      <div className="manual">
        <Entry title="The loop, in one breath">
          <p>
            Click the planet to generate <b>Terraforming Units (TU)</b>. Spend TU on
            installations that produce more TU and fill the planet&rsquo;s four{' '}
            <b>aspect gauges</b>. When all four gauges reach their targets, the world is
            delivered, you collect a completion bonus, and a slightly larger commission is
            wheeled out of the workshop. Everything else in this manual is decoration on
            that loop.
          </p>
        </Entry>

        <Entry title="Aspects, gauges, and the bottleneck">
          <p>
            Every world needs <b>Thermal</b>, <b>Atmospheric</b>, <b>Hydrologic</b>, and{' '}
            <b>Biotic</b> work. Each planet type is biased — ice worlds want heat, deserts
            want water — so the right installations change from world to world.
          </p>
          <p>
            Once a gauge is full, further production of that aspect converts to TU at{' '}
            {Math.round(C.OVERFLOW_RATE * 100)}% efficiency, so overbuilding is never
            wasted, merely frowned upon.
          </p>
          <p>
            The gauge that finishes <i>last</i> is recorded as the world&rsquo;s{' '}
            <b>primary bottleneck</b>. This is not idle bookkeeping: bottlenecks decide
            which contracts a delivery satisfies, which dispatch routes a system can run,
            and what a heritage world strengthens forever.
          </p>
          <p>
            From the {C.SURVEY_FROM_INDEX + 1}th world of a commission onward you may file
            an <b>orbital survey</b> before construction — a one-time choice that tilts
            the world&rsquo;s behavior. Surveyed worlds also satisfy survey contracts and
            help a system qualify for the Science route.
          </p>
        </Entry>

        <Entry title="Science and research">
          <p>
            Research Labs produce <b>Science</b>, which pays for research projects that
            take real time to complete. Most research is lost when you sell the portfolio,
            but a few discoveries are marked as persistent and survive — the Guide
            considers actually finishing them the hard part.
          </p>
        </Entry>

        <Entry title="Bubbles, events, and Vogons">
          <p>
            <b>Improbability bubbles</b> drift by every{' '}
            {Math.round(C.BUBBLE_MIN_GAP_MS / 1000)}&ndash;
            {Math.round(C.BUBBLE_MAX_GAP_MS / 1000)} seconds. Click one for an instant
            payout; rare varieties (golden cores, whales, petunias, Gargle Blasters) pay
            considerably better. Go {minutes(C.BUBBLE_PITY_MS)} minutes without catching
            one and the next is guaranteed golden.
          </p>
          <p>
            <b>Events</b> arrive every {minutes(C.EVENT_MIN_GAP_MS)}&ndash;
            {minutes(C.EVENT_MAX_GAP_MS)} minutes with temporary boons or nuisances.{' '}
            <b>Vogon constructor fleets</b> occasionally stop by to read poetry
            (−{Math.round(C.VOGON_DEBUFF * 100)}% production); click all{' '}
            {C.VOGON_SHIPS} ships to cut the reading short.
          </p>
          <p>
            The <b>Vortex</b> panel tracks your local anomaly pressure — Heart of Gold
            drives raise it, improving event cadence and bubble quality. If you buy
            nothing for {minutes(C.STALL_MS)} minutes, the universe takes pity and
            improbability rises on its own.
          </p>
        </Entry>

        <Entry title="Systems and galaxies">
          <p>
            Every {C.PLANETS_PER_SYSTEM} delivered worlds form a <b>system</b> (+
            {Math.round(C.SYSTEM_BONUS * 100)}% production each, this commission). Every{' '}
            {C.SYSTEMS_PER_GALAXY} systems form a <b>galaxy</b> (×{C.GALAXY_MULT} each).
            Completed worlds persist in the universe view — zoom out and they are all
            still there, orbiting, which is more than most employers offer.
          </p>
        </Entry>

        <Entry title="Operations: contracts">
          <p>
            After your first delivery, three factions post work on the Operations board:{' '}
            <b>{FACTION_META.magrathea.label}</b> (deliveries and system assembly),{' '}
            <b>{FACTION_META.mice.label}</b> (bottleneck and survey requirements), and{' '}
            <b>{FACTION_META.vogon.label}</b> (building ceilings and deadlines).
          </p>
          <p>
            You may hold <b>one active contract</b> at a time, and only work done{' '}
            <i>after acceptance</i> counts. Completing a contract pays{' '}
            <b>Blueprints</b> and <b>reputation</b>; every{' '}
            {C.CONTRACT_REPUTATION_PER_BP} reputation with a faction adds +
            {C.CONTRACT_REPUTATION_BP_CAP} BP to that faction&rsquo;s future offers.
          </p>
          <p>
            Withdrawing costs nothing but the progress. Timed filings use simulation
            time, so deadlines keep counting while you are away. The board offers one
            free reissue at each system count if you dislike all three filings.
          </p>
        </Entry>

        <Entry title="Operations: dispatch routes">
          <p>
            A formed system can be assigned a <b>specialty route</b>: an aspect route (+
            {pct(C.SYSTEM_SPECIALTY_ASPECT_MULT)} to that aspect), Science (+
            {pct(C.SYSTEM_SPECIALTY_SCIENCE_MULT)} Science), or Production (+
            {pct(C.SYSTEM_SPECIALTY_PRODUCTION_MULT)} to everything).
          </p>
          <p>
            Routes are limited by <b>dispatch slots</b>: you start with{' '}
            {C.CONTRACT_DISPATCH_BASE}, gain one per {C.CONTRACTS_PER_DISPATCH_SLOT}{' '}
            completed contracts, and top out at {C.CONTRACT_DISPATCH_MAX}. A system can
            only run routes its history justifies — an aspect route needs a member world
            with that recorded bottleneck; Science needs two surveyed worlds; Production
            is always legal, like paperwork.
          </p>
        </Entry>

        <Entry title="Operations: heritage worlds">
          <p>
            Before selling a portfolio, designate one completed world in the{' '}
            <b>Commission Atlas</b> below as a heritage candidate. When you sell, that
            world is archived permanently. The newest {C.HERITAGE_ACTIVE_LIMIT} heritage
            worlds each grant +{pct(C.HERITAGE_ASPECT_MULT)} output to their recorded
            bottleneck aspect, across every future commission.
          </p>
        </Entry>

        <Entry title="Selling to Magrathea">
          <p>
            Selling the portfolio (<b>prestige</b>) trades your entire run — planets,
            installations, upgrades — for <b>Blueprints (BP)</b>. Magrathea only buys
            complete portfolios: the first sale requires{' '}
            {C.PRESTIGE_MIN_SYSTEMS} finished systems, and each sale raises the
            requirement by {C.PRESTIGE_SYSTEMS_PER_COMMISSION}.
          </p>
          <p>
            BP buys catalogue perks, and every BP ever earned adds a permanent +
            {Math.round(C.BP_PASSIVE * 100)}% production. You also keep Guide entries,
            heritage worlds, faction reputation, contract history, and persistent
            research. The mice keep everything else.
          </p>
        </Entry>

        <Entry title="Away time and saving">
          <p>
            While you are gone the simulation continues at{' '}
            {Math.round(C.OFFLINE_EFFICIENCY * 100)}% efficiency for up to{' '}
            {Math.round(C.OFFLINE_CAP_MS / 3_600_000)} hours, contract deadlines
            included, and files a report when you return.
          </p>
          <p>
            The game autosaves to this browser and rotates backups. Settings offers
            export and import as <b>TC2</b> strings — export before switching machines,
            and occasionally on principle. If a save is ever rejected, it is quarantined
            rather than deleted, and the recovery page can inspect and restore it.
          </p>
        </Entry>
      </div>
    </>
  );
}
