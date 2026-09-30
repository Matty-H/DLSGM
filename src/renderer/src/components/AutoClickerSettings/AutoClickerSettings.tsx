import { useEffect, useState, type ReactNode } from 'react';
import { Crosshair, MousePointer2 } from 'lucide-react';
import Select from '../Select/Select';
import AutoClickerHelp from '../AutoClickerHelp/AutoClickerHelp';
import { HOTKEY_OPTIONS, joinInterval, splitInterval, type AutoClickerSettings as ClickerSettings, type ClickerButton, type IntervalParts } from '../../lib/autoClicker.js';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import type { AutoClickerStatus } from '../../../../shared/ipc-types';

export interface AutoClickerSettingsProps {
  value: ClickerSettings;
  onChange: (value: ClickerSettings) => void;
  overlayEnabled: boolean;
  onOverlayEnabledChange: (value: boolean) => void;
  /** Modifications pas encore enregistrées (le raccourci utilise les réglages enregistrés). */
  isDirty: boolean;
}

const BUTTON_OPTIONS: { value: ClickerButton; label: string }[] = [
  { value: 'left', label: 'Gauche' },
  { value: 'right', label: 'Droit' },
  { value: 'middle', label: 'Milieu' }
];

const CAPTURE_DELAY_S = 3;

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

function NumberField({ label, value, onChange, width = 'w-[70px]' }: { label: string; value: number; onChange: (v: number) => void; width?: string }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
      {label}
      <input
        className={`input ${width} tabular-nums`}
        inputMode="numeric"
        value={String(value)}
        onChange={e => onChange(Number(e.target.value.replace(/\D/g, '').slice(0, 7)) || 0)}
      />
    </label>
  );
}

/**
 * Paramètres › Auto-clicker : réglages façon OP Auto Clicker (intervalle,
 * bouton, simple / double, répétitions, position) et overlay en jeu.
 */
