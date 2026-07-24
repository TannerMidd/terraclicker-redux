import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'assets');
const temp = path.join(root, '.asset-source-tmp');

const palette = {
  void: '#05060A',
  panel: '#0D1020',
  line: '#2A3350',
  ink: '#E9EEF9',
  dim: '#8C96AF',
  faint: '#5A6378',
  thermal: '#FF8A3D',
  atmo: '#5AD7E8',
  hydro: '#4D8DFF',
  bio: '#58D68A',
  gold: '#F5C84C',
  magrathea: '#B36BFF',
  vogon: '#8A8F5A',
};

const xml = (body) => `<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`;
const esc = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

async function put(relative, content) {
  const target = path.join(out, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

function cornerTicks(stroke = palette.faint) {
  return `<path d="M10 18V10H18 M46 10H54V18 M54 46V54H46 M18 54H10V46"
    stroke="${stroke}" stroke-width="1.25" opacity=".36"/>`;
}

function iconSvg(title, accent, body) {
  return xml(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 64 64"
  fill="none" role="img" aria-labelledby="title">
  <title id="title">${esc(title)}</title>
  <g stroke-linecap="round" stroke-linejoin="round">
    ${cornerTicks()}
    <g stroke="${palette.ink}" stroke-width="2.35">${body.base ?? ''}</g>
    <g stroke="${accent}" stroke-width="2.35">${body.accent ?? ''}</g>
    <g fill="${accent}">${body.fill ?? ''}</g>
  </g>
</svg>`);
}

function aspectSvg(title, body) {
  return xml(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
  stroke-linejoin="round" role="img" aria-labelledby="title">
  <title id="title">${esc(title)}</title>
  ${body}
</svg>`);
}

const aspectIcons = {
  thermal: aspectSvg(
    'Thermal',
    `<path d="M13.2 2.7c.8 3.3-1.5 4.6-2.3 6.8-.6 1.6.2 2.8 1.5 3.6-.1-1.5.8-2.4 2-3.3 2 1.7 3.1 3.8 3.1 6.1A5.5 5.5 0 0 1 6.5 16c0-3.2 1.7-5.3 4.1-7.7 1.5-1.6 2.1-3.3 2.6-5.6Z"/>
     <path d="M12 20.8c-1.6-.5-2.6-1.6-2.6-3 0-1 .5-1.9 1.5-2.9.1 1 .6 1.6 1.3 2 .2-1 .8-1.7 1.6-2.3.6.8.9 1.7.9 2.5 0 1.7-1 3-2.7 3.7Z"/>`,
  ),
  atmo: aspectSvg(
    'Atmospheric',
    `<path d="M3 8h10.7a2.6 2.6 0 1 0-2.3-3.8"/>
     <path d="M3 12h15.3a2.7 2.7 0 1 1-2.4 4"/>
     <path d="M3 16h6.3a2.5 2.5 0 1 1-2.2 3.7"/>`,
  ),
  hydro: aspectSvg(
    'Hydrologic',
    `<path d="M12 2.8S5.8 9.7 5.8 15a6.2 6.2 0 0 0 12.4 0C18.2 9.7 12 2.8 12 2.8Z"/>
     <path d="M8.7 15.6c1.8 1.2 4.8 1.2 6.6 0"/>
     <path d="M9.5 18.1c1.4.7 3.6.7 5 0"/>`,
  ),
  bio: aspectSvg(
    'Biotic',
    `<path d="M12 21V9.5"/>
     <path d="M11.8 13.2C7.2 13.4 4.2 11 4 6.6c4.4-.5 7.5 1.6 7.8 6.6Z"/>
     <path d="M12.1 10.7c.3-4.8 3.2-7.2 7.7-6.9.1 4.7-2.7 7.2-7.7 6.9Z"/>
     <path d="M8.3 21h7.4"/>`,
  ),
};

const buildingIcons = {
  seedProbe: iconSvg('Seed Probe', palette.bio, {
    base: `<path d="M27 18h10l3 8-2 12H26l-2-12 3-8Z"/>
      <path d="M28 38 22 49M36 38l6 11M25 45h14M32 18V10M29 10h6"/>
      <circle cx="32" cy="29" r="3.5"/>`,
    accent: `<path d="M32 33v10M32 39c-4-1-6-3.4-6.2-6.7 3.8-.2 6 2.1 6.2 6.7ZM32 37.2c.3-3.5 2.4-5.5 6-5.5-.1 3.5-2.2 5.4-6 5.5Z"/>`,
    fill: `<circle cx="19" cy="22" r="1.4"/><circle cx="45" cy="22" r="1.4"/>`,
  }),
  atmoProcessor: iconSvg('Atmospheric Processor', palette.atmo, {
    base: `<path d="M22 18c0-3 4.5-5.5 10-5.5S42 15 42 18v28c0 3-4.5 5.5-10 5.5S22 49 22 46V18Z"/>
      <path d="M22 18c0 3 4.5 5.5 10 5.5S42 21 42 18M22 42c0 3 4.5 5.5 10 5.5S42 45 42 42"/>
      <path d="M27 29h10M27 35h10"/>`,
    accent: `<path d="M10 23h7a3 3 0 1 0-2.6-4.4M47 29h7a3 3 0 1 1-2.6 4.4M9 38h8"/>`,
  }),
  hydroSeeder: iconSvg('Hydro Seeder', palette.hydro, {
    base: `<path d="M20 17h24v28H20zM24 13h16v4M16 49h32"/>
      <path d="M28 25h8M32 17v8M23 45l-3 4M41 45l3 4"/>`,
    accent: `<path d="M32 29s-5 5.7-5 9.4a5 5 0 0 0 10 0C37 34.7 32 29 32 29ZM45 22l5-4M47 27l7-1M19 22l-5-4"/>`,
  }),
  geoTap: iconSvg('Geothermal Tap', palette.thermal, {
    base: `<path d="M18 48 27 14h10l9 34M22 34h20M20 42h24M27 14l10 34M37 14 27 48"/>
      <path d="M32 14V8M13 51h38"/>`,
    accent: `<path d="M28 55c-2.5-2-2.7-4-.8-6M36 55c2.5-2 2.7-4 .8-6M32 57c-1.7-2.4-1.5-4.8.5-7.2"/>`,
  }),
  bioDome: iconSvg('Bio-Dome', palette.bio, {
    base: `<path d="M11 47h42M15 47a17 17 0 0 1 34 0M32 30v17M18 40h28"/>
      <path d="M22 47c.3-7.4 3.6-11.4 10-12M42 47c-.3-7.4-3.6-11.4-10-12"/>`,
    accent: `<path d="M32 40c-4.8-.5-7.4-3-7.5-7.4 4.8 0 7.3 2.5 7.5 7.4ZM32 37.2c.4-4.2 3-6.5 7.4-6.4-.1 4.3-2.7 6.4-7.4 6.4Z"/>`,
    fill: `<circle cx="23" cy="24" r="1.4"/><circle cx="42" cy="22" r="1.4"/>`,
  }),
  researchLab: iconSvg('Research Laboratory', palette.atmo, {
    base: `<path d="M18 49h28M25 13h14M28 13v11L20 43c-1.2 3 1 6 4.3 6h15.4c3.3 0 5.5-3 4.3-6l-8-19V13"/>
      <path d="M23 39h18"/>`,
    accent: `<path d="M24.5 39c3-2.8 5.3 2.6 8.2 0 2.7-2.3 4.5 1.2 7.2-.1"/>
      <circle cx="29" cy="33" r="1.3"/><circle cx="36.5" cy="29" r="1.3"/>
      <path d="M47 18c3-3 6-1.7 6.2 1.3.2 3-3.2 5.4-6.2 2.7-3 2.7-6.4.3-6.2-2.7.2-3 3.2-4.3 6.2-1.3Z"/>`,
  }),
  orbitalMirror: iconSvg('Orbital Mirror Array', palette.thermal, {
    base: `<circle cx="32" cy="34" r="8"/><path d="M32 26V12M24 34H10M40 34h14M32 42v12"/>
      <path d="m17 17 7 4-4 7-7-4 4-7ZM47 17l4 7-7 4-4-7 7-4ZM17 51l-4-7 7-4 4 7-7 4ZM47 51l-7-4 4-7 7 4-4 7Z"/>`,
    accent: `<circle cx="32" cy="34" r="3.8"/><path d="m29.3 31.3 5.4 5.4M34.7 31.3l-5.4 5.4"/>`,
  }),
  marvin: iconSvg('Marvin', palette.atmo, {
    base: `<path d="M18 31c0-11 6-18 14-18s14 7 14 18v13c0 5-6.3 8-14 8s-14-3-14-8V31Z"/>
      <path d="M18 31h28M23 27c1.8-3 4.2-4.5 7-4.5M41 27c-1.8-3-4.2-4.5-7-4.5"/>
      <path d="M25 41h14M28 45h8"/>`,
    accent: `<path d="M24 34c2.2 2.4 5 2.4 7.2 0M32.8 34c2.2 2.4 5 2.4 7.2 0"/>
      <circle cx="27.6" cy="35" r="1.1"/><circle cx="36.4" cy="35" r="1.1"/>`,
  }),
  quantumExcavator: iconSvg('Quantum Excavation Core', palette.hydro, {
    base: `<path d="M25 12h14v9H25zM28 21v7l-7 5v8l11 11 11-11v-8l-7-5v-7"/>
      <path d="m25 41 7 7 7-7-7-7-7 7Z"/>`,
    accent: `<path d="M14 29c-5 3.5-5 8.5 0 12s13 3.5 18 0M50 29c5 3.5 5 8.5 0 12s-13 3.5-18 0" stroke-dasharray="2.2 3.2"/>
      <circle cx="32" cy="41" r="2.2"/>`,
  }),
  temporalCompressor: iconSvg('Temporal Compressor', palette.thermal, {
    base: `<path d="M19 12h26M19 52h26M23 12c0 10 3.5 14 9 20-5.5 6-9 10-9 20M41 12c0 10-3.5 14-9 20 5.5 6 9 10 9 20"/>
      <path d="M25 17h14M27 47h10"/>`,
    accent: `<path d="M28 22c0 4 1.3 6.4 4 10 2.7-3.6 4-6 4-10M28 46c.6-5 2-8.2 4-12 2 3.8 3.4 7 4 12"/>
      <path d="M13 25h8M43 25h8M13 39h8M43 39h8"/>`,
  }),
  deepThought: iconSvg('Deep Thought Node', palette.gold, {
    base: `<path d="M16 13h32v38H16zM21 19h22v20H21zM22 45h4M30 45h4M38 45h4"/>
      <path d="M27 24h4v10M27 29h7M38 24h-4v5h4v5h-4"/>`,
    accent: `<circle cx="42" cy="45" r="2"/><path d="M12 20H8v8M52 20h4v8M12 44H8v-8M52 44h4v-8"/>`,
  }),
  stellarForge: iconSvg('Stellar Forge', palette.thermal, {
    base: `<circle cx="32" cy="31" r="8"/><path d="M32 9v8M32 45v10M10 31h8M46 31h8M16.5 15.5l5.7 5.7M41.8 40.8l5.7 5.7M47.5 15.5l-5.7 5.7M22.2 40.8l-5.7 5.7"/>
      <path d="M23 50h18l-4 5H27l-4-5Z"/>`,
    accent: `<path d="m32 22 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L32 22Z"/>`,
  }),
  heartOfGold: iconSvg('Heart of Gold Drive', palette.gold, {
    base: `<path d="M32 51S14 41 14 26c0-7 4.7-12 11-12 3.7 0 6 2.2 7 5 1-2.8 3.3-5 7-5 6.3 0 11 5 11 12 0 15-18 25-18 25Z"/>
      <ellipse cx="32" cy="31" rx="24" ry="9" transform="rotate(-22 32 31)"/>`,
    accent: `<circle cx="32" cy="31" r="5"/><path d="M32 22v18M23 31h18" stroke-dasharray="2 3"/>`,
    fill: `<circle cx="12.5" cy="38" r="1.5"/><circle cx="51.5" cy="24" r="1.5"/>`,
  }),
  magratheanWorkshop: iconSvg('Magrathean Workshop', palette.magrathea, {
    base: `<path d="M12 48h40M16 48V27l10 6V22l10 8V18h12v30M40 24h4M40 30h4M40 36h4"/>
      <circle cx="25" cy="43" r="9"/><path d="M16 43h18M25 34v18"/>`,
    accent: `<path d="M20 41c2-5 7-6 11-2-5 1-4 6-10 7M11 16h13M14 12v8M21 12v8"/>`,
  }),
};

const researchIcons = {
  'thermal-dynamics': iconSvg('Applied Thermal Dynamics', palette.thermal, {
    base: `<path d="M16 49h34M19 45V16M23 40l8-12 7 8 10-20"/>`,
    accent: `<path d="M31 50c-5-3.5-4-9.2.3-13 0 3 1.3 4.6 3.2 5.7 0-2.8 1.6-5.2 4-7 3 2.8 4.5 5.5 4.5 8.2 0 3.4-2.8 6.1-6.5 6.1"/>`,
  }),
  'atmo-retention': iconSvg('Atmospheric Retention Models', palette.atmo, {
    base: `<circle cx="32" cy="32" r="18"/><circle cx="32" cy="32" r="11"/><path d="M14 32h36"/>`,
    accent: `<path d="M21 27h14a3 3 0 1 0-2.6-4.5M43 36H29a3 3 0 1 0 2.6 4.5"/>`,
  }),
  'hydro-cycle': iconSvg('Stabilized Hydro Cycle', palette.hydro, {
    base: `<path d="M15 31a17 17 0 0 1 28-12M49 33a17 17 0 0 1-28 12M43 13v8h-8M21 51v-8h8"/>`,
    accent: `<path d="M32 19s-7 8-7 13a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/>`,
  }),
  'bio-protocols': iconSvg('Bio-Enhancement Protocols', palette.bio, {
    base: `<path d="M22 12c15 8 15 32 0 40M42 12c-15 8-15 32 0 40M24 18h16M21 27h22M21 37h22M24 46h16"/>`,
    accent: `<path d="M32 41c-5-.5-8-3.1-8.2-7.7 5-.2 7.8 2.4 8.2 7.7ZM32 37.5c.4-4.5 3.2-7 8-6.8-.1 4.5-2.9 6.8-8 6.8Z"/>`,
  }),
  'ergonomic-terraforming': iconSvg('Ergonomic Terraforming', palette.bio, {
    base: `<path d="M14 43h20c6 0 10-3.5 10-8.5S40 26 35 26h-6v-9c0-5-8-5-8 0v17l-5-4c-4-3-8 3-4 6l8 8c3 3 6 5 12 5h8"/>`,
    accent: `<path d="M41 20h10M46 15v10M42 43l7 7"/>`,
  }),
  'peer-review': iconSvg('Accelerated Peer Review', palette.atmo, {
    base: `<path d="M13 15h25v34H13zM26 11h25v34h-8M19 23h13M19 29h13M19 35h8"/>`,
    accent: `<path d="m34 35 4 4 8-10"/>`,
  }),
  'while-hitchhiking-1': iconSvg('While You Were Hitchhiking I', palette.gold, {
    base: `<circle cx="32" cy="31" r="17"/><path d="M32 20v12l8 5M15 49h34"/>`,
    accent: `<path d="M12 18h8M16 14v8M45 14c4 2 6 5 7 9"/>`,
  }),
  'while-hitchhiking-2': iconSvg('While You Were Hitchhiking II', palette.gold, {
    base: `<circle cx="32" cy="32" r="20"/><path d="M32 16v16l11 7M32 12v4M32 48v4M12 32h4M48 32h4"/>`,
    accent: `<path d="M18 18 15 15M46 18l3-3M18 46l-3 3M46 46l3 3"/>`,
  }),
  'babel-fish': iconSvg('Babel Fish Cultivation', palette.gold, {
    base: `<path d="M13 33c8-12 23-13 33-4l7-5v16l-7-5c-10 9-25 8-33-4Z"/><circle cx="39" cy="29" r="1.5"/>`,
    accent: `<path d="M10 25c-4 2-4 12 0 14M7 21c-8 5-8 17 0 22M23 33c4-4 9-5 14-3"/>`,
  }),
  'sens-o-matic': iconSvg('Sub-Etha Sens-O-Matic', palette.atmo, {
    base: `<path d="M32 23v28M24 51h16M32 23l-9-12M32 23l9-12"/><circle cx="32" cy="23" r="4"/>`,
    accent: `<path d="M20 22c-3 3-3 7 0 10M15 17c-6 6-6 14 0 20M44 22c3 3 3 7 0 10M49 17c6 6 6 14 0 20"/>`,
  }),
  'sep-field': iconSvg("Somebody Else's Problem Field", palette.atmo, {
    base: `<path d="M32 13c9 0 16 7 16 16v18H16V29c0-9 7-16 16-16Z"/><path d="M23 31h18M25 37h14"/>`,
    accent: `<path d="M10 10 54 54M50 13l4-3M10 54l4-3" stroke-dasharray="3 3"/>`,
  }),
  'bubble-stabilization': iconSvg('Improbability Containment', palette.gold, {
    base: `<path d="M14 15v34M50 15v34M14 20h7M14 44h7M43 20h7M43 44h7"/>`,
    accent: `<circle cx="32" cy="32" r="12"/><circle cx="27" cy="27" r="2"/><path d="M25 38c4 3 10 3 14-1"/>`,
  }),
  bistromathics: iconSvg('Bistromathics', palette.gold, {
    base: `<path d="M16 12v17c0 4 2 6 6 6v17M25 12v17c0 4-1 6-3 6M42 12v40M37 12v13c0 4 2 7 5 7"/>`,
    accent: `<path d="M29 18h6M29 24h6M29 42h6M32 39v6"/>`,
  }),
  'universal-constants': iconSvg('Negotiable Universal Constants', palette.magrathea, {
    base: `<path d="M14 18h36M14 32h36M14 46h36"/><circle cx="25" cy="18" r="4"/><circle cx="41" cy="32" r="4"/><circle cx="30" cy="46" r="4"/>`,
    accent: `<path d="M25 14v8M41 28v8M30 42v8"/>`,
  }),
  'the-answer': iconSvg('The Answer', palette.gold, {
    base: `<path d="M15 18v18h14M25 14v32M36 20c0-5 13-7 13 1 0 8-13 9-13 20h14"/>`,
    accent: `<circle cx="50" cy="46" r="2"/><path d="M11 12h42M11 52h42" stroke-dasharray="2 4"/>`,
  }),
};

const upgradeIcons = {
  'terraforming-gloves': iconSvg('Terraforming Gloves', palette.bio, {
    base: `<path d="M21 50c-4-5-6-10-6-17V20c0-5 7-5 7 0v9-14c0-5 7-5 7 0v13-16c0-5 7-5 7 0v16-13c0-5 7-5 7 0v17l4-5c3-4 9 0 6 5l-9 14c-2 4-6 6-11 6H21Z"/>`,
    accent: `<path d="M20 38h25M22 44h18"/>`,
  }),
  'reinforced-gauntlets': iconSvg('Reinforced Gauntlets', palette.thermal, {
    base: `<path d="M19 48c-3-6-4-12-3-20l1-9c.5-4 6-4 7 0l1 8 1-13c.5-5 7-4 7 0l1 13 2-11c1-5 7-3 7 1l-1 12 4-7c2-4 8-1 6 4l-6 17c-2 6-6 9-12 9H19Z"/>`,
    accent: `<path d="M18 36h30M20 42h24M25 31h17"/>`,
  }),
  'hydraulic-servos': iconSvg('Hydraulic Servos', palette.hydro, {
    base: `<path d="M20 48h24l-3-14 6-7-5-9-10 4-10-4-5 9 6 7-3 14Z"/><path d="M25 26h14M27 34h10"/>`,
    accent: `<path d="M15 48h34M24 48v5M40 48v5M32 22v12"/><circle cx="32" cy="36" r="3"/>`,
  }),
  'neural-lace': iconSvg('Neural Terraforming Lace', palette.atmo, {
    base: `<path d="M18 42c-5-10-3-22 7-28 11-6 25 1 27 14 1 8-2 14-8 18v7H27v-8c-4-1-7-2-9-3Z"/><path d="M25 28h6v-6M39 25h-8v9h10v7"/>`,
    accent: `<circle cx="31" cy="22" r="2"/><circle cx="39" cy="25" r="2"/><circle cx="41" cy="41" r="2"/><path d="M14 28h8M16 35h7"/>`,
  }),
  'stellar-conductor': iconSvg('Stellar Conductor Batons', palette.thermal, {
    base: `<path d="m19 49 25-34 4 3-25 34-4-3Z"/><path d="m15 17 8 6M41 48l8-8"/>`,
    accent: `<path d="M13 12v9M8.5 16.5h9M50 43v9M45.5 47.5h9M44 11l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z"/>`,
  }),
  'electronic-thumb': iconSvg('Electronic Thumb', palette.gold, {
    base: `<path d="M18 49V31c0-5 7-5 7 0v5-17c0-5 7-5 7 0v13l5-7c3-4 9 0 6 5l-4 6h8c5 0 6 7 1 8l-15 6c-5 2-10 1-15-1Z"/>`,
    accent: `<path d="M10 20h11M14 15v10M38 16h10M43 11v10"/><circle cx="32" cy="19" r="2"/>`,
  }),
  'improbable-digits': iconSvg('Improbable Digits', palette.gold, {
    base: `<path d="M20 48V30c0-5 7-5 7 0v5-16c0-5 7-5 7 0v16-12c0-5 7-5 7 0v14l4-4c4-3 8 2 5 6l-7 8c-3 4-7 6-12 6"/>`,
    accent: `<ellipse cx="32" cy="32" rx="24" ry="9" transform="rotate(-18 32 32)" stroke-dasharray="2 3"/><circle cx="12" cy="39" r="1.5"/><circle cx="52" cy="25" r="1.5"/>`,
  }),
  milestone: iconSvg('Milestone Upgrade', palette.gold, {
    base: `<path d="M18 51V13M18 16h29l-6 8 6 8H18M12 51h17"/>`,
    accent: `<path d="m30 20 2.3 4.6 5.1.8-3.7 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1-3.7-3.6 5.1-.8L30 20Z"/>`,
  }),
  synergy: iconSvg('Synergy Upgrade', palette.magrathea, {
    base: `<circle cx="20" cy="32" r="8"/><circle cx="44" cy="32" r="8"/><path d="M28 28h8M28 36h8"/>`,
    accent: `<path d="M20 20c4-8 20-8 24 0M20 44c4 8 20 8 24 0"/><circle cx="32" cy="32" r="3"/>`,
  }),
};

const wordmark = xml(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="120" viewBox="0 0 640 120" role="img" aria-labelledby="title">
  <title id="title">TerraClicker</title>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="61" cy="60" r="34" stroke="${palette.bio}" stroke-width="5"/>
    <path d="M30 57c14-6 30-4 43 4 8 5 15 5 22 2M40 38c9 2 15 7 19 14M49 86c4-10 13-17 24-20"
      stroke="${palette.ink}" stroke-width="4"/>
    <path d="M61 16v13M61 91v13M17 60h13M92 60h13" stroke="${palette.bio}" stroke-width="4"/>
  </g>
  <text x="124" y="74" fill="${palette.ink}" font-family="Inter, Arial, sans-serif" font-size="48" font-weight="760" letter-spacing="5">TERRA</text>
  <text x="315" y="74" fill="${palette.bio}" font-family="Inter, Arial, sans-serif" font-size="48" font-weight="760" letter-spacing="5">CLICKER</text>
  <path d="M125 91H594" stroke="${palette.line}" stroke-width="2"/>
  <circle cx="607" cy="91" r="4" fill="${palette.gold}"/>
</svg>`);

const dontPanic = xml(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="512" viewBox="0 0 1024 512" role="img" aria-labelledby="title">
  <title id="title">DON'T PANIC</title>
  <defs>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M170 84H854l86 172-86 172H170L84 256 170 84Z" stroke="${palette.line}" stroke-width="4"/>
    <path d="M190 108H834l72 148-72 148H190l-72-148 72-148Z" stroke="${palette.gold}" stroke-width="3" opacity=".55"/>
    <path d="M118 256h76M830 256h76M512 108v42M512 362v42" stroke="${palette.gold}" stroke-width="4"/>
    <circle cx="512" cy="256" r="176" stroke="${palette.gold}" stroke-width="2" opacity=".18" stroke-dasharray="2 14"/>
  </g>
  <text x="512" y="282" text-anchor="middle" fill="${palette.gold}" filter="url(#glow)"
    font-family="Inter, Arial, sans-serif" font-size="104" font-weight="850" letter-spacing="7">DON'T PANIC</text>
  <text x="512" y="327" text-anchor="middle" fill="${palette.dim}" font-family="Inter, Arial, sans-serif"
    font-size="18" font-weight="650" letter-spacing="8">LARGE FRIENDLY LETTERS</text>
</svg>`);

function guidePlate(index, title, accent, drawing) {
  const fig = String(index).padStart(2, '0');
  return xml(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="144" viewBox="0 0 320 144">
    <g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 25V8h17M295 8h17v17M312 119v17h-17M25 136H8v-17"
        stroke="${palette.faint}" stroke-width="1" opacity=".48"/>
      <path d="M27 19H293M27 124H293" stroke="${palette.line}" stroke-width="1" stroke-dasharray="1 5"/>
      <g stroke="${palette.ink}" stroke-width="2">${drawing.base ?? ''}</g>
      <g stroke="${accent}" stroke-width="2">${drawing.accent ?? ''}</g>
      <g fill="${accent}">${drawing.fill ?? ''}</g>
    </g>
    <text x="18" y="18" fill="${palette.dim}" font-family="Inter, Arial, sans-serif" font-size="7.5"
      font-weight="700" letter-spacing="1.5">FIG. ${fig}</text>
    <text x="302" y="18" text-anchor="end" fill="${palette.faint}" font-family="Inter, Arial, sans-serif"
      font-size="6.5" font-weight="650" letter-spacing=".8">${esc(title.toUpperCase())}</text>
    <text x="302" y="134" text-anchor="end" fill="${palette.faint}" font-family="Inter, Arial, sans-serif"
      font-size="6" letter-spacing=".8">GUIDE TECHNICAL PLATE / NOT TO SCALE</text>
  </svg>`);
}

const guidePlates = {
  'first-contact': guidePlate(1, 'First contact', palette.bio, {
    base: `<circle cx="151" cy="74" r="31"/><path d="M119 72c16-7 33-5 47 3 8 5 17 6 26 2M139 48c11 4 19 11 24 21M132 98c8-10 19-16 32-18"/>
      <path d="M62 102h52M198 102h60M76 96v12M246 96v12"/>`,
    accent: `<path d="M151 30v10M151 106v10M107 74h10M183 74h12"/><circle cx="151" cy="74" r="4"/>`,
  }),
  'blue-dawn': guidePlate(2, 'Atmosphere commissioning', palette.atmo, {
    base: `<circle cx="158" cy="76" r="34"/><path d="M126 70c18-7 35-4 52 6 7 4 15 4 23 1M134 91c14-9 30-11 47-5"/>
      <path d="M83 37h41M192 37h45M103 32v10M217 32v10"/>`,
    accent: `<path d="M113 55c-14 3-22 10-27 21M203 58c14 5 23 13 28 24M110 89c-12-4-22-2-30 4M205 91c12-3 22 0 28 7"/>`,
  }),
  'ocean-invention': guidePlate(3, 'Hydrology section', palette.hydro, {
    base: `<path d="M68 93c25-16 48-11 69 0s43 14 66-1 41-12 55-2M74 105h174"/>
      <path d="M159 34s-21 24-21 39a21 21 0 0 0 42 0c0-15-21-39-21-39Z"/>`,
    accent: `<path d="M145 75c8 5 20 5 28 0M149 83c6 3 14 3 20 0M84 116h151" stroke-dasharray="3 5"/>`,
  }),
  'biosphere-online': guidePlate(4, 'Biosphere acceptance test', palette.bio, {
    base: `<path d="M71 107h177M94 107a66 66 0 0 1 132 0M160 54v53M113 83h94"/>
      <path d="M113 107c2-25 17-42 47-47M207 107c-2-25-17-42-47-47"/>`,
    accent: `<path d="M160 87c-16-1-25-9-26-24 15 0 24 8 26 24ZM160 78c1-14 10-21 25-21-1 14-10 21-25 21Z"/>`,
  }),
  'planetary-portfolio': guidePlate(5, 'Portfolio accumulation', palette.magrathea, {
    base: `<circle cx="99" cy="75" r="24"/><circle cx="160" cy="64" r="31"/><circle cx="224" cy="82" r="20"/>
      <path d="M76 75h46M130 60c18-7 35-4 52 6M204 82h40M61 112h198"/>`,
    accent: `<path d="M51 108v9h218v-9M78 38h163" stroke-dasharray="4 5"/><circle cx="160" cy="64" r="4"/>`,
  }),
  'manual-terraforming': guidePlate(6, 'Manual intervention', palette.thermal, {
    base: `<path d="M107 108V70c0-12 17-12 17 0v12-37c0-12 17-12 17 0v32-26c0-12 17-12 17 0v28l12-14c10-10 23 4 14 14l-22 27c-8 10-18 13-31 13"/>
      <path d="M90 119h94"/>`,
    accent: `<path d="M90 61h25M96 53v16M174 45h30M189 36v18M200 86l24-10"/>`,
  }),
  'first-world': guidePlate(7, 'World completion', palette.bio, {
    base: `<circle cx="160" cy="75" r="42"/><path d="M120 67c21-9 41-6 62 7 9 5 18 6 29 2M135 102c9-18 25-28 48-30M141 42c16 5 27 15 34 30"/>`,
    accent: `<path d="m145 76 11 11 23-25"/><path d="M103 75h10M207 75h10M160 18v10M160 122v8"/>`,
  }),
  'system-builder': guidePlate(8, 'Local arrangement', palette.gold, {
    base: `<circle cx="160" cy="72" r="13"/><ellipse cx="160" cy="72" rx="89" ry="30"/><ellipse cx="160" cy="72" rx="61" ry="21"/>
      <circle cx="100" cy="93" r="7"/><circle cx="219" cy="52" r="5"/><circle cx="194" cy="88" r="4"/>`,
    accent: `<circle cx="160" cy="72" r="5"/><circle cx="73" cy="67" r="4"/><circle cx="128" cy="54" r="3"/>`,
  }),
  'planet-series': guidePlate(9, 'Serial terraforming', palette.bio, {
    base: `<circle cx="90" cy="76" r="19"/><circle cx="137" cy="76" r="25"/><circle cx="195" cy="76" r="31"/><circle cx="254" cy="76" r="16"/>
      <path d="M57 111h217"/>`,
    accent: `<path d="M76 76h28M112 73h49M164 80h62M238 76h32"/><path d="M70 119h200" stroke-dasharray="2 5"/>`,
  }),
  'earth-42': guidePlate(10, 'Mostly harmless', palette.gold, {
    base: `<circle cx="159" cy="74" r="43"/><path d="M118 65c18-9 36-7 49-1 13 6 28 7 43 1M129 96c11-8 24-14 39-14 13 0 22 6 34 6"/>
      <path d="M139 38c12 7 19 16 21 27M178 85c-4 14-12 24-24 31"/>`,
    accent: `<path d="M76 47h31M211 47h32M91 41v12M227 41v12"/><path d="M223 104h-9V91h9M214 97h13M234 91h-7v6h7v7h-7"/>`,
  }),
  'galaxy-formation': guidePlate(11, 'Spiral tendencies', palette.atmo, {
    base: `<path d="M160 76c21-1 30-15 23-26-9-14-35-10-52 6-23 22-7 51 21 57 37 8 72-16 74-47"/>
      <path d="M160 76c-21 1-30 15-23 26 9 14 35 10 52-6 23-22 7-51-21-57-37-8-72 16-74 47"/>`,
    accent: `<circle cx="160" cy="76" r="4"/><circle cx="111" cy="48" r="2"/><circle cx="215" cy="94" r="2"/><circle cx="126" cy="111" r="2"/>`,
  }),
  infrastructure: guidePlate(12, 'Installed capacity', palette.thermal, {
    base: `<path d="M60 111h205M72 111V76l31 17V60l34 25V48h42v63M185 111V68l29 16V55h34v56"/>
      <path d="M147 60h17M147 73h17M222 67h14M222 79h14M222 91h14"/>`,
    accent: `<path d="M95 111V96M118 111V87M202 111V80M253 111V96"/><path d="M60 119h205" stroke-dasharray="3 5"/>`,
  }),
  'six-by-nine': guidePlate(13, 'Arithmetic discrepancy', palette.gold, {
    base: `<path d="M74 46h52v52H74zM194 46h52v52h-52z"/><path d="M94 58h18v28H94M94 72h18M211 58h18v28h-18M211 72h18"/>
      <path d="M142 72h36M160 55v34"/>`,
    accent: `<path d="M58 111h204M68 106v10M252 106v10"/><circle cx="160" cy="72" r="4"/>`,
  }),
  marvin: guidePlate(14, 'Genuine personality', palette.atmo, {
    base: `<path d="M119 71c0-30 17-50 41-50s41 20 41 50v27c0 15-18 24-41 24s-41-9-41-24V71Z"/>
      <path d="M119 72h82M132 61c6-9 15-13 25-13M188 61c-6-9-15-13-25-13M140 96h40"/>`,
    accent: `<path d="M136 78c6 7 15 7 22 0M162 78c6 7 15 7 22 0"/><circle cx="147" cy="81" r="3"/><circle cx="173" cy="81" r="3"/>`,
  }),
  bubbles: guidePlate(15, 'Probability capture', palette.gold, {
    base: `<circle cx="160" cy="74" r="37"/><circle cx="143" cy="58" r="8"/><circle cx="180" cy="88" r="5"/>
      <path d="M88 38v74M232 38v74M88 49h17M88 101h17M215 49h17M215 101h17"/>`,
    accent: `<ellipse cx="160" cy="74" rx="72" ry="24" transform="rotate(-18 160 74)" stroke-dasharray="3 5"/><circle cx="93" cy="95" r="3"/>`,
  }),
  petunias: guidePlate(16, 'Recurrence report', palette.bio, {
    base: `<path d="M124 107h72l-9-40h-54l-9 40ZM133 67h54M160 67V41"/>
      <path d="M160 49c-19-1-29-10-29-27 19 0 28 9 29 27ZM160 43c2-16 12-24 29-23-1 17-11 24-29 23Z"/>`,
    accent: `<path d="M110 112h100M142 78c11 5 25 5 36 0"/><circle cx="119" cy="39" r="4"/><circle cx="201" cy="48" r="4"/>`,
  }),
  vogon: guidePlate(17, 'Poetry countermeasure', palette.vogon, {
    base: `<path d="M79 88h162l-19-37H98L79 88ZM107 88l-17 22M213 88l17 22M122 51l13-20h50l13 20"/>
      <path d="M126 64h68M137 75h46"/>`,
    accent: `<path d="M60 29h45M215 29h45M72 24v10M248 24v10M108 111h104" stroke-dasharray="4 4"/>`,
  }),
  research: guidePlate(18, 'Peer review apparatus', palette.atmo, {
    base: `<path d="M105 27h63v80h-63zM151 18h63v80h-34M120 46h33M120 58h33M120 70h24"/>
      <path d="M171 50h28M171 62h20"/>`,
    accent: `<path d="m151 85 11 11 24-28"/><circle cx="216" cy="105" r="7"/>`,
  }),
  magrathea: guidePlate(19, 'Portfolio transfer', palette.magrathea, {
    base: `<circle cx="115" cy="73" r="34"/><path d="M82 69c17-8 34-5 49 4 7 4 14 5 21 2M101 99c5-14 15-23 30-28"/>
      <path d="M179 42h65v68h-65zM188 57h47M188 70h47M188 83h31"/>`,
    accent: `<path d="m146 75 28 0M164 65l10 10-10 10"/><circle cx="227" cy="98" r="5"/>`,
  }),
  towel: guidePlate(20, 'Essential equipment', palette.gold, {
    base: `<path d="M101 31h118v78H101zM101 50c28 9 61 9 118 0M101 91c37-9 78-9 118 0"/>
      <path d="M119 31V19h82v12M83 116h154"/>`,
    accent: `<path d="M117 69h86M127 61v16M193 61v16"/><path d="M91 116v8M229 116v8"/>`,
  }),
};

const lensTexture = xml(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <filter id="blur8"><feGaussianBlur stdDeviation="8"/></filter>
    <filter id="blur18"><feGaussianBlur stdDeviation="18"/></filter>
    <radialGradient id="ring">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".68" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".78" stop-color="#fff" stop-opacity=".2"/>
      <stop offset=".9" stop-color="#fff" stop-opacity=".04"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="none"/>
  <g fill="url(#ring)" filter="url(#blur8)">
    <circle cx="276" cy="248" r="204"/><circle cx="210" cy="308" r="92"/>
    <circle cx="356" cy="168" r="58"/><circle cx="126" cy="126" r="44"/>
  </g>
  <g fill="#fff" opacity=".17" filter="url(#blur18)">
    <ellipse cx="162" cy="312" rx="26" ry="9" transform="rotate(-28 162 312)"/>
    <ellipse cx="372" cy="286" rx="18" ry="7" transform="rotate(18 372 286)"/>
    <circle cx="240" cy="115" r="9"/><circle cx="318" cy="374" r="12"/>
  </g>
  <g fill="#fff" opacity=".11">
    <circle cx="95" cy="266" r="2"/><circle cx="147" cy="194" r="3"/><circle cx="228" cy="402" r="2"/>
    <circle cx="411" cy="227" r="3"/><circle cx="333" cy="94" r="2"/><circle cx="383" cy="356" r="2"/>
  </g>
</svg>`);

async function renderWebp(source, target, quality = 72) {
  await mkdir(path.dirname(target), { recursive: true });
  await execFileAsync('magick', [
    '-background',
    'none',
    source,
    '-alpha',
    'on',
    '-strip',
    '-define',
    'webp:method=6',
    '-quality',
    String(quality),
    target,
  ]);
}

async function main() {
  await rm(temp, { recursive: true, force: true });
  await mkdir(temp, { recursive: true });

  for (const [id, svg] of Object.entries(aspectIcons)) {
    await put(`icons/aspects/${id}.svg`, svg);
  }
  for (const [id, svg] of Object.entries(buildingIcons)) {
    await put(`icons/buildings/${id}.svg`, svg);
  }
  for (const [id, svg] of Object.entries(researchIcons)) {
    await put(`icons/research/${id}.svg`, svg);
  }
  for (const [id, svg] of Object.entries(upgradeIcons)) {
    await put(`icons/upgrades/${id}.svg`, svg);
  }
  await put('brand/terraclicker-wordmark.svg', wordmark);
  await put('brand/dont-panic.svg', dontPanic);

  for (const [id, svg] of Object.entries(guidePlates)) {
    const source = path.join(temp, `guide-${id}.svg`);
    await writeFile(source, svg, 'utf8');
    await renderWebp(source, path.join(out, 'illustrations', 'guide', `${id}.webp`), 68);
  }

  const lensSource = path.join(temp, 'lens-dirt.svg');
  await writeFile(lensSource, lensTexture, 'utf8');
  await renderWebp(lensSource, path.join(out, 'textures', 'lens-dirt.webp'), 62);

  const manifest = {
    version: 1,
    generatedBy: 'scripts/generate-themed-assets.mjs',
    palette,
    counts: {
      buildings: Object.keys(buildingIcons).length,
      aspects: Object.keys(aspectIcons).length,
      research: Object.keys(researchIcons).length,
      upgrades: Object.keys(upgradeIcons).length,
      guideIllustrations: Object.keys(guidePlates).length,
      eventIllustrations: 10,
      brand: 2,
      textures: 1,
    },
  };
  await put('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  await rm(temp, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
