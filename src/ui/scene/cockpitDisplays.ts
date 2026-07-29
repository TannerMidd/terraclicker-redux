/**
 * Live diegetic screens for the authored runabout cockpit.
 *
 * The three materials, canvases and GPU textures are lazy singletons. A
 * cockpit may mount/unmount while changing camera modes, but it must never
 * create a fresh display stack or upload a new texture every time. Call
 * `updateCockpitDisplays` from the cockpit frame loop; a 24 Hz cadence gate
 * keeps the instruments crisp without making canvas painting a render cost.
 */
import {
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  MeshBasicNodeMaterial,
  SRGBColorSpace,
} from 'three/webgpu';
import { useUiBus } from '../fx/uiBus';
import { atmoEnvelope } from '../../engine/atmoflight';
import { flightInput, flightLive } from './flightControl';
import { surfaceInput, surfaceLive } from './surface/surfaceControl';

const DISPLAY_WIDTH = 768;
const DISPLAY_HEIGHT = 512;
const DISPLAY_HZ = 24;
const TAU = Math.PI * 2;
const RAD_TO_DEG = 180 / Math.PI;

const INK = '#bceff1';
const DIM_INK = '#6d9da2';
const CYAN = '#78e4e2';
const CYAN_HOT = '#d1ffff';
const AMBER = '#ffbf72';
const RED = '#ff746c';
const BLACK = '#03080b';
const PANEL = '#07151a';
const PANEL_2 = '#0a2026';
const GRID = 'rgba(113, 220, 218, 0.17)';
const SKY = '#102d39';
const GROUND = '#38251d';

const FONT_XS = '600 18px "IBM Plex Mono", monospace';
const FONT_SM = '600 22px "IBM Plex Mono", monospace';
const FONT_MD = '600 28px "IBM Plex Mono", monospace';
const FONT_XL = '700 58px "IBM Plex Mono", monospace';

const PERCENT_TEXT: string[] = [];
const DEGREE_TEXT: string[] = [];
const HEADING_TEXT: string[] = [];
for (let i = 0; i <= 200; i++) PERCENT_TEXT.push(`${i}%`);
for (let i = 0; i <= 180; i++) DEGREE_TEXT.push(`${i}°`);
for (let i = 0; i < 360; i++) HEADING_TEXT.push(`${String(i).padStart(3, '0')}°`);

interface DisplaySurface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: CanvasTexture;
  material: MeshBasicNodeMaterial;
}

export interface CockpitDisplayMaterials {
  /** Centre attitude director and primary flight data. */
  readonly primaryFlight: MeshBasicNodeMaterial;
  /** Route, bearing, course and range display. */
  readonly navigation: MeshBasicNodeMaterial;
  /** Velocity, boost, automation and landing-state display. */
  readonly systems: MeshBasicNodeMaterial;
}

interface CockpitDisplayCache {
  primary: DisplaySurface;
  navigation: DisplaySurface;
  systems: DisplaySurface;
  materials: CockpitDisplayMaterials;
  lastTick: number;
}

let cache: CockpitDisplayCache | null = null;