export default function AutoClickerSettings({ value, onChange, overlayEnabled, onOverlayEnabledChange, isDirty }: AutoClickerSettingsProps) {
  const [status, setStatus] = useState<AutoClickerStatus | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  // Champs de l'intervalle gardés tels que saisis (joinInterval impose le minimum à l'enregistrement).
  const [parts, setParts] = useState<IntervalParts>(() => splitInterval(value.intervalMs));
  const set = (patch: Partial<ClickerSettings>) => onChange({ ...value, ...patch });

  useEffect(() => {
    window.electronAPI.getAutoClickerStatus().then(setStatus).catch(() => undefined);
    return window.electronAPI.onAutoClickerStatus(setStatus);
  }, []);

  useEffect(() => {
    if (joinInterval(parts) !== value.intervalMs) setParts(splitInterval(value.intervalMs));
    // Seulement quand la valeur change de l'extérieur (rechargement des paramètres).
  }, [value.intervalMs]);

  const setPart = (key: keyof IntervalParts, v: number) => {
    const next = { ...parts, [key]: v };
    setParts(next);
    set({ intervalMs: joinInterval(next) });
  };

  const capture = async () => {
    setCaptureError(null);
    setCountdown(CAPTURE_DELAY_S);
    const timer = setInterval(() => setCountdown(c => (c && c > 1 ? c - 1 : c)), 1000);
    try {
      const point = await window.electronAPI.captureCursorPosition(CAPTURE_DELAY_S * 1000);
      set({ position: point });
    } catch (error) {
      setCaptureError(ipcErrorMessage(error));
    } finally {
      clearInterval(timer);
      setCountdown(null);
    }
  };

  if (status && !status.available) {
    return <p className="py-4 text-[13px] text-text-muted">L'auto-clicker n'est disponible que sous Windows.</p>;
  }

  return (
    <>
      <Row
        label="Activer l'auto-clicker"
        description={
          <>
            Interrupteur général. L'auto-clicker s'ajoute ensuite jeu par jeu, depuis l'overlay en jeu (Maj+Tab, case
            « Ajouter l'auto-clicker à ce jeu ») : le raccourci et le témoin en bas à gauche n'existent que pendant ces
            parties, et les clics ne partent que vers le jeu (en pause si une autre fenêtre est au premier plan).
            {status?.running && (
              <span className={`mt-1 block font-semibold ${status.paused ? 'text-amber-300' : 'text-play'}`}>
                {status.paused ? 'En pause (le jeu n’est pas au premier plan).' : 'En marche.'}
              </span>
            )}
            {status?.error && <span className="mt-1 block text-danger">{status.error}</span>}
            {(status?.lastStartLatencyMs != null || status?.lastStopLatencyMs != null) && (
              <span className="mt-1 block text-text-secondary">
                Délais mesurés — dernier démarrage : {status.lastStartLatencyMs ?? '—'} ms (appui → premier clic), dernier
                arrêt : {status.lastStopLatencyMs ?? '—'} ms. Détail dans auto-clicker.log (dossier des données de DLSGM).
              </span>
            )}
            {isDirty && <span className="mt-1 block text-text-secondary">Enregistre pour appliquer les changements.</span>}
          </>
        }
      >
        <input type="checkbox" className="toggle" aria-label="Activer l'auto-clicker" checked={value.enabled} onChange={e => set({ enabled: e.target.checked })} />
      </Row>

      <Row label="Raccourci marche / arrêt">
        <Select value={value.hotkey} options={HOTKEY_OPTIONS} onChange={hotkey => set({ hotkey })} aria-label="Raccourci" className="w-[150px]" />
      </Row>

      <Row label="Intervalle entre les clics" description="10 ms minimum.">
        <NumberField label="h" value={parts.hours} onChange={v => setPart('hours', v)} />
        <NumberField label="min" value={parts.minutes} onChange={v => setPart('minutes', v)} />
        <NumberField label="s" value={parts.seconds} onChange={v => setPart('seconds', v)} />
        <NumberField label="ms" value={parts.ms} onChange={v => setPart('ms', v)} width="w-[80px]" />
      </Row>

      <Row label="Clic">
        <Select value={value.button} options={BUTTON_OPTIONS} onChange={button => set({ button })} aria-label="Bouton de la souris" className="w-[120px]" />
        <div className="seg">
          <button type="button" aria-pressed={!value.double} onClick={() => set({ double: false })} className="seg-opt">
            Simple
          </button>
          <button type="button" aria-pressed={value.double} onClick={() => set({ double: true })} className="seg-opt">
            Double
          </button>
        </div>
      </Row>

      <Row label="Répétitions" description="Nombre de clics avant arrêt automatique.">
        <div className="seg">
          <button type="button" aria-pressed={value.repeat === 0} onClick={() => set({ repeat: 0 })} className="seg-opt">
            Jusqu'à l'arrêt
          </button>
          <button type="button" aria-pressed={value.repeat > 0} onClick={() => set({ repeat: value.repeat || 10 })} className="seg-opt">
            Nombre fixe
          </button>
        </div>
        {value.repeat > 0 && (
          <input
            className="input w-[90px] tabular-nums"
            inputMode="numeric"
            aria-label="Nombre de clics"
            value={String(value.repeat)}
            onChange={e => set({ repeat: Math.max(1, Number(e.target.value.replace(/\D/g, '').slice(0, 7)) || 1) })}
          />
        )}
      </Row>

      <Row
        label="Position"
        description={
          <>
            Au curseur : là où est la souris à chaque clic. Point fixe : la souris y est ramenée avant chaque clic —
            « Prendre la position » laisse {CAPTURE_DELAY_S} s pour placer la souris.
            {captureError && <span className="mt-1 block text-danger">{captureError}</span>}
          </>
        }
      >
        <div className="seg">
          <button type="button" aria-pressed={value.position === null} onClick={() => set({ position: null })} className="seg-opt">
            <MousePointer2 size={14} strokeWidth={2.25} />
            Au curseur
          </button>
          <button type="button" aria-pressed={value.position !== null} onClick={capture} disabled={countdown !== null} className="seg-opt">
            <Crosshair size={14} strokeWidth={2.25} />
            {countdown !== null ? `Place la souris… ${countdown}` : value.position ? `(${value.position.x}, ${value.position.y})` : 'Prendre la position'}
          </button>
        </div>
      </Row>

      <Row
        label="Overlay en jeu (Maj+Tab)"
        description="Pendant qu'un jeu lancé depuis DLSGM tourne, Maj+Tab affiche par-dessus : temps de session, temps de jeu total, auto-clicker. Fonctionne avec les jeux en fenêtre ou en plein écran sans bordure, pas en plein écran exclusif. Le raccourci n'existe que pendant la partie (Maj+Tab n'arrive alors plus au jeu)."
      >
        <input type="checkbox" className="toggle" aria-label="Overlay en jeu" checked={overlayEnabled} onChange={e => onOverlayEnabledChange(e.target.checked)} />
      </Row>

      <div className="py-4">
        <div className="section-title mb-2">Mode d'emploi</div>
        <AutoClickerHelp hotkey={value.hotkey} />
      </div>
    </>
  );
}
