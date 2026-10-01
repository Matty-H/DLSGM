import { useEffect, useState } from 'react';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import type { GameToolsInfo, RpgMakerExtractResult } from '../../../../shared/ipc-types';

export interface TextToolsProps {
  gameId: string;
  info: GameToolsInfo | null;
  textractorEnabled: boolean;
  onTextractorEnabledChange: (enabled: boolean) => void;
}

const LABEL_CLASS = 'text-[12px] text-text-muted';

/**
 * Page du jeu › Outils : lancement avec Textractor (texte des moteurs non
 * Unity) et extraction des images / sons chiffrés d'un RPG Maker MV/MZ dans
 * le dossier de travaux (si l'extracteur est activé dans les paramètres).
 */
export default function TextTools({ gameId, info, textractorEnabled, onTextractorEnabledChange }: TextToolsProps) {
  const [extractorEnabled, setExtractorEnabled] = useState(false);
  const [textractorFound, setTextractorFound] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<RpgMakerExtractResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.getSettings().then(s => setExtractorEnabled(Boolean(s.rpgMakerExtractor))).catch(() => undefined);
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
        <div className={`${LABEL_CLASS} mb-1`}>Texte du jeu</div>
        <label className="flex cursor-pointer items-center justify-between gap-3">
          Lancer avec Textractor
          <input type="checkbox" className="toggle" checked={textractorEnabled} onChange={e => onTextractorEnabledChange(e.target.checked)} />
        </label>
        <p className="mt-1 text-text-secondary">
          Extrait le texte des visual novels et RPG Maker (moteurs que la traduction BepInEx ne couvre pas). Le fil choisi
          dans l'overlay (Maj+Tab) part au presse-papiers et/ou dans <span className="font-mono">textractor/</span> du dossier
          de travaux.
        </p>
        {textractorEnabled && textractorFound === false && (
          <p className="mt-1 text-danger">Textractor introuvable (Paramètres › Lancement) : le jeu ne pourra pas être lancé.</p>
        )}
      </div>

      {isRpgMakerWeb && extractorEnabled && (
        <div>
          <div className={`${LABEL_CLASS} mb-1`}>Ressources RPG Maker</div>
          <button type="button" onClick={extract} disabled={progress !== null} className="btn text-[13px]">
            {progress ? (progress.total ? `Extraction ${progress.done}/${progress.total}…` : 'Extraction…') : 'Extraire images et sons'}
          </button>
          {result && (
            <p className="mt-1 text-text-secondary">
              {result.files} fichier{result.files > 1 ? 's' : ''} déchiffré{result.files > 1 ? 's' : ''} dans{' '}
              <button type="button" className="font-mono text-accent hover:underline" onClick={() => window.electronAPI.openGameWorkspace(gameId)}>
                {result.folder}/
              </button>{' '}
              (clé {result.keySource === 'system' ? 'du jeu' : 'déduite d’une image'})
              {result.failed.length > 0 && <span className="text-danger"> — {result.failed.length} illisible{result.failed.length > 1 ? 's' : ''}</span>}.
            </p>
          )}
          {error && <p className="mt-1 text-danger">{error}</p>}
        </div>
      )}
    </>
  );
}