function surfaceMode(): boolean {
  if (useUiBus.getState().groundfall === null) return false;
  return surfaceLive.phase === 'entry' || surfaceLive.phase === 'fly';
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function wrapRadians(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function percentText(value: number, high = 200): string {
  return PERCENT_TEXT[clamp(Math.round(value * 100), 0, high)] ?? '0%';
}

function degreeText(radians: number): string {
  return DEGREE_TEXT[clamp(Math.round(Math.abs(radians) * RAD_TO_DEG), 0, 180)] ?? '0°';
}

function headingText(radians: number): string {
  const heading = ((Math.round(-radians * RAD_TO_DEG) % 360) + 360) % 360;
  return HEADING_TEXT[heading] ?? '000°';
}

function makeSurface(name: string): DisplaySurface {
  const canvas = document.createElement('canvas');
  canvas.width = DISPLAY_WIDTH;
  canvas.height = DISPLAY_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error(`Unable to create ${name} cockpit display canvas`);

  const texture = new CanvasTexture(canvas);
  texture.name = `${name}-cockpit-display`;
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;

  const material = new MeshBasicNodeMaterial({
    map: texture,
    color: 0xffffff,
    fog: false,
    side: DoubleSide,
    toneMapped: false,
  });
  material.name = `${name}-cockpit-display`;

  return { canvas, ctx, texture, material };
}

function displayCache(): CockpitDisplayCache {
  if (cache) return cache;
  const primary = makeSurface('primary-flight');
  const navigation = makeSurface('navigation');
  const systems = makeSurface('systems');
  const materials: CockpitDisplayMaterials = {
    primaryFlight: primary.material,
    navigation: navigation.material,
    systems: systems.material,
  };
  cache = { primary, navigation, systems, materials, lastTick: -1 };
  updateCockpitDisplays(flightLive.clock, true);
  return cache;
}

function frame(ctx: CanvasRenderingContext2D, title: string, right: string): void {
  ctx.fillStyle = BLACK;
  ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
  ctx.fillStyle = PANEL;
  ctx.fillRect(12, 12, DISPLAY_WIDTH - 24, DISPLAY_HEIGHT - 24);
  ctx.strokeStyle = 'rgba(126, 235, 231, 0.48)';
  ctx.lineWidth = 2;
  ctx.strokeRect(12.5, 12.5, DISPLAY_WIDTH - 25, DISPLAY_HEIGHT - 25);

  ctx.fillStyle = PANEL_2;
  ctx.fillRect(24, 22, DISPLAY_WIDTH - 48, 44);
  ctx.font = FONT_SM;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = CYAN_HOT;
  ctx.fillText(title, 38, 44);
  ctx.textAlign = 'right';
  ctx.fillStyle = DIM_INK;
  ctx.fillText(right, DISPLAY_WIDTH - 38, 44);
}

function label(
  ctx: CanvasRenderingContext2D,
  name: string,
  value: string,
  x: number,
  y: number,
  align: CanvasTextAlign = 'left',
  hot = false,
): void {
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = FONT_XS;
  ctx.fillStyle = DIM_INK;
  ctx.fillText(name, x, y - 19);
  ctx.font = FONT_MD;
  ctx.fillStyle = hot ? AMBER : INK;
  ctx.fillText(value, x, y + 10);
}

function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  value: number,
  hot = false,
): void {
  ctx.fillStyle = '#061014';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
  ctx.fillStyle = hot ? AMBER : CYAN;
  ctx.fillRect(x + 4, y + 4, Math.max(0, width - 8) * clamp(value, 0, 1), height - 8);
}

function drawPrimary(surface: DisplaySurface): void {
  const ctx = surface.ctx;
  const f = flightLive;
  const atmospheric = surfaceMode();
  const envelope = atmoEnvelope(surfaceLive.atmoRank);
  const speedFraction = atmospheric
    ? surfaceLive.airSpeed / Math.max(1, envelope.boost)
    : f.cap > 0 ? f.speed / f.cap : 0;
  const throttle = atmospheric
    ? Math.max(Math.abs(surfaceInput.fwd), Math.abs(surfaceInput.strafe) * 0.45, surfaceInput.run ? 1 : 0)
    : Math.max(flightInput.thrust, flightInput.cruise);
  const pitch = atmospheric ? surfaceLive.pitch : f.pitch;
  const roll = atmospheric ? surfaceLive.roll : f.roll;
  const altitude = atmospheric ? surfaceLive.alt : f.altitude;
  const altitudeScale = atmospheric ? Math.max(1, surfaceLive.ceilingM) : 3;
  const boosting = atmospheric ? surfaceInput.run : f.boostBlend > 0.05;
  const pitchOffset = clamp(pitch, -Math.PI * 0.48, Math.PI * 0.48) * 158;

  frame(
    ctx,
    atmospheric ? 'ATMOSPHERIC FLIGHT' : 'PRIMARY FLIGHT',
    atmospheric ? `${Math.round(surfaceLive.alt)}m AGL` : f.station ? 'STATION HOLD' : 'RUNABOUT / FBW',
  );

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(32, 78, 704, 294, 10);
  ctx.clip();
  ctx.fillStyle = SKY;
  ctx.fillRect(32, 78, 704, 294);
  ctx.translate(384, 225);
  ctx.rotate(-roll);
  ctx.translate(0, pitchOffset);
  ctx.fillStyle = GROUND;
  ctx.fillRect(-600, 0, 1200, 620);
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-600, 0);
  ctx.lineTo(600, 0);
  ctx.stroke();

  ctx.font = FONT_XS;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let degrees = -60; degrees <= 60; degrees += 10) {
    if (degrees === 0) continue;
    const y = -(degrees / 10) * 46;
    const length = degrees % 20 === 0 ? 112 : 68;
    ctx.strokeStyle = 'rgba(190, 239, 241, 0.72)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-length, y);
    ctx.lineTo(-22, y);
    ctx.moveTo(22, y);
    ctx.lineTo(length, y);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(DEGREE_TEXT[Math.abs(degrees)] ?? '0°', -length - 28, y);
    ctx.fillText(DEGREE_TEXT[Math.abs(degrees)] ?? '0°', length + 28, y);
  }
  ctx.restore();

  // Fixed aircraft datum and flight director. The horizon moves; this does not.
  ctx.strokeStyle = CYAN_HOT;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(284, 230);
  ctx.lineTo(350, 230);
  ctx.lineTo(367, 245);
  ctx.moveTo(401, 245);
  ctx.lineTo(418, 230);
  ctx.lineTo(484, 230);
  ctx.stroke();
  ctx.strokeStyle = !atmospheric && f.nav?.overshooting ? RED : CYAN;
  ctx.lineWidth = 3;
  const steerVertical = surfaceInput.rise ? -0.5 : surfaceInput.descend ? 0.5 : 0;
  const directorX = 384 + clamp(
    atmospheric ? -surfaceInput.strafe * 0.22 : f.nav?.bearing ?? -flightInput.steerX * 0.22,
    -0.8,
    0.8,
  ) * 108;
  const directorY = 225 - clamp(
    atmospheric ? steerVertical : f.nav?.elevation ?? flightInput.steerY * 0.18,
    -0.6,
    0.6,
  ) * 94;
  ctx.beginPath();
  ctx.arc(directorX, directorY, 18, 0, TAU);
  ctx.moveTo(directorX - 31, directorY);
  ctx.lineTo(directorX + 31, directorY);
  ctx.moveTo(directorX, directorY - 31);
  ctx.lineTo(directorX, directorY + 31);
  ctx.stroke();

  label(
    ctx,
    atmospheric ? 'GROUND SPEED' : 'VELOCITY / CAP',
    atmospheric ? `${Math.round(surfaceLive.airSpeed)}m/s` : percentText(speedFraction),
    42,
    427,
    'left',
    speedFraction > 1,
  );
  label(ctx, 'THROTTLE', percentText(throttle, 100), 384, 427, 'center', boosting);
  label(
    ctx,
    atmospheric ? 'RADAR ALT' : 'ALTITUDE',
    atmospheric
      ? `${Math.max(0, Math.round(altitude))}m`
      : Number.isFinite(altitude) && altitude < 1000 ? `${altitude.toFixed(1)}u` : 'DEEP',
    726,
    427,
    'right',
    Number.isFinite(altitude) && altitude < (atmospheric ? 10 : 0.8),
  );
  bar(ctx, 42, 476, 194, 14, speedFraction, speedFraction > 1);
  bar(ctx, 287, 476, 194, 14, throttle, boosting);
  bar(
    ctx,
    532,
    476,
    194,
    14,
    Number.isFinite(altitude) ? clamp(altitude / altitudeScale, 0, 1) : 1,
    Number.isFinite(altitude) && altitude < (atmospheric ? 10 : 0.8),
  );
  surface.texture.needsUpdate = true;
}

