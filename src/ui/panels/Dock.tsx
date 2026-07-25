import { useEffect, useState } from 'react';
import { useGame } from '../../state/store';
import { useUiBus } from '../fx/uiBus';
import { C } from '../../content/constants';
import { BUILDING_BY_ID } from '../../content/buildings';
import { ShopPanel } from './ShopPanel';
import { ResearchPanel } from './ResearchPanel';
import { OperationsPanel } from './OperationsPanel';
import { GuidePanel } from './GuidePanel';
import { VortexPanel } from './VortexPanel';
import { ChartPanel } from './ChartPanel';
import { StandingOrdersPanel } from './StandingOrdersPanel';
import { MagratheaPanel } from './MagratheaPanel';
import { SettingsPanel } from './SettingsPanel';

const SETTINGS_TAB = 'Settings' as const;
const TABS = ['Shop', 'Research', 'Operations', 'Chart', 'Orders', 'Guide', 'Vortex', 'Magrathea', SETTINGS_TAB] as const;
type Tab = (typeof TABS)[number];

export function Dock() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s, d } = useGame.getState();
  const started = s.lifetime.clicks > 0 || s.lifetime.tuEarned.gt(0);
  const [tab, setTab] = useState<Tab>(started ? 'Shop' : SETTINGS_TAB);

  // Honour a deep link from elsewhere (the Morning Circular), once.
  const dockRequest = useUiBus((b) => b.dockRequest);
  useEffect(() => {
    if (!dockRequest) return;
    if ((TABS as readonly string[]).includes(dockRequest)) setTab(dockRequest as Tab);
    useUiBus.getState().clearDockRequest();
  }, [dockRequest]);

  const isUnlocked = (candidate: Tab): boolean => {
    switch (candidate) {
      case 'Research':
        return s.lifetime.tuEarned.gte(BUILDING_BY_ID['researchLab']!.unlockAtTu)
          || s.research.completed.length > 0
          || Boolean(s.research.active);
      // Guide stays unlocked: it now carries the Field Manual, and a manual
      // you must earn the right to read is a Vogon idea.
      case 'Operations':
        return s.lifetime.planetsCompleted > 0;
      case 'Vortex':
        return s.lifetime.planetsCompleted > 0;
      // The chart is worth having the moment there is more than one place.
      // Automation is the reward for having done it by hand at least once.
      case 'Orders':
        return s.lifetime.prestiges >= 1;
      case 'Chart':
        return s.lifetime.planetsCompleted > 0 || Object.keys(s.expedition.discovered).length > 0;
      case 'Magrathea':
        return s.lifetime.prestiges > 0 || s.run.systems > 0
          || s.run.tuEarned.gte(C.PRESTIGE_TU_DIVISOR * 0.1);
      default:
        return true;
    }
  };
  // Recovery/import must remain reachable without mutating a fresh universe.
  const visibleTabs: readonly Tab[] = started ? TABS.filter(isUnlocked) : [SETTINGS_TAB];
  const featureTabs = visibleTabs.filter((candidate) => candidate !== SETTINGS_TAB);

  const attention: Partial<Record<Tab, boolean>> = {
    Magrathea: d.prestigeEligible,
    Research: !s.research.active && s.science.gte(15) && s.buildings['researchLab'] !== undefined,
    Operations: !s.operations.active && s.operations.offers.length > 0,
  };

  return (
    <div className="dock">
      <div className="dock-nav" role="tablist" aria-label="Guide device panels">
        <div className="dock-tabs">
          {featureTabs.map((t) => (
            <button
              key={t}
              className={`dock-tab${t === tab ? ' active' : ''}${attention[t] ? ' attention' : ''}`}
              onClick={() => setTab(t)}
              role="tab"
              aria-selected={t === tab}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          className={`dock-tab dock-settings-tab${tab === SETTINGS_TAB ? ' active' : ''}`}
          onClick={() => setTab(SETTINGS_TAB)}
          role="tab"
          aria-selected={tab === SETTINGS_TAB}
          aria-label="Settings and save options"
          title="Settings and save options"
        >
          <span className="dock-settings-icon" aria-hidden="true">⚙</span>
          <span>Settings</span>
        </button>
      </div>
      <div className="dock-body" role="tabpanel" aria-label={`${tab} panel`}>
        {tab === 'Shop' && <ShopPanel />}
        {tab === 'Research' && <ResearchPanel />}
        {tab === 'Guide' && <GuidePanel />}
        {tab === 'Vortex' && <VortexPanel />}
        {tab === 'Chart' && <ChartPanel />}
        {tab === 'Orders' && <StandingOrdersPanel />}
        {tab === 'Operations' && <OperationsPanel />}
        {tab === 'Magrathea' && <MagratheaPanel />}
        {tab === SETTINGS_TAB && <SettingsPanel />}
      </div>
    </div>
  );
}
