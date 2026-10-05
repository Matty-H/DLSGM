import { useEffect, useState } from 'react';
import Select from '../Select/Select';
import SaveBackups from '../SaveBackups/SaveBackups';
import TextTools from './TextTools';
import RpgSaveEditor from './RpgSaveEditor';
import {
  TRANSLATION_LANGUAGES,
  saveLocationLabel,
  applyUserPatch,
  canInstallAutoTranslator,
  clearGameSandbox,
  describeEngine,
  getGameToolsInfo,
  installAutoTranslator,
  ipcErrorMessage,
  openSaveLocation,
  uninstallLastPatch,
  type GameToolsInfo
} from '../../lib/gameTools.js';
import { releaseLabel } from '../../lib/releaseInfo.js';
import { t, tr, uiLocale } from '../../lib/i18n.js';
import Trans from '../Trans/Trans';

export interface GameToolsSectionProps {
  gameId: string;
  /** Exécutable choisi : le changer peut changer le dossier d'installation détecté. */
  executablePath?: string;
  /** Jeu exclu de la sandbox Sandboxie (entrée de cache `sandboxDisabled`). */
  sandboxDisabled: boolean;
  onSandboxDisabledChange: (disabled: boolean) => void;
  /** Dernière session : rafraîchit la liste des copies des sauvegardes après une partie. */
  lastPlayed?: string;
  /** Lancer avec Textractor (entrée de cache `textractorEnabled`). */
  textractorEnabled: boolean;
  onTextractorEnabledChange: (enabled: boolean) => void;
  localeEmulator: boolean;
  onLocaleEmulatorChange: (enabled: boolean) => void;
}

const LABEL_CLASS = 'text-[12px] text-text-muted';

/**
 * Moteur détecté, emplacements de sauvegarde, et patchs réversibles
 * (traduction automatique BepInEx + XUnity pour Unity Mono, patchs .zip ou
 * dossier fournis par l'utilisateur — décensure, traduction...), et sandbox
 * Sandboxie quand le lancement en sandbox est activé dans les paramètres.
 */
