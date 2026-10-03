import { useEffect, useState } from 'react';
import { LayoutGrid, BarChart3, Maximize, Minimize, Settings, ArrowLeftRight, House, Heart } from 'lucide-react';
import { msg, t, tr, uiLocale } from '../../lib/i18n.js';
import Logo from '../Logo/Logo';

export type AppTab = 'home' | 'library' | 'wishlist' | 'stats' | 'share' | 'settings';

export interface TopNavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  /** Réception réseau local ouverte : pastille sur l'onglet Partage. */
  isReceiving?: boolean;
}

export const TABS: { id: AppTab; label: string; Icon: typeof LayoutGrid }[] = [
  { id: 'home', label: msg('Accueil'), Icon: House },

  { id: 'library', label: msg('Bibliothèque'), Icon: LayoutGrid },
  { id: 'wishlist', label: msg('Souhaits'), Icon: Heart },

  { id: 'stats', label: msg('Statistiques'), Icon: BarChart3 },
  { id: 'share', label: msg('Partage'), Icon: ArrowLeftRight },
  { id: 'settings', label: msg('Paramètres'), Icon: Settings }
];

/** Horloge de la barre d'état, comme en haut à droite de SteamOS. */
function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="hidden text-[15px] font-semibold tabular-nums text-text-secondary sm:inline">
      {now.toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

export default function TopNav({ activeTab, onTabChange, isFullscreen, onToggleFullscreen, isReceiving }: TopNavProps) {
  return (
    // Responsive : sous 1180 px, seuls l'onglet actif et les icônes gardent
    // leur place (libellés des autres onglets en infobulle) ; la liste défile
    // horizontalement en dernier recours au lieu de déborder de la fenêtre.
    <header className="flex flex-shrink-0 items-center gap-2 px-4 pb-2 pt-4 sm:px-6">
      <div className="mr-2 flex flex-shrink-0 items-center lg:mr-6">
        <Logo variant="square" height={28} className="md:hidden" />
        <Logo variant="horizontal" height={24} className="hidden md:block" />
      </div>
      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {TABS.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              title={tr(label)}
              aria-label={tr(label)}
              className={`pill-tab flex-shrink-0 px-3 min-[1180px]:px-4 ${active ? 'is-active' : ''}`}
            >
              <Icon size={15} strokeWidth={2.25} />
              <span className={active ? 'hidden sm:inline' : 'hidden min-[1180px]:inline'}>{tr(label)}</span>
              {id === 'share' && isReceiving && (
                <span className="h-2 w-2 rounded-full bg-play" title={t('Réception ouverte')} aria-label={t('Réception ouverte')} />
              )}
            </button>
          );
        })}
      </nav>
      <div className="ml-auto flex flex-shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="btn btn-ghost btn-icon rounded-full"
          title={isFullscreen ? t('Quitter le plein écran (F11)') : t('Plein écran (F11)')}
          aria-label={isFullscreen ? t('Quitter le plein écran') : t('Plein écran')}
        >
          {isFullscreen ? <Minimize size={17} strokeWidth={2.25} /> : <Maximize size={17} strokeWidth={2.25} />}
        </button>
        <Clock />
      </div>
    </header>
  );
}
