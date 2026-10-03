import { useEffect, useState } from 'react';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import type { GameToolsInfo, RpgMakerExtractResult } from '../../../../shared/ipc-types';
import { t } from '../../lib/i18n.js';
import Trans from '../Trans/Trans';

export interface TextToolsProps {
  gameId: string;
  info: GameToolsInfo | null;
  textractorEnabled: boolean;
  onTextractorEnabledChange: (enabled: boolean) => void;
  /** Lancer en locale japonaise (Locale Emulator), entrée `localeEmulator`. */
  localeEmulator: boolean;
  onLocaleEmulatorChange: (enabled: boolean) => void;
  /** Ce jeu est lancé dans Sandboxie (incompatible pour l'instant). */
  sandboxed: boolean;
}

const LABEL_CLASS = 'text-[12px] text-text-muted';

/**
 * Page du jeu › Outils : lancement avec Textractor (texte des moteurs non
 * Unity) et extraction des images / sons chiffrés d'un RPG Maker MV/MZ dans
 * le dossier de travaux (si l'extracteur est activé dans les paramètres).
 */
export default function TextTools({ gameId, info, textractorEnabled, onTextractorEnabledChange, localeEmulator, onLocaleEmulatorChange, sandboxed }: TextToolsProps) {
  const [extractorEnabled, setExtractorEnabled] = useState(false);
  const [textractorFound, setTextractorFound] = useState<boolean | null>(null);
  const [leReady, setLeReady] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<RpgMakerExtractResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.getSettings().then(s => setExtractorEnabled(Boolean(s.rpgMakerExtractor))).catch(() => undefined);
    window.electronAPI
      .checkLocaleEmulator()
      .then(status => setLeReady(status.found))
      .catch(() => setLeReady(false));
    window.electronAPI
      .checkTextractor()
      .then(found => setTextractorFound(found.x86 || found.x64))
      .catch(() => setTextractorFound(false));
    return window.electronAPI.onRpgMakerExtractProgress(p => {
      if (p.gameId === gameId) setProgress({ done: p.done, total: p.total });
    });
  }, [gameId]);

  useEffect(() => {
    setResult(null);
    setError(null);
  }, [gameId]);

  const isRpgMakerWeb = info?.engine.engine === 'rpgmaker-mv' || info?.engine.engine === 'rpgmaker-mz';

  const extract = async () => {
    setError(null);
    setResult(null);
    setProgress({ done: 0, total: 0 });
    try {
      setResult(await window.electronAPI.extractRpgMakerAssets(gameId));
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      <div>
        <div className={`${LABEL_CLASS} mb-1`}>{t('Texte du jeu')}</div>
        <label className="flex cursor-pointer items-center justify-between gap-3">
          {t('Lancer en japonais (Locale Emulator)')}
          <input type="checkbox" className="toggle" checked={localeEmulator} onChange={e => onLocaleEmulatorChange(e.target.checked)} />
        </label>
        <p className="mt-1 text-text-secondary">
          {t('Pour un jeu aux textes illisibles, qui plante au démarrage ou ne trouve pas ses fichiers sur un Windows non japonais. Le temps de jeu reste suivi.')}
        </p>
        {localeEmulator && leReady === false && (
          <p className="mt-1 text-danger">{t('Locale Emulator introuvable (Paramètres › Lancement) : le jeu ne pourra pas être lancé.')}</p>
        )}
        {localeEmulator && info?.engine.arch === 'x64' && (
          <p className="mt-1 text-danger">{t('Jeu 64 bits : Locale Emulator ne gère que les jeux 32 bits, le lancement sera refusé.')}</p>
        )}
        {localeEmulator && sandboxed && (
          <p className="mt-1 text-danger">{t('Ce jeu est lancé dans Sandboxie : pas encore combinable avec Locale Emulator.')}</p>
        )}
      </div>

      <div>
        <label className="flex cursor-pointer items-center justify-between gap-3">
          {t('Lancer avec Textractor')}
          <input type="checkbox" className="toggle" checked={textractorEnabled} onChange={e => onTextractorEnabledChange(e.target.checked)} />
        </label>
        <p className="mt-1 text-text-secondary">
          {t("Extrait le texte des visual novels et RPG Maker (moteurs que la traduction BepInEx ne couvre pas). Le fil choisi dans l'overlay (Maj+Tab) part au presse-papiers et/ou dans textractor/ du dossier de travaux.")}
        </p>
        {textractorEnabled && textractorFound === false && (
          <p className="mt-1 text-danger">{t('Textractor introuvable (Paramètres › Lancement) : le jeu ne pourra pas être lancé.')}</p>
        )}
      </div>

      {isRpgMakerWeb && extractorEnabled && (
        <div>
          <div className={`${LABEL_CLASS} mb-1`}>{t('Ressources RPG Maker')}</div>
          <button type="button" onClick={extract} disabled={progress !== null} className="btn text-[13px]">
            {progress ? (progress.total ? t('Extraction {done}/{total}…', { done: progress.done, total: progress.total }) : t('Extraction…')) : t('Extraire images et sons')}
          </button>
          {result && (
            <p className="mt-1 text-text-secondary">
              <Trans
                text={result.keySource === 'system' ? t('{n} fichier(s) déchiffré(s) dans {folder} (clé du jeu)') : t('{n} fichier(s) déchiffré(s) dans {folder} (clé déduite d’une image)')}
                values={{
                  n: result.files,
                  folder: (
                    <button type="button" className="font-mono text-accent hover:underline" onClick={() => window.electronAPI.openGameWorkspace(gameId)}>
                      {result.folder}/
                    </button>
                  )
                }}
              />
              {result.failed.length > 0 && <span className="text-danger"> — {t('{n} illisible(s)', { n: result.failed.length })}</span>}.
            </p>
          )}
          {error && <p className="mt-1 text-danger">{error}</p>}
        </div>
      )}
    </>
  );
}
