import { useEffect, useState } from 'react';
import { LayoutGrid, BarChart3, Maximize, Minimize, Settings, ArrowLeftRight, House, Heart } from 'lucide-react';

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
  { id: 'home', label: 'Accueil', Icon: House },

  { id: 'library', label: 'Bibliothèque', Icon: LayoutGrid },
  { id: 'wishlist', label: 'Souhaits', Icon: Heart },

  { id: 'stats', label: 'Statistiques', Icon: BarChart3 },
  { id: 'share', label: 'Partage', Icon: ArrowLeftRight },
  { id: 'settings', label: 'Paramètres', Icon: Settings }
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
      {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

export default function TopNav({ activeTab, onTabChange, isFullscreen, onToggleFullscreen, isReceiving }: TopNavProps) {
  return (
    // Responsive : sous 1180 px, seuls l'onglet actif et les icônes gardent
    // leur place (libellés des autres onglets en infobulle) ; la liste défile
    // horizontalement en dernier recours au lieu de déborder de la fenêtre.
    <header className="flex flex-shrink-0 items-center gap-2 px-4 pb-2 pt-4 sm:px-6">
      <div className="mr-2 flex flex-shrink-0 items-center gap-2 text-[17px] font-extrabold tracking-wide lg:mr-6">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[11px] font-extrabold text-white">
          DL
        </span>
        <span className="hidden md:inline">DLSGM</span>
      </div>
      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {TABS.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              title={label}
              aria-label={label}
              className={`pill-tab flex-shrink-0 px-3 min-[1180px]:px-4 ${active ? 'is-active' : ''}`}
            >
              <Icon size={15} strokeWidth={2.25} />
              <span className={active ? 'hidden sm:inline' : 'hidden min-[1180px]:inline'}>{label}</span>
              {id === 'share' && isReceiving && (
                <span className="h-2 w-2 rounded-full bg-play" title="Réception ouverte" aria-label="Réception ouverte" />
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
          title={isFullscreen ? 'Quitter le plein écran (F11)' : 'Plein écran (F11)'}
          aria-label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
        >
          {isFullscreen ? <Minimize size={17} strokeWidth={2.25} /> : <Maximize size={17} strokeWidth={2.25} />}
        </button>
        <Clock />
      </div>
    </header>
  );
}
