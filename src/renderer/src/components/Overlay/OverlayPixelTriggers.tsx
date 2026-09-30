import { useState } from 'react';
import { Crosshair, Minus, Plus, Trash2 } from 'lucide-react';
import Select from '../Select/Select';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import {
  KEY_OPTIONS,
  MAX_TRIGGERS,
  describeTrigger,
  formatCaptureRate,
  newPixelTrigger,
  resizeZone,
  zoneAround,
  type PixelTrigger,
  type PixelTriggerSettings,
  type PixelTriggerStatus
} from '../../lib/pixelTrigger.js';

export interface OverlayPixelTriggersProps {
  gameId: string;
  triggers: PixelTrigger[];
  status: PixelTriggerStatus;
  settings: PixelTriggerSettings;
  /** Zones enregistrées (main renvoie la version nettoyée). */
  onSaved: () => void;
  /** Depuis l'overlay : l'effacer le temps de viser. Pas depuis le témoin (il ne couvre pas le jeu). */
  hideOverlayWhileAiming?: boolean;
  className?: string;
}

const AIM_DELAY_S = 3;

/** −/+ : l'overlay ne reçoit pas le clavier (il ne prend jamais le focus au jeu). */
function Stepper({ label, value, suffix, onChange, step, min, max }: { label: string; value: number; suffix?: string; onChange: (v: number) => void; step: number; min: number; max: number }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex items-center gap-1">
      <span className="w-[74px] text-[11px] text-text-muted">{label}</span>
      <button type="button" onClick={() => onChange(clamp(value - step))} aria-label={`${label} −`} className="btn btn-icon h-6 w-6 p-0">
        <Minus size={12} strokeWidth={2.5} />
      </button>
      <span className="w-[58px] text-center text-[12px] font-semibold tabular-nums">
        {value}
        {suffix}
      </span>
      <button type="button" onClick={() => onChange(clamp(value + step))} aria-label={`${label} +`} className="btn btn-icon h-6 w-6 p-0">
        <Plus size={12} strokeWidth={2.5} />
      </button>
    </div>
  );
}

/**
 * Overlay (Maj+Tab) › zones du détecteur de rythme du jeu en cours (sous la
 * case qui l'ajoute au jeu), réglables à la souris par-dessus le jeu ; la
 * marche / l'arrêt passent par son raccourci, comme l'auto-clicker. « Viser » efface
 * l'overlay {AIM_DELAY_S} s, le temps de placer la souris sur la piste :
 * la couleur lue est alors celle du jeu, pas celle du voile de l'overlay.
 */