export default function GameToolsSection({
  gameId,
  executablePath,
  sandboxDisabled,
  onSandboxDisabledChange,
  lastPlayed,
  textractorEnabled,
  onTextractorEnabledChange,
  localeEmulator,
  onLocaleEmulatorChange
}: GameToolsSectionProps) {
  const [info, setInfo] = useState<GameToolsInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [language, setLanguage] = useState('en');
  // Sauvegarde modifiée par l'éditeur : la liste des copies (nouvelle copie « Avant modification ») est à relire.
  const [savesVersion, setSavesVersion] = useState(0);

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
  }, [gameId, executablePath, lastPlayed]);

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

  const handleClearSandbox = () => {
    const confirmed = window.confirm(
      t("Vider la sandbox de ce jeu ? Tout ce qu'il a écrit hors de son dossier (configuration, sauvegardes dans AppData, registre) sera définitivement supprimé. Son dossier n'est pas touché.")
    );
    if (confirmed) run('clear-sandbox', () => clearGameSandbox(gameId));
  };

  const lastPatch = info?.patches[info.patches.length - 1];
  const sandboxed = info !== null && info.sandbox.globallyEnabled && !sandboxDisabled;
  const engineDetails = info ? describeEngine(info) : '';

  return (
    <div className="flex flex-col gap-4 text-[13px]">
      <div>
        <div className={LABEL_CLASS}>{t('Moteur')}</div>
        {info ? (
          <div>
            {info.engine.label}
            {engineDetails && <span className="text-text-secondary"> · {engineDetails}</span>}
          </div>
        ) : (
          !error && <div className="text-text-secondary">{t('Analyse…')}</div>
        )}
      </div>

      {info?.install && (
        <div>
          <div className={LABEL_CLASS}>{t('Installé depuis')}</div>
          <div className="min-w-0 truncate" title={info.install.source}>
            {info.install.source}
            {releaseLabel(info.install) && <span className="text-text-secondary"> · {releaseLabel(info.install)}</span>}
          </div>
          {info.install.date && (
            <div className="text-text-secondary">{t('le {date}', { date: new Date(info.install.date).toLocaleDateString(uiLocale()) })}</div>
          )}
        </div>
      )}

      {info && info.saveLocations.length > 0 && (
        <div>
          <div className={`${LABEL_CLASS} mb-1`}>{t('Sauvegardes')}</div>
          {info.saveLocations.map((location, index) => (
            <div key={location.path} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate" title={location.path}>
                {saveLocationLabel(location.label)}
                {!location.exists && <span className="text-text-secondary"> {t('(pas encore créé)')}</span>}
              </span>
              {location.exists && (
                <button type="button" onClick={() => openSaveLocation(gameId, index)} className="btn btn-ghost flex-shrink-0 px-2 py-1 text-[13px]">
                  {t('Ouvrir')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {info && info.saveLocations.length > 0 && <SaveBackups gameId={gameId} lastPlayed={lastPlayed} refreshKey={savesVersion} />}

      {(info?.engine.engine === 'rpgmaker-mv' || info?.engine.engine === 'rpgmaker-mz') && (
        <RpgSaveEditor gameId={gameId} lastPlayed={lastPlayed} onSaved={() => setSavesVersion(v => v + 1)} />
      )}

      <TextTools
        gameId={gameId}
        info={info}
        textractorEnabled={textractorEnabled}
        onTextractorEnabledChange={onTextractorEnabledChange}
        localeEmulator={localeEmulator}
        onLocaleEmulatorChange={onLocaleEmulatorChange}
        sandboxed={sandboxed}
      />

      {info?.sandbox.globallyEnabled && (

        <div>
          <div className={`${LABEL_CLASS} mb-1`}>{t('Sandbox')}</div>
          <label className="flex cursor-pointer items-center justify-between gap-3">
            {t('Lancer ce jeu dans Sandboxie')}
            <input type="checkbox" className="toggle" checked={!sandboxDisabled} onChange={e => onSandboxDisabledChange(!e.target.checked)} />
          </label>
          {sandboxed && !info.sandbox.available && (
            <p className="mt-1 text-danger">{t('Sandboxie-Plus introuvable : le jeu ne pourra pas être lancé.')}</p>
          )}
          {sandboxed && info.sandbox.available && (
            <>
              <p className="mt-1 text-text-secondary">
                <Trans
                  text={t('Sandbox {box}. Les sauvegardes écrites hors du dossier du jeu (AppData, registre) y sont isolées : les emplacements ci-dessus peuvent sembler vides.')}
                  values={{ box: <span className="font-mono">{info.sandbox.boxName}</span> }}
                />
              </p>
              <button type="button" disabled={busy !== null} onClick={handleClearSandbox} className="btn btn-ghost mt-1 px-2 py-1 text-[13px]">
                {busy === 'clear-sandbox' ? t('Nettoyage…') : t('Vider la sandbox')}
              </button>
            </>
          )}
        </div>
      )}

      {info && (
        <div>
          <div className={`${LABEL_CLASS} mb-1`}>{t('Patchs')}</div>

          {canInstallAutoTranslator(info) && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Select
                value={language}
                options={TRANSLATION_LANGUAGES.map(l => ({ value: l.code, label: tr(l.label) }))}
                onChange={setLanguage}
                aria-label={t('Langue de traduction')}
                className="w-auto flex-1 text-[13px]"
                disabled={busy !== null}
              />
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run('translate', () => installAutoTranslator(gameId, language))}
                className="btn text-[13px]"
              >
                {busy === 'translate' ? t('Installation…') : t('Traduction auto (BepInEx)')}
              </button>
            </div>
          )}
          {info.engine.engine === 'unity' && info.engine.unityBackend === 'il2cpp' && (
            <p className="mb-2 text-text-secondary">{t('Unity IL2CPP : traduction auto non prise en charge (nécessite BepInEx 6).')}</p>
          )}

          {info.patches.map(patch => (
            <div key={patch.id} className="mb-1 truncate rounded-sm bg-bg-deep px-2.5 py-1.5" title={patch.name}>
              {patch.name}
            </div>
          ))}

          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={busy !== null} onClick={() => run('zip', () => applyUserPatch(gameId, 'zip'))} className="btn text-[13px]">
              {busy === 'zip' ? t('Application…') : t('Patch .zip…')}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => run('folder', () => applyUserPatch(gameId, 'folder'))} className="btn text-[13px]">
              {busy === 'folder' ? t('Application…') : t('Patch dossier…')}
            </button>
            {lastPatch && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run('uninstall', () => uninstallLastPatch(gameId))}
                className="btn btn-ghost text-[13px]"
                title={t('Désinstaller : {name}', { name: lastPatch.name })}
              >
                {busy === 'uninstall' ? t('Désinstallation…') : t('Retirer le dernier patch')}
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}
