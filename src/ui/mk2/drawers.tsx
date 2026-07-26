/**
 * The nine drawers.
 *
 * Each one declares how it announces itself — a two-letter code on the rail, a
 * name, and a one-line statement of what it is FOR, because a panel that has
 * to be opened to find out what it does is a filing cabinet with no labels.
 *
 * The three-cell ledger under each header is the drawer's own vital signs: the
 * numbers you would otherwise open the drawer to check. They are chosen so
 * that a glance at the header answers "do I need to be in here right now".
 */
import { useGame } from '../../state/store';
import { format, formatDuration } from '../../engine/num';
import { C } from '../../content/constants';
import { currentManifestLeg } from '../../engine/freight';
import { statuteOffers } from '../../engine/statutes';
import { Installations } from './drawers/Installations';
import { Research } from './drawers/Research';
import { Operations } from './drawers/Operations';
import { Guide } from './drawers/Guide';
import { Vortex } from './drawers/Vortex';
import { Chart } from './drawers/Chart';
import { Orders } from './drawers/Orders';
import { Magrathea } from './drawers/Magrathea';
import { Settings } from './drawers/Settings';
import './drawers.css';

export type DrawerId =
  | 'shop'
  | 'research'
  | 'orders'
  | 'operations'
  | 'magrathea'
  | 'chart'
  | 'guide'
  | 'vortex'
  | 'settings';

export interface LedgerCell {
  k: string;
  v: string;
  color?: string;
}

export interface DrawerMeta {
  /** Two letters, stamped on the rail. */
  code: string;
  /** The rail's own tiny label under the code. */
  rail: string;
  eyebrow: string;
  title: string;
  dek: string;
  ledger: () => LedgerCell[];
}

/** Count of installations standing, which is a different number from types. */
function installations(buildings: Record<string, number | undefined>): number {
  let n = 0;
  for (const key of Object.keys(buildings)) n += buildings[key] ?? 0;
  return n;
}

