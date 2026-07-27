import { create } from 'zustand';
import { computeDerived, newGame, step, stepOffline } from '../engine/sim';
import { buildCircular, type CircularItem } from '../engine/circular';
import type { StandingOrders } from '../engine/standingOrders';
import { deserialize, exportSave, importSave, serialize } from '../engine/save/codec';
import type { Decimal } from '../engine/num';
import { ASPECTS, type AspectId, type Derived, type GameState, type GroundSiteOutcome, type Input, type SampleHaul, type SimEffect, type SystemSpecialty } from '../engine/types';
import { C } from '../content/constants';

const SAVE_KEY = 'terraclicker2.save';
const BACKUP_KEYS = ['terraclicker2.backup.0', 'terraclicker2.backup.1'];
const QUARANTINE_KEY = 'terraclicker2.recovery.rejected';
const BACKUP_INTERVAL_MS = 5 * 60_000;

export type OfflineCompletedContract = Omit<Extract<SimEffect, { t: 'contractCompleted' }>, 't' | 'id'>;
export type OfflineFailedContract = Omit<Extract<SimEffect, { t: 'contractFailed' }>, 't' | 'id'>;

export interface OfflineReport {
  /** The Morning Circular: what happened, and what it wants doing. */
  circular: CircularItem[];
  simulatedMs: number;
  cappedMs: number;
  tuGained: Decimal;
  scienceGained: Decimal;
  planetsCompleted: number;
  planetNames: string[];
  researchCompleted: string[];
  systemsFormed: number;
  galaxiesFormed: number;
  achievementsUnlocked: string[];
  completedContracts: OfflineCompletedContract[];
  failedContracts: OfflineFailedContract[];
  bottleneck: AspectId;
}

interface GameStore {
  /** Live engine state — mutated in place by the loop; treat as read-only in UI. */
  s: GameState;
  /** Fresh derived bundle, republished each logic tick. */
  d: Derived;
  /** Bumped on every publish; cheap subscription key. */
  rev: number;
  booted: boolean;
  loadError: string | null;
  /** True when a rejected save is quarantined and automatic writes must stop. */
  persistenceBlocked: boolean;
  /** Wall-clock of the last confirmed main-save write in this session. */
  lastSavedAt: number | null;
  /** A visible persistence failure; null after the next confirmed write. */
  saveError: string | null;
  offlineReport: OfflineReport | null;
  dismissOfflineReport: () => void;
}

type EffectListener = (effects: SimEffect[]) => void;
const effectListeners = new Set<EffectListener>();

/** Subscribe to sim effects (cinematics, audio, toasts). Returns unsubscribe. */
export function onEffects(cb: EffectListener): () => void {
  effectListeners.add(cb);
  return () => effectListeners.delete(cb);
}

function emit(effects: SimEffect[]): void {
  if (effects.length === 0) return;
  for (const cb of effectListeners) cb(effects);
}

function opts() {
  return { utcDay: new Date().getUTCDay() };
}
function currentBottleneck(state: GameState): AspectId {
  let result: AspectId = 'thermal';
  let lowest = Number.POSITIVE_INFINITY;
  for (const aspect of ASPECTS) {
    const fraction = state.planet.gauges[aspect].div(state.planet.targets[aspect]).toNumber();
    if (fraction < lowest) {
      lowest = fraction;
      result = aspect;
    }
  }
  return result;
}

