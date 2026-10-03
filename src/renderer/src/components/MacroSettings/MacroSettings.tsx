import { useEffect, useState, type ReactNode } from 'react';
import Select from '../Select/Select';
import { HOTKEY_OPTIONS } from '../../lib/autoClicker.js';
import type { MacroRecorderSettings, MacroRecorderStatus } from '../../lib/macros.js';
import { t } from '../../lib/i18n.js';

export interface MacroSettingsProps {
  value: MacroRecorderSettings;
  onChange: (value: MacroRecorderSettings) => void;
  /** Raccourcis des autres outils : pas proposés ici (un seul raccourci par action). */
  takenHotkeys: string[];
  isDirty: boolean;
}

function Row({ label, description, children }: { label: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-divider py-4 last:border-0">
      <div className="min-w-0">
        <div className="text-[15px] font-semibold">{label}</div>
        {description && <div className="mt-1 text-[13px] leading-relaxed text-text-muted">{description}</div>}
      </div>
      {children && <div className="flex flex-shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

/**
 * Paramètres › Outils en jeu › Enregistreur de macros : interrupteur général
 * et raccourcis. Les macros se gèrent jeu par jeu dans l'overlay (Maj+Tab).
 */
export default function MacroSettings({ value, onChange, takenHotkeys, isDirty }: MacroSettingsProps) {
  const [status, setStatus] = useState<MacroRecorderStatus | null>(null);
  const set = (patch: Partial<MacroRecorderSettings>) => onChange({ ...value, ...patch });

  useEffect(() => {
    window.electronAPI.getOverlayState().then(state => setStatus(state.macro)).catch(() => undefined);
    return window.electronAPI.onMacroStatus(setStatus);
  }, []);

  if (status && !status.available) return null;

  const options = (other: string) =>
    HOTKEY_OPTIONS.filter(o => ![...takenHotkeys, other].some(key => key.toLowerCase() === o.value.toLowerCase()));

  return (
    <>
      <Row
        label={t("Activer l'enregistreur de macros")}
        description={
          <>
            {t("Interrupteur général ; il s'ajoute ensuite jeu par jeu (overlay Maj+Tab, case « Ajouter l'enregistreur de macros à ce jeu »), où se choisit la macro à rejouer. Seuls les clics et touches faits dans le jeu au premier plan sont enregistrés, et rien n'est rejoué ailleurs.")}
            {status?.recording && <span className="mt-1 block font-semibold text-danger">{t('Enregistrement en cours ({n} étapes).', { n: status.stepCount })}</span>}
            {status?.playing && (
              <span className={`mt-1 block font-semibold ${status.paused ? 'text-amber-300' : 'text-play'}`}>
                {status.paused ? t('Lecture en pause (le jeu n’est pas au premier plan).') : t('Lecture en cours.')}
              </span>
            )}
            {status?.error && <span className="mt-1 block text-danger">{status.error}</span>}
            {isDirty && <span className="mt-1 block text-text-secondary">{t('Enregistre pour appliquer les changements.')}</span>}
          </>
        }
      >
        <input type="checkbox" className="toggle" aria-label={t("Activer l'enregistreur de macros")} checked={value.enabled} onChange={e => set({ enabled: e.target.checked })} />
      </Row>
      <Row label={t("Raccourci d'enregistrement")} description={t("Démarre un enregistrement, puis l'arrête : la macro est ajoutée au jeu et devient celle à rejouer.")}>
        <Select value={value.recordHotkey} options={options(value.playHotkey)} onChange={recordHotkey => set({ recordHotkey })} aria-label={t("Raccourci d'enregistrement")} className="w-[150px]" />
      </Row>
      <Row label={t('Raccourci de lecture')} description={t("Lance la macro choisie (une fois ou en boucle), ou l'arrête. Alt+Espace (panique) arrête tout et jette un enregistrement en cours.")}>
        <Select value={value.playHotkey} options={options(value.recordHotkey)} onChange={playHotkey => set({ playHotkey })} aria-label={t('Raccourci de lecture')} className="w-[150px]" />
      </Row>
      <Row
        label={t('Limites')}
        description={t("Les positions de la souris sont relatives à la fenêtre du jeu (elle peut bouger entre l'enregistrement et la lecture, pas changer de taille). Les déplacements ne sont gardés que bouton enfoncé. Les entrées n'arrivent pas à un jeu lancé en administrateur si DLSGM ne l'est pas.")}
      />
    </>
  );
}
