import { useEffect } from 'react';
import { Dices, RefreshCw } from 'lucide-react';
import { findTheme, RANDOM_THEME, TURBO_THEME } from '../../../../shared/themes';
import { applyThemeColors, getActiveTheme, useActiveTheme } from '../../hooks/activeTheme';
import { themeChoices, themeLabel } from '../../lib/themes.js';
import { t } from '../../lib/i18n.js';
import Logo from '../Logo/Logo';
import TurboLogo from '../Logo/TurboLogo';

export interface ThemePickerProps {
  /** Choix en cours (pas encore enregistré). */
  value: string;
  /** Réglage enregistré : « Relancer » n'a de sens que pour lui. */
  savedValue: string;
  onChange: (value: string) => void;
}

/**
 * Choix du thème de couleur : une tuile par palette (icône à ses couleurs),
 * puis « Aléatoire » et « Super random turbo 2000 remix ». La palette
 * survolée par le choix s'applique en aperçu tant que les paramètres sont
 * ouverts ; l'enregistrement la rend définitive (main la diffuse alors à
 * toutes les fenêtres).
 */
export default function ThemePicker({ value, savedValue, onChange }: ThemePickerProps) {
  const active = useActiveTheme();

  // Aperçu d'une palette prédéfinie ; retour au thème actif en quittant.
  useEffect(() => {
    applyThemeColors(findTheme(value) ?? getActiveTheme());
    return () => applyThemeColors(getActiveTheme());
  }, [value, active]);

  const randomMode = savedValue === RANDOM_THEME || savedValue === TURBO_THEME;

  return (
    <div className="pb-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
        {themeChoices().map(id => {
          const preset = findTheme(id);
          const selected = value === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-pressed={selected}
              className={`flex flex-col items-center gap-2 rounded-md border-2 px-2 py-3 text-center text-[12px] font-semibold transition-colors ${
                selected ? 'border-accent bg-accent-soft text-text' : 'border-transparent bg-surface-2 text-text-secondary hover:bg-surface-3'
              }`}
            >
              {preset ? (
                <Logo variant="square" height={48} colors={{ background: preset.icon.bg, dls: preset.icon.dls, gm: preset.icon.gm }} />
              ) : id === TURBO_THEME ? (
                <TurboLogo height={48} />
              ) : (
                <span
                  className="flex h-12 w-12 items-center justify-center text-white"
                  style={{ background: 'linear-gradient(135deg, #ff4f8b 0 25%, #1a9fff 25% 50%, #ffc61a 50% 75%, #8fcf5a 75%)' }}
                >
                  <Dices size={24} strokeWidth={2.5} />
                </span>
              )}
              <span className="leading-tight">{themeLabel(id)}</span>
            </button>
          );
        })}
      </div>
      {randomMode && value === savedValue && (
        <div className="mt-3 flex items-center gap-3 text-[13px] text-text-muted">
          <Logo variant="square" height={28} colors={{ background: active.icon.bg, dls: active.icon.dls, gm: active.icon.gm }} />
          <span>
            {active.id === TURBO_THEME
              ? t('Couleurs générées pour ce lancement (accent {accent}).', { accent: active.accent })
              : t('Thème tiré pour ce lancement : {name}.', { name: themeLabel(active.id) })}
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => window.electronAPI.rerollTheme()}>
            <RefreshCw size={15} strokeWidth={2.25} />
            {t('Nouveau tirage')}
          </button>
        </div>
      )}
    </div>
  );
}
