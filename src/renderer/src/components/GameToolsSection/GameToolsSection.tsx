import { useEffect, useState } from 'react';
import {
  TRANSLATION_LANGUAGES,
  applyUserPatch,
  canInstallAutoTranslator,
  describeEngine,
  getGameToolsInfo,
  installAutoTranslator,
  ipcErrorMessage,
  openSaveLocation,
  uninstallLastPatch,
  type GameToolsInfo
} from '../../lib/gameTools.js';

export interface GameToolsSectionProps {
  gameId: string;
  /** Exécutable choisi : le changer peut changer le dossier d'installation détecté. */
  executablePath?: string;
}

const LABEL_CLASS = 'text-[10px] uppercase tracking-wide text-text-secondary';

/**
 * Moteur détecté, emplacements de sauvegarde, et patchs réversibles
 * (traduction automatique BepInEx + XUnity pour Unity Mono, patchs .zip ou
 * dossier fournis par l'utilisateur — décensure, traduction...).
 */
export default function GameToolsSection({ gameId, executablePath }: GameToolsSectionProps) {
  const [info, setInfo] = useState<GameToolsInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [language, setLanguage] = useState('en');

  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    setError(null);
    getGameToolsInfo(gameId)
      .then(result => !cancelled && setInfo(result))
      .catch(err => !cancelled && setError(ipcErrorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [gameId, executablePath]);

  const run = async (label: string, action: () => Promise<GameToolsInfo | null>) => {
    setBusy(label);
    setError(null);
    try {
      const result = await action();
      if (result) setInfo(result);
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const lastPatch = info?.patches[info.patches.length - 1];
  const engineDetails = info ? describeEngine(info) : '';

  return (
    <div className="mb-3 flex flex-col gap-3 text-xs">
      <div>
        <div className={LABEL_CLASS}>Moteur</div>
        {info ? (
          <div>
            {info.engine.label}
            {engineDetails && <span className="text-text-secondary"> · {engineDetails}</span>}
          </div>
        ) : (
          !error && <div className="text-text-secondary">Analyse…</div>
        )}
      </div>

      {info && info.saveLocations.length > 0 && (
        <div>
          <div className={`${LABEL_CLASS} mb-1`}>Sauvegardes</div>
          {info.saveLocations.map((location, index) => (
            <div key={location.path} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate" title={location.path}>
                {location.label}
                {!location.exists && <span className="text-text-secondary"> (pas encore créé)</span>}
              </span>
              {location.exists && (
                <button type="button" onClick={() => openSaveLocation(gameId, index)} className="btn btn-ghost flex-shrink-0 text-xs">
                  Ouvrir
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {info && (
        <div>
          <div className={`${LABEL_CLASS} mb-1`}>Patchs</div>

          {canInstallAutoTranslator(info) && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <select value={language} onChange={e => setLanguage(e.target.value)} className="input cursor-pointer text-xs" disabled={busy !== null}>
                {TRANSLATION_LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run('translate', () => installAutoTranslator(gameId, language))}
                className="btn btn-secondary text-xs"
              >
                {busy === 'translate' ? 'Installation…' : 'Traduction auto (BepInEx)'}
              </button>
            </div>
          )}
          {info.engine.engine === 'unity' && info.engine.unityBackend === 'il2cpp' && (
            <p className="mb-2 text-text-secondary">Unity IL2CPP : traduction auto non prise en charge (nécessite BepInEx 6).</p>
          )}

          {info.patches.map(patch => (
            <div key={patch.id} className="truncate" title={patch.name}>
              • {patch.name}
            </div>
          ))}

          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={busy !== null} onClick={() => run('zip', () => applyUserPatch(gameId, 'zip'))} className="btn btn-secondary text-xs">
              {busy === 'zip' ? 'Application…' : 'Patch .zip…'}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => run('folder', () => applyUserPatch(gameId, 'folder'))} className="btn btn-secondary text-xs">
              {busy === 'folder' ? 'Application…' : 'Patch dossier…'}
            </button>
            {lastPatch && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run('uninstall', () => uninstallLastPatch(gameId))}
                className="btn btn-ghost text-xs"
                title={`Désinstaller : ${lastPatch.name}`}
              >
                {busy === 'uninstall' ? 'Désinstallation…' : 'Retirer le dernier patch'}
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-red-400">{error}</p>}
    </div>
  );
}
