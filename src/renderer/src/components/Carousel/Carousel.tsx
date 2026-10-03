import { ChevronLeft, ChevronRight, EyeOff } from 'lucide-react';
import { PLACEHOLDER_IMAGE } from '../../lib/constants.js';
import { t } from '../../lib/i18n.js';

export interface CarouselProps {
  workImageSrc: string;
  sampleSrcs: string[];
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (index: number) => void;
  /** Œuvre R18 non révélée : images floutées sous un voile « Cliquer pour révéler ». */
  blurred?: boolean;
  onReveal?: () => void;
}

/**
 * Bandeau "hero" de la page d'un jeu : l'image active est affichée entière
 * (object-contain) au centre, sur un fond constitué de la même image floutée,
 * comme les illustrations de fond de SteamOS.
 */
export default function Carousel({ workImageSrc, sampleSrcs, activeIndex, onPrev, onNext, onSelect, blurred = false, onReveal }: CarouselProps) {
  const srcs = [workImageSrc, ...sampleSrcs];
  const totalImages = srcs.length;
  // Les flèches clavier incrémentent l'index sans connaître le nombre
  // d'images : on le ramène ici dans l'intervalle (défilement circulaire).
  const current = ((activeIndex % totalImages) + totalImages) % totalImages;
  const activeSrc = srcs[current];

  return (
    <div className="group relative h-full w-full overflow-hidden bg-bg-deep">
      <img src={activeSrc} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />

      {srcs.map((src, i) => (
        <img
          key={src}
          src={src}
          onError={e => {
            e.currentTarget.onerror = null;
            if (i === 0) e.currentTarget.src = PLACEHOLDER_IMAGE;
            else e.currentTarget.style.display = 'none';
          }}
          className={`relative h-full w-full object-contain ${current === i ? 'block' : 'hidden'} ${blurred ? 'scale-105 blur-3xl' : ''}`}
        />
      ))}

      {blurred && (
        <button
          type="button"
          data-reveal
          onClick={onReveal}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-bg/40 text-center"
        >
          <EyeOff size={24} strokeWidth={2} className="text-text-secondary" />
          <span className="text-sm font-bold tracking-wide">R18</span>
          <span className="text-[12px] text-text-secondary">{t('Cliquer pour révéler')}</span>
        </button>
      )}

      {totalImages > 1 && (
        <>
          <button
            type="button"
            onClick={onPrev}
            aria-label={t('Image précédente')}
            className="btn btn-icon absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label={t('Image suivante')}
            className="btn btn-icon absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
          >
            <ChevronRight size={20} strokeWidth={2.5} />
          </button>
          <div className="absolute right-6 top-4 z-10 flex gap-1.5">
            {srcs.map((src, i) => (
              <button
                key={src}
                type="button"
                aria-label={t('Image {n}', { n: i + 1 })}
                onClick={() => onSelect(i)}
                className={`h-1.5 rounded-full transition-all ${current === i ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
