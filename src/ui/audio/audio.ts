/**
 * Fully synthesized sound (ART_DIRECTION.md §9): zero audio files.
 * An ambient pad that warms up as the planet completes, click thocks with
 * pitch variation, purchase motifs that widen with tier, and stingers.
 */
import { useSettings } from '../settings';
import { useGame } from '../../state/store';
import { ASPECTS } from '../../engine/types';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let started = false;

function ensure(): AudioContext | null {
  if (!useSettings.getState().audio) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/**
 * How far along the world in the window is, 0–1. The one number the music
 * listens to.
 */
function planetWarmth(): number {
  const p = useGame.getState().s.planet;
  let frac = 0;
  for (const a of ASPECTS) {
    const t = p.targets[a];
    frac += t.lte(0) ? 0.25 : Math.min(1, p.gauges[a].div(t).toNumber()) * 0.25;
  }
  return frac;
}

/**
 * Call on the first user gesture.
 *
 * What is NOT here any more: the ambient bed. It was three oscillators at 55,
 * 82.5 and 110 Hz held open forever — a low fifth that never rested, never
 * resolved and never changed except to get slightly brighter. Sustained
 * intervals are the one thing ears refuse to stop hearing, so over an idle
 * game's session length it stopped reading as atmosphere and started reading
 * as a fault in the building. The warmth it carried now lives in the theme,
 * which says the same thing with notes and, crucially, with gaps between
 * them.
 */
export function initAudioOnGesture(): void {
  const c = ensure();
  if (!c || !master || started) return;
  started = true;
  startTheme();
}

// ————— The theme —————

/**
 * A small, sincere tune, synthesized like everything else (ART_DIRECTION.md
 * §9 — still zero audio files). It is played by a plucked lead, a soft bass
 * and a tick that is doing its best, over four bars that come round again.
 *
 * Two rules keep it from becoming the thing it replaced:
 *
 * 1. **It rests.** Roughly a third of the beats are silence, and one bar in
 *    four the lead sits out entirely. A loop you can hear the edges of is a
 *    loop you stop noticing; a wall of sound is one you start resenting.
 * 2. **It answers the game.** The world's completion opens the lead's filter
 *    and adds the upper octave, so a finished planet genuinely sounds
 *    brighter than a barren one — the job the old drone was doing, done by
 *    something that is also a tune.
 */
const BPM = 92;
const BEAT = 60 / BPM;
const STEP = BEAT / 2; // eighth notes
const STEPS_PER_BAR = 8;
const BARS = 4;
const LOOP_STEPS = STEPS_PER_BAR * BARS;

/** C major, the friendly one. Roots for the four bars: C, A minor, F, G. */
const BASS = [65.41, 55.0, 43.65, 49.0];

/**
 * The melody, in semitones above C4, one slot per eighth note; null is a
 * rest and the rests are load-bearing. Bar three is deliberately almost
 * empty — the tune takes a breath, and the loop stops feeling like a wheel.
 */
const MELODY: (number | null)[] = [
  // C major
  0, null, 4, 7, null, 4, null, null,
  // A minor
  9, null, 7, 4, null, null, 2, null,
  // F — the breath
  5, null, null, null, 4, null, null, null,
  // G — the turn back round
  7, null, 9, 11, null, 7, 4, null,
];

let themeTimer: number | null = null;
let themeStep = 0;
let nextNoteTime = 0;
let themeGain: GainNode | null = null;

function midiHz(semitonesAboveC4: number): number {
  return 261.63 * Math.pow(2, semitonesAboveC4 / 12);
}

/** One plucked note: a triangle with a fast decay, gentle on the top end. */
function pluck(t: number, hz: number, gain: number, dur: number, bright: number): void {
  if (!ctx || !themeGain) return;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = hz;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 700 + bright * 2600;
  f.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(themeGain);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** The bass: a round sine that gets out of the way quickly. */
function bassNote(t: number, hz: number): void {
  if (!ctx || !themeGain) return;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = hz;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.075, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  o.connect(g).connect(themeGain);
  o.start(t);
  o.stop(t + 0.55);
}

/** The tick: a rimshot made of one hiss, mixed low enough to be a suggestion. */
function tick(t: number, soft: boolean): void {
  if (!ctx || !themeGain) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = soft ? 2600 : 1500;
  f.Q.value = 1.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(soft ? 0.012 : 0.022, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (soft ? 0.03 : 0.06));
  src.connect(f).connect(g).connect(themeGain);
  src.start(t);
  src.stop(t + 0.08);
}

/** Schedule every note that falls inside the lookahead window. */
function scheduleTheme(): void {
  if (!ctx || !themeGain) return;
  // Truth lives in the settings, not in whoever remembered to call stop.
  const s = useSettings.getState();
  if (!s.audio || !s.music) return;
  // A hidden tab throttles timers; if we have fallen behind, do not try to
  // catch up by firing a burst of notes at once — pick the clock back up.
  if (nextNoteTime < ctx.currentTime - 0.5) nextNoteTime = ctx.currentTime + 0.05;

  while (nextNoteTime < ctx.currentTime + 0.2) {
    const t = nextNoteTime;
    const step = themeStep % LOOP_STEPS;
    const bar = Math.floor(step / STEPS_PER_BAR);
    const inBar = step % STEPS_PER_BAR;
    const loop = Math.floor(themeStep / LOOP_STEPS);
    const warmth = planetWarmth();
    const bright = 0.25 + warmth * 0.75;

    if (inBar === 0) bassNote(t, BASS[bar]!);
    if (inBar === 4) bassNote(t, BASS[bar]! * 1.5); // the fifth, lightly
    if (inBar % 4 === 2) tick(t, false);
    if (inBar % 2 === 1) tick(t, true);

    // Every fourth time round, the lead sits a bar out. Nothing else changes;
    // it is simply enough to stop the ear predicting the whole thing.
    const resting = loop % 4 === 3 && bar === 2;
    const note = MELODY[step];
    if (note !== null && note !== undefined && !resting) {
      pluck(t, midiHz(note), 0.09, 0.42, bright);
      // A delivered world earns the octave above — audibly a brighter place.
      if (warmth > 0.55) pluck(t + 0.008, midiHz(note + 12), 0.022 * warmth, 0.3, bright);
    }

    nextNoteTime += STEP;
    themeStep += 1;
  }
}

export function startTheme(): void {
  const c = ensure();
  if (!c || !master || themeTimer !== null) return;
  if (!useSettings.getState().music) return;
  themeGain = c.createGain();
  themeGain.gain.value = 0.0001;
  themeGain.connect(master);
  // Under the effects, over the silence: a lead note lands at about 0.045
  // once master has had its say, against a click's 0.11.
  themeGain.gain.setTargetAtTime(1, c.currentTime, 1.6);
  themeStep = 0;
  nextNoteTime = c.currentTime + 0.15;
  scheduleTheme();
  themeTimer = window.setInterval(scheduleTheme, 40);
}

export function stopTheme(): void {
  if (themeTimer !== null) {
    window.clearInterval(themeTimer);
    themeTimer = null;
  }
  if (ctx && themeGain) {
    themeGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
    const dying = themeGain;
    window.setTimeout(() => dying.disconnect(), 2500);
  }
  themeGain = null;
}

/** The Settings switch, both ways, without needing a fresh gesture. */
export function setThemeEnabled(on: boolean): void {
  if (on) {
    if (started) startTheme();
  } else {
    stopTheme();
  }
}

function blip(freq: number, dur: number, type: OscillatorType, gain: number, when = 0): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime + when;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Click: a filtered thock with ±30 cents of variation. */
export function thock(): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sine';
  const base = 180 * Math.pow(2, (Math.random() * 60 - 30) / 1200);
  o.frequency.setValueAtTime(base * 2.2, t);
  o.frequency.exponentialRampToValueAtTime(base, t + 0.06);
  const g = c.createGain();
  g.gain.setValueAtTime(0.22, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.12);
}

/** Purchase: rising two-note motif; the interval widens with tier (0–13). */
export function purchaseMotif(tier: number): void {
  const root = 262; // C4
  const spread = 1 + Math.min(tier, 13) / 13; // unison → octave
  blip(root, 0.12, 'triangle', 0.14);
  blip(root * spread * 1.0 + root * 0.5, 0.16, 'triangle', 0.14, 0.09);
}

export function upgradeSting(): void {
  blip(392, 0.1, 'triangle', 0.13);
  blip(523, 0.12, 'triangle', 0.13, 0.08);
  blip(784, 0.2, 'sine', 0.11, 0.16);
}

export function achievementSting(): void {
  blip(660, 0.14, 'sine', 0.13);
  blip(880, 0.2, 'sine', 0.12, 0.1);
}

export function completeSting(): void {
  blip(330, 0.16, 'triangle', 0.15);
  blip(440, 0.16, 'triangle', 0.15, 0.12);
  blip(660, 0.28, 'sine', 0.13, 0.24);
  blip(880, 0.4, 'sine', 0.1, 0.36);
}

export function bubblePing(): void {
  blip(1180 + Math.random() * 240, 0.25, 'sine', 0.07);
}

export function bubbleCatchSting(): void {
  blip(740, 0.1, 'sine', 0.12);
  blip(1108, 0.18, 'sine', 0.11, 0.07);
}

/**
 * A line arriving on the Sub-Etha. Deliberately the quietest thing in the
 * mix — two thin carrier ticks, like a channel opening and closing. A rumour
 * gets a third tick a fifth up, so you learn to notice the ones worth flying
 * out for without anybody explaining it.
 */
export function subEthaBlip(rumour: boolean): void {
  blip(1560, 0.045, 'square', 0.028);
  blip(1180, 0.06, 'square', 0.022, 0.05);
  if (rumour) blip(1760, 0.1, 'sine', 0.038, 0.12);
}

let noiseBuf: AudioBuffer | null = null;
function noiseBuffer(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/**
 * Crossing a scale band on the perspective journey: filtered air, rising
 * as you pull out toward the universe, falling as you come home.
 */
export function zoomWhoosh(dir: 1 | -1, band: number): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  const lo = 220 + band * 40;
  const hi = 1150 + band * 120;
  f.frequency.setValueAtTime(dir > 0 ? lo : hi, t);
  f.frequency.exponentialRampToValueAtTime(dir > 0 ? hi : lo, t + 0.45);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + 0.55);
}