function simulateAbsence(state: GameState, elapsed: number): {
  report: OfflineReport;
  effects: SimEffect[];
} {
  const scienceBefore = state.science;
  const planetsBefore = state.lifetime.planetsCompleted;
  // Captured before the absence runs: the Circular reports what is new since
  // the player last saw it, and after `stepOffline` that instant is gone.
  const leftAtMs = state.gameTimeMs;
  const res = stepOffline(state, elapsed, opts());
  const planetNames = res.effects
    .filter((effect): effect is Extract<SimEffect, { t: 'planetComplete' }> => effect.t === 'planetComplete')
    .map((effect) => effect.name);
  const completedContracts: OfflineCompletedContract[] = res.effects
    .filter((effect): effect is Extract<SimEffect, { t: 'contractCompleted' }> => effect.t === 'contractCompleted')
    .map(({ templateId, faction, rewardBp, rewardReputation }) => ({
      templateId, faction, rewardBp, rewardReputation,
    }));
  const failedContracts: OfflineFailedContract[] = res.effects
    .filter((effect): effect is Extract<SimEffect, { t: 'contractFailed' }> => effect.t === 'contractFailed')
    .map(({ templateId, reason }) => ({ templateId, reason }));

  return {
    effects: res.effects,
    report: {
      simulatedMs: res.simulatedMs,
      cappedMs: elapsed - res.simulatedMs,
      circular: buildCircular(state, leftAtMs),
      tuGained: res.tuGained,
      scienceGained: state.science.sub(scienceBefore),
      planetsCompleted: state.lifetime.planetsCompleted - planetsBefore,
      planetNames,
      researchCompleted: res.effects
        .filter((effect): effect is Extract<SimEffect, { t: 'researchDone' }> => effect.t === 'researchDone')
        .map((effect) => effect.id),
      systemsFormed: res.effects.filter((effect) => effect.t === 'systemFormed').length,
      galaxiesFormed: res.effects.filter((effect) => effect.t === 'galaxyFormed').length,
      achievementsUnlocked: res.effects
        .filter((effect): effect is Extract<SimEffect, { t: 'achievement' }> => effect.t === 'achievement')
        .map((effect) => effect.id),
      completedContracts,
      failedContracts,
      bottleneck: currentBottleneck(state),
    },
  };
}

// ————— Boot: load or new game —————

interface BootResult {
  state: GameState;
  loadError: string | null;
  report: OfflineReport | null;
  persistenceBlocked: boolean;
}

function quarantineRejectedSave(raw: string): boolean {
  try {
    const existing = localStorage.getItem(QUARANTINE_KEY);
    if (!existing) {
      localStorage.setItem(QUARANTINE_KEY, raw);
    } else if (existing !== raw) {
      localStorage.setItem(`${QUARANTINE_KEY}.${Date.now()}`, raw);
    }
    return true;
  } catch {
    return false;
  }
}

function boot(): BootResult {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    /* storage unavailable (private mode etc.) — run in-memory */
  }
  if (raw) {
    const r = deserialize(raw);
    if (r.ok) {
      try {
        if (!localStorage.getItem(BACKUP_KEYS[0]!)) {
          localStorage.setItem(BACKUP_KEYS[0]!, raw);
        }
      } catch {
        /* the validated main remains authoritative */
      }
      const state = r.state;
      const elapsed = Date.now() - state.savedAtWall;
      let report: OfflineReport | null = null;
      if (elapsed > C.OFFLINE_MIN_MS) {
        const res = simulateAbsence(state, elapsed);
        emit(res.effects);
        report = res.report;
      }
      return { state, loadError: null, report, persistenceBlocked: false };
    }
    // Corrupt main save: try backups, keep the corpse for forensics.
    const quarantined = quarantineRejectedSave(raw);

    for (const key of BACKUP_KEYS) {
      try {
        const backup = localStorage.getItem(key);
        if (!backup) continue;
        const recovered = deserialize(backup);
        if (recovered.ok) {
          return {
            state: recovered.state,
            loadError: `Main save was rejected (${r.error}). Loaded validated ${key}; the rejected main ${quarantined ? `is preserved in ${QUARANTINE_KEY}` : 'could not be quarantined'}.`,
            report: null,
            persistenceBlocked: false,
          };
        }
      } catch {
        /* keep trying */
      }
    }
    return {
      state: freshGame(),
      loadError: `Main save was rejected (${r.error}) and no valid backup was found; autosave paused. The rejected data ${quarantined ? `is preserved in ${QUARANTINE_KEY}` : 'could not be quarantined'}. Open the recovery page (Settings → Save recovery) before importing or resetting.`,
      report: null,
      persistenceBlocked: true,
    };
  }
  return { state: freshGame(), loadError: null, report: null, persistenceBlocked: false };
}

function freshGame(): GameState {
  const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  return newGame(seed, Date.now());
}

const initial = boot();

export const useGame = create<GameStore>((set) => ({
  s: initial.state,
  d: computeDerived(initial.state, opts()),
  rev: 0,
  booted: true,
  loadError: initial.loadError,
  persistenceBlocked: initial.persistenceBlocked,
  lastSavedAt: null,
  saveError: null,
  offlineReport: initial.report,
  dismissOfflineReport: () => set({ offlineReport: null }),
}));

function publish(): void {
  const { s } = useGame.getState();
  useGame.setState((prev) => ({ d: computeDerived(s, opts()), rev: prev.rev + 1 }));
}

// ————— Actions: immediate input processing (zero-dt step) —————

