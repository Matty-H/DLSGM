import { useEffect, useState, type ReactNode } from 'react';
import { Crosshair, Plus, Trash2 } from 'lucide-react';
import Select from '../Select/Select';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import {
  KEY_OPTIONS,
  MAX_TRIGGERS,
  MAX_ZONE_SIZE,
  describeTrigger,
  formatCaptureRate,
  newPixelTrigger,
  resizeZone,
  zoneAround,
  type PixelTrigger,
  type PixelTriggerSettings,
  type PixelTriggerStatus
} from '../../lib/pixelTrigger.js';
import type { ClickerButton } from '../../lib/autoClicker.js';

export interface PixelTriggerSectionProps {
  triggers: PixelTrigger[] | undefined;
  onChange: (triggers: PixelTrigger[]) => void;
}

const CAPTURE_DELAY_S = 3;

const BUTTON_OPTIONS: { value: ClickerButton; label: string }[] = [
  { value: 'left', label: 'Gauche' },
  { value: 'right', label: 'Droit' },
  { value: 'middle', label: 'Milieu' }
];

function NumberField({ label, value, onChange, max, suffix }: { label: string; value: number; onChange: (v: number) => void; max: number; suffix?: string }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
      {label}
      <span className="flex items-center gap-1 normal-case tracking-normal">
        <input
          className="input w-[72px] tabular-nums"
          inputMode="numeric"
          value={String(value)}
          onChange={e => onChange(Math.min(max, Number(e.target.value.replace(/\D/g, '').slice(0, 5)) || 0))}
        />
        {suffix && <span className="text-[12px] font-normal">{suffix}</span>}
      </span>
    </label>
  );
}