/** Star ignition: a low settling boom under a rising shimmer. */
export function igniteSting(): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.7);
  const g = c.createGain();
  g.gain.setValueAtTime(0.22, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.85);
  blip(523, 0.5, 'sine', 0.07, 0.05);
  blip(784, 0.6, 'sine', 0.06, 0.16);
  blip(1046, 0.8, 'sine', 0.05, 0.3);
}

/** Galaxy bloom: the ignition's bigger sibling, with a chord that means it. */
export function galaxySting(): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(96, t);
  o.frequency.exponentialRampToValueAtTime(36, t + 1.1);
  const g = c.createGain();
  g.gain.setValueAtTime(0.26, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 1.25);
  blip(262, 0.7, 'triangle', 0.09, 0.08);
  blip(392, 0.8, 'triangle', 0.08, 0.2);
  blip(523, 0.9, 'sine', 0.08, 0.34);
  blip(659, 1.1, 'sine', 0.07, 0.5);
  blip(1046, 1.3, 'sine', 0.05, 0.66);
}

// ————— Manual flight: the runabout's voice —————

let humOsc1: OscillatorNode | null = null;
let humOsc2: OscillatorNode | null = null;
let humFilter: BiquadFilterNode | null = null;
let humGain: GainNode | null = null;

/** Start the engine idle. Safe to call twice; stops cleanly via flightHumStop. */
export function flightHumStart(): void {
  const c = ensure();
  if (!c || !master || humGain) return;
  humGain = c.createGain();
  humGain.gain.value = 0.0001;
  humFilter = c.createBiquadFilter();
  humFilter.type = 'lowpass';
  humFilter.frequency.value = 170;
  humFilter.Q.value = 1.1;
  humOsc1 = c.createOscillator();
  humOsc1.type = 'sawtooth';
  humOsc1.frequency.value = 47;
  humOsc2 = c.createOscillator();
  humOsc2.type = 'sawtooth';
  humOsc2.frequency.value = 47.7; // a slow beat between the two coils
  humOsc1.connect(humFilter);
  humOsc2.connect(humFilter);
  humFilter.connect(humGain).connect(master);
  humOsc1.start();
  humOsc2.start();
  humGain.gain.setTargetAtTime(0.02, c.currentTime, 0.5);
}

