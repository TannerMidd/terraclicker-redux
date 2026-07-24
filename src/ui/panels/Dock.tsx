import { useState } from 'react';
import { useGame } from '../../state/store';
import { ShopPanel } from './ShopPanel';
import { ResearchPanel } from './ResearchPanel';
import { GuidePanel } from './GuidePanel';
import { VortexPanel } from './VortexPanel';
import { MagratheaPanel } from './MagratheaPanel';
import { SettingsPanel } from './SettingsPanel';

const TABS = ['Shop', 'Research', 'Guide', 'Vortex', 'Magrathea', '⚙'] as const;
type Tab = (typeof TABS)[number];

export function Dock() {
  const [tab, setTab] = useState<Tab>('Shop');
  const rev = useGame((g) => g.rev);
  void rev;
  const { s, d } = useGame.getState();

  const attention: Partial<Record<Tab, boolean>> = {
    Magrathea: d.prestigeBp >= 1,
    Research: !s.research.active && s.science.gte(15) && s.buildings['researchLab'] !== undefined,
  };

  return (
    <div className="dock">
      <div className="dock-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`dock-tab${t === tab ? ' active' : ''}${attention[t] ? ' attention' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="dock-body">
        {tab === 'Shop' && <ShopPanel />}
        {tab === 'Research' && <ResearchPanel />}
        {tab === 'Guide' && <GuidePanel />}
        {tab === 'Vortex' && <VortexPanel />}
        {tab === 'Magrathea' && <MagratheaPanel />}
        {tab === '⚙' && <SettingsPanel />}
      </div>
    </div>
  );
}
