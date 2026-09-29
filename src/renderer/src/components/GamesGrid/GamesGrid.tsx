import GameCard from '../GameCard/GameCard';

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
  getWorkImageSrc,
  onOpenInfo,
  onReveal,
  onFocusGame
}: GamesGridProps) {
  if (games.length === 0) {
    return <div className="py-16 text-center text-text-muted">Aucune œuvre ne correspond à ces filtres.</div>;
  }

  return (
    // data-games-grid : repère utilisé par useKeyboardNavigation pour mesurer
    // le nombre de colonnes (navigation haut/bas dans la grille).
    <div data-games-grid className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
      {games.map(({ id, data }) => (
        <GameCard
          key={id}
          gameId={id}
          gameData={data}
          imageSrc={getWorkImageSrc(id)}
          isRunning={runningGames.has(id)}
          isFocused={focusedGameId === id}
          isBlurred={data.age_category === 'R18' && blurAdultContent && !revealedGames.has(id)}
          onOpenInfo={onOpenInfo}
          onReveal={onReveal}
          onFocusGame={onFocusGame}
        />
      ))}
    </div>
  );
}