/** Throttle 0–1 and boost 0–1 open the filter and lean on the coils. */
export function flightHumSet(throttle: number, boost: number): void {
  if (!ctx || !humFilter || !humGain || !humOsc1 || !humOsc2) return;
  const t = ctx.currentTime;
  const k = Math.max(0, Math.min(1, throttle));
  const b = Math.max(0, Math.min(1, boost));
  humFilter.frequency.setTargetAtTime(170 + k * 620 + b * 900, t, 0.18);
  humGain.gain.setTargetAtTime(0.016 + k * 0.03 + b * 0.02, t, 0.25);
  humOsc1.frequency.setTargetAtTime(47 * (1 + b * 0.28), t, 0.3);
  humOsc2.frequency.setTargetAtTime(47.7 * (1 + b * 0.28), t, 0.3);
}

export function flightHumStop(): void {
  if (!ctx || !humGain) return;
  const t = ctx.currentTime;
  humGain.gain.setTargetAtTime(0.0001, t, 0.2);
  const o1 = humOsc1;
  const o2 = humOsc2;
  o1?.stop(t + 1.2);
  o2?.stop(t + 1.2);
  humOsc1 = humOsc2 = null;
  humFilter = null;
  humGain = null;
}

/** Punching the improbability boost: air, briefly in a hurry. */
export function boostWhoosh(): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 0.9;
  f.frequency.setValueAtTime(240, t);
  f.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.07, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + 0.75);
}

