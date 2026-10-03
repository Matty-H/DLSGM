import { useEffect, useState } from 'react';
import { generateTurboTheme } from '../../../../shared/themes';
import Logo from './Logo';

const INTERVAL_MS = 900;

/**
 * Tuile du mode « Super random turbo 2000 remix » : le logo carré change de
 * couleurs au hasard en boucle (fondu), entouré d'un halo de la couleur
 * d'accent tirée. Figé sur un tirage si l'utilisateur limite les animations.
 */
export default function TurboLogo({ height }: { height: number }) {
  const [theme, setTheme] = useState(() => generateTurboTheme());

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const interval = setInterval(() => setTheme(generateTurboTheme()), INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <span
      className="turbo-logo inline-flex"
      style={{ filter: `drop-shadow(0 0 6px ${theme.accent}) drop-shadow(0 0 14px ${theme.logo.dls}88)` }}
    >
      <Logo variant="square" height={height} colors={{ background: theme.icon.bg, dls: theme.icon.dls, gm: theme.icon.gm }} />
    </span>
  );
}