/** Couleur #rrggbb : la saisie en cours est gardée, seule une couleur complète est enregistrée. */
function ColorField({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="input w-[90px] py-1 font-mono"
      aria-label="Couleur visée"
      value={draft}
      maxLength={7}
      onChange={e => {
        const v = e.target.value.trim().toLowerCase();
        if (!/^#?[0-9a-f]{0,6}$/.test(v)) return;
        const color = v.startsWith('#') ? v : `#${v}`;
        setDraft(color);
        if (color.length === 7) onChange(color);
      }}
      onBlur={() => setDraft(value)}
    />
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-[70px] flex-shrink-0 text-[12px] font-semibold text-text-muted">{label}</span>
      {children}
    </div>
  );
}

/**
 * Page du jeu › Détecteur de rythme : les zones surveillées pendant ce jeu
 * (src/main/pixel-trigger.ts). « Viser » laisse quelques secondes pour
 * placer la souris sur la piste dans le jeu, puis prend la zone autour du
 * curseur et la couleur dessous. Enregistré dans la fiche à chaque
 * modification ; appliqué tout de suite si le jeu tourne.
 */
export default function PixelTriggerSection({ triggers = [], onChange }: PixelTriggerSectionProps) {
  const [status, setStatus] = useState<PixelTriggerStatus | null>(null);
  const [settings, setSettings] = useState<PixelTriggerSettings | null>(null);
  // Visée en cours : `${id}:zone` ou `${id}:point`, et le compte à rebours.
  const [capturing, setCapturing] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI
      .getPixelTriggerState()
      .then(state => {
        setStatus(state.status);
        setSettings(state.settings);
      })
      .catch(() => undefined);
    return window.electronAPI.onPixelTriggerStatus(setStatus);
  }, []);

  if (status && !status.available) {
    return <p className="m-0 text-[13px] text-text-muted">Le détecteur de rythme n'est disponible que sous Windows.</p>;
  }

  const update = (id: string, patch: Partial<PixelTrigger>) => onChange(triggers.map(t => (t.id === id ? { ...t, ...patch } : t)));

  const withCountdown = async <T,>(key: string, action: () => Promise<T>): Promise<T | null> => {
    setError(null);
    setCapturing(key);
    setCountdown(CAPTURE_DELAY_S);
    const timer = setInterval(() => setCountdown(c => (c > 1 ? c - 1 : c)), 1000);
    try {
      return await action();
    } catch (err) {
      setError(ipcErrorMessage(err));
      return null;
    } finally {
      clearInterval(timer);
      setCapturing(null);
    }
  };

  const aimZone = async (trigger: PixelTrigger) => {
    const target = await withCountdown(`${trigger.id}:zone`, () => window.electronAPI.capturePixelTarget(CAPTURE_DELAY_S * 1000));
    if (target) update(trigger.id, { zone: zoneAround(target, trigger.zone), color: target.color });
  };

  const aimPoint = async (trigger: PixelTrigger) => {
    const point = await withCountdown(`${trigger.id}:point`, () => window.electronAPI.captureCursorPosition(CAPTURE_DELAY_S * 1000));
    if (point) update(trigger.id, { clickPoint: { x: Math.round(point.x), y: Math.round(point.y) } });
  };

  const rate = formatCaptureRate(status?.frameMs ?? null);

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <p className="m-0 leading-relaxed text-text-muted">
        Une zone par piste : pendant la partie, <span className="kbd">{settings?.hotkey ?? 'F7'}</span> démarre / arrête la
        surveillance, et chaque note qui passe dans une zone déclenche son action. « Viser » laisse {CAPTURE_DELAY_S} s pour
        placer la souris sur la piste dans le jeu (lancé en fenêtré ou plein écran sans bordure).
        {settings && !settings.enabled && (
          <span className="mt-1 block text-amber-300">Active d'abord le détecteur dans Paramètres › Outils en jeu.</span>
        )}
        {status?.running && (
          <span className={`mt-1 block font-semibold ${status.paused ? 'text-amber-300' : 'text-play'}`}>
            {status.paused ? 'En pause (le jeu n’est pas au premier plan).' : `En marche${rate ? ` — ${rate}` : ''}.`}
          </span>
        )}
      </p>

      {triggers.map(trigger => {
        const hits = status?.hits[trigger.id] ?? 0;
        const aimingZone = capturing === `${trigger.id}:zone`;
        const aimingPoint = capturing === `${trigger.id}:point`;
        return (
          <div key={trigger.id} className={`panel flex flex-col gap-2.5 p-3 ${trigger.enabled ? '' : 'opacity-60'}`}>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 flex-shrink-0 accent-accent"
                aria-label="Zone active"
                checked={trigger.enabled}
                onChange={e => update(trigger.id, { enabled: e.target.checked })}
              />
              <input className="input min-w-0 flex-1 py-1" aria-label="Nom de la zone" value={trigger.name} maxLength={40} onChange={e => update(trigger.id, { name: e.target.value })} />
              {status?.running && <span className="tag tabular-nums" title="Déclenchements depuis le démarrage">{hits}</span>}
              <button type="button" onClick={() => onChange(triggers.filter(t => t.id !== trigger.id))} aria-label="Supprimer la zone" className="btn btn-ghost btn-icon">
                <Trash2 size={15} strokeWidth={2.25} />
              </button>
            </div>
            <div className="text-[12px] text-text-secondary">{describeTrigger(trigger)}</div>

            <Line label="Zone">
              <button type="button" onClick={() => aimZone(trigger)} disabled={capturing !== null} className="btn py-1 text-[12px]">
                <Crosshair size={14} strokeWidth={2.25} />
                {aimingZone ? `Place la souris… ${countdown}` : trigger.zone ? `Viser à nouveau (${trigger.zone.x}, ${trigger.zone.y})` : 'Viser'}
              </button>
              {trigger.zone && (
                <>
                  <NumberField label="Largeur" value={trigger.zone.width} max={MAX_ZONE_SIZE} suffix="px" onChange={w => update(trigger.id, { zone: resizeZone(trigger.zone!, w, trigger.zone!.height) })} />
                  <NumberField label="Hauteur" value={trigger.zone.height} max={MAX_ZONE_SIZE} suffix="px" onChange={h => update(trigger.id, { zone: resizeZone(trigger.zone!, trigger.zone!.width, h) })} />
                </>
              )}
            </Line>

            <Line label="Quand">
              <div className="seg">
                <button type="button" aria-pressed={trigger.mode === 'motion'} onClick={() => update(trigger.id, { mode: 'motion' })} className="seg-opt">
                  Ça bouge
                </button>
                <button type="button" aria-pressed={trigger.mode === 'color'} onClick={() => update(trigger.id, { mode: 'color' })} className="seg-opt">
                  Couleur
                </button>
              </div>
              {trigger.mode === 'color' && (
                <>
                  <span className="h-6 w-6 flex-shrink-0 rounded-sm border border-divider" style={{ background: trigger.color }} title="Couleur visée" />
                  <ColorField value={trigger.color} onChange={color => update(trigger.id, { color })} />
                </>
              )}
            </Line>
            <Line label="Seuils">
              <NumberField label={trigger.mode === 'color' ? 'Écart couleur' : 'Écart min.'} value={trigger.tolerance} max={255} onChange={v => update(trigger.id, { tolerance: v })} />
              <NumberField label="Part de la zone" value={trigger.minPercent} max={100} suffix="%" onChange={v => update(trigger.id, { minPercent: Math.max(1, v) })} />
            </Line>

            <Line label="Action">
              <div className="seg">
                <button type="button" aria-pressed={trigger.action === 'click'} onClick={() => update(trigger.id, { action: 'click' })} className="seg-opt">
                  Clic
                </button>
                <button type="button" aria-pressed={trigger.action === 'key'} onClick={() => update(trigger.id, { action: 'key' })} className="seg-opt">
                  Touche
                </button>
              </div>
              {trigger.action === 'click' ? (
                <>
                  <Select value={trigger.button} options={BUTTON_OPTIONS} onChange={button => update(trigger.id, { button })} aria-label="Bouton" className="w-[110px]" />
                  <div className="seg">
                    <button type="button" aria-pressed={trigger.clickPoint === null} onClick={() => update(trigger.id, { clickPoint: null })} className="seg-opt">
                      Centre de la zone
                    </button>
                    <button type="button" aria-pressed={trigger.clickPoint !== null} onClick={() => aimPoint(trigger)} disabled={capturing !== null} className="seg-opt">
                      <Crosshair size={14} strokeWidth={2.25} />
                      {aimingPoint ? `Place la souris… ${countdown}` : trigger.clickPoint ? `(${trigger.clickPoint.x}, ${trigger.clickPoint.y})` : 'Point fixe'}
                    </button>
                  </div>
                </>
              ) : (
                <Select value={trigger.key} options={KEY_OPTIONS} onChange={key => update(trigger.id, { key })} aria-label="Touche" className="w-[120px]" />
              )}
            </Line>
            <Line label="Timing">
              <NumberField label="Délai" value={trigger.delayMs} max={2000} suffix="ms" onChange={v => update(trigger.id, { delayMs: v })} />
              <NumberField label="Pause min." value={trigger.cooldownMs} max={5000} suffix="ms" onChange={v => update(trigger.id, { cooldownMs: v })} />
              <label className="flex cursor-pointer items-center gap-1.5 text-[12px]" title="Garder le bouton / la touche enfoncé tant que la zone correspond (notes longues)">
                <input type="checkbox" className="h-4 w-4 accent-accent" checked={trigger.hold} onChange={e => update(trigger.id, { hold: e.target.checked })} />
                Maintenir
              </label>
            </Line>
          </div>
        );
      })}

      {error && <p className="m-0 text-danger">{error}</p>}
      {triggers.length < MAX_TRIGGERS && (
        <button type="button" onClick={() => onChange([...triggers, newPixelTrigger(triggers.length)])} className="btn self-start text-[13px]">
          <Plus size={15} strokeWidth={2.25} />
          Ajouter une zone
        </button>
      )}
    </div>
  );
}
