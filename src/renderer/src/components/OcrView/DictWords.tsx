import { useRef, useState } from 'react';
import type { DictToken } from '../../../../shared/ipc-types';
import { shortGloss } from '../../lib/ocr.js';
import { t } from '../../lib/i18n.js';

/**
 * Texte d'un bloc découpé en mots : lecture en furigana au-dessus, premier
 * sens en dessous ; au survol, fiche du mot (forme de base, tous les sens,
 * kanji un à un). La fenêtre laisse passer les clics au jeu : seul le survol
 * est reçu.
 */
export default function DictWords({ words, frenchWanted = true }: { words: DictToken[]; frenchWanted?: boolean }) {
  const [hovered, setHovered] = useState<number | null>(null);
  // Fiche du côté du bloc où il y a le plus de place dans la fenêtre du jeu, sa hauteur limitée à cette place.
  const [placement, setPlacement] = useState<{ above: boolean; maxHeight: number }>({ above: false, maxHeight: 300 });
  const container = useRef<HTMLDivElement>(null);
  const card = hovered !== null ? words[hovered] : null;

  return (
    <div ref={container} className="relative">
      <div className="flex flex-wrap items-end gap-x-1.5 gap-y-1">
        {words.map((word, i) =>
          word.senses.length === 0 && word.kanji.length === 0 ? (
            <span key={i} className="text-[15px] text-white/70">
              {word.text}
            </span>
          ) : (
            <span
              key={i}
              onMouseEnter={() => {
                setHovered(i);
                const rect = container.current?.getBoundingClientRect();
                if (!rect) return;
                const below = window.innerHeight - rect.bottom - 12;
                const aboveSpace = rect.top - 12;
                setPlacement({ above: aboveSpace > below, maxHeight: Math.max(80, Math.max(below, aboveSpace)) });
              }}
              onMouseLeave={() => setHovered(prev => (prev === i ? null : prev))}
              className={`flex cursor-help flex-col items-center rounded-sm px-0.5 ${hovered === i ? 'bg-accent/40' : ''}`}
            >
              <ruby className="text-[16px] leading-tight">
                {word.text}
                <rt className="text-[10px] text-white/70">{word.reading ?? ''}</rt>
              </ruby>
              <span className="max-w-[140px] truncate text-[11px] leading-tight text-accent-hover">{shortGloss(word)}</span>
            </span>
          )
        )}
      </div>

      {card && (
        <div className={`absolute left-0 z-10 w-[340px] ${placement.above ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
        <div style={{ maxHeight: placement.maxHeight }} className="overflow-y-auto rounded-md border border-divider bg-bg-deep/95 p-3 text-[12px] leading-relaxed shadow-2xl">
          <div className="flex items-baseline gap-2">
            <span className="text-[20px] font-bold">{card.base ?? card.text}</span>
            {card.reading && <span className="text-white/70">{card.reading}</span>}
            {card.base && <span className="text-white/50">← {card.text}</span>}
          </div>
          {card.senses.length > 0 && (
            <ol className="m-0 mt-1 list-decimal pl-5">
              {card.senses.map((sense, i) => (
                <li key={i}>{sense.join(', ')}</li>
              ))}
            </ol>
          )}
          {frenchWanted && !card.french && card.senses.length > 0 && <div className="mt-1 text-[11px] text-white/50">{t('Pas de traduction française dans JMdict : sens en anglais.')}</div>}
          {card.kanji.length > 0 && (
            <div className="mt-2 flex flex-col gap-1 border-t border-divider pt-2">
              {card.kanji.map(k => (
                <div key={k.char} className="flex gap-2">
                  <span className="text-[18px] font-bold leading-none">{k.char}</span>
                  <span className="min-w-0">
                    <span>{k.meanings.join(', ')}</span>
                    <span className="block text-[11px] text-white/60">
                      {[k.on.length > 0 && t('on : {readings}', { readings: k.on.join('、') }), k.kun.length > 0 && t('kun : {readings}', { readings: k.kun.join('、') })].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      )}
    </div>
  );
}
