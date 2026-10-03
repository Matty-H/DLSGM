import { useEffect, useState } from 'react';
import type { OcrView } from '../../../../shared/ipc-types';
import DictWords from './DictWords';
import { t } from '../../lib/i18n.js';

/**
 * Traduction à l'écran (route #ocr-view) : fenêtre transparente posée sur
 * le jeu, traversée par la souris. Chaque bloc lu est recouvert de sa
 * traduction (ou du texte reconnu, sans moteur de traduction), à sa place.
 * L'état est demandé au montage puis suivi par `ocr-view`.
 */
export default function OcrViewApp() {
  const [view, setView] = useState<OcrView | null>(null);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    window.electronAPI.getOcrView().then(v => v && setView(v)).catch(() => undefined);
    return window.electronAPI.onOcrView(setView);
  }, []);

  if (!view || view.status === 'idle') return null;

  const status =
    view.status === 'reading'
      ? t('Lecture du texte…')
      : view.status === 'translating'
        ? view.engine === 'dictionary'
          ? t('Recherche dans le dictionnaire…')
          : t('Traduction…')
        : view.status === 'error'
          ? view.error
          : view.blocks.length === 0
            ? t('Aucun texte reconnu (langue OCR installée ? texte assez grand ?)')
            : null;

  return (
    <div className="relative h-screen w-screen overflow-hidden font-body">
      {view.blocks.map((block, i) => {
        if (block.words) {
          return (
            <div
              key={i}
              className="absolute rounded-sm bg-black/85 px-2 py-1 text-white shadow-lg"
              style={{ left: block.x - 4, top: block.y - 4, minWidth: block.width + 8, maxWidth: Math.max(block.width + 8, 420) }}
            >
              <DictWords words={block.words} frenchWanted={view.target !== 'en'} />
            </div>
          );
        }
        const text = block.translation ?? (view.engine === 'none' || view.status === 'error' ? block.text : null);
        return (
          <div
            key={i}
            className="absolute rounded-sm bg-black/80 px-1.5 py-0.5 leading-snug text-white shadow-lg"
            style={{
              left: block.x - 4,
              top: block.y - 2,
              minWidth: block.width + 8,
              maxWidth: Math.max(block.width + 8, 360),
              minHeight: block.height + 4,
              fontSize: 15
            }}
            title={block.text}
          >
            {text ?? <span className="text-white/60">…</span>}
          </div>
        );
      })}
      {status && (
        <div className={`absolute left-1/2 top-3 -translate-x-1/2 rounded-full px-3 py-1 text-[12px] font-semibold shadow-lg ${view.status === 'error' ? 'bg-danger text-white' : 'bg-black/80 text-white'}`}>
          {status}
        </div>
      )}
    </div>
  );
}