export const DRAWERS: Record<DrawerId, DrawerMeta> = {
  shop: {
    code: 'IN',
    rail: 'WORKS',
    eyebrow: 'The works',
    title: 'Installations',
    dek: 'Things that do the terraforming while you are thinking about something else. Upgrades first — they are one-off, permanent, and never the wrong purchase.',
    ledger: () => {
      const { s, d } = useGame.getState();
      return [
        { k: 'STANDING', v: String(installations(s.buildings)) },
        { k: 'PER SECOND', v: format(d.tuPerSec), color: 'var(--bio)' },
        { k: 'ON HAND', v: format(s.tu) },
      ];
    },
  },
  research: {
    code: 'RD',
    rail: 'LAB',
    eyebrow: 'The laboratory',
    title: 'Research',
    dek: 'Science accrues whether or not anybody is watching it. Projects run one at a time and finish on their own schedule, which is rarely yours.',
    ledger: () => {
      const { s, d } = useGame.getState();
      return [
        { k: 'SCIENCE', v: format(s.science), color: 'var(--atmo)' },
        { k: 'PER SECOND', v: format(d.sciencePerSec) },
        { k: 'CONCLUDED', v: String(s.research.completed.length) },
      ];
    },
  },
  orders: {
    code: 'SO',
    rail: 'ORDERS',
    eyebrow: 'Automation',
    title: 'Standing Orders',
    dek: 'What the department should do without being asked. Every switch here is something you have already done by hand at least once.',
    ledger: () => {
      const { s } = useGame.getState();
      const o = s.standingOrders;
      return [
        { k: 'MASTER', v: o.enabled ? 'IN FORCE' : 'STOOD DOWN', color: o.enabled ? 'var(--magrathea)' : 'var(--ink-faint)' },
        { k: 'HOLD BACK', v: `${Math.round((o.reserveSeconds ?? 0))}s` },
        { k: 'COMMISSION', v: String(s.lifetime.prestiges + 1) },
      ];
    },
  },
  operations: {
    code: 'OP',
    rail: 'OPS',
    eyebrow: 'The business',
    title: 'Operations',
    dek: 'Start with Filings for contracts and deadlines. Works holds freight, rigs, and monuments; Dispatch assigns system routes; Heritage records what survives a sale.',
    ledger: () => {
      const { s } = useGame.getState();
      const leg = currentManifestLeg(s);
      const rigs = Object.values(s.expedition.rigs);
      const ready = rigs.filter((rig) => Math.floor(rig.banked) > 0).length;
      const contract = s.operations.active
        ? 'ACTIVE'
        : s.operations.offers.length > 0
          ? `${s.operations.offers.length} OFFER${s.operations.offers.length === 1 ? '' : 'S'}`
          : 'NONE';
      return [
        { k: 'CONTRACT', v: contract, color: s.operations.active ? 'var(--atmo)' : undefined },
        { k: 'FREIGHT', v: leg ? leg.phase.toUpperCase() : s.expedition.jobs.length > 0 ? `${s.expedition.jobs.length} JOBS` : 'NONE', color: leg ? 'var(--atmo)' : undefined },
        { k: 'RIGS', v: ready > 0 ? `${ready} READY` : rigs.length > 0 ? `${rigs.length} OUT` : 'NONE', color: ready > 0 ? 'var(--bio)' : undefined },
      ];
    },
  },
  magrathea: {
    code: 'MG',
    rail: 'MAGRA',
    eyebrow: 'The firm',
    title: 'Magrathea',
    dek: 'Sell the portfolio. The mice pay in Blueprints, the universe starts again, and everything you learned about it does not.',
    ledger: () => {
      const { s, d } = useGame.getState();
      return [
        { k: 'BLUEPRINTS', v: String(s.prestige.bp), color: 'var(--magrathea)' },
        { k: 'ON SALE', v: d.prestigeEligible ? 'READY' : 'NOT YET', color: d.prestigeEligible ? 'var(--bio)' : undefined },
        { k: 'COMMISSIONS', v: String(s.lifetime.prestiges) },
      ];
    },
  },
  chart: {
    code: 'CH',
    rail: 'CHART',
    eyebrow: 'Navigation',
    title: 'The Chart',
    dek: 'Everywhere addressable, and the one place you have pinned. Provisional, as all charts of an expanding universe are.',
    ledger: () => {
      const { s } = useGame.getState();
      return [
        { k: 'WORLDS', v: String(s.run.completedPlanets.length) },
        { k: 'LANDMARKS', v: String(Object.keys(s.expedition.discovered).length), color: 'var(--atmo)' },
        { k: 'PINNED', v: s.expedition.pinned ? 'ONE' : 'NONE' },
      ];
    },
  },
  guide: {
    code: 'GD',
    rail: 'GUIDE',
    eyebrow: 'The Guide',
    title: 'The Guide',
    dek: 'Entries earned, the field manual, and whatever the channel has been saying about you. Largely accurate, occasionally apologetic.',
    ledger: () => {
      const { s } = useGame.getState();
      return [
        { k: 'ENTRIES', v: String(Object.keys(s.achievements).length), color: 'var(--improbable)' },
        { k: 'WORLDS MADE', v: String(s.lifetime.planetsCompleted) },
        { k: 'CLICKS', v: format(s.lifetime.clicks) },
      ];
    },
  },
  vortex: {
    code: 'VX',
    rail: 'VORTEX',
    eyebrow: 'Perspective',
    title: 'Total Perspective Vortex',
    dek: 'Decisions first: statutes permanently change every commission. The perspective reading and complete lifetime record follow below.',
    ledger: () => {
      const { s } = useGame.getState();
      const offers = statuteOffers(s);
      const openStages = new Set(offers.map((offer) => offer.stage)).size;
      return [
        { k: 'STATUTES', v: openStages > 0 ? `${openStages} OPEN` : `${s.lifetime.statutes.length} ENACTED`, color: openStages > 0 ? 'var(--magrathea)' : undefined },
        { k: 'LIFETIME TU', v: format(s.lifetime.tuEarned) },
        { k: 'GALAXIES', v: String(s.run.galaxies) },
      ];
    },
  },
  settings: {
    code: 'ST',
    rail: 'DEPT',
    eyebrow: 'The department',
    title: 'Settings',
    dek: 'Saves, imports, comfort, and the switches nobody should have to find twice.',
    ledger: () => {
      const { s } = useGame.getState();
      // Simulated time, not wall-clock: the department bills for work done,
      // and the sim is the only witness to how much of that there was.
      const onThisWorld = Math.max(0, s.gameTimeMs - s.planet.startedAtGameMs);
      return [
        { k: 'THIS WORLD', v: formatDuration(onThisWorld) },
        { k: 'COMMISSION', v: String(s.lifetime.prestiges + 1) },
        { k: 'PER SYSTEM', v: `${C.PLANETS_PER_SYSTEM} WORLDS` },
      ];
    },
  },
};

/** The drawer body itself. */
export function Drawer({ id }: { id: DrawerId }) {
  switch (id) {
    case 'shop':
      return <Installations />;
    case 'research':
      return <Research />;
    case 'orders':
      return <Orders />;
    case 'operations':
      return <Operations />;
    case 'magrathea':
      return <Magrathea />;
    case 'chart':
      return <Chart />;
    case 'guide':
      return <Guide />;
    case 'vortex':
      return <Vortex />;
    case 'settings':
      return <Settings />;
    default:
      return null;
  }
}
