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
let padGain: GainNode | null = null;
let padFilter: BiquadFilterNode | null = null;
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

/** Call on the first user gesture. Starts the ambient bed. */
export function initAudioOnGesture(): void {
  const c = ensure();
  if (!c || !master || started) return;
  started = true;

  // Ambient bed: two detuned triangles + a whisper of filtered noise.
  padGain = c.createGain();
  padGain.gain.value = 0.0;
  padFilter = c.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 220;
  padFilter.Q.value = 0.6;

  const osc1 = c.createOscillator();
  osc1.type = 'triangle';
  osc1.frequency.value = 55; // A1
  const osc2 = c.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.value = 82.5; // E2-ish, a fifth up
  osc2.detune.value = 6;
  const osc3 = c.createOscillator();
  osc3.type = 'sine';
  osc3.frequency.value = 110;
  osc3.detune.value = -5;

  const o3g = c.createGain();
  o3g.gain.value = 0.4;
  osc1.connect(padFilter);
  osc2.connect(padFilter);
  osc3.connect(o3g).connect(padFilter);
  padFilter.connect(padGain).connect(master);
  osc1.start();
  osc2.start();
  osc3.start();

  padGain.gain.linearRampToValueAtTime(0.05, c.currentTime + 4);

  // The bed tracks planet progress: barren = dark and hollow, alive = warm.
  useGame.subscribe((st) => {
    if (!padFilter || !padGain || !ctx) return;
    const p = st.s.planet;
    let frac = 0;
    for (const a of ASPECTS) {
      const t = p.targets[a];
      frac += t.lte(0) ? 0.25 : Math.min(1, p.gauges[a].div(t).toNumber()) * 0.25;
    }
    const target = 200 + frac * 1400;
    padFilter.frequency.setTargetAtTime(target, ctx.currentTime, 1.5);
    padGain.gain.setTargetAtTime(0.04 + frac * 0.035, ctx.currentTime, 2);
  });
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
