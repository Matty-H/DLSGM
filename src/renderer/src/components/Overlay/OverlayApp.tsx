import { useCallback, useEffect, useState } from 'react';
import { Clock, MousePointerClick, X } from 'lucide-react';
import { formatClock } from '../../lib/autoClicker.js';
import { formatLastPlayed, formatPlayTime } from '../../lib/timeFormatter.js';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import type { OverlayState } from '../../../../shared/ipc-types';

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
 * route #overlay. Session en cours, temps de jeu, et la case qui ajoute
 * l'auto-clicker à ce jeu (son état et ses réglages rapides sont dans le
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
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      offState();
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

  const clickerSettings = state?.clickerSettings;
  const clickerAvailable = state?.clicker.available ?? false;

  return (
    <div className="flex h-screen w-screen items-center justify-end bg-black/55 p-8 font-body text-text">
      <div className="flex max-h-full w-[440px] flex-col gap-4 overflow-y-auto">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[11px] font-extrabold text-white">DL</span>
          <span className="flex-1 text-[15px] font-extrabold tracking-wide">DLSGM</span>
          <span className="text-[12px] text-text-muted">
            <span className="kbd">Maj</span> + <span className="kbd">Tab</span> ou <span className="kbd">Échap</span> pour fermer
          </span>
          <button type="button" onClick={close} aria-label="Fermer l'overlay" className="btn btn-ghost btn-icon">
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
                    {game.id} · lancé à {new Date(game.startedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Session" value={formatClock(sessionSeconds)} />
                <Stat label="Temps total" value={formatPlayTime(game.previousPlayTime + sessionSeconds) || '< 1 min'} />
                <Stat label="Sessions" value={String(game.sessionCount + 1)} />
              </div>
              {game.lastPlayed && (
                <div className="flex items-center gap-1.5 text-[12px] text-text-muted">
                  <Clock size={13} strokeWidth={2.25} />
                  Session précédente : {formatLastPlayed(game.lastPlayed)}
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
                        Ajouter l'auto-clicker à ce jeu
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-text-muted">
                        {clickerSettings.enabled ? (
                          <>
                            Un témoin s'affichera en bas à gauche de l'écran : <span className="kbd">{clickerSettings.hotkey}</span>{' '}
                            démarre / arrête les clics, un clic sur le témoin (à l'arrêt) règle l'intervalle et le raccourci.
                          </>
                        ) : (
                          "Active d'abord l'auto-clicker dans Paramètres › Auto-clicker & overlay."
                        )}
                      </span>
                    </span>
                  </label>
                </div>
              )}
            </section>
          );
        })}

        {error && <p className="m-0 text-[13px] text-danger">{error}</p>}
      </div>
    </div>
  );
}
