import { LayoutGrid, BarChart3, Settings } from 'lucide-react';

export type AppTab = 'library' | 'stats' | 'settings';

export interface TopNavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const TABS: { id: AppTab; label: string; Icon: typeof LayoutGrid }[] = [
  { id: 'library', label: 'Bibliothèque', Icon: LayoutGrid },
  { id: 'stats', label: 'Statistiques', Icon: BarChart3 },
  { id: 'settings', label: 'Paramètres', Icon: Settings }
];

export default function TopNav({ activeTab, onTabChange }: TopNavProps) {
  return (
    <header className="flex flex-shrink-0 items-center gap-5 border-b border-divider px-6 py-3">
      <div className="mr-2 font-heading text-lg font-semibold tracking-wide">
        DLSGM<span className="text-accent-500">.</span>
      </div>
      {TABS.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={`-mb-px flex cursor-pointer items-center gap-2 border-b-2 px-3 py-2 text-[13px] ${
              isActive
                ? 'border-accent-500 font-semibold text-accent-700'
                : 'border-transparent text-text hover:text-accent-700'
            }`}
          >
            <Icon size={15} strokeWidth={1.5} />
            {label}
          </button>
        );
      })}
    </header>
  );
}
