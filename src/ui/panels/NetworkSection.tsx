import { CHARTER_BY_ID } from '../../content/charters';
import { C } from '../../content/constants';
import {
  deriveGalaxyNetwork,
  GALAXY_ACCORD_META,
  type GalaxyAccordKind,
} from '../../engine/networks';
import { useGame } from '../../state/store';

function cssColor(kind: GalaxyAccordKind): string {
  return `#${GALAXY_ACCORD_META[kind].color.toString(16).padStart(6, '0')}`;
}

function percent(multiplier: number): string {
  const value = (multiplier - 1) * 100;
  return value.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * A standalone drawer section. It deliberately reads only derived state, so
 * mounting it cannot create a new save dependency or alter simulation order.
 */
export function NetworkSection() {
  const rev = useGame((game) => game.rev);
  void rev;
  const state = useGame.getState().s;
  const network = deriveGalaxyNetwork(state);
  if (network.galaxies.length === 0 && state.run.systems === 0) return null;

  const active = network.galaxies.filter((galaxy) => galaxy.kind !== null).length;
  const { effects } = network;
  const aspectPercent = percent(effects.aspectMult.thermal);

  const nextFirstSystem = network.galaxies.length * C.SYSTEMS_PER_GALAXY;
  const nextSystemCount = Math.max(
    0,
    Math.min(C.SYSTEMS_PER_GALAXY, state.run.systems - nextFirstSystem),
  );
  let nextSignedCount = 0;
  for (let slot = 0; slot < nextSystemCount; slot++) {
    const id = state.run.charters[String(nextFirstSystem + slot)];
    if (id && CHARTER_BY_ID[id]) nextSignedCount++;
  }

  const diversityText = effects.diversityKinds.length < 2
    ? 'Diversity exchange opens when two galaxies ratify different kinds of accord.'
    : `+${percent(effects.diversityMult)}% all production from exchanging ${effects.diversityKinds.length} distinct accord traditions.`;

  return (
    <>
      <div className="dr-sec">
        <span className="dr-sec-k" style={{ color: 'var(--atmo)' }}>Galaxy network</span>
        <span className="dr-rule" />
        <span className="dr-sec-note">
          {network.galaxies.length > 0
            ? `${active} / ${network.galaxies.length} RATIFIED`
            : 'NEXT NETWORK'}
        </span>
      </div>
      {nextSystemCount > 0 && (
        <div className="dr-card">
          <div className="dr-card-head">
            <span className="dr-sec-k">Next galaxy network</span>
            <span className="dr-card-clock">
              {nextSystemCount} / {C.SYSTEMS_PER_GALAXY} SYSTEMS
            </span>
          </div>
          <div className="dr-card-name">An accord is taking shape</div>
          <div className="dr-card-body">
            {nextSignedCount} / {C.NETWORK_QUORUM_ARTICLES} signed articles toward quorum.
            Form five systems to reveal their permanent connections; three signed seats
            ratify a production, science, or aspect accord.
          </div>
          <div className="dr-meter" aria-hidden>
            <i style={{ width: `${(nextSystemCount / C.SYSTEMS_PER_GALAXY) * 100}%` }} />
          </div>
          <div className="dr-card-note">
            Different accord traditions later unlock an intergalactic production exchange.
          </div>
        </div>
      )}
      {network.galaxies.length > 0 && (
        <div className="dr-card lit">
        <div className="dr-card-head">
          <span className="dr-sec-k">Intergalactic exchange</span>
          <span className="dr-card-clock">{effects.diversityKinds.length} TRADITIONS</span>
        </div>
        <div className="dr-card-body">{diversityText}</div>
        <div className="dr-card-note">
          Network total: +{percent(effects.prodMult)}% production
          {' · '}+{percent(effects.scienceMult)}% science
          {' · '}+{aspectPercent}% all aspects
        </div>
      </div>
      )}
      {network.galaxies.map((galaxy) => {
        const meta = galaxy.kind ? GALAXY_ACCORD_META[galaxy.kind] : null;
        const signedNames = galaxy.signedArticles
          .map((id) => CHARTER_BY_ID[id]?.name)
          .filter((name): name is string => Boolean(name));
        return (
          <div
            className={`dr-card${meta ? ' lit' : ''}`}
            key={galaxy.galaxyIndex}
            style={galaxy.kind ? { borderLeftColor: cssColor(galaxy.kind) } : undefined}
          >
            <div className="dr-card-head">
              <span className="dr-sec-k">Galaxy {galaxy.galaxyIndex + 1}</span>
              <span className="dr-card-clock">
                {galaxy.signedCount} / {galaxy.totalArticles} SIGNED
              </span>
            </div>
            <div className="dr-card-name">
              {meta?.name ?? 'Accord awaiting quorum'}
            </div>
            <div className="dr-card-body">
              {meta?.description
                ?? `${galaxy.quorum - galaxy.signedCount} more signed article${galaxy.quorum - galaxy.signedCount === 1 ? '' : 's'} required to ratify this galaxy's first accord.`}
            </div>
            <div className="dr-meter" aria-hidden>
              <i style={{ width: `${(galaxy.signedCount / galaxy.totalArticles) * 100}%` }} />
            </div>
            <div
              className="dr-card-note"
              style={galaxy.kind ? { color: cssColor(galaxy.kind) } : undefined}
            >
              {meta?.bonusText ?? `Quorum: ${galaxy.quorum} signed articles`}
            </div>
            <div className="dr-card-body">
              {signedNames.length > 0
                ? `On file: ${signedNames.join(' · ')}`
                : 'No member-system articles are on file yet.'}
            </div>
          </div>
        );
      })}
    </>
  );
}
