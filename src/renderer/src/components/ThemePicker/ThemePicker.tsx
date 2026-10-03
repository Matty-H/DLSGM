import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Dices, RefreshCw } from 'lucide-react';
import { findTheme, MAX_CUSTOM_THEMES, RANDOM_THEME, TURBO_THEME, type CustomTheme } from '../../../../shared/themes';
import { applyThemeColors, getActiveTheme, useActiveTheme } from '../../hooks/activeTheme';
import { themeChoices, themeLabel } from '../../lib/themes.js';
import { t } from '../../lib/i18n.js';
import Logo from '../Logo/Logo';
import TurboLogo from '../Logo/TurboLogo';
import CustomThemeEditor from './CustomThemeEditor';

export interface ThemePickerProps {
  /** Choix en cours (pas encore enregistré). */
  value: string;
  /** Réglage enregistré : « Nouveau tirage » n'a de sens que pour lui. */
  savedValue: string;
  onChange: (value: string) => void;
}

/**
 * Choix du thème de couleur : une tuile par palette (icône à ses couleurs),
 * les palettes perso, puis « Aléatoire » et « Super random turbo 2000
 * remix ». La palette choisie s'applique en aperçu tant que les paramètres
 * sont ouverts ; l'enregistrement la rend définitive (main la diffuse alors
 * à toutes les fenêtres). Les palettes perso, elles, sont enregistrées dès
 * « Enregistrer la palette » (menu « Mes palettes »).
 */
export default function ThemePicker({ value, savedValue, onChange }: ThemePickerProps) {
  const active = useActiveTheme();
  const [customs, setCustoms] = useState<CustomTheme[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      .getSettings()
      .then(settings => !cancelled && setCustoms(settings.customThemes ?? []))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Aperçu d'une palette (prédéfinie ou perso) ; retour au thème actif en quittant.
  useEffect(() => {
    applyThemeColors(findTheme(value, customs) ?? getActiveTheme());
    return () => applyThemeColors(getActiveTheme());
  }, [value, active, customs]);

  const saveCustoms = async (list: CustomTheme[]) => {
    const saved = await window.electronAPI.saveCustomThemes(list);
    setCustoms(saved);
    return saved;
  };

  const label = (id: string) => customs.find(custom => custom.id === id)?.name ?? themeLabel(id);
  const randomMode = savedValue === RANDOM_THEME || savedValue === TURBO_THEME;
  const choices = themeChoices();
  const ids = [...choices.slice(0, -2), ...customs.map(custom => custom.id), ...choices.slice(-2)];
  const selectedCustom = customs.find(custom => custom.id === value) ?? null;

  return (
    <div className="pb-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
        {ids.map(id => {
          const preset = findTheme(id, customs);
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
                <Logo variant="square" height={48} colors={{ background: preset.icon.bg, dls: preset.icon.dls, gm: preset.icon.gm, rounded: preset.icon.rounded }} />
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
              <span className="max-w-full break-words leading-tight">{label(id)}</span>
            </button>
          );
        })}
      </div>
      {randomMode && value === savedValue && (
        <div className="mt-3 flex items-center gap-3 text-[13px] text-text-muted">
          <Logo variant="square" height={28} colors={{ background: active.icon.bg, dls: active.icon.dls, gm: active.icon.gm, rounded: active.icon.rounded }} />
          <span>
            {active.id === TURBO_THEME
              ? t('Couleurs générées pour ce lancement (accent {accent}).', { accent: active.accent })
              : t('Thème tiré pour ce lancement : {name}.', { name: label(active.id) })}
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => window.electronAPI.rerollTheme()}>
            <RefreshCw size={15} strokeWidth={2.25} />
            {t('Nouveau tirage')}
          </button>
        </div>
      )}

      <button type="button" onClick={() => setEditorOpen(open => !open)} aria-expanded={editorOpen} className="btn btn-ghost mt-3">
        {editorOpen ? <ChevronDown size={16} strokeWidth={2.25} /> : <ChevronRight size={16} strokeWidth={2.25} />}
        {t('Mes palettes')}
      </button>
      {editorOpen && (
        <CustomThemeEditor
          editing={selectedCustom}
          canAdd={customs.length < MAX_CUSTOM_THEMES}
          onSave={async draft => {
            const exists = customs.some(custom => custom.id === draft.id);
            const saved = await saveCustoms(exists ? customs.map(custom => (custom.id === draft.id ? draft : custom)) : [...customs, draft]);
            if (saved.some(custom => custom.id === draft.id)) onChange(draft.id);
          }}
          onDelete={async id => {
            await saveCustoms(customs.filter(custom => custom.id !== id));
            if (value === id) onChange(savedValue === id ? themeChoices()[0] : savedValue);
          }}
        />
      )}
    </div>
  );
}
