import { useState } from 'react';
import type { WeeklyPlayTime } from '../../lib/statsManager.js';
import { formatSessionDuration } from '../../lib/timeFormatter.js';

const CHART_HEIGHT = 160;

const shortDate = (date: Date) => date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

/**
 * Histogramme du temps de jeu par semaine (une seule série : pas de
 * légende, le titre de la carte la nomme). Survol / focus d'une barre :
 * valeur exacte dans une infobulle.
 */
export default function PlayTimeChart({ weeks }: { weeks: WeeklyPlayTime[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const maxSeconds = Math.max(...weeks.map(w => w.seconds));
  // Graduation haute arrondie à l'heure supérieure (au moins 1 h).
  const maxHours = Math.max(1, Math.ceil(maxSeconds / 3600));
  const scale = maxHours * 3600;

  return (
    <div>
      <div className="relative flex gap-3">
        <div className="flex flex-col justify-between text-right text-[11px] tabular-nums text-text-muted" style={{ height: CHART_HEIGHT }}>
          <span>{maxHours} h</span>
          <span>0</span>
        </div>
        <div className="relative flex-1 border-b border-divider" style={{ height: CHART_HEIGHT }}>
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-divider" />
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {weeks.map((week, i) => {
              const label = `Semaine du ${shortDate(week.weekStart)} : ${week.seconds > 0 ? formatSessionDuration(week.seconds) : 'aucune session'}`;
              return (
                <div
                  key={week.weekStart.toISOString()}
                  className="relative flex h-full flex-1 items-end justify-center"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  aria-label={label}
                  role="img"
                >
                  {week.seconds > 0 && (
                    <div
                      className={`w-full max-w-[28px] rounded-t-[4px] ${hovered === i ? 'bg-accent-hover' : 'bg-accent'}`}
                      style={{ height: `${Math.max(2, (week.seconds / scale) * 100)}%` }}
                    />
                  )}
                  {hovered === i && (
                    <div className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-sm bg-surface-3 px-2 py-1 text-[12px] shadow-lg">
                      <div className="text-text-muted">Semaine du {shortDate(week.weekStart)}</div>
                      <div className="font-semibold tabular-nums">{week.seconds > 0 ? formatSessionDuration(week.seconds) : 'Aucune session'}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="ml-[calc(2ch+12px)] mt-1.5 flex justify-between text-[11px] text-text-muted">
        <span>{shortDate(weeks[0].weekStart)}</span>
        <span>Cette semaine</span>
      </div>
    </div>
  );
}
