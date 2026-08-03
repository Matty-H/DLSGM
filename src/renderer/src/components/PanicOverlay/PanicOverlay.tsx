import { useEffect, useState } from 'react';

export interface PanicOverlayProps {
  active: boolean;
}

const ORIGINAL_TITLE = document.title;
const PANIC_URL = 'https://fr.wikipedia.org/wiki/Spécial:Aléatoire';
const TRANSITION_DELAY_MS = 500;

/**
 * "Mode Panique" (Alt+Space) : masque rapidement l'application derrière une
 * page anodine. Reproduit le comportement en deux temps de l'ancien
 * renderer.js (overlay de chargement puis iframe, et inversement à la
 * fermeture) avec de l'état React plutôt que des manipulations directes du DOM.
 */
export default function PanicOverlay({ active }: PanicOverlayProps) {
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [iframeVisible, setIframeVisible] = useState(false);
  const [iframeSrc, setIframeSrc] = useState('about:blank');

  useEffect(() => {
    if (active) {
      document.title = "Wikipedia - L'encyclopédie libre";
      setOverlayVisible(true);

      const timer = setTimeout(() => {
        setIframeSrc(PANIC_URL);
        setIframeVisible(true);
      }, TRANSITION_DELAY_MS);

      return () => clearTimeout(timer);
    }

    setOverlayVisible(true);
    const timer = setTimeout(() => {
      setIframeSrc('about:blank');
      setIframeVisible(false);
      document.title = ORIGINAL_TITLE;
      setOverlayVisible(false);
    }, TRANSITION_DELAY_MS);

    return () => clearTimeout(timer);
  }, [active]);

  return (
    <>
      <div
        className={`fixed inset-0 z-[9998] flex-col items-center justify-center bg-white ${
          overlayVisible ? 'flex' : 'hidden'
        }`}
      >
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-neutral-200 border-t-blue-500" />
          <p className="mt-4 font-sans text-base font-bold text-neutral-800">Chargement, veuillez patienter...</p>
          <p className="mt-2 font-sans text-xs italic text-neutral-800">(Alt+Space pour fermer)</p>
        </div>
      </div>
      <iframe
        src={iframeSrc}
        onLoad={() => {
          if (active) setOverlayVisible(false);
        }}
        className={`fixed inset-0 z-[9999] h-full w-full border-none ${iframeVisible ? 'block' : 'hidden'}`}
      />
    </>
  );
}
