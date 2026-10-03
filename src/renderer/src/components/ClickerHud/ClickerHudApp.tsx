import { useCallback, useEffect, useState } from 'react';
import { Minus, MousePointerClick, Plus } from 'lucide-react';
import { HOTKEY_OPTIONS, INTERVAL_PRESETS, formatInterval, formatRate, stepInterval, type AutoClickerSettings } from '../../lib/autoClicker.js';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import type { AutoClickerStatus } from '../../../../shared/ipc-types';
import { t } from '../../lib/i18n.js';

/**
 * Témoin de l'auto-clicker (src/main/clicker-hud.ts, route #clicker-hud),
 * affiché tant qu'un jeu où l'auto-clicker a été ajouté tourne : pastille
 * verte en marche, orange en pause (le jeu n'est pas au premier plan), rouge
 * à l'arrêt (grise si le raccourci est momentanément inactif), et le rythme. Discret
 * (semi-transparent) sauf au survol ; à l'arrêt, un clic le déplie pour
 * changer l'intervalle et le raccourci. La fenêtre ne prend jamais le focus
 * (le jeu se réduirait) : réglages à la souris seulement.
 */
export default function ClickerHudApp() {
  const [status, setStatus] = useState<AutoClickerStatus | null>(null);
  const [settings, setSettings] = useState<AutoClickerSettings | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [intervalMs, setIntervalMs] = useState(100);
  const [hotkey, setHotkey] = useState('F6');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    window.electronAPI
      .getOverlayState()
      .then(state => {
        setStatus(state.clicker);
        setSettings(state.clickerSettings);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    refresh();
    const offStatus = window.electronAPI.onAutoClickerStatus(setStatus);
    const offState = window.electronAPI.onOverlayStateChanged(refresh);
    const offExpanded = window.electronAPI.onClickerHudExpanded(setExpanded);
    return () => {
      offStatus();
      offState();
      offExpanded();
    };
  }, [refresh]);

  const running = Boolean(status?.running);
  const paused = running && Boolean(status?.paused);
  const inGame = Boolean(status?.inGame);

  const open = () => {
    if (running || !settings) return;
    setIntervalMs(settings.intervalMs);
    setHotkey(settings.hotkey);
    setError(null);
    window.electronAPI.setClickerHudExpanded(true);
  };

  const close = () => window.electronAPI.setClickerHudExpanded(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await window.electronAPI.saveClickerQuickSettings({ intervalMs, hotkey });
      refresh();
      close();
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return null;

  const dot = (
    <span
      className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
        paused ? 'bg-amber-400' : running ? 'bg-play shadow-[0_0_8px_var(--color-play)]' : inGame ? 'bg-danger' : 'bg-text-muted'
      }`}
      aria-label={paused ? t('En pause') : running ? t('En marche') : inGame ? t('À l’arrêt') : t('Hors jeu')}
    />
  );

  const title = paused
    ? t('En pause : le jeu n’est pas au premier plan')
    : running
      ? t('En marche — {hotkey} pour arrêter', { hotkey: settings.hotkey })
      : inGame
        ? t("À l'arrêt — {hotkey} pour démarrer, clic pour régler", { hotkey: settings.hotkey })
        : t("Hors jeu : {hotkey} n'agit que pendant un jeu lancé depuis DLSGM (où l'auto-clicker est permis). Clic pour régler.", { hotkey: settings.hotkey });

  return (
    <div className="flex h-screen w-screen items-end font-body text-text">
      {expanded ? (
        <div className="panel flex w-full flex-col gap-3 p-3 shadow-lg">
          <div className="flex items-center gap-2 text-[13px] font-bold">
            {dot}
            <MousePointerClick size={15} strokeWidth={2.25} />
            {t('Auto-clicker')}
          </div>
          <div>
            <div className="section-title mb-1 flex items-center justify-between text-[10px]">
              {t('Intervalle')}
              <span className="normal-case tracking-normal text-text-muted">{formatRate({ intervalMs, double: settings.double })}</span>
            </div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <button type="button" onClick={() => setIntervalMs(v => stepInterval(v, -1))} aria-label={t('Plus rapide')} className="btn btn-icon h-7 w-7 p-0">
                <Minus size={14} strokeWidth={2.5} />
              </button>
              <span className="flex-1 text-center text-[15px] font-bold tabular-nums">{formatInterval(intervalMs)}</span>
              <button type="button" onClick={() => setIntervalMs(v => stepInterval(v, 1))} aria-label={t('Plus lent')} className="btn btn-icon h-7 w-7 p-0">
                <Plus size={14} strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {INTERVAL_PRESETS.map(preset => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={intervalMs === preset}
                  onClick={() => setIntervalMs(preset)}
                  className={`tag px-1.5 py-0.5 text-[11px] ${intervalMs === preset ? 'tag-accent' : ''}`}
                >
                  {formatInterval(preset)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="section-title mb-1 text-[10px]">{t('Raccourci')}</div>
            <div className="flex flex-wrap gap-1">
              {HOTKEY_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={hotkey === option.value}
                  onClick={() => setHotkey(option.value)}
                  className={`tag px-2 py-0.5 text-[11px] ${hotkey === option.value ? 'tag-accent' : ''}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {error && <div className="text-[11px] text-danger">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="btn btn-ghost py-1 text-[12px]">
              {t('Annuler')}
            </button>
            <button type="button" onClick={save} disabled={saving} className="btn btn-primary py-1 text-[12px]">
              {t('Enregistrer')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={open}
          title={title}
          className={`flex w-full items-center gap-2 rounded-full border border-divider bg-bg-deep/90 px-3 py-2 text-[12px] font-semibold opacity-45 transition-opacity hover:opacity-100 ${
            running ? 'cursor-default' : 'cursor-pointer'
          }`}
        >
          {dot}
          <span className="min-w-0 flex-1 truncate text-left tabular-nums">{paused ? t('En pause') : formatRate(settings)}</span>
          {!inGame && !running && <span className="text-[11px] font-normal text-text-muted">{t('hors jeu')}</span>}
          <span className="kbd">{settings.hotkey}</span>
        </button>
      )}
    </div>
  );
}
