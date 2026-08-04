import GameCard from '../GameCard/GameCard';

export interface GamesGridItem {
  id: string;
  data: any;
}

export interface GamesGridProps {
  games: GamesGridItem[];
  runningGames: Set<string>;
  selectedGameId: string | null;
  blurAdultContent: boolean;
  revealedGames: Set<string>;
  getWorkImageSrc: (gameId: string) => string;
  onOpenInfo: (gameId: string) => void;
  onReveal: (gameId: string) => void;
}

export default function GamesGrid({
  games,
  runningGames,
  selectedGameId,
  blurAdultContent,
  revealedGames,
  getWorkImageSrc,
  onOpenInfo,
  onReveal
}: GamesGridProps) {
  if (games.length === 0) {
    return <div className="py-16 text-center text-text-secondary opacity-60">Aucune œuvre ne correspond à ces filtres.</div>;
  }

  return (
    <div className="grid gap-[var(--space-4)]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
      {games.map(({ id, data }) => (
        <GameCard
          key={id}
          gameId={id}
          gameData={data}
          imageSrc={getWorkImageSrc(id)}
          isRunning={runningGames.has(id)}
          isSelected={selectedGameId === id}
          isBlurred={data.age_category === 'R18' && blurAdultContent && !revealedGames.has(id)}
          onOpenInfo={onOpenInfo}
          onReveal={onReveal}
        />
      ))}
    </div>
  );
}
