/**
 * The parts of the old HUD that belong to the SCENE rather than to the chrome.
 *
 * Mk II took over everything that was a readout — vitals, gauges, news, the
 * open question. What is left here is the stuff that is glued to the world
 * itself: the numbers that fly off a click, the whiteout when something
 * enormous happens, the fleet that has to be clicked, and the focus furniture
 * that appears when you fly up to look at a system. None of it is chrome, so
 * none of it moved into the casing.
 */
import { useEffect, useState } from 'react';
import { useGame } from '../../state/store';
import { useUiBus } from '../fx/uiBus';
import { UniverseHUD } from '../hud/UniverseHUD';
import { VOGON_POEM_LINES } from '../../content/vogonPoetry';
import { poemLine } from '../../engine/improbability';
import { C } from '../../content/constants';
import { VOGON_ART } from '../assets';

function Floats() {
  const floats = useUiBus((b) => b.floats);
  return (
    <>
      {floats.map((f) => (
        <div key={f.id} className="float-num" style={{ left: f.x, top: f.y }}>
          {f.text}
        </div>
      ))}
    </>
  );
}

function Flash() {
  const nonce = useUiBus((b) => b.flashNonce);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (nonce === 0) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 700);
    return () => clearTimeout(t);
  }, [nonce]);
  if (!visible) return null;
  return <div className="flash-overlay" />;
}

/** A reading in progress. You cannot file this one; you have to go and stop it. */
function VogonBanner() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  if (!s.vogon) return null;
  const line = VOGON_POEM_LINES[poemLine(s, VOGON_POEM_LINES.length)];
  const left = s.vogon.ships.filter((sh) => !sh.hit).length;
  const earth = Boolean(s.flags['earthDefenseActive']);
  return (
    <div className="vogon-banner">
      <img className="v-art" src={VOGON_ART} alt="" aria-hidden />
      <div className="v-kicker">
        {earth ? '⚠ DEMOLITION NOTICE — EARTH ⚠' : 'Vogon poetry reading in progress'} · −
        {Math.round(C.VOGON_DEBUFF * 100)}% production
      </div>
      <div className="v-line">“{line}”</div>
      <div className="v-hint">
        Click the constructor ships to end the reading. {left} remain{left === 1 ? 's' : ''}.
        {earth ? ' This one is personal.' : ''}
      </div>
    </div>
  );
}

export function SceneOverlays() {
  const flightMode = useUiBus((b) => b.flightMode);
  return (
    <div className="hud-layer">
      {!flightMode && <UniverseHUD />}
      <VogonBanner />
      <Floats />
      <Flash />
    </div>
  );
}
