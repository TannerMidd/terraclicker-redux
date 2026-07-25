/**
 * The combinatorial content format.
 *
 * Four things still to build all want the same shape: something assembled from
 * authored parts rather than written out in full, so that the humour is
 * written once and reused, and so a universe can keep producing new material
 * after the handcrafted set is exhausted. Those are the Unscheduled Objects
 * Register, world biographies, commission dossiers, and cargo and passenger
 * stories. Written four times they would drift into four formats; written once
 * they share an authoring surface and a determinism guarantee.
 *
 * ## The shape
 *
 * A `Composition` is a sentence pattern with `{slot}` holes, plus a set of
 * slots each holding authored `Fragment`s. Composing picks one fragment per
 * slot and fills the pattern.
 *
 * ## Why it does not produce nonsense
 *
 * Free combination is how procedural text earns its reputation. Fragments
 * carry `tags`, and may `requires` tags contributed by earlier slots or
 * `forbids` them. Slots resolve in declaration order, each seeing the tags
 * accumulated so far, so an author can say "this complication only makes sense
 * for something that is a building" and have it mean something. A slot whose
 * fragments are all excluded falls back to its first unconditional fragment,
 * because a missing sentence is worse than a slightly loose one.
 *
 * ## Determinism
 *
 * Composition takes an explicit numeric seed and runs a local PRNG. It never
 * touches the shared rng streams, for the same reason world traits do not:
 * rendering a description must not move the universe along. The same seed and
 * the same authored set always produce the same text (engine law #1).
 */
import { mulberry } from '../engine/rng';

export interface Fragment {
  id: string;
  /** The text this contributes to its slot. */
  text: string;
  /** Relative likelihood within its slot. Defaults to 1. */
  weight?: number;
  /** Tags this fragment contributes to the composition once chosen. */
  tags?: readonly string[];
  /** Only eligible if every tag here was contributed by an earlier slot. */
  requires?: readonly string[];
  /** Ineligible if any tag here was contributed by an earlier slot. */
  forbids?: readonly string[];
}

export interface Slot {
  id: string;
  fragments: readonly Fragment[];
}

export interface Composition {
  id: string;
  /** Sentence with `{slotId}` holes. Unknown holes are left as written. */
  pattern: string;
  slots: readonly Slot[];
}

export interface Composed {
  /** `compositionId:fragmentId/fragmentId/...` — stable, and a usable key. */
  id: string;
  text: string;
  /** Which fragment filled each slot, by slot id. */
  parts: Record<string, string>;
  /** Every tag the chosen fragments contributed. */
  tags: string[];
}

function eligible(fragment: Fragment, tags: Set<string>): boolean {
  if (fragment.requires?.some((t) => !tags.has(t))) return false;
  if (fragment.forbids?.some((t) => tags.has(t))) return false;
  return true;
}

function choose(fragments: readonly Fragment[], tags: Set<string>, roll: number): Fragment | null {
  const pool = fragments.filter((f) => eligible(f, tags));
  // A slot that has excluded itself entirely falls back to its first
  // unconditional fragment: a gap in the sentence is worse than a loose fit.
  const usable = pool.length > 0
    ? pool
    : fragments.filter((f) => !f.requires?.length && !f.forbids?.length);
  if (usable.length === 0) return null;

  const total = usable.reduce((sum, f) => sum + (f.weight ?? 1), 0);
  let remaining = roll * total;
  for (const fragment of usable) {
    remaining -= fragment.weight ?? 1;
    if (remaining <= 0) return fragment;
  }
  return usable[usable.length - 1] ?? null;
}

/**
 * Assemble one piece of content. Pure: same seed, same result, and no shared
 * rng stream is advanced.
 *
 * `contextTags` seeds the tag set before any slot resolves, which is how a
 * caller says what this composition is *about* — a neglected ocean world, an
 * object found inside a nebula, a passenger who is already late. Fragments
 * gate on those tags exactly as they gate on each other's.
 */
export function compose(
  composition: Composition,
  seed: number,
  contextTags: readonly string[] = [],
): Composed {
  const rand = mulberry(seed >>> 0);
  const tags = new Set<string>(contextTags);
  const parts: Record<string, string> = {};
  const chosen: string[] = [];

  for (const slot of composition.slots) {
    const fragment = choose(slot.fragments, tags, rand());
    if (!fragment) continue;
    parts[slot.id] = fragment.text;
    chosen.push(fragment.id);
    for (const tag of fragment.tags ?? []) tags.add(tag);
  }

  const text = composition.pattern.replace(/\{(\w+)\}/g, (whole, key: string) =>
    parts[key] ?? whole,
  );

  return {
    id: `${composition.id}:${chosen.join('/')}`,
    text,
    parts,
    tags: [...tags],
  };
}

/** How many distinct outputs an authored set can produce, ignoring constraints. */
export function compositionSpace(composition: Composition): number {
  return composition.slots.reduce((n, slot) => n * Math.max(1, slot.fragments.length), 1);
}
