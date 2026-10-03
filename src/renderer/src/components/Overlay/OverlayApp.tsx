import { useCallback, useEffect, useState } from 'react';
import { Camera, Clapperboard, Clock, Languages, MousePointerClick, ScanEye, X } from 'lucide-react';
import { formatClock } from '../../lib/autoClicker.js';
import { formatLastPlayed, formatPlayTime } from '../../lib/timeFormatter.js';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import OverlayPixelTriggers from './OverlayPixelTriggers';
import OverlayMacros from './OverlayMacros';
import OverlayTextractor from './OverlayTextractor';
import CaptureGallery from '../CaptureGallery/CaptureGallery';
import type { OverlayState } from '../../../../shared/ipc-types';
import { t, uiLocale } from '../../lib/i18n.js';
import Logo from '../Logo/Logo';
import Trans from '../Trans/Trans';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="section-title text-[11px]">{label}</span>
      <span className="text-[18px] font-bold tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Overlay en jeu (Maj+Tab), façon overlay Steam : fenêtre transparente
 * toujours au premier plan (src/main/overlay.ts) qui charge ce renderer à la
 * route #overlay. Session en cours, temps de jeu, les zones du détecteur de
 * pixels (OverlayPixelTriggers) et la case qui ajoute l'auto-clicker à ce jeu (son état et ses réglages rapides sont dans le
 * témoin en bas à gauche, src/main/clicker-hud.ts). Elle ne prend pas le
 * focus (le jeu reste au premier plan) : seuls Maj+Tab et Échap (raccourci
 * global le temps de l'affichage) la ferment, pas un clic ailleurs.
 */
export default function OverlayApp() {
  const [state, setState] = useState<OverlayState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    window.electronAPI.getOverlayState().then(setState).catch(err => setError(ipcErrorMessage(err)));
  }, []);

  useEffect(() => {
    // La fenêtre est transparente : la page aussi.
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    refresh();
    const offState = window.electronAPI.onOverlayStateChanged(refresh);
    const offShown = window.electronAPI.onOverlayShown(() => {
      setError(null);
      refresh();
    });
    const offTrigger = window.electronAPI.onPixelTriggerStatus(trigger => setState(prev => (prev ? { ...prev, trigger } : prev)));
    const offTextractor = window.electronAPI.onTextractorChanged((gameId, view) =>
      setState(prev => (prev ? { ...prev, textractor: { ...prev.textractor, [gameId]: view } } : prev))
    );
    const offMacro = window.electronAPI.onMacroStatus(macro => {
      setState(prev => (prev ? { ...prev, macro } : prev));
      // Fin d'un enregistrement : la nouvelle macro arrive par l'état complet.
      if (!macro.recording) refresh();
    });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      offState();
      offTrigger();
      offMacro();
      offTextractor();
      offShown();
      clearInterval(timer);
    };
  }, [refresh]);

  const close = () => window.electronAPI.hideOverlay();

  const setGameClicker = async (gameId: string, enabled: boolean) => {
    setError(null);
    try {
      await window.electronAPI.setGameAutoClicker(gameId, enabled);
      refresh();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const setGameTrigger = async (gameId: string, enabled: boolean) => {
    setError(null);
    try {
      await window.electronAPI.setGamePixelTrigger(gameId, enabled);
      refresh();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const setGameMacro = async (gameId: string, enabled: boolean) => {
    setError(null);
    try {
      await window.electronAPI.setGameMacroEnabled(gameId, enabled);
      refresh();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const clickerSettings = state?.clickerSettings;
  const clickerAvailable = state?.clicker.available ?? false;

  return (
    <div className="flex h-screen w-screen items-center justify-end bg-black/55 p-3 font-body text-text sm:p-8">
      <div className="flex max-h-full w-[440px] max-w-full flex-col gap-4 overflow-y-auto">
        <div className="flex items-center gap-3">
          <span className="flex-1"><Logo variant="horizontal" height={20} /></span>
          <span className="text-[12px] text-text-muted">
            <Trans text={t('{shift} + {tab} ou {esc} pour fermer')} values={{ shift: <span className="kbd">{t('Maj')}</span>, tab: <span className="kbd">Tab</span>, esc: <span className="kbd">{t('Échap')}</span> }} />
          </span>
          <button type="button" onClick={close} aria-label={t("Fermer l'overlay")} className="btn btn-ghost btn-icon">
            <X size={17} strokeWidth={2.5} />
          </button>
        </div>

        {state?.games.map(game => {
          const sessionSeconds = (now - new Date(game.startedAt).getTime()) / 1000;
          return (
            <section key={game.id} className="panel flex flex-col gap-4 p-5">
              <div className="flex items-center gap-4">
                <img src={`atom://img/${game.id}/work_image.jpg`} alt="" className="h-16 w-24 flex-shrink-0 rounded-sm object-cover" />
                <div className="min-w-0">
                  <div className="truncate text-[17px] font-bold">{game.name}</div>
                  <div className="text-[12px] text-text-muted">
                    {game.id} · {t('lancé à {time}', { time: new Date(game.startedAt).toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' }) })}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Stat label={t('Session')} value={formatClock(sessionSeconds)} />
                <Stat label={t('Temps total')} value={formatPlayTime(game.previousPlayTime + sessionSeconds) || t('< 1 min')} />
                <Stat label={t('Sessions')} value={String(game.sessionCount + 1)} />
              </div>
              {game.lastPlayed && (
                <div className="flex items-center gap-1.5 text-[12px] text-text-muted">
                  <Clock size={13} strokeWidth={2.25} />
                  {t('Session précédente : {when}', { when: formatLastPlayed(game.lastPlayed) })}
                </div>
              )}

              {clickerAvailable && clickerSettings && (
                <div className="border-t border-divider pt-3">
                  <label
                    className={`flex items-start gap-2.5 text-[13px] ${clickerSettings.enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 flex-shrink-0 accent-accent"
                      checked={game.autoClickerEnabled}
                      disabled={!clickerSettings.enabled}
                      onChange={e => setGameClicker(game.id, e.target.checked)}
                    />
                    <span>
                      <span className="flex items-center gap-1.5 font-semibold">
                        <MousePointerClick size={14} strokeWidth={2.25} />
                        {t("Ajouter l'auto-clicker à ce jeu")}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-text-muted">
                        {clickerSettings.enabled ? (
                          <>
                            <Trans text={t("Un témoin s'affichera en bas à gauche de la fenêtre du jeu : {hotkey} démarre / arrête les clics, un clic sur le témoin (à l'arrêt) règle l'intervalle et le raccourci.")} values={{ hotkey: <span className="kbd">{clickerSettings.hotkey}</span> }} />
                          </>
                        ) : (
                          t("Active d'abord l'auto-clicker dans Paramètres › Outils en jeu.")
                        )}
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {state.trigger.available && (
                <div className="flex flex-col gap-2.5 border-t border-divider pt-3">
                  <label
                    className={`flex items-start gap-2.5 text-[13px] ${state.triggerSettings.enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 flex-shrink-0 accent-accent"
                      checked={game.pixelTriggerEnabled}
                      disabled={!state.triggerSettings.enabled}
                      onChange={e => setGameTrigger(game.id, e.target.checked)}
                    />
                    <span>
                      <span className="flex items-center gap-1.5 font-semibold">
                        <ScanEye size={14} strokeWidth={2.25} />
                        {t('Ajouter le détecteur de rythme à ce jeu')}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-text-muted">
                        {state.triggerSettings.enabled ? (
                          <>
                            <Trans text={t("Clique quand une note passe dans une zone. Un témoin s'affichera en bas à gauche et les zones seront encadrées sur le jeu (vert à chaque clic) : {hotkey} démarre / arrête.")} values={{ hotkey: <span className="kbd">{state.triggerSettings.hotkey}</span> }} />
                          </>
                        ) : (
                          t("Active d'abord le détecteur de rythme dans Paramètres › Outils en jeu.")
                        )}
                      </span>
                    </span>
                  </label>
                  {game.pixelTriggerEnabled && state.triggerSettings.enabled && (
                    <OverlayPixelTriggers
                      gameId={game.id}
                      triggers={state.gameTriggers[game.id] ?? []}
                      status={state.trigger}
                      settings={state.triggerSettings}
                      onSaved={refresh}
                    />
                  )}
                </div>
              )}

              {state.screenshot.enabled && (
                <div className="flex flex-col gap-2 border-t border-divider pt-3">
                  <div className="flex items-center gap-2 text-[13px] font-semibold">
                    <Camera size={14} strokeWidth={2.25} />
                    <span className="flex-1">{t('Captures')}</span>
                    <button
                      type="button"
                      className="btn py-1 text-[12px]"
                      onClick={() => window.electronAPI.takeScreenshot().catch(err => setError(ipcErrorMessage(err)))}
                    >
                      {t('Capturer')} <span className="kbd">{state.screenshot.hotkey}</span>
                    </button>
                  </div>
                  <CaptureGallery gameId={game.id} limit={6} inOverlay />
                </div>
              )}

              {state.textractor[game.id] && <OverlayTextractor gameId={game.id} view={state.textractor[game.id]} />}

              {state.macro.available && (
                <div className="flex flex-col gap-2.5 border-t border-divider pt-3">
                  <label className={`flex items-start gap-2.5 text-[13px] ${state.macroSettings.enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 flex-shrink-0 accent-accent"
                      checked={game.macroEnabled}
                      disabled={!state.macroSettings.enabled}
                      onChange={e => setGameMacro(game.id, e.target.checked)}
                    />
                    <span>
                      <span className="flex items-center gap-1.5 font-semibold">
                        <Clapperboard size={14} strokeWidth={2.25} />
                        {t("Ajouter l'enregistreur de macros à ce jeu")}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-text-muted">
                        {state.macroSettings.enabled ? (
                          <>
                            <Trans text={t('Enregistre tes clics et touches dans le jeu puis les rejoue : {record} enregistre, {play} rejoue la macro choisie ci-dessous.')} values={{ record: <span className="kbd">{state.macroSettings.recordHotkey}</span>, play: <span className="kbd">{state.macroSettings.playHotkey}</span> }} />
                          </>
                        ) : (
                          t("Active d'abord l'enregistreur de macros dans Paramètres › Outils en jeu.")
                        )}
                      </span>
                    </span>
                  </label>
                  {game.macroEnabled && state.macroSettings.enabled && (
                    <OverlayMacros gameId={game.id} data={state.gameMacros[game.id]} status={state.macro} settings={state.macroSettings} onChanged={refresh} />
                  )}
                </div>
              )}
            </section>
          );
        })}

        {state?.ocr.enabled && state.games.length > 0 && (
          <button
            type="button"
            className="btn btn-primary self-start"
            onClick={() => window.electronAPI.ocrTranslateNow().catch(err => setError(ipcErrorMessage(err)))}
          >
            <Languages size={16} strokeWidth={2.25} />
            {t("Traduire l'écran du jeu")} <span className="kbd">{state.ocr.hotkey}</span>
          </button>
        )}

        {error && <p className="m-0 text-[13px] text-danger">{error}</p>}
      </div>
    </div>
  );
}