export function dispatch(input: Input): void {
  const { s } = useGame.getState();
  const r = step(s, 0, [input], opts());
  emit(r.effects);
  publish();
}

export const actions = {
  click: () => dispatch({ type: 'click' }),
  buyBuilding: (id: string, qty: number | 'max') => dispatch({ type: 'buyBuilding', id, qty }),
  buyUpgrade: (id: string) => dispatch({ type: 'buyUpgrade', id }),
  startResearch: (id: string) => dispatch({ type: 'startResearch', id }),
  chooseSurvey: (id: string) => dispatch({ type: 'chooseSurvey', id }),
  declineSurvey: () => dispatch({ type: 'declineSurvey' }),
  catchBubble: (id: number) => dispatch({ type: 'catchBubble', id }),
  hitVogonShip: (id: number) => dispatch({ type: 'hitVogonShip', id }),
  prestige: () => dispatch({ type: 'prestige' }),
  buyPerk: (id: string) => dispatch({ type: 'buyPerk', id }),
  acceptContract: (id: string) => dispatch({ type: 'acceptContract', id }),
  abandonContract: () => dispatch({ type: 'abandonContract' }),
  rerollContracts: () => dispatch({ type: 'rerollContracts' }),
  assignSystemSpecialty: (systemIndex: number, specialty: SystemSpecialty | null) => dispatch({ type: 'assignSystemSpecialty', systemIndex, specialty }),
  designateHeritage: (lifetimeIndex: number) => dispatch({ type: 'designateHeritage', lifetimeIndex }),
  scanSite: (id: string) => dispatch({ type: 'scanSite', id }),
  boardSite: (id: string) => dispatch({ type: 'boardSite', id }),
  buyRefit: (id: string) => dispatch({ type: 'buyRefit', id }),
  answerSituation: (uid: number, optionId: string) =>
    dispatch({ type: 'answerSituation', uid, optionId }),
  acceptJob: (uid: number) => dispatch({ type: 'acceptJob', uid }),
  abandonManifest: () => dispatch({ type: 'abandonManifest' }),
  deliverManifest: () => dispatch({ type: 'deliverManifest' }),
  prospectSeam: (id: string) => dispatch({ type: 'prospectSeam', id }),
  placeRig: (id: string) => dispatch({ type: 'placeRig', id }),
  collectRig: (id: string) => dispatch({ type: 'collectRig', id }),
  startMegaproject: (id: string) => dispatch({ type: 'startMegaproject', id }),
  resolveInterdiction: (outcome: 'outrun' | 'complied' | 'deterred' | 'decoyed' | 'eclipsed' | 'permitted' | 'wake') =>
    dispatch({ type: 'resolveInterdiction', outcome }),
  /** Point the helm at a chart waypoint, or null to clear it. */
  setWaypoint: (id: string | null) => dispatch({ type: 'setWaypoint', id }),
  markVisited: (id: string) => dispatch({ type: 'markVisited', id }),
  setFlag: (id: string, value: number) => dispatch({ type: 'setFlag', id, value }),
  completeFirstSortie: () => dispatch({ type: 'completeFirstSortie' }),
  setStandingOrders: (orders: StandingOrders) => dispatch({ type: 'setStandingOrders', orders }),
  bankGroundSamples: (
    worldKey: string,
    worldName: string,
    haul: SampleHaul[],
    sites: Record<string, GroundSiteOutcome>,
    species: string[] = [],
  ) => dispatch({ type: 'bankGroundSamples', worldKey, worldName, haul, sites, species }),
  acceptDossier: (id: string) => dispatch({ type: 'acceptDossier', id }),
  declineDossier: () => dispatch({ type: 'declineDossier' }),
  signCharter: (systemIndex: number, id: string) => dispatch({ type: 'signCharter', systemIndex, id }),
  answerPhase: (id: string, optionId: string) => dispatch({ type: 'answerPhase', id, optionId }),
  pickUpManifest: () => dispatch({ type: 'pickUpManifest' }),
  attendInPerson: (uid: number) => dispatch({ type: 'attendInPerson', uid }),
  boardUnscheduled: (id: string) => dispatch({ type: 'boardUnscheduled', id }),
  setRole: (id: string) => dispatch({ type: 'setRole', id }),
  buildInfrastructure: (id: string) => dispatch({ type: 'buildInfrastructure', id }),
  enactStatute: (id: string) => dispatch({ type: 'enactStatute', id }),
};