/** Vogon drone: atonal, bureaucratic, briefly unavoidable. */
export function vogonDrone(): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  for (const [i, f] of [66, 71, 99].entries()) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t + i * 0.1);
    g.gain.exponentialRampToValueAtTime(0.05, t + i * 0.1 + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    const fl = c.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = 320;
    o.connect(fl).connect(g).connect(master);
    o.start(t);
    o.stop(t + 2.8);
  }
}

// ————— Groundfall: the sound of standing on something —————

let roarSrc: AudioBufferSourceNode | null = null;
let roarFilter: BiquadFilterNode | null = null;
let roarGain: GainNode | null = null;

/** Atmospheric entry / takeoff: air arguing with a hull. Loops until stopped. */
export function entryRoarStart(): void {
  const c = ensure();
  if (!c || !master || roarGain) return;
  roarSrc = c.createBufferSource();
  roarSrc.buffer = noiseBuffer(c);
  roarSrc.loop = true;
  roarFilter = c.createBiquadFilter();
  roarFilter.type = 'lowpass';
  roarFilter.frequency.value = 140;
  roarFilter.Q.value = 0.8;
  roarGain = c.createGain();
  roarGain.gain.value = 0.0001;
  roarSrc.connect(roarFilter).connect(roarGain).connect(master);
  roarSrc.start();
  const t = c.currentTime;
  roarGain.gain.setTargetAtTime(0.085, t, 1.4);
  roarFilter.frequency.setTargetAtTime(900, t, 2.6);
}

export function entryRoarStop(): void {
  if (!ctx || !roarGain) return;
  const t = ctx.currentTime;
  roarGain.gain.setTargetAtTime(0.0001, t, 0.5);
  roarSrc?.stop(t + 2.2);
  roarSrc = null;
  roarFilter = null;
  roarGain = null;
}

let windSrc: AudioBufferSourceNode | null = null;
let windFilter: BiquadFilterNode | null = null;
let windGain: GainNode | null = null;

/** The surface wind bed. Night air is thinner and higher than day air. */
export function surfaceWindStart(): void {
  const c = ensure();
  if (!c || !master || windGain) return;
  windSrc = c.createBufferSource();
  windSrc.buffer = noiseBuffer(c);
  windSrc.loop = true;
  windFilter = c.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 320;
  windFilter.Q.value = 0.5;
  windGain = c.createGain();
  windGain.gain.value = 0.0001;
  windSrc.connect(windFilter).connect(windGain).connect(master);
  windSrc.start();
  windGain.gain.setTargetAtTime(0.03, c.currentTime, 1.8);
}

/** Strength 0–1; sunUp −1…1 tunes the register (night reads colder). */
export function surfaceWindSet(strength: number, sunUp: number): void {
  if (!ctx || !windFilter || !windGain) return;
  const t = ctx.currentTime;
  const k = Math.max(0, Math.min(1, strength));
  windGain.gain.setTargetAtTime(0.012 + k * 0.05, t, 0.8);
  windFilter.frequency.setTargetAtTime(260 + k * 300 + Math.max(0, -sunUp) * 220, t, 1.2);
}

export function surfaceWindStop(): void {
  if (!ctx || !windGain) return;
  const t = ctx.currentTime;
  windGain.gain.setTargetAtTime(0.0001, t, 0.4);
  windSrc?.stop(t + 1.8);
  windSrc = null;
  windFilter = null;
  windGain = null;
}

