import { useEffect, useState, type ReactNode } from 'react';
import { Crosshair, MousePointer2 } from 'lucide-react';
import Select from '../Select/Select';
import AutoClickerHelp from '../AutoClickerHelp/AutoClickerHelp';
import { HOTKEY_OPTIONS, joinInterval, splitInterval, type AutoClickerSettings as ClickerSettings, type ClickerButton, type IntervalParts } from '../../lib/autoClicker.js';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import type { AutoClickerStatus } from '../../../../shared/ipc-types';
import { t } from '../../lib/i18n.js';

export interface AutoClickerSettingsProps {
  value: ClickerSettings;
  onChange: (value: ClickerSettings) => void;
  /** Modifications pas encore enregistrées (le raccourci utilise les réglages enregistrés). */
  isDirty: boolean;
}

const buttonOptions = (): { value: ClickerButton; label: string }[] => [
  { value: 'left', label: t('Gauche') },
  { value: 'right', label: t('Droit') },
  { value: 'middle', label: t('Milieu') }
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
 * Paramètres › Outils en jeu › Auto-clicker : réglages façon OP Auto Clicker
 * (intervalle, bouton, simple / double, répétitions, position).
 */
export default function AutoClickerSettings({ value, onChange, isDirty }: AutoClickerSettingsProps) {
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
    return <p className="py-4 text-[13px] text-text-muted">{t("L'auto-clicker n'est disponible que sous Windows.")}</p>;
  }

  return (
    <>
      <Row
        label={t("Activer l'auto-clicker")}
        description={
          <>
            {t("Interrupteur général ; il s'ajoute ensuite jeu par jeu (overlay Maj+Tab, case « Ajouter l'auto-clicker à ce jeu »). Les clics ne partent que vers le jeu (en pause si une autre fenêtre est au premier plan).")}
            {status?.running && (
              <span className={`mt-1 block font-semibold ${status.paused ? 'text-amber-300' : 'text-play'}`}>
                {status.paused ? t('En pause (le jeu n’est pas au premier plan).') : t('En marche.')}
              </span>
            )}
            {status?.error && <span className="mt-1 block text-danger">{status.error}</span>}
            {(status?.lastStartLatencyMs != null || status?.lastStopLatencyMs != null) && (
              <span className="mt-1 block text-text-secondary">
                {t('Délais mesurés — dernier démarrage : {start} ms (appui → premier clic), dernier arrêt : {stop} ms. Détail dans auto-clicker.log (dossier des données de DLSGM).', { start: status.lastStartLatencyMs ?? '—', stop: status.lastStopLatencyMs ?? '—' })}
              </span>
            )}
            {isDirty && <span className="mt-1 block text-text-secondary">{t('Enregistre pour appliquer les changements.')}</span>}
          </>
        }
      >
        <input type="checkbox" className="toggle" aria-label={t("Activer l'auto-clicker")} checked={value.enabled} onChange={e => set({ enabled: e.target.checked })} />
      </Row>

      <Row label={t('Raccourci marche / arrêt')}>
        <Select value={value.hotkey} options={HOTKEY_OPTIONS} onChange={hotkey => set({ hotkey })} aria-label={t('Raccourci')} className="w-[150px]" />
      </Row>

      <Row label={t('Intervalle entre les clics')} description={t('10 ms minimum.')}>
        <NumberField label={t('h')} value={parts.hours} onChange={v => setPart('hours', v)} />
        <NumberField label={t('min')} value={parts.minutes} onChange={v => setPart('minutes', v)} />
        <NumberField label="s" value={parts.seconds} onChange={v => setPart('seconds', v)} />
        <NumberField label="ms" value={parts.ms} onChange={v => setPart('ms', v)} width="w-[80px]" />
      </Row>

      <Row label={t('Clic')}>
        <Select value={value.button} options={buttonOptions()} onChange={button => set({ button })} aria-label={t('Bouton de la souris')} className="w-[120px]" />
        <div className="seg">
          <button type="button" aria-pressed={!value.double} onClick={() => set({ double: false })} className="seg-opt">
            {t('Simple')}
          </button>
          <button type="button" aria-pressed={value.double} onClick={() => set({ double: true })} className="seg-opt">
            {t('Double')}
          </button>
        </div>
      </Row>

      <Row label={t('Répétitions')} description={t('Nombre de clics avant arrêt automatique.')}>
        <div className="seg">
          <button type="button" aria-pressed={value.repeat === 0} onClick={() => set({ repeat: 0 })} className="seg-opt">
            {t("Jusqu'à l'arrêt")}
          </button>
          <button type="button" aria-pressed={value.repeat > 0} onClick={() => set({ repeat: value.repeat || 10 })} className="seg-opt">
            {t('Nombre fixe')}
          </button>
        </div>
        {value.repeat > 0 && (
          <input
            className="input w-[90px] tabular-nums"
            inputMode="numeric"
            aria-label={t('Nombre de clics')}
            value={String(value.repeat)}
            onChange={e => set({ repeat: Math.max(1, Number(e.target.value.replace(/\D/g, '').slice(0, 7)) || 1) })}
          />
        )}
      </Row>

      <Row
        label={t('Position')}
        description={
          <>
            {t('Au curseur : là où est la souris à chaque clic. Point fixe : la souris y est ramenée avant chaque clic — « Prendre la position » laisse {s} s pour placer la souris.', { s: CAPTURE_DELAY_S })}
            {captureError && <span className="mt-1 block text-danger">{captureError}</span>}
          </>
        }
      >
        <div className="seg">
          <button type="button" aria-pressed={value.position === null} onClick={() => set({ position: null })} className="seg-opt">
            <MousePointer2 size={14} strokeWidth={2.25} />
            {t('Au curseur')}
          </button>
          <button type="button" aria-pressed={value.position !== null} onClick={capture} disabled={countdown !== null} className="seg-opt">
            <Crosshair size={14} strokeWidth={2.25} />
            {countdown !== null ? t('Place la souris… {n}', { n: countdown }) : value.position ? `(${value.position.x}, ${value.position.y})` : t('Prendre la position')}
          </button>
        </div>
      </Row>

      <div className="py-4">
        <div className="section-title mb-2">{t("Mode d'emploi")}</div>
        <AutoClickerHelp hotkey={value.hotkey} />
      </div>
    </>
  );
}
