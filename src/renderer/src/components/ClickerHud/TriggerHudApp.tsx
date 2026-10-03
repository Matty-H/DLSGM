import { useCallback, useEffect, useState } from 'react';
import { ScanEye, X } from 'lucide-react';
import OverlayPixelTriggers from '../Overlay/OverlayPixelTriggers';
import { HOTKEY_OPTIONS } from '../../lib/autoClicker.js';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import { formatCaptureRate } from '../../lib/pixelTrigger.js';
import type { OverlayState, PixelTriggerStatus } from '../../../../shared/ipc-types';
import { t } from '../../lib/i18n.js';

/**
 * Témoin du détecteur de rythme (route #trigger-hud, même fenêtre que celui
 * de l'auto-clicker, décalée à sa droite) : pastille verte en marche,
 * orange en pause, rouge à l'arrêt ; nombre de zones, notes jouées,
 * captures par seconde, et son raccourci. Affiché comme celui de
 * l'auto-clicker : détecteur activé et ajouté au jeu en cours (case de
 * l'overlay). À l'arrêt, un clic le déplie : zones du jeu (visée, mode,
 * action, seuils) et raccourci, à la souris seulement — la fenêtre ne prend
 * jamais le focus (le jeu se réduirait).
 */
export default function TriggerHudApp() {
  const [state, setState] = useState<OverlayState | null>(null);
  const [status, setStatus] = useState<PixelTriggerStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    window.electronAPI
      .getOverlayState()
      .then(next => {
        setState(next);
        setStatus(next.trigger);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    refresh();
    const offStatus = window.electronAPI.onPixelTriggerStatus(setStatus);
    const offState = window.electronAPI.onOverlayStateChanged(refresh);
    const offExpanded = window.electronAPI.onClickerHudExpanded(setExpanded);
    return () => {
      offStatus();
      offState();
      offExpanded();
    };
  }, [refresh]);

  if (!state || !status) return null;
  const settings = state.triggerSettings;

  const running = status.running;
  const paused = running && status.paused;
  const hits = Object.values(status.hits).reduce((sum, n) => sum + n, 0);
  const rate = formatCaptureRate(status.frameMs);
  const noZone = status.zoneCount === 0;
  const games = state.games.filter(game => game.pixelTriggerEnabled);

  const open = () => {
    if (running) return;
    setError(null);
    window.electronAPI.setTriggerHudExpanded(true);
  };
  const close = () => window.electronAPI.setTriggerHudExpanded(false);

  const saveHotkey = async (hotkey: string) => {
    setError(null);
    try {
      await window.electronAPI.saveTriggerQuickSettings({ hotkey });
      refresh();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const dot = (
    <span
      className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
        paused ? 'bg-amber-400' : running ? 'bg-play shadow-[0_0_8px_var(--color-play)]' : noZone ? 'bg-text-muted' : 'bg-danger'
      }`}
      aria-label={paused ? t('En pause') : running ? t('En marche') : t('À l’arrêt')}
    />
  );

  if (expanded) {
    const hotkeyOptions = HOTKEY_OPTIONS.filter(option => option.value.toLowerCase() !== state.clickerSettings.hotkey.toLowerCase());
    return (
      <div className="flex h-screen w-screen items-end font-body text-text">
        <div className="panel flex max-h-full w-full flex-col gap-3 overflow-y-auto p-3 shadow-lg">
          <div className="flex items-center gap-2 text-[13px] font-bold">
            {dot}
            <ScanEye size={15} strokeWidth={2.25} />
            <span className="flex-1">{t('Détecteur de rythme')}</span>
            <button type="button" onClick={close} aria-label={t('Replier')} className="btn btn-ghost btn-icon h-7 w-7 p-0">
              <X size={15} strokeWidth={2.5} />
            </button>
          </div>

          {games.map(game => (
            <div key={game.id} className="flex flex-col gap-1.5">
              {games.length > 1 && <div className="section-title text-[10px]">{game.name}</div>}
              <OverlayPixelTriggers
                gameId={game.id}
                triggers={state.gameTriggers[game.id] ?? []}
                status={status}
                settings={settings}
                onSaved={refresh}
                hideOverlayWhileAiming={false}
                className=""
              />
            </div>
          ))}

          <div>
            <div className="section-title mb-1 text-[10px]">{t('Raccourci marche / arrêt')}</div>
            <div className="flex flex-wrap gap-1">
              {hotkeyOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={settings.hotkey === option.value}
                  onClick={() => saveHotkey(option.value)}
                  className={`tag px-2 py-0.5 text-[11px] ${settings.hotkey === option.value ? 'tag-accent' : ''}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {error && <div className="text-[11px] text-danger">{error}</div>}
          <div className="text-[11px] text-text-muted">{t('Les changements sont enregistrés tout de suite.')}</div>
        </div>
      </div>
    );
  }

  const label = paused
    ? t('En pause')
    : running
      ? `${hits > 1 ? t('{n} notes', { n: hits }) : t('{n} note', { n: hits })}${rate ? ` · ${rate}` : ''}`
      : noZone
        ? t('Aucune zone — clic pour régler')
        : status.zoneCount > 1 ? t('{n} zones', { n: status.zoneCount }) : t('{n} zone', { n: status.zoneCount });
  const title = paused
    ? t('En pause : le jeu n’est pas au premier plan')
    : running
      ? t('Détecteur de rythme en marche — {hotkey} pour arrêter', { hotkey: settings.hotkey })
      : t("Détecteur de rythme à l'arrêt — {hotkey} pour démarrer, clic pour régler les zones", { hotkey: settings.hotkey });

  return (
    <div className="flex h-screen w-screen items-end font-body text-text">
      <button
        type="button"
        onClick={open}
        title={title}
        className={`flex w-full items-center gap-2 rounded-full border border-divider bg-bg-deep/90 px-3 py-2 text-[12px] font-semibold opacity-45 transition-opacity hover:opacity-100 ${
          running ? 'cursor-default' : 'cursor-pointer'
        }`}
      >
        {dot}
        <ScanEye size={14} strokeWidth={2.25} className="flex-shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left tabular-nums">{label}</span>
        <span className="kbd">{settings.hotkey}</span>
      </button>
    </div>
  );
}