function drawNavigation(surface: DisplaySurface): void {
  const ctx = surface.ctx;
  const f = flightLive;
  const atmospheric = surfaceMode();
  const nav = atmospheric ? null : f.nav;
  const setdown = atmospheric ? surfaceLive.setdown : null;
  const setdownDx = setdown ? setdown.x - surfaceLive.pos.x : 0;
  const setdownDz = setdown ? setdown.z - surfaceLive.pos.z : 0;
  const setdownRange = Math.hypot(setdownDx, setdownDz);
  const setdownBearing = setdown
    ? wrapRadians(Math.atan2(-setdownDx, -setdownDz) - surfaceLive.yaw)
    : 0;
  frame(
    ctx,
    atmospheric ? 'TERRAIN / NAV' : 'NAVIGATION',
    atmospheric ? `${Math.round(surfaceLive.sweepM)}m SWEEP` : nav ? 'ROUTE SOLUTION' : 'LOCAL REFERENCE',
  );

  ctx.fillStyle = '#06151a';
  ctx.fillRect(32, 82, 392, 318);
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(228, 241, 52, 0, TAU);
  ctx.arc(228, 241, 104, 0, TAU);
  ctx.arc(228, 241, 150, 0, TAU);
  ctx.moveTo(48, 241);
  ctx.lineTo(408, 241);
  ctx.moveTo(228, 98);
  ctx.lineTo(228, 384);
  ctx.stroke();

  // Ownship points up. The route cue uses the same signed error as the HUD.
  ctx.fillStyle = CYAN_HOT;
  ctx.beginPath();
  ctx.moveTo(228, 205);
  ctx.lineTo(214, 260);
  ctx.lineTo(228, 251);
  ctx.lineTo(242, 260);
  ctx.closePath();
  ctx.fill();

  if (nav) {
    const markerX = 228 + Math.sin(clamp(nav.bearing, -Math.PI, Math.PI)) * 142;
    const markerY = 241 - Math.cos(clamp(nav.bearing, -Math.PI, Math.PI)) * 142;
    ctx.strokeStyle = nav.overshooting ? RED : AMBER;
    ctx.fillStyle = nav.overshooting ? RED : AMBER;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(228, 241);
    ctx.lineTo(markerX, markerY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(markerX, markerY, 12, 0, TAU);
    ctx.fill();
  } else if (atmospheric && setdown) {
    const markerX = 228 + Math.sin(clamp(setdownBearing, -Math.PI, Math.PI)) * 142;
    const markerY = 241 - Math.cos(clamp(setdownBearing, -Math.PI, Math.PI)) * 142;
    ctx.strokeStyle = setdown.ok ? CYAN : AMBER;
    ctx.fillStyle = setdown.ok ? CYAN : AMBER;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(228, 241);
    ctx.lineTo(markerX, markerY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(markerX, markerY, 12, 0, TAU);
    ctx.fill();
  } else {
    ctx.font = FONT_SM;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = DIM_INK;
    ctx.fillText(atmospheric ? 'SWEEP IN PROGRESS' : 'NO ACTIVE ROUTE', 228, 354);
  }

  const course = headingText(atmospheric ? surfaceLive.yaw : f.yaw);
  const bearing = atmospheric
    ? setdown ? `${setdownBearing < 0 ? 'P' : 'S'} ${degreeText(setdownBearing)}` : 'AHEAD'
    : nav ? `${nav.bearing < 0 ? 'P' : 'S'} ${degreeText(nav.bearing)}` : 'NONE';
  const range = atmospheric
    ? setdown ? `${Math.round(setdownRange)}m` : `${Math.round(surfaceLive.sweepM)}m`
    : nav
      ? nav.distance < 10
        ? `${nav.distance.toFixed(1)}u`
        : nav.distance < 1000
          ? `${Math.round(nav.distance)}u`
          : `${(nav.distance / 1000).toFixed(1)}ku`
      : 'NONE';

  label(
    ctx,
    'TARGET',
    atmospheric ? setdown ? 'SETDOWN SITE' : 'REGION SWEEP' : f.navLabel || 'UNASSIGNED',
    462,
    122,
    'left',
    atmospheric ? Boolean(setdown && !setdown.ok) : Boolean(nav?.overshooting),
  );
  label(ctx, 'BEARING', bearing, 462, 207);
  label(ctx, 'COURSE', course, 462, 292);
  label(
    ctx,
    atmospheric ? 'RADIUS' : 'RANGE',
    range,
    462,
    377,
    'left',
    atmospheric ? Boolean(setdown && !setdown.ok) : Boolean(nav?.overshooting),
  );
  label(
    ctx,
    atmospheric ? 'RADAR ALT' : 'ELEVATION',
    atmospheric
      ? `${Math.max(0, Math.round(surfaceLive.alt))}m`
      : nav ? `${nav.elevation < 0 ? 'DN' : 'UP'} ${degreeText(nav.elevation)}` : 'NONE',
    42,
    452,
  );
  label(
    ctx,
    'APPROACH',
    atmospheric
      ? setdown ? setdown.ok ? 'GEAR ACCEPTS' : 'DIVERTING' : 'SCANNING'
      : nav ? (nav.overshooting ? 'BRAKE' : nav.closingSpeed > 0 ? 'CLOSING' : 'OPENING') : 'STANDBY',
    726,
    452,
    'right',
    atmospheric ? Boolean(setdown && !setdown.ok) : Boolean(nav?.overshooting),
  );
  surface.texture.needsUpdate = true;
}

function autopilotStatus(): string {
  const f = flightLive;
  if (f.courseHold) {
    if (f.autopilotPhase === 'align') return 'ALIGNING';
    if (f.autopilotPhase === 'cruise') return 'CRUISE';
    if (f.autopilotPhase === 'brake') return 'BRAKING';
    if (f.autopilotPhase === 'arrived') return 'ARRIVED';
  }
  return f.nav ? 'READY' : 'OFF';
}

function landingStatus(): string {
  const f = flightLive;
  if (f.prompt?.verb === 'land') return f.prompt.blocked ? 'LANDING HOLD' : 'LANDING ARMED';
  if (Number.isFinite(f.altitude) && f.altitude < 0.8) return 'SURFACE CLOSE';
  if (Number.isFinite(f.altitude) && f.altitude < 3) return 'SURFACE OPS';
  return 'FLIGHT';
}

function statusLamp(
  ctx: CanvasRenderingContext2D,
  name: string,
  value: string,
  x: number,
  y: number,
  active: boolean,
  caution = false,
): void {
  ctx.fillStyle = active ? (caution ? AMBER : CYAN) : '#244047';
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, TAU);
  ctx.fill();
  ctx.font = FONT_XS;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = DIM_INK;
  ctx.fillText(name, x + 20, y - 13);
  ctx.font = FONT_MD;
  ctx.fillStyle = active ? (caution ? AMBER : INK) : DIM_INK;
  ctx.fillText(value, x + 20, y + 16);
}

function drawSystems(surface: DisplaySurface): void {
  const ctx = surface.ctx;
  const f = flightLive;
  const atmospheric = surfaceMode();
  const envelope = atmoEnvelope(surfaceLive.atmoRank);
  const speedFraction = atmospheric
    ? surfaceLive.airSpeed / Math.max(1, envelope.boost)
    : f.cap > 0 ? f.speed / f.cap : 0;
  const boosting = atmospheric ? surfaceInput.run : f.boostBlend > 0.05;
  const requestedBoost = atmospheric ? surfaceInput.run : flightInput.boost;

  frame(
    ctx,
    atmospheric ? 'AIRFRAME SYSTEMS' : 'RUNABOUT SYSTEMS',
    atmospheric ? `${surfaceLive.weather.kind.toUpperCase()} / FCS` : f.paused ? 'HELM PAUSED' : 'NOMINAL',
  );

  ctx.fillStyle = '#06151a';
  ctx.fillRect(32, 84, 704, 106);
  ctx.font = FONT_XS;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = DIM_INK;
  ctx.fillText(atmospheric ? 'GROUND SPEED / VNE' : 'VELOCITY / FLIGHT CAP', 48, 108);
  ctx.font = FONT_XL;
  ctx.fillStyle = speedFraction > 1 ? AMBER : CYAN_HOT;
  ctx.fillText(percentText(speedFraction), 48, 151);
  ctx.font = FONT_SM;
  ctx.textAlign = 'right';
  ctx.fillStyle = INK;
  ctx.fillText(
    atmospheric
      ? `${Math.round(surfaceLive.airSpeed)} / ${Math.round(envelope.boost)}m/s`
      : `${f.speed.toFixed(2)} / ${f.cap.toFixed(2)}u`,
    716,
    146,
  );
  bar(ctx, 342, 104, 374, 24, speedFraction, speedFraction > 1);

  statusLamp(
    ctx,
    'BOOST',
    boosting ? 'ACTIVE' : requestedBoost ? 'ARMED' : 'STANDBY',
    56,
    244,
    boosting || requestedBoost,
    boosting,
  );
  statusLamp(
    ctx,
    atmospheric ? 'STABILITY' : 'AUTOPILOT',
    atmospheric ? envelope.stormproof ? 'TRIM RATED' : 'MANUAL' : autopilotStatus(),
    408,
    244,
    atmospheric ? true : f.courseHold,
    atmospheric ? !envelope.stormproof && surfaceLive.weather.intensity > 0.35 : f.autopilotPhase === 'brake',
  );
  statusLamp(
    ctx,
    'LANDING',
    atmospheric
      ? surfaceLive.setdown ? surfaceLive.setdown.ok ? 'GEAR ACCEPTS' : 'DIVERTING' : 'AIRBORNE'
      : landingStatus(),
    56,
    337,
    atmospheric ? surfaceLive.alt < 60 : Number.isFinite(f.altitude) && f.altitude < 3,
    atmospheric ? Boolean(surfaceLive.setdown && !surfaceLive.setdown.ok) : f.prompt?.verb === 'land' && Boolean(f.prompt.blocked),
  );
  statusLamp(
    ctx,
    atmospheric ? 'CEILING' : 'STATION',
    atmospheric
      ? `${Math.round(surfaceLive.alt)}/${Math.round(surfaceLive.ceilingM)}m`
      : f.station ? 'HOLDING' : f.paused ? 'HELM LOCK' : 'MANUAL',
    408,
    337,
    atmospheric ? surfaceLive.ceilingM > 0 : f.station || f.paused,
    atmospheric ? surfaceLive.alt > surfaceLive.ceilingM * 0.9 : false,
  );

  ctx.fillStyle = PANEL_2;
  ctx.fillRect(32, 416, 704, 66);
  ctx.font = FONT_SM;
  ctx.textAlign = 'left';
  ctx.fillStyle = DIM_INK;
  ctx.fillText('FLIGHT CONTROL', 48, 449);
  ctx.textAlign = 'center';
  const steeringActive = atmospheric
    ? Math.abs(surfaceInput.fwd) + Math.abs(surfaceInput.strafe) > 0.05
    : Math.abs(flightInput.steerX) + Math.abs(flightInput.steerY) > 0.05;
  ctx.fillStyle = steeringActive ? CYAN_HOT : INK;
  ctx.fillText('FBW', 374, 449);
  const braking = atmospheric ? surfaceInput.descend : flightInput.brake > 0.05;
  ctx.fillStyle = braking ? AMBER : INK;
  ctx.fillText(atmospheric ? 'GEAR' : 'BRAKE', 492, 449);
  ctx.textAlign = 'right';
  ctx.fillStyle = atmospheric || f.active ? CYAN : DIM_INK;
  ctx.fillText(atmospheric || f.active ? 'ONLINE' : 'STANDBY', 716, 449);
  surface.texture.needsUpdate = true;
}

/** The shared material set. Never dispose these materials or their maps. */
export function cockpitDisplayMaterials(): CockpitDisplayMaterials {
  return displayCache().materials;
}

/** Individually named accessors keep cockpit mesh integration terse. */
export function primaryFlightDisplayMaterial(): MeshBasicNodeMaterial {
  return displayCache().materials.primaryFlight;
}

export function navigationDisplayMaterial(): MeshBasicNodeMaterial {
  return displayCache().materials.navigation;
}

export function systemsDisplayMaterial(): MeshBasicNodeMaterial {
  return displayCache().materials.systems;
}

/**
 * Paint live flight state into all three shared textures.
 *
 * Safe to call every R3F frame: the actual canvas uploads are capped at 24 Hz.
 * `force` exists for deterministic screenshots/tests and initial creation.
 */
export function updateCockpitDisplays(
  nowSeconds = flightLive.clock,
  force = false,
): void {
  const displays = displayCache();
  const tick = Math.floor(nowSeconds * DISPLAY_HZ);
  if (!force && tick === displays.lastTick) return;
  displays.lastTick = tick;
  drawPrimary(displays.primary);
  drawNavigation(displays.navigation);
  drawSystems(displays.systems);
}
