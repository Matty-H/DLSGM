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
    <span className="text-[15px] font-semibold tabular-nums text-text-secondary">
      {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

export default function TopNav({ activeTab, onTabChange, isFullscreen, onToggleFullscreen, isReceiving }: TopNavProps) {
  return (
    <header className="flex flex-shrink-0 items-center gap-2 px-6 pb-2 pt-4">
      <div className="mr-6 flex items-center gap-2 text-[17px] font-extrabold tracking-wide">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[11px] font-extrabold text-white">
          DL
        </span>
        DLSGM
      </div>
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onTabChange(id)}
          className={`pill-tab ${activeTab === id ? 'is-active' : ''}`}
        >
          <Icon size={15} strokeWidth={2.25} />
          {label}
          {id === 'share' && isReceiving && (
            <span className="h-2 w-2 rounded-full bg-play" title="Réception ouverte" aria-label="Réception ouverte" />
          )}
        </button>
      ))}
      <div className="ml-auto flex items-center gap-3">
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
