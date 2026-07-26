import { describe, expect, it } from 'vitest';
import { DEEP_FIELD } from '../src/content/deepField';
import { SEAMS } from '../src/content/freight';
import { seamSites } from '../src/engine/freight';
import { flightFieldSites } from '../src/ui/scene/universe/DeepField';

describe('flight field contacts', () => {
  it('renders every deep-field landmark and resource seam at the helm position', () => {
    const seed = 424242;
    const contacts = flightFieldSites(seed);
    expect(contacts).toHaveLength(DEEP_FIELD.length + SEAMS.length);
    expect(new Set(contacts.map((site) => site.def.id)).size).toBe(contacts.length);

    const expectedSeams = new Map(seamSites(seed).map((site) => [site.id, site.pos]));
    for (const seam of SEAMS) {
      const contact = contacts.find((site) => site.def.id === seam.id);
      expect(contact?.pos).toEqual(expectedSeams.get(seam.id));
      expect(contact?.def.contact).toContain('diffuse');
      expect(contact?.def.radius).toBeGreaterThan(3);
    }
  });
});
