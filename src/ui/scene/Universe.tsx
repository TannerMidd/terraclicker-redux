import { AssemblingSystem } from './universe/AssemblingSystem';
import { SystemGlyphs } from './universe/SystemGlyphs';
import { Galaxies } from './universe/Galaxies';
import { ProtoGalaxy } from './universe/ProtoGalaxy';
import { CosmicWeb } from './universe/CosmicWeb';
import { FormationFX } from './universe/FormationFX';

/**
 * The universe you have built, all of it visible and none of it faked:
 * finished worlds orbit the system they're assembling; formed systems
 * recede into a constellation; five of those collapse into a galaxy; and
 * behind everything hangs the cosmic web, where each lifetime galaxy stays
 * lit forever. Scroll out to take perspective (CameraRig owns the journey;
 * FormationFX owns the ceremonies).
 */
export function Universe() {
  return (
    <group>
      <AssemblingSystem />
      <SystemGlyphs />
      <Galaxies />
      <ProtoGalaxy />
      <CosmicWeb />
      <FormationFX />
    </group>
  );
}
