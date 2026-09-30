import { useEffect, useRef, useState } from 'react';
import type { PixelTriggerStatus, TriggerZonesView } from '../../../../shared/ipc-types';

// Contour tracé à l'extérieur de la zone : écart puis épaisseur, en pixels.
// Jamais sur les pixels de la zone, que le détecteur lit (src/main/trigger-zones.ts).
const GAP = 2;
const BORDER = 2;
const FLASH_MS = 180;

/**
 * Zones du détecteur de rythme par-dessus le jeu (route #trigger-zones,
 * fenêtre transparente qui laisse passer les clics) : contour blanc
 * pointillé à l'arrêt, plein en marche, orange en pause, et vert un instant
 * à chaque action (après le délai de la zone, quand le clic part).
 */
export default function TriggerZonesApp() {
  const [view, setView] = useState<TriggerZonesView | null>(null);
  const [status, setStatus] = useState<PixelTriggerStatus | null>(null);
  const [flashing, setFlashing] = useState<Record<string, number>>({});
  const previousHits = useRef<Record<string, number>>({});
  const viewRef = useRef<TriggerZonesView | null>(null);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    window.electronAPI.getPixelTriggerState().then(state => setStatus(state.status)).catch(() => undefined);
    const apply = (next: TriggerZonesView | null) => {
      viewRef.current = next;
      setView(next);
    };
    // Abonnement d'abord, puis l'état courant : aucune mise à jour ne se perd entre les deux.
    const offZones = window.electronAPI.onTriggerZones(apply);
    window.electronAPI.getTriggerZones().then(current => viewRef.current ?? apply(current)).catch(() => undefined);
    const offStatus = window.electronAPI.onPixelTriggerStatus(next => {
      setStatus(next);
      for (const [id, count] of Object.entries(next.hits)) {
        const before = previousHits.current[id] ?? 0;
        if (count > before) {
          const delayMs = viewRef.current?.zones.find(z => z.id === id)?.delayMs ?? 0;
          setTimeout(() => {
            setFlashing(prev => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
            setTimeout(() => setFlashing(prev => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 1) - 1) })), FLASH_MS);
          }, delayMs);
        }
      }
      previousHits.current = { ...next.hits };
    });
    return () => {
      offZones();
      offStatus();
    };
  }, []);

  if (!view) return null;
  const running = Boolean(status?.running);
  const paused = running && Boolean(status?.paused);

  return (
    <div className="pointer-events-none fixed inset-0">
      {view.zones.map(({ id, zone }) => {
        const flash = (flashing[id] ?? 0) > 0;
        const color = flash ? '#22c55e' : paused ? '#fbbf24' : running ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)';
        return (
          <div
            key={id}
            className="absolute rounded-[2px]"
            style={{
              left: zone.x - view.origin.x - GAP - BORDER,
              top: zone.y - view.origin.y - GAP - BORDER,
              width: zone.width + 2 * (GAP + BORDER),
              height: zone.height + 2 * (GAP + BORDER),
              border: `${BORDER}px ${running || flash ? 'solid' : 'dashed'} ${color}`,
              boxShadow: flash ? '0 0 10px 2px rgba(34,197,94,0.8)' : '0 0 0 1px rgba(0,0,0,0.6)'
            }}
          />
        );
      })}
    </div>
  );
}
