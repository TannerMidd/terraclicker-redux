/**
 * Every tunable in the game lives here. Change protocol (PROGRESSION.md §9):
 * any change ships with a balance-harness run attached to the commit.
 */
export const C = {
  SAVE_VERSION: 19,
  LOGIC_TICK_MS: 250,

  // Clicks
  CLICK_BASE: 1,

  // Buildings
  COST_GROWTH: 1.15,

  // Planet gauges: T(n) = GAUGE_BASE × GAUGE_GROWTH^n × sizeMod × typeBias
  GAUGE_BASE: 60,
  GAUGE_GROWTH: 1.42,
  SIZE_MODS: { small: 0.7, medium: 1.0, large: 1.4, huge: 2.0 } as const,
  /** Completion bonus: this many seconds of TU/s, minimum 50 TU.
   * (Was 90; halved after the harness showed completion bonuses compounding
   * into a runaway for high-cadence players — see PROGRESSION.md §3.) */
  PLANET_BONUS_SECONDS: 45,
  PLANET_BONUS_MIN: 50,
  /** Excess aspect production converts to TU at this rate once a gauge is full. */
  OVERFLOW_RATE: 0.35,
  /** Survey choice appears from this run-planet index (0-based). */
  SURVEY_FROM_INDEX: 3,

  // Meta ladder
  PLANETS_PER_SYSTEM: 5,
  SYSTEMS_PER_GALAXY: 5,
  SYSTEM_BONUS: 0.15, // +15% additive each, per run
  GALAXY_MULT: 1.5, // ×1.5 multiplicative each, per run

  // Bubbles (Improbability Bubbles)
  BUBBLE_MIN_GAP_MS: 60_000,
  BUBBLE_MAX_GAP_MS: 95_000,
  BUBBLE_LIFETIME_MS: 18_000,
  BUBBLE_PAYOUT_SECONDS: 45,
  BUBBLE_PAYOUT_BANK_PCT: 0.005,
  BUBBLE_PITY_MS: 360_000, // 6 min without a catch → next is golden

  // Events
  EVENT_MIN_GAP_MS: 300_000, // 5 min
  EVENT_MAX_GAP_MS: 720_000, // 12 min
  FIRST_EVENT_MIN_MS: 420_000, // guaranteed window 7–10 min into a fresh game
  FIRST_EVENT_MAX_MS: 600_000,
  // Situations are the ones that ask a question, so they come round less
  // often than a buff did — often enough to be the rhythm of a session,
  // rarely enough that answering one never feels like clearing an inbox.
  SITUATION_MIN_GAP_MS: 420_000, // 7 min
  SITUATION_MAX_GAP_MS: 900_000, // 15 min
  SITUATION_FIRST_MIN_MS: 240_000, // the first one arrives early; it teaches
  SITUATION_FIRST_MAX_MS: 360_000,
  // Petitions queue rather than interrupt, so they can be much more frequent
  // than situations without ever feeling like an inbox.
  PETITION_MIN_GAP_MS: 300_000, // 5 min
  PETITION_MAX_GAP_MS: 600_000, // 10 min
  PETITION_QUEUE_MAX: 3,
  // How much a full hold adds to the runabout's inertia. Tuned so a loaded
  // ship is noticeably heavier to stop without becoming unflyable.
  CARGO_INERTIA: 0.85,
  // How often the freight board is redrawn.
  JOB_REFRESH_MS: 240_000,
  // Interdiction: how long a patrol pursues before losing you on its own.
  INTERDICTION_PURSUIT_MS: 45_000,
  INTERDICTION_MIN_GAP_MS: 420_000,
  FIRST_BUBBLE_MS: 180_000, // guaranteed first bubble at ~3 min

  // Rubber band: if nothing acquired for this long, improbability rises
  STALL_MS: 720_000, // 12 min
  STALL_FREQ_BONUS: 2.0, // spawn-gap divisor while stalled

  // Vogons
  VOGON_MIN_GAP_MS: 1_800_000, // 30 min
  VOGON_MAX_GAP_MS: 5_400_000, // 90 min
  VOGON_EARLIEST_MS: 1_500_000, // never before 25 min of game time
  VOGON_DURATION_MS: 45_000,
  VOGON_DEBUFF: 0.5, // −50% production
  VOGON_SHIPS: 5,

  // Offline
  OFFLINE_EFFICIENCY: 0.5,
  OFFLINE_CAP_MS: 8 * 3_600_000,
  OFFLINE_CHUNK_MS: 60_000,
  /** Below this, we treat a gap as a hiccup, not an absence. */
  OFFLINE_MIN_MS: 30_000,

  // Prestige: BP = floor((runTU/1e12)^(1/3) + 0.5 × planetsCompleted)
  /** First appraisal needs a real portfolio; later commissions add one system each. */
  PRESTIGE_MIN_SYSTEMS: 5,
  PRESTIGE_SYSTEMS_PER_COMMISSION: 1,
  PRESTIGE_TU_DIVISOR: 1e12,
  PRESTIGE_TU_EXP: 1 / 3,
  PRESTIGE_PER_PLANET: 0.5,
  BP_PASSIVE: 0.02, // +2% production per BP ever earned

  // Operations
  CONTRACT_OFFER_COUNT: 3,
  CONTRACT_REPUTATION_PER_BP: 10,
  CONTRACT_REPUTATION_BP_CAP: 1,
  CONTRACT_DISPATCH_BASE: 1,
  CONTRACTS_PER_DISPATCH_SLOT: 3,
  CONTRACT_DISPATCH_MAX: 4,
  SYSTEM_SPECIALTY_ASPECT_MULT: 1.08,
  SYSTEM_SPECIALTY_SCIENCE_MULT: 1.1,
  SYSTEM_SPECIALTY_PRODUCTION_MULT: 1.04,
  HERITAGE_ACTIVE_LIMIT: 8,
  HERITAGE_ASPECT_MULT: 1.01,

  // Sub-Etha (the channel keeps filing offline — see engine/subEtha.ts)
  SUBETHA_FIRST_MS: 90_000,
  SUBETHA_MIN_GAP_MS: 75_000,
  SUBETHA_MAX_GAP_MS: 150_000,
  /** Ring buffer: an 8-hour absence would otherwise file hundreds of lines. */
  SUBETHA_LOG_MAX: 60,
  /** Odds an ambient broadcast is a rumour pointing at an unfound landmark. */
  SUBETHA_RUMOUR_ODDS: 0.22,
  /** Sensor range multiplier for a landmark the channel has gossiped about. */
  SUBETHA_RUMOUR_RANGE_MULT: 1.7,

  // Achievements: +1% production per Guide entry
  ACHIEVEMENT_BONUS: 0.01,

  // The Answer
  ANSWER_MULT: 1.42,

  // Marvin
  MARVIN_CLICKS_PER_SEC: 1,

  // Magrathean Workshop: +2% aspect fill per workshop (multiplicative)
  WORKSHOP_ASPECT_BONUS: 0.02,

  // Buff caps
  MAX_BUBBLES: 3,
} as const;