export default function OverlayPixelTriggers({ gameId, triggers, status, settings, onSaved, hideOverlayWhileAiming = true, className = 'ml-6' }: OverlayPixelTriggersProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [aiming, setAiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: PixelTrigger[]) => {
    setError(null);
    try {
      await window.electronAPI.setGamePixelTriggers(gameId, next);
      onSaved();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };
  const update = (id: string, patch: Partial<PixelTrigger>) => save(triggers.map(t => (t.id === id ? { ...t, ...patch } : t)));

  const aim = async (trigger: PixelTrigger, what: 'zone' | 'point') => {
    setError(null);
    setAiming(true);
    try {
      const target = await window.electronAPI.capturePixelTarget(AIM_DELAY_S * 1000, hideOverlayWhileAiming);
      await update(
        trigger.id,
        what === 'zone' ? { zone: zoneAround(target, trigger.zone), color: target.color } : { clickPoint: { x: target.x, y: target.y } }
      );
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setAiming(false);
    }
  };

  const add = async () => {
    const trigger = newPixelTrigger(triggers.length);
    await save([...triggers, trigger]);
    setOpen(trigger.id);
  };

  const rate = formatCaptureRate(status.frameMs);
  const armed = status.inGame;

  return (
    <div className={`${className} flex flex-col gap-2.5 text-[13px]`}>
        <>
          <p className="m-0 text-[12px] leading-relaxed text-text-muted">
            {status.running
              ? status.paused
                ? 'En pause (le jeu n’est pas au premier plan).'
                : `En marche${rate ? ` — ${rate}` : ''}. Ferme l'overlay pour jouer.`
              : triggers.length === 0
                ? `Ajoute une zone par piste, puis « Viser » : ${hideOverlayWhileAiming ? 'l’overlay s’efface 3 s, ' : 'tu as 3 s pour '}place${hideOverlayWhileAiming ? '' : 'r'} la souris sur la ligne de frappe de la piste.`
                : armed
                  ? `Prêt : ${settings.hotkey} démarre / arrête la surveillance (témoin en bas à gauche).`
                  : 'Aucune zone active visée.'}
          </p>

          {triggers.map(trigger => {
            const expanded = open === trigger.id;
            return (
              <div key={trigger.id} className={`rounded-md border border-divider p-2 ${trigger.enabled ? '' : 'opacity-60'}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 flex-shrink-0 accent-accent"
                    aria-label="Zone active"
                    checked={trigger.enabled}
                    onChange={e => update(trigger.id, { enabled: e.target.checked })}
                  />
                  {trigger.mode === 'color' && trigger.zone && (
                    <span className="h-3.5 w-3.5 flex-shrink-0 rounded-sm border border-divider" style={{ background: trigger.color }} />
                  )}
                  <button type="button" onClick={() => setOpen(expanded ? null : trigger.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate font-semibold">{trigger.name || 'Zone'}</span>
                    <span className="block truncate text-[11px] text-text-muted">{describeTrigger(trigger)}</span>
                  </button>
                  {status.running && <span className="tag tabular-nums">{status.hits[trigger.id] ?? 0}</span>}
                  <button type="button" onClick={() => aim(trigger, 'zone')} disabled={aiming} className="btn py-1 text-[12px]">
                    <Crosshair size={13} strokeWidth={2.25} />
                    {aiming ? 'Vise…' : 'Viser'}
                  </button>
                </div>

                {expanded && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="seg">
                        <button type="button" aria-pressed={trigger.mode === 'motion'} onClick={() => update(trigger.id, { mode: 'motion' })} className="seg-opt">
                          Ça bouge
                        </button>
                        <button type="button" aria-pressed={trigger.mode === 'color'} onClick={() => update(trigger.id, { mode: 'color' })} className="seg-opt">
                          Couleur
                        </button>
                      </div>
                      <div className="seg">
                        <button type="button" aria-pressed={trigger.action === 'click'} onClick={() => update(trigger.id, { action: 'click' })} className="seg-opt">
                          Clic
                        </button>
                        <button type="button" aria-pressed={trigger.action === 'key'} onClick={() => update(trigger.id, { action: 'key' })} className="seg-opt">
                          Touche
                        </button>
                      </div>
                    </div>
                    {trigger.action === 'key' ? (
                      <Select value={trigger.key} options={KEY_OPTIONS} onChange={key => update(trigger.id, { key })} aria-label="Touche" className="w-[140px]" />
                    ) : (
                      <div className="seg self-start">
                        <button type="button" aria-pressed={trigger.clickPoint === null} onClick={() => update(trigger.id, { clickPoint: null })} className="seg-opt">
                          Centre de la zone
                        </button>
                        <button type="button" aria-pressed={trigger.clickPoint !== null} onClick={() => aim(trigger, 'point')} disabled={aiming} className="seg-opt">
                          <Crosshair size={13} strokeWidth={2.25} />
                          {trigger.clickPoint ? `(${trigger.clickPoint.x}, ${trigger.clickPoint.y})` : 'Viser le point'}
                        </button>
                      </div>
                    )}
                    {trigger.zone && (
                      <Stepper
                        label="Taille"
                        value={trigger.zone.width}
                        suffix=" px"
                        step={2}
                        min={2}
                        max={200}
                        onChange={v => update(trigger.id, { zone: resizeZone(trigger.zone!, v, v) })}
                      />
                    )}
                    <Stepper label={trigger.mode === 'color' ? 'Écart couleur' : 'Écart min.'} value={trigger.tolerance} step={5} min={0} max={255} onChange={v => update(trigger.id, { tolerance: v })} />
                    <Stepper label="Part zone" value={trigger.minPercent} suffix=" %" step={5} min={1} max={100} onChange={v => update(trigger.id, { minPercent: v })} />
                    <Stepper label="Délai" value={trigger.delayMs} suffix=" ms" step={5} min={0} max={2000} onChange={v => update(trigger.id, { delayMs: v })} />
                    <Stepper label="Pause min." value={trigger.cooldownMs} suffix=" ms" step={10} min={10} max={5000} onChange={v => update(trigger.id, { cooldownMs: v })} />
                    <div className="flex items-center justify-between">
                      <label className="flex cursor-pointer items-center gap-1.5 text-[12px]">
                        <input type="checkbox" className="h-4 w-4 accent-accent" checked={trigger.hold} onChange={e => update(trigger.id, { hold: e.target.checked })} />
                        Maintenir (notes longues)
                      </label>
                      <button type="button" onClick={() => save(triggers.filter(t => t.id !== trigger.id))} className="btn btn-ghost py-1 text-[12px]">
                        <Trash2 size={13} strokeWidth={2.25} />
                        Supprimer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {triggers.length < MAX_TRIGGERS && (
            <button type="button" onClick={add} className="btn self-start py-1 text-[12px]">
              <Plus size={13} strokeWidth={2.25} />
              Ajouter une zone
            </button>
          )}
        </>
      {error && <p className="m-0 text-[12px] text-danger">{error}</p>}
    </div>
  );
}
