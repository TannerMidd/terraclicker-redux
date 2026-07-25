# The Expansion — flight as a trade, the idle game as a place with obligations

The plan for everything still missing, written down once so it lands as one
coherent shape instead of eight bolted-on ones. Read with DESIGN.md §3.6
(the living universe) and PROGRESSION.md §9 (pacing bands).

## The two laws this expansion must not break

1. **The Deep Field economy stays sealed.** Salvage buys the ship and nothing
   else. Flight never pays TU, Science, aspects, or planet progress, and the
   idle game never spends salvage. A player who never leaves the planet loses
   nothing but the view — that promise predates this document and outranks it.
2. **The universe visibly accumulates.** Anything this adds that creates a
   thing — a rig, a megaproject, a route you fly often — must be visible in
   the scene afterwards and must persist. Nothing here may be a number in a
   panel only.

## One save version for all of it: v9

Eight features arriving in eight migrations would be eight chances to get the
same thing wrong. The whole shape is declared here and lands as one bump.

```
expedition (lifetime — survives prestige, like the rest of the Deep Field)
  manifest: { kind: 'freight' | 'passenger'; jobId; fromId; toId;
              mass; salvage; deadlineMs } | null   -- what is in the hold
  jobs:     JobOffer[]                             -- the board, refreshed on a timer
  rigs:     Record<seamId, { placedAtMs; banked }> -- mining, accrues offline
  seams:    Record<seamId, { foundAtMs }>          -- prospected, placement-eligible
  interdictions: number                            -- lifetime count, for the Guide
run (this run only — sold with the portfolio)
  megaprojects: Record<id, { startedAtMs; ticks; done }>
  petitions:    PetitionInstance[]                 -- queued, world-sourced
```

`operations.reputation` already exists and already tracks three factions; the
expansion gives it teeth rather than adding a parallel system.

## Flight

### The hold (hauling and hitchhikers are ONE system)

A manifest slot with two payload kinds. Freight is mass and pays salvage;
a passenger is light, pays in Guide entries and a Sub-Etha rumour. Everything
else — accept, carry, deliver, lose — is shared.

* **Board.** Jobs are offered at delivered worlds and Deep Field landmarks,
  refreshed on a timer, seeded. Accept at the origin, fly to the destination,
  deliver. Deadlines are generous; the failure state is losing the fee, not
  losing progress.
* **Mass is the mechanic, not a minigame.** Cargo mass raises the runabout's
  effective inertia: slower to accelerate, much slower to stop, wider turns.
  It reuses `stepFlight`'s existing accel/omega limits rather than adding a
  new system — a loaded ship simply flies like a loaded ship, and the
  proximity governor (`cushion`) needs more room to save you.
* **Capacity is the upgrade, not fuel.** No fuel, deliberately: a stranding
  mechanic in a game people play in ten-minute visits is a punishment, not
  tension. The Cargo Hold refit raises how much mass (and how many jobs) you
  can hold, which is the same design lever without the cruelty.
* **Pays** salvage, and faction reputation for whoever posted it.

### Mining

The bridge between the two halves of the game: flight time becomes idle
production, and leaves a permanent structure behind.

* **Prospect.** Seams are seeded from the master seed, exactly like Deep Field
  landmarks — they were always there. Found by holding the scan verb on a
  contact the sensors class as a seam.
* **Place a rig.** Costs salvage. The rig is a real object in the scene,
  forever, at the seam.
* **It works while you are away.** Salvage accrues per rig per second, capped
  per rig so it banks rather than growing without bound. Collected by flying
  back — which is the reason to return, and the retention hook.
* **Rig Bay refit** raises how many rigs may stand at once.

### Interdiction (the combat that fits this universe)

Not dogfighting. This universe does *being pursued by paperwork*.

* A patrol (Vogon customs, or something worse near the Krikkit gate) locks on
  while you are carrying a manifest — the risk exists because you have
  something to lose.
* Three ways out, all using the flight model already tuned: **outrun** it
  (speed and distance, harder when loaded — mass matters again), **comply**
  (stop, lose the cargo and the fee, keep everything else), or **deter** it
  (the Deterrent refit: disperses, never destroys).
* Losing a manifest costs the fee and nothing structural. There is no damage
  model and no death.

### The refit tree, deepened

Salvage has more to buy, which is what "deepen the flight economy" means:
`cargoHold`, `rigBay`, `deterrent`, alongside the existing sensors, analysis,
thrusters and drive.

## Idle

### Megaprojects

The multi-day arc the game lacks.

* Commissioned with TU, then build over **real days**, progressing offline —
  the one system that deliberately does, because its whole point is being
  something you come back to.
* **Visible while building and after**: a structure in the scene at its site,
  incomplete then complete.
* **Survives prestige.** Selling the portfolio does not sell the monuments;
  finished megaprojects grant a permanent effect and stay in the sky.
* Gated by faction reputation, which is what finally makes reputation matter.

### Petitions

The daily, low-stakes counterpart to situations, and deliberately the SAME
machinery (`content/situations.ts` shapes, `engine/situations.ts` resolution)
with three differences:

* **Sourced by a world**, keyed to its recorded bottleneck and quirks, so it
  is unmistakably from a place you built.
* **Queued**, not one-at-a-time: several may wait, because these are requests
  rather than emergencies.
* **Gentler**, with long windows. Answering lifts standing; ignoring lets it
  slip. The world's lights already show it.

### Faction standing with teeth

Reputation earned from contracts, situations, petitions and haul jobs gates:
better contract tiers, faction-specific megaprojects, and one refit line each
faction will sell you. Standing is spendable trust, not a decoration.

## Order of work

Foundation first, because everything else hangs off the same state and the
same save bump: **state + refits → hold (haul/passenger) → mining →
interdiction → megaprojects → petitions → reputation gates.**

Each lands with: content, engine (deterministic, offline-honest), UI, scene
presence, and tests.
