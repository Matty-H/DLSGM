import GameCard from '../GameCard/GameCard';

export interface GamesGridItem {
  id: string;
  data: any;
}

export interface GamesGridProps {
  games: GamesGridItem[];
  runningGames: Set<string>;
  isAnyGameRunning: boolean;
  selectedGameId: string | null;
  getWorkImageSrc: (gameId: string) => string;
  onOpenInfo: (gameId: string) => void;
  onLaunch: (gameId: string) => void;
}

export default function GamesGrid({
  games,
  runningGames,
  isAnyGameRunning,
  selectedGameId,
  getWorkImageSrc,
  onOpenInfo,
  onLaunch
}: GamesGridProps) {
  if (games.length === 0) {
    return <p className="text-text-secondary">Aucun jeu ne correspond aux critères de recherche.</p>;
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] items-start gap-8">
      {games.map(({ id, data }) => (
        <GameCard
          key={id}
          gameId={id}
          gameData={data}
          imageSrc={getWorkImageSrc(id)}
          isRunning={runningGames.has(id)}
          isAnyGameRunning={isAnyGameRunning}
          isSelected={selectedGameId === id}
          onOpenInfo={onOpenInfo}
          onLaunch={onLaunch}
        />
      ))}
    </div>
  );
}
