import { useState } from 'react';
import { Circle, Play, Repeat, Square, Trash2 } from 'lucide-react';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import { activeMacroOf, macroSummary, type GameMacros, type MacroRecorderSettings, type MacroRecorderStatus } from '../../lib/macros.js';

export interface OverlayMacrosProps {
  gameId: string;
  data: GameMacros | undefined;
  status: MacroRecorderStatus;
  settings: MacroRecorderSettings;
  onChanged: () => void;
}

/**
 * Macros d'un jeu dans l'overlay (à la souris : l'overlay ne prend jamais le
 * clavier) : choisir celle que le raccourci rejoue, boucle, suppression ;
 * boutons enregistrer / lire équivalents aux raccourcis.
 */
export default function OverlayMacros({ gameId, data, status, settings, onChanged }: OverlayMacrosProps) {
  const [error, setError] = useState<string | null>(null);
  const active = activeMacroOf(data);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-2 pl-6.5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run(() => window.electronAPI.toggleMacroRecording())}
          disabled={status.playing}
          className={`btn py-1 text-[12px] ${status.recording ? 'btn-primary' : ''}`}
          title={`Raccourci : ${settings.recordHotkey}`}
        >
          {status.recording ? <Square size={13} strokeWidth={2.5} /> : <Circle size={13} strokeWidth={2.5} className="text-danger" />}
          {status.recording ? `Arrêter (${status.stepCount} étapes)` : 'Enregistrer'}
        </button>
        <button
          type="button"
          onClick={() => run(() => window.electronAPI.toggleMacroPlayback())}
          disabled={status.recording || (!status.playing && !active)}
          className={`btn py-1 text-[12px] ${status.playing ? 'btn-primary' : ''}`}
          title={`Raccourci : ${settings.playHotkey}`}
        >
          {status.playing ? <Square size={13} strokeWidth={2.5} /> : <Play size={13} strokeWidth={2.5} />}
          {status.playing ? (status.paused ? 'En pause — arrêter' : 'Arrêter la lecture') : 'Lire'}
        </button>
      </div>
      {status.recording && (
        <p className="m-0 text-[12px] text-text-muted">
          Ferme l'overlay et joue : clics et touches faits dans le jeu sont enregistrés. <span className="kbd">{settings.recordHotkey}</span> pour finir.
        </p>
      )}

      {data && data.macros.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {[...data.macros].reverse().map(macro => (
            <li key={macro.id} className="flex items-center gap-2 text-[12px]">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name={`macro-${gameId}`}
                  className="accent-accent"
                  checked={active?.id === macro.id}
                  onChange={() => run(() => window.electronAPI.setActiveMacro(gameId, macro.id))}
                />
                <span className="min-w-0 truncate font-semibold">{macro.name}</span>
                <span className="flex-shrink-0 text-text-muted">{macroSummary(macro)}</span>
              </label>
              <button
                type="button"
                aria-pressed={macro.loop}
                onClick={() => run(() => window.electronAPI.updateMacro(gameId, macro.id, { loop: !macro.loop }))}
                className={`tag px-1.5 py-0.5 text-[11px] ${macro.loop ? 'tag-accent' : ''}`}
                title={macro.loop ? 'Rejouée en boucle jusqu’à l’arrêt' : 'Rejouée une fois'}
              >
                <Repeat size={11} strokeWidth={2.5} /> Boucle
              </button>
              <button
                type="button"
                onClick={() => run(() => window.electronAPI.deleteMacro(gameId, macro.id))}
                aria-label={`Supprimer ${macro.name}`}
                className="btn btn-ghost btn-icon h-6 w-6 p-0"
              >
                <Trash2 size={13} strokeWidth={2.25} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[12px] text-text-muted">
          Aucune macro pour ce jeu. <span className="kbd">{settings.recordHotkey}</span> (ou « Enregistrer ») en commence une.
        </p>
      )}
      {(error || status.error) && <p className="m-0 text-[12px] text-danger">{error ?? status.error}</p>}
    </div>
  );
}
