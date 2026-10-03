import { useCallback, useEffect, useState } from 'react';
import { Clapperboard } from 'lucide-react';
import { activeMacroOf, macroSummary } from '../../lib/macros.js';
import type { MacroRecorderStatus, OverlayState } from '../../../../shared/ipc-types';
import { t } from '../../lib/i18n.js';

/**
 * Témoin de l'enregistreur de macros (route #macro-hud), à droite de celui
 * du détecteur : rouge clignotant en enregistrement, vert en lecture, orange
 * en pause, gris à l'arrêt ; macro qui sera rejouée et raccourcis. Affiché
 * seulement avec l'enregistreur activé et ajouté au jeu en cours. Pas de
 * réglages ici : les macros se gèrent dans l'overlay (Maj+Tab).
 */
export default function MacroHudApp() {
  const [state, setState] = useState<OverlayState | null>(null);
  const [status, setStatus] = useState<MacroRecorderStatus | null>(null);

  const refresh = useCallback(() => {
    window.electronAPI
      .getOverlayState()
      .then(next => {
        setState(next);
        setStatus(next.macro);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    refresh();
    const offStatus = window.electronAPI.onMacroStatus(next => {
      setStatus(next);
      // Fin d'un enregistrement : la nouvelle macro arrive par l'état complet.
      if (!next.recording) refresh();
    });
    const offState = window.electronAPI.onOverlayStateChanged(refresh);
    return () => {
      offStatus();
      offState();
    };
  }, [refresh]);

  if (!state || !status) return null;
  const settings = state.macroSettings;
  const gameId = state.games.filter(g => g.macroEnabled).map(g => g.id).pop();
  const macro = activeMacroOf(gameId ? state.gameMacros[gameId] : undefined);

  const dot = status.recording
    ? 'bg-danger animate-pulse'
    : status.paused
      ? 'bg-amber-400'
      : status.playing
        ? 'bg-play shadow-[0_0_8px_var(--color-play)]'
        : 'bg-text-muted';
  const label = status.recording
    ? `REC · ${status.stepCount > 1 ? t('{n} étapes', { n: status.stepCount }) : t('{n} étape', { n: status.stepCount })}`
    : status.paused
      ? t('En pause')
      : status.playing
        ? `${macro?.name ?? t('Macro')}${status.loops > 0 ? ' · ' + t('tour {n}', { n: status.loops + 1 }) : ''}`
        : macro
          ? `${macro.name} · ${macroSummary(macro)}`
          : t('Aucune macro');
  const title = status.recording
    ? t('Enregistrement — {hotkey} pour finir', { hotkey: settings.recordHotkey })
    : status.playing
      ? t('Lecture — {hotkey} pour arrêter', { hotkey: settings.playHotkey })
      : t('{record} enregistre, {play} rejoue la macro choisie (overlay Maj+Tab)', { record: settings.recordHotkey, play: settings.playHotkey });

  return (
    <div className="flex h-screen w-screen items-end font-body text-text">
      <div
        title={title}
        className="flex w-full cursor-default items-center gap-2 rounded-full border border-divider bg-bg-deep/90 px-3 py-2 text-[12px] font-semibold opacity-45 transition-opacity hover:opacity-100"
      >
        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${dot}`} />
        <Clapperboard size={14} strokeWidth={2.25} className="flex-shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left tabular-nums">{label}</span>
        <span className="kbd">{status.recording ? settings.recordHotkey : settings.playHotkey}</span>
      </div>
    </div>
  );
}
