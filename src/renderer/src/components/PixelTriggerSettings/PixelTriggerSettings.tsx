import { useEffect, useState, type ReactNode } from 'react';
import Select from '../Select/Select';
import { HOTKEY_OPTIONS } from '../../lib/autoClicker.js';
import { formatCaptureRate, type PixelTriggerSettings as TriggerSettings, type PixelTriggerStatus } from '../../lib/pixelTrigger.js';

export interface PixelTriggerSettingsProps {
  value: TriggerSettings;
  onChange: (value: TriggerSettings) => void;
  /** Raccourci de l'auto-clicker : pas proposé ici (un seul raccourci par action). */
  clickerHotkey: string;
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
 * Paramètres › Outils en jeu › Détecteur de rythme : interrupteur général et raccourci du
 * détecteur de rythme. Les zones se règlent jeu par jeu (page du jeu).
 */
export default function PixelTriggerSettings({ value, onChange, clickerHotkey, isDirty }: PixelTriggerSettingsProps) {
  const [status, setStatus] = useState<PixelTriggerStatus | null>(null);
  const set = (patch: Partial<TriggerSettings>) => onChange({ ...value, ...patch });

  useEffect(() => {
    window.electronAPI.getPixelTriggerState().then(state => setStatus(state.status)).catch(() => undefined);
    return window.electronAPI.onPixelTriggerStatus(setStatus);
  }, []);

  if (status && !status.available) return null;

  const hotkeyOptions = HOTKEY_OPTIONS.filter(option => option.value.toLowerCase() !== clickerHotkey.toLowerCase());
  const rate = formatCaptureRate(status?.frameMs ?? null);

  return (
    <>
      <Row
        label="Activer le détecteur de rythme"
        description={
          <>
            Interrupteur général ; il s'ajoute ensuite jeu par jeu (overlay Maj+Tab, case « Ajouter le détecteur de
            rythme à ce jeu »), où se règlent aussi ses zones (ou sur la page du jeu). Rien n'est envoyé si le jeu n'est
            pas au premier plan.
            {status?.running && (
              <span className={`mt-1 block font-semibold ${status.paused ? 'text-amber-300' : 'text-play'}`}>
                {status.paused ? 'En pause (le jeu n’est pas au premier plan).' : `En marche${rate ? ` — ${rate}` : ''}.`}
              </span>
            )}
            {status?.error && <span className="mt-1 block text-danger">{status.error}</span>}
            {isDirty && <span className="mt-1 block text-text-secondary">Enregistre pour appliquer les changements.</span>}
          </>
        }
      >
        <input type="checkbox" className="toggle" aria-label="Activer le détecteur de rythme" checked={value.enabled} onChange={e => set({ enabled: e.target.checked })} />
      </Row>
      <Row
        label="Raccourci marche / arrêt"
        description="Différent de celui de l'auto-clicker. Alt+Espace (panique) arrête aussi le détecteur."
      >
        <Select value={value.hotkey} options={hotkeyOptions} onChange={hotkey => set({ hotkey })} aria-label="Raccourci du détecteur" className="w-[150px]" />
      </Row>
      <Row
        label="Limites"
        description={
          <>
            L'écran est lu une fois par rafraîchissement (60 fois par seconde sur un écran 60 Hz) : une note est vue
            jusqu'à ~17 ms après son affichage — le « délai » de chaque zone sert à recaler l'action sur la ligne de
            frappe. Ne voit pas les jeux en plein écran exclusif (fenêtré ou plein écran sans bordure seulement), et les
            entrées n'arrivent pas à un jeu lancé en administrateur si DLSGM ne l'est pas.
          </>
        }
      />
    </>
  );
}
