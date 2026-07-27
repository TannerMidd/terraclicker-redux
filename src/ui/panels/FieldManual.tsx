import type { ReactNode } from 'react';
import { C } from '../../content/constants';
import { FACTION_META } from '../../content/contracts';
import { CARGO_CAPACITY, RIG_LIMIT } from '../../content/refit';
import { SEAMS } from '../../content/freight';
import { MEGAPROJECTS } from '../../content/megaprojects';
import { STANDING_FLOOR } from '../../engine/situations';

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

        <Entry title="Bubbles, situations, and Vogons">
          <p>
            <b>Improbability bubbles</b> drift by every{' '}
            {Math.round(C.BUBBLE_MIN_GAP_MS / 1000)}&ndash;
            {Math.round(C.BUBBLE_MAX_GAP_MS / 1000)} seconds. Click one for an instant
            payout; rare varieties (golden cores, whales, petunias, Gargle Blasters) pay
            considerably better. Go {minutes(C.BUBBLE_PITY_MS)} minutes without catching
            one and the next is guaranteed golden.
          </p>
          <p>
            <b>Situations</b> arrive every {minutes(C.SITUATION_MIN_GAP_MS)}&ndash;
            {minutes(C.SITUATION_MAX_GAP_MS)} minutes, name one of the worlds you
            delivered, and ask you something. Each option costs real production or research
            time, and each leaves a mark. Leaving one alone is a legitimate answer and
            never a free one — the card says what kind of thing is at stake before you
            decide.
          </p>
          <p>
            Nothing hands you a production boon at random any more. Every temporary boost
            in the game is now something a situation gave you for choosing well, and
            everything that used to make events more frequent makes <em>situations</em>{' '}
            more frequent instead.
          </p>
          <p>
            <b>Vogon constructor fleets</b> occasionally stop by to read poetry
            (−{Math.round(C.VOGON_DEBUFF * 100)}% production); click all{' '}
            {C.VOGON_SHIPS} ships to cut the reading short.
          </p>
          <p>
            The <b>Vortex</b> panel tracks your local anomaly pressure — Heart of Gold
            drives raise it, improving cadence and bubble quality. If you buy nothing for{' '}
            {minutes(C.STALL_MS)} minutes, the universe takes pity and improbability rises
            on its own.
          </p>
        </Entry>

        <Entry title="Standing: what a world thinks of you">
          <p>
            Every delivered world has <b>standing</b>, and it starts full. Answer what a
            world asks and it rises; let requests lapse and it falls. A world whose
            standing has dropped visibly puts its lights out — fewer settlements burning on
            the night side, in the same places they always were — and contributes less to
            what your finished worlds are worth.
          </p>
          <p>
            Nothing is ever destroyed. Standing is floored at{' '}
            {Math.round(STANDING_FLOOR * 100)}%, and a world lights back up as soon as you
            start looking after it again.
          </p>
        </Entry>

        <Entry title="Petitions: worlds that write to you">
          <p>
            A finished world files a <b>petition</b> every{' '}
            {minutes(C.PETITION_MIN_GAP_MS)}&ndash;{minutes(C.PETITION_MAX_GAP_MS)} minutes
            about something only that world would care about — keyed to the bottleneck it
            was delivered against, and to its quirks. Up to {C.PETITION_QUEUE_MAX} can be
            waiting at once; they queue rather than interrupt, because these are requests,
            not emergencies.
          </p>
          <p>
            They are gentler than situations in both directions. Answering lifts standing,
            often for very little. A world that stops writing to you is the real penalty.
          </p>
        </Entry>

        <Entry title="Missions: flight jobs and the cargo hold">
          <p>
            Finish <b>First Sortie</b> and the company fits a rank-one <b>Cargo Hold</b> free;
            the recovered salvage still belongs to you for a different first refit. Deliver two
            worlds so clients have both an origin and a destination, then open{' '}
            <b>MS · Missions</b>. Flight Jobs remain visible there even when your current hold is
            too small, along with the exact capacity they need.
          </p>
          <p>
            <b>Accept &amp; Set Course</b> pins the job immediately. Fly first to the origin:
            arrival collects the payload automatically and retargets the destination. Arrival
            there unloads it and pays the reward. There is no dock, load, or unload button hiding
            somewhere else.
          </p>
          <p>
            Freight is <b>mass</b>, and mass is the whole mechanic: a loaded runabout takes
            longer to get moving and much longer to stop, and the approach governor needs more
            room to save you from whatever you are pointed at. The hold takes{' '}
            {CARGO_CAPACITY[1]}, {CARGO_CAPACITY[2]} then {CARGO_CAPACITY[3]} tonnes by rank.
            Passengers weigh almost nothing and pay in Guide entries as well as reputation.
          </p>
          <p>
            The board refreshes every {minutes(C.JOB_REFRESH_MS)} minutes. An accepted job never
            expires, and its course pin clears only when it is delivered, abandoned, or lost.
          </p>
        </Entry>
        <Entry title="Mining: prospect, rig, come back">
          <p>
            There are <b>{SEAMS.length} seams</b> out in the dark, placed by your
            universe&rsquo;s master seed alone — they were there before your first
            commission and they never move. Lock one at the helm and hold <kbd>e</kbd> to
            prospect it.
          </p>
          <p>
            Fit a <b>Rig Bay</b> and you can spend salvage to leave a rig standing on a
            prospected seam. It is a real structure, permanently in the sky, and it works
            whether or not the game is open — banking salvage up to its own cap and then
            waiting. Fly back and hold <kbd>e</kbd> to collect. The bay holds{' '}
            {RIG_LIMIT[1]}, {RIG_LIMIT[2]} then {RIG_LIMIT[3]} rigs by rank.
          </p>
        </Entry>

        <Entry title="Groundfall: standing on the merchandise">
          <p>
            Fly close to any world with a floor — the current commission at any stage of
            terraforming, or a delivered one — and the console offers to{' '}
            <b>make groundfall</b>. Press <kbd>e</kbd>, or simply keep flying at the
            ground: a committed dive is its own answer, the console announces{' '}
            <i>atmospheric entry</i>, and pulling up before the plasma takes is always
            enough to change your mind. Gas giants decline to provide a floor and the
            Guide declines to argue with them.
          </p>
          <p>
            On the ground you have legs (the helm keys, repurposed), a horizon that is
            genuinely the planet&rsquo;s, and whatever the gauges have actually built:
            the sea sits where Hydrologic put it, the frost line where Thermal left it,
            and the vegetation exactly as far as Biotic has crept. Crystal seams grow
            near the landing site — face one and hold <kbd>e</kbd> to swing the
            company pick until the seam gives, which takes a few honest blows and
            yields <b>core samples</b> worth {C.GROUND_SAMPLE_SALVAGE} salvage each
            once you carry them back aboard. Bank {C.GROUND_SURVEY_SAMPLES} in one
            landing and the world&rsquo;s <b>ground survey</b> is filed for a one-time{' '}
            {C.GROUND_SURVEY_BONUS}-salvage bonus, because almost nobody ever bothers
            to stand on anything.
          </p>
          <p>
            Walk back to the runabout and press <kbd>e</kbd> to leave. The ship handles
            the ascent; the universe is where you parked it.
          </p>
        </Entry>

        <Entry title="Customs, and how to leave">
          <p>
            Carrying a manifest makes you interesting to people who inspect manifests. A
            patrol only ever takes an interest in <em>cargo</em>, so an empty ship is never
            stopped and sightseeing is never taxed.
          </p>
          <p>
            Three ways out, none involving weapons. <b>Outrun</b> it — harder loaded, which
            is where the mass you accepted comes back for its answer. <b>Comply</b> by
            stopping, and lose the cargo and the fee. Or fit a <b>Dispersal Field</b> and
            hold <kbd>f</kbd> until it loses interest, which harms nobody and is enormously
            resented.
          </p>
        </Entry>

        <Entry title="Megaprojects: the things that take days">
          <p>
            Commissioned with TU in Operations, then built over <b>real days</b> —
            including the days you are not here. Alone among everything in this game, a
            megaproject makes progress while the tab is shut, at full rate, because being
            what happened while you were gone is the entire point of it.
          </p>
          <p>
            They are gated on <b>faction reputation</b>, which is what reputation is now
            for. You earn it by completing contracts, by flying freight for a faction, and
            by looking after the worlds that write to you.
          </p>
          <p>
            A finished megaproject is <b>not sold with the commission</b>. Magrathea buys
            the portfolio; it does not buy the monuments. It keeps its effect across every
            commission that follows, stands in the sky over your home world, and is the
            only permanent thing you can build. There are {MEGAPROJECTS.length} of them.
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

        <Entry title="Missions: desk contracts">
          <p>
            <b>MS · Missions</b> is available from the beginning. Its first board always includes
            one plain one-world delivery contract, so the first mission teaches the core idle loop
            before asking for surveys, bottlenecks, deadlines, or entire systems. The other offers
            come from <b>{FACTION_META.magrathea.label}</b>,{' '}
            <b>{FACTION_META.mice.label}</b>, and <b>{FACTION_META.vogon.label}</b>.
          </p>
          <p>
            You may hold <b>one active desk contract</b> at a time, and only work done{' '}
            <i>after acceptance</i> counts. Completing one pays <b>Blueprints</b> and{' '}
            <b>reputation</b>; every {C.CONTRACT_REPUTATION_PER_BP} reputation with a faction
            adds +{C.CONTRACT_REPUTATION_BP_CAP} BP to that faction&rsquo;s future offers.
          </p>
          <p>
            Withdrawing costs nothing but progress. Timed contracts use simulation time, so their
            deadlines keep counting while you are away. The board offers one free reissue at each
            system count. Completed desk contracts and the total number of flight deliveries stay
            visible in the Missions record.
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

        <Entry title="Systems and galaxy accords">
          <p>
            Every formed system offers <b>Charter articles</b> in Magrathea. The offers are
            shaped by the five member worlds, so surveys, bottlenecks, and installations leave
            a political consequence after their production numbers are gone. Signing is a
            choice for the current portfolio, not permanent account progression.
          </p>
          <p>
            Five systems form a galaxy. Once three of its system seats have signed, their
            articles ratify a <b>Galaxy Accord</b>: civic and works accords strengthen production,
            observatory accords strengthen Science, and elemental accords strengthen all four
            world aspects. Galaxies with different traditions also exchange a small production
            bonus. Magrathea shows the next quorum before formation and the exact network total
            afterwards; the universe renders the resulting links, halos, and moving traffic.
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