// ————— Settlements: somebody's power grid, audibly —————

let townOscA: OscillatorNode | null = null;
let townOscB: OscillatorNode | null = null;
let townFilter: BiquadFilterNode | null = null;
let townGain: GainNode | null = null;

/**
 * The civic hum: mains, climate plant, and a thousand small machines heard
 * as one warm chord. Strength 0 parks it silent; the loop starts lazily and
 * fades with distance from the lights (the caller does the geometry).
 */
export function settlementHumSet(strength: number): void {
  const c = ensure();
  if (!c || !master) return;
  if (!townGain) {
    townOscA = c.createOscillator();
    townOscA.type = 'triangle';
    townOscA.frequency.value = 92;
    townOscB = c.createOscillator();
    townOscB.type = 'triangle';
    townOscB.frequency.value = 138;
    townOscB.detune.value = 7;
    townFilter = c.createBiquadFilter();
    townFilter.type = 'lowpass';
    townFilter.frequency.value = 340;
    townFilter.Q.value = 0.7;
    townGain = c.createGain();
    townGain.gain.value = 0.0001;
    townOscA.connect(townFilter);
    townOscB.connect(townFilter);
    townFilter.connect(townGain).connect(master);
    townOscA.start();
    townOscB.start();
  }
  const t = c.currentTime;
  const k = Math.max(0, Math.min(1, strength));
  townGain.gain.setTargetAtTime(k * 0.045, t, 0.8);
  townFilter!.frequency.setTargetAtTime(280 + k * 260, t, 1.1);
}

export function settlementHumStop(): void {
  if (!ctx || !townGain) return;
  const t = ctx.currentTime;
  townGain.gain.setTargetAtTime(0.0001, t, 0.4);
  townOscA?.stop(t + 1.6);
  townOscB?.stop(t + 1.6);
  townOscA = null;
  townOscB = null;
  townFilter = null;
  townGain = null;
}

// ————— Wildlife: the catalogue, audibly —————

/**
 * One creature saying one thing, once. Registers by level: ambient life
 * chirps high and brief, vignette life calls lower and longer. Synthesized
 * like everything else — no files, only opinions about frequencies.
 */
export function wildlifeCall(register: 'chirp' | 'call' | 'drone'): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  const g = c.createGain();
  g.connect(master);
  const o = c.createOscillator();
  o.connect(g);
  if (register === 'chirp') {
    o.type = 'sine';
    const f0 = 1900 + Math.random() * 900;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.5, t + 0.06);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.9, t + 0.14);
    g.gain.setValueAtTime(0.028, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.start(t);
    o.stop(t + 0.18);
  } else if (register === 'call') {
    o.type = 'triangle';
    const f0 = 340 + Math.random() * 160;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 1.25, t + 0.35);
    o.frequency.linearRampToValueAtTime(f0 * 0.8, t + 0.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.start(t);
    o.stop(t + 0.95);
  } else {
    o.type = 'sawtooth';
    const f0 = 110 + Math.random() * 40;
    o.frequency.setValueAtTime(f0, t);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    o.disconnect();
    o.connect(lp).connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.start(t);
    o.stop(t + 1.5);
  }
}

// ————— Weather: the sky, audibly —————

let rainSrc: AudioBufferSourceNode | null = null;
let rainFilter: BiquadFilterNode | null = null;
let rainGain: GainNode | null = null;

/**
 * Precipitation bed: filtered noise above the wind's register. Strength 0
 * parks it silent; the loop starts lazily and survives kind changes (snow
 * and ash are the same hiss, further down the filter).
 */
export function weatherPrecipSet(strength: number, hiss: number): void {
  const c = ensure();
  if (!c || !master) return;
  if (!rainGain) {
    rainSrc = c.createBufferSource();
    rainSrc.buffer = noiseBuffer(c);
    rainSrc.loop = true;
    rainFilter = c.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 1600;
    rainFilter.Q.value = 0.35;
    rainGain = c.createGain();
    rainGain.gain.value = 0.0001;
    rainSrc.connect(rainFilter).connect(rainGain).connect(master);
    rainSrc.start();
  }
  const t = c.currentTime;
  const k = Math.max(0, Math.min(1, strength));
  rainGain.gain.setTargetAtTime(k * 0.055, t, 0.9);
  rainFilter!.frequency.setTargetAtTime(700 + hiss * 1900, t, 1.1);
}

