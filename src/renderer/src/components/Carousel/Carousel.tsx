import { PLACEHOLDER_IMAGE } from '../../lib/constants.js';

export interface CarouselProps {
  workImageSrc: string;
  sampleSrcs: string[];
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

export default function Carousel({ workImageSrc, sampleSrcs, activeIndex, onPrev, onNext, onClose }: CarouselProps) {
  const totalImages = 1 + sampleSrcs.length;

  return (
    <div className="relative overflow-hidden">
      <button
        onClick={onClose}
        aria-label="Fermer"
        className="btn btn-ghost btn-icon absolute right-2 top-2 z-[100] bg-bg/80"
      >
        ✖
      </button>
      <div className="relative aspect-video bg-black">
        <div className="flex h-full">
          <img
            src={workImageSrc}
            onError={e => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = PLACEHOLDER_IMAGE;
            }}
            className={`h-full w-full object-contain ${activeIndex === 0 ? 'block' : 'hidden'}`}
          />
          {sampleSrcs.map((src, i) => (
            <img
              key={src}
              src={src}
              onError={e => {
                e.currentTarget.onerror = null;
                e.currentTarget.style.display = 'none';
              }}
              className={`h-full w-full object-contain ${activeIndex === i + 1 ? 'block' : 'hidden'}`}
            />
          ))}
        </div>
        {totalImages > 1 && (
          <>
            <button
              onClick={onPrev}
              className="absolute inset-y-0 left-0 z-10 w-12 bg-black/30 text-2xl text-white transition-colors hover:bg-black/60"
            >
              ❮
            </button>
            <button
              onClick={onNext}
              className="absolute inset-y-0 right-0 z-10 w-12 bg-black/30 text-2xl text-white transition-colors hover:bg-black/60"
            >
              ❯
            </button>
          </>
        )}
      </div>
    </div>
  );
}