// Dev hook for headless verification and manual poking.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['__tc'] = {
    dispatch,
    useGame,
    saveNow: () => saveNow(),
    exportSave: () => exportToClipboard(),
    importSave: (t: string) => importFromText(t),
    /** Headless verification: a universe whose landmarks sit still. */
    newUniverse: (seed: number) => {
      useGame.setState({ s: newGame(seed >>> 0, Date.now()) });
      publish();
    },
  };
}

// ————— Persistence —————

let lastBackupAt = 0;

export function saveNow(): void {
  const { s, persistenceBlocked } = useGame.getState();
  if (persistenceBlocked) {
    useGame.setState({ saveError: 'Autosave is paused while rejected save data is protected.' });
    return;
  }

  const now = Date.now();
  const previousSavedAt = s.savedAtWall;
  let json: string;
  try {
    // The timestamp belongs to the write. If no write lands, put the prior
    // timestamp back so offline progress never trusts a save that did not exist.
    s.savedAtWall = now;
    json = serialize(s);
  } catch {
    s.savedAtWall = previousSavedAt;
    useGame.setState({ saveError: 'The current game state could not be serialized.' });
    return;
  }

  // Backup rotation is best-effort. A backup problem must not prevent the main
  // slot from being refreshed when that write is still available.
  try {
    const previousMain = localStorage.getItem(SAVE_KEY);
    if (
      previousMain
      && now - lastBackupAt >= BACKUP_INTERVAL_MS
      && deserialize(previousMain).ok
    ) {
      const previousBackup = localStorage.getItem(BACKUP_KEYS[0]!);
      if (previousBackup && deserialize(previousBackup).ok && previousBackup !== previousMain) {
        localStorage.setItem(BACKUP_KEYS[1]!, previousBackup);
      }
      localStorage.setItem(BACKUP_KEYS[0]!, previousMain);
      lastBackupAt = now;
    }
  } catch {
    /* the confirmed main write below remains the source of truth */
  }

  try {
    localStorage.setItem(SAVE_KEY, json);
  } catch {
    s.savedAtWall = previousSavedAt;
    useGame.setState({ saveError: 'Browser storage rejected the save. Export a copy from Settings.' });
    return;
  }

  try {
    const backup0 = localStorage.getItem(BACKUP_KEYS[0]!);
    if (!backup0 || !deserialize(backup0).ok) {
      localStorage.setItem(BACKUP_KEYS[0]!, json);
      lastBackupAt = now;
    }
  } catch {
    /* main save is confirmed even if the backup slot is unavailable */
  }
  useGame.setState({ lastSavedAt: now, saveError: null });
}

export function exportToClipboard(): string {
  return exportSave(useGame.getState().s);
}

export function importFromText(text: string): string | null {
  const r = importSave(text);
  if (!r.ok) return r.error;
  lastBackupAt = 0;
  useGame.setState({
    s: r.state, offlineReport: null, loadError: null, persistenceBlocked: false,
    lastSavedAt: null, saveError: null,
  });
  saveNow();
  publish();
  return null;
}

export function hardReset(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
    for (const k of BACKUP_KEYS) localStorage.removeItem(k);
    localStorage.removeItem(QUARANTINE_KEY);
  } catch {
    /* fine */
  }
  lastBackupAt = 0;
  useGame.setState({
    s: freshGame(), offlineReport: null, loadError: null, persistenceBlocked: false,
    lastSavedAt: null, saveError: null,
  });
  publish();
}

// ————— The loop driver —————

let loopStarted = false;

export function startLoop(): void {
  if (loopStarted) return;
  loopStarted = true;

  let last = performance.now();
  let acc = 0;
  let sinceSave = 0;

  const frame = (now: number) => {
    const dt = now - last;
    last = now;

    if (dt > C.OFFLINE_MIN_MS) {
      // The tab slept long enough to count as an absence.
      const { s } = useGame.getState();
      const res = simulateAbsence(s, dt);
      emit(res.effects);
      useGame.setState({ offlineReport: res.report });
      publish();
      acc = 0;
    } else {
      acc += dt;
      if (acc >= C.LOGIC_TICK_MS) {
        const { s } = useGame.getState();
        const r = step(s, acc, [], opts()); // sub-tick remainder carries inside the engine
        acc = 0;
        emit(r.effects);
        publish();
      }
    }

    sinceSave += dt;
    if (sinceSave > 10_000) {
      saveNow();
      sinceSave = 0;
    }

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const onHide = () => {
    if (document.visibilityState === 'hidden') saveNow();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', () => saveNow());
}