export function weatherPrecipStop(): void {
  if (!ctx || !rainGain) return;
  const t = ctx.currentTime;
  rainGain.gain.setTargetAtTime(0.0001, t, 0.5);
  rainSrc?.stop(t + 2);
  rainSrc = null;
  rainFilter = null;
  rainGain = null;
}

/** Thunder, arriving late the way thunder does. Call at the flash. */
export function thunder(delayS: number): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime + Math.max(0.1, delayS);
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(340, t);
  f.frequency.exponentialRampToValueAtTime(70, t + 2.2);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + 2.8);
  // The sub-bass body under the crack.
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(52, t);
  o.frequency.exponentialRampToValueAtTime(30, t + 1.4);
  const og = c.createGain();
  og.gain.setValueAtTime(0.1, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  o.connect(og).connect(master);
  o.start(t);
  o.stop(t + 1.7);
}

let rumbleOsc: OscillatorNode | null = null;
let rumbleGain: GainNode | null = null;

/** Tremor rumble follows the ground-shake envelope. 0 parks it silent. */
export function tremorRumbleSet(k: number): void {
  const c = ensure();
  if (!c || !master) return;
  if (!rumbleGain) {
    rumbleOsc = c.createOscillator();
    rumbleOsc.type = 'sawtooth';
    rumbleOsc.frequency.value = 27;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 70;
    rumbleGain = c.createGain();
    rumbleGain.gain.value = 0.0001;
    rumbleOsc.connect(f).connect(rumbleGain).connect(master);
    rumbleOsc.start();
  }
  rumbleGain.gain.setTargetAtTime(Math.max(0, Math.min(1, k)) * 0.12, c.currentTime, 0.14);
}

export function tremorRumbleStop(): void {
  if (!ctx || !rumbleGain) return;
  const t = ctx.currentTime;
  rumbleGain.gain.setTargetAtTime(0.0001, t, 0.3);
  rumbleOsc?.stop(t + 1.4);
  rumbleOsc = null;
  rumbleGain = null;
}

/** A boot in shallow water. Depth 0–1 picks how much sea objects. */
export function wadeSplash(depth: number): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 640 + Math.random() * 400;
  f.Q.value = 0.6;
  const g = c.createGain();
  g.gain.setValueAtTime(0.03 + depth * 0.05, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16 + depth * 0.12);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + 0.35);
}

/** One boot on regolith. `heavy` for landings rather than strides. */
export function footstep(heavy: boolean): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = heavy ? 240 : 420 + Math.random() * 160;
  const g = c.createGain();
  g.gain.setValueAtTime(heavy ? 0.09 : 0.028 + Math.random() * 0.012, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (heavy ? 0.2 : 0.08));
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + 0.22);
}

/** Touchdown: the whole ship agreeing with the ground at once. */
export function touchdownThud(): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(88, t);
  o.frequency.exponentialRampToValueAtTime(34, t + 0.5);
  const g = c.createGain();
  g.gain.setValueAtTime(0.16, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.75);
  footstep(true);
}

/** The pick landing on crystal: a knock with a ring in it. */
export function pickThunk(): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  // The knock: a short burst of low filtered noise.
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const nf = c.createBiquadFilter();
  nf.type = 'lowpass';
  nf.frequency.value = 460 + Math.random() * 120;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.09, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  src.connect(nf).connect(ng).connect(master);
  src.start(t);
  src.stop(t + 0.1);
  // The ring: crystal answering back, a little different every strike.
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.value = 1420 * Math.pow(2, (Math.random() * 140 - 70) / 1200);
  const g = c.createGain();
  g.gain.setValueAtTime(0.028, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g).connect(master);
  o.start(t + 0.012);
  o.stop(t + 0.32);
}

/** The seam giving way: a chord of the rings it made while resisting. */
export function crystalShatter(): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  for (const [i, f] of [988, 1318, 1976, 2637].entries()) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f * Math.pow(2, (Math.random() * 40 - 20) / 1200);
    const g = c.createGain();
    g.gain.setValueAtTime(0.03 - i * 0.005, t + i * 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5 + i * 0.08);
    o.connect(g).connect(master);
    o.start(t + i * 0.02);
    o.stop(t + 0.62 + i * 0.08);
  }
}

/** A core sample coming free: bright, brief, worth the walk. */
export function sampleChime(): void {
  blip(1318, 0.22, 'sine', 0.09);
  blip(1975, 0.3, 'sine', 0.07, 0.09);
}
