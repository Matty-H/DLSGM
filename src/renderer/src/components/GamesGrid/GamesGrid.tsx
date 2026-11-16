import { useEffect, useLayoutEffect, useRef } from 'react';
import GameCard from '../GameCard/GameCard';
import { animationsEnabled } from '../../hooks/animations';

/** Rang à partir duquel les jaquettes apparaissent ensemble (cascade de ~0,4 s au plus). */
const MAX_STAGGER = 20;

/** Durée du glissement des jaquettes qui font place à un nouveau jeu ; `--anim-new-delay` (animations.css) attend la même durée. */
const SHIFT_MS = 320;
import { t } from '../../lib/i18n.js';
import { isAdultBlurred } from '../../lib/adultContent.js';

export interface GamesGridItem {
  id: string;
  data: any;
}

export interface GamesGridProps {
  games: GamesGridItem[];
  runningGames: Set<string>;
  focusedGameId: string | null;
  blurAdultContent: boolean;
  revealedGames: Set<string>;
  /** Jeux qui viennent d'arriver dans la bibliothèque (hooks/useNewGames). */
  newGameIds?: Set<string>;
  /** Change à chaque retour depuis la page d'un jeu : la cascade est rejouée sur les jaquettes visibles. */
  replayToken?: number;
  getWorkImageSrc: (gameId: string) => string;
  onOpenInfo: (gameId: string) => void;
  onReveal: (gameId: string) => void;
  onFocusGame: (gameId: string) => void;
}

export default function GamesGrid({
  games,
  runningGames,
  focusedGameId,
  blurAdultContent,
  revealedGames,
  newGameIds,
  replayToken = 0,
  getWorkImageSrc,
  onOpenInfo,
  onReveal,
  onFocusGame
}: GamesGridProps) {
  const staggered = useRef(false);
  useEffect(() => {
    staggered.current = true;
  }, []);

  // Retour depuis la page d'un jeu : la cascade est rejouée sans remonter la
  // grille (le défilement reste). Le rang se compte sur les jaquettes visibles —
  // celui du montage vaut pour le haut de la grille, pas pour l'endroit où l'on
  // revient. Classe retirée puis remise (reflow entre les deux) : l'animation repart.
  const gridRef = useRef<HTMLDivElement>(null);
  const lastReplay = useRef(replayToken);
  useLayoutEffect(() => {
    if (replayToken === lastReplay.current) return;
    lastReplay.current = replayToken;
    const grid = gridRef.current;
    if (!grid) return;
    let rank = 0;
    for (const card of Array.from(grid.children) as HTMLElement[]) {
      const rect = card.getBoundingClientRect();
      const visible = rect.bottom > 0 && rect.top < window.innerHeight;
      card.style.setProperty('--anim-back-i', String(visible ? Math.min(rank++, MAX_STAGGER) : 0));
    }
    grid.classList.remove('anim-cascade-replay');
    void grid.offsetWidth;
    grid.classList.add('anim-cascade-replay');
  }, [replayToken]);

  // Nouveau jeu inséré entre deux jaquettes : celles qu'il pousse glissent de
  // leur ancienne place à la nouvelle (FLIP), puis il apparaît avec son halo
  // (card-new, retardé d'autant). Places lues à chaque rendu par offsetLeft/Top :
  // insensibles au défilement et aux transformations (survol, animation en cours).
  // Seule l'arrivée d'un jeu fait glisser — pas un tri, un filtre ou un
  // redimensionnement. Animation par script : l'option « Animations » est
  // vérifiée ici, le CSS ne la couperait pas.
  const positions = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const cards = gridRef.current ? (Array.from(gridRef.current.children) as HTMLElement[]) : [];
    const previous = positions.current;
    const next = new Map<string, { x: number; y: number }>();
    for (const card of cards) {
      const id = card.dataset.gameId;
      if (id) next.set(id, { x: card.offsetLeft, y: card.offsetTop });
    }
    positions.current = next;
    if (previous.size === 0 || !newGameIds || newGameIds.size === 0 || !animationsEnabled()) return;
    const arrived = [...next.keys()].some(id => !previous.has(id) && newGameIds.has(id));
    if (!arrived) return;
    const screen = window.innerHeight;
    for (const card of cards) {
      const before = previous.get(card.dataset.gameId ?? '');
      const after = next.get(card.dataset.gameId ?? '');
      if (!before || !after) continue;
      const dx = before.x - after.x;
      const dy = before.y - after.y;
      if (dx === 0 && dy === 0) continue;
      // Loin de l'écran : rien à voir, rien à animer.
      const rect = card.getBoundingClientRect();
      if (rect.bottom < -screen || rect.top > 2 * screen) continue;
      card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
        duration: SHIFT_MS,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
      });
    }
  });

  if (games.length === 0) {
    return <div className="py-16 text-center text-text-muted">{t('Aucune œuvre ne correspond à ces filtres.')}</div>;
  }

  return (
    // data-games-grid : repère utilisé par useKeyboardNavigation pour mesurer
    // le nombre de colonnes (navigation haut/bas dans la grille).
    <div ref={gridRef} data-games-grid className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
      {games.map(({ id, data }, index) => (
        <GameCard
          key={id}
          // Cascade à l'affichage de la grille seulement : une jaquette arrivée
          // ensuite (scan, import) apparaît tout de suite, sans attendre son rang.
          enterIndex={staggered.current ? 0 : Math.min(index, MAX_STAGGER)}
          isNew={newGameIds?.has(id) ?? false}
          gameId={id}
          gameData={data}
          imageSrc={getWorkImageSrc(id)}
          isRunning={runningGames.has(id)}
          isFocused={focusedGameId === id}
          isBlurred={isAdultBlurred(data.age_category, blurAdultContent, revealedGames.has(id))}
          onOpenInfo={onOpenInfo}
          onReveal={onReveal}
          onFocusGame={onFocusGame}
        />
      ))}
    </div>
  );
}
