import { useEffect, useMemo, useRef, useState } from 'react';
import TopNav, { type AppTab } from './components/TopNav/TopNav';
import LibraryToolbar from './components/LibraryToolbar/LibraryToolbar';
import AdvancedFilterPanel from './components/AdvancedFilterPanel/AdvancedFilterPanel';
import GamesGrid from './components/GamesGrid/GamesGrid';
import GameInfoPanel from './components/GameInfoPanel/GameInfoPanel';
import StatsScreen from './components/StatsScreen/StatsScreen';
import SettingsScreen from './components/SettingsScreen/SettingsScreen';
import PanicOverlay from './components/PanicOverlay/PanicOverlay';
import { useSettings } from './hooks/useSettings';
import { useFilters } from './hooks/useFilters';
import { useGamesLibrary } from './hooks/useGamesLibrary';
import { usePanicButton } from './hooks/usePanicButton';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { collectAllCategories, collectAllGenres } from './lib/metadataManager.js';
import { matchesFilters, compareGames } from './lib/filterManager.js';
import { collectCanonicalGenres } from './lib/genreAliases.js';
import { openGameFolder } from './lib/osHandler.js';

export default function App() {
  const { settings, save: saveSettings } = useSettings();
  const library = useGamesLibrary();
  const filters = useFilters('name_asc');
  const panicActive = usePanicButton();

  const [activeTab, setActiveTab] = useState<AppTab>('library');
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [revealedGames, setRevealedGames] = useState<Set<string>>(new Set());

  const sortSyncedRef = useRef(false);

  // Synchronise le tri sélectionné avec les paramètres sauvegardés, une seule
  // fois au chargement (les changements suivants viennent de l'utilisateur).
  useEffect(() => {
    if (settings && !sortSyncedRef.current) {
      sortSyncedRef.current = true;
      if (settings.selectedSort) {
        filters.setSelectedSort(settings.selectedSort);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // Persiste le tri dès qu'il change (après la synchronisation initiale).
  useEffect(() => {
    if (settings && sortSyncedRef.current) {
      saveSettings({ ...settings, selectedSort: filters.selectedSort });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.selectedSort]);

  // Rafraîchissement périodique du cache (dossier de jeux inchangé, mais les
  // données peuvent avoir été mises à jour en tâche de fond par un scan).
  useEffect(() => {
    if (!settings || settings.refreshRate <= 0) return;
    const intervalMs = settings.refreshRate * 60 * 1000;
    const interval = setInterval(() => {
      library.reloadCache();
    }, intervalMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.refreshRate]);

  useEffect(() => {
    setCarouselIndex(0);
  }, [selectedGameId]);

  // Les fiches des jeux absents du dossier sont conservées dans le cache (pas
  // de purge), mais seuls les jeux présents alimentent les filtres
  // et les statistiques.
  const presentGamesCache = useMemo(
    () => Object.fromEntries(library.gameFolders.filter(id => library.cache[id]).map(id => [id, library.cache[id]])),
    [library.gameFolders, library.cache]
  );

  const categories = useMemo(() => collectAllCategories(presentGamesCache), [presentGamesCache]);
  const rawGenres = useMemo(() => collectAllGenres(presentGamesCache), [presentGamesCache]);
  const genreAliasGroups = settings?.genreAliasGroups ?? [];
  const genres = useMemo(() => collectCanonicalGenres(rawGenres, genreAliasGroups), [rawGenres, genreAliasGroups]);

  const displayedGames = useMemo(() => {
    const filterState = {
      selectedCategoryCode: filters.selectedCategoryCode,
      searchTerm: filters.searchTerm.toLowerCase(),
      selectedGenres: filters.selectedGenres,
      selectedRating: filters.selectedRating,
      genreAliasGroups
    };

    return library.gameFolders
      .filter(gameId => library.cache[gameId])
      .map(gameId => ({ id: gameId, data: library.cache[gameId] }))
      .filter(game => matchesFilters(game.data, filterState))
      .sort((a, b) => compareGames(a, b, filters.selectedSort));
  }, [
    library.gameFolders,
    library.cache,
    filters.selectedCategoryCode,
    filters.searchTerm,
    filters.selectedGenres,
    filters.selectedRating,
    filters.selectedSort,
    genreAliasGroups
  ]);

  const displayedGameIds = useMemo(() => displayedGames.map(g => g.id), [displayedGames]);

  const handleResetFilters = () => {
    filters.resetFilters();
    setSelectedGameId(null);
    library.rescan();
  };

  const handleSaveSettings = async (newSettings: NonNullable<typeof settings>) => {
    await saveSettings(newSettings);
    library.rescan();
  };

  const handleReveal = (gameId: string) => {
    setRevealedGames(prev => new Set(prev).add(gameId));
  };

  useKeyboardNavigation({
    displayedGameIds,
    selectedGameId,
    isLibraryTab: activeTab === 'library',
    onSelectGame: setSelectedGameId,
    onClosePanel: () => setSelectedGameId(null),
    onLeaveTab: () => setActiveTab('library'),
    onLaunchGame: library.launch,
    onCarouselPrev: () => setCarouselIndex(i => Math.max(0, i - 1)),
    onCarouselNext: () => setCarouselIndex(i => i + 1)
  });

  return (
    <div className="flex h-screen flex-col overflow-hidden font-body">
      <TopNav activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'library' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <LibraryToolbar
            searchTerm={filters.searchTerm}
            onSearchTermChange={filters.setSearchTerm}
            selectedCategoryCode={filters.selectedCategoryCode}
            onCategoryChange={filters.setSelectedCategoryCode}
            categories={categories}
            selectedSort={filters.selectedSort}
            onSortChange={filters.setSelectedSort}
            showAdvancedFilters={showAdvancedFilters}
            onToggleAdvancedFilters={() => setShowAdvancedFilters(prev => !prev)}
            onResetFilters={handleResetFilters}
          />

          <AdvancedFilterPanel
            show={showAdvancedFilters}
            selectedRating={filters.selectedRating}
            onRatingChange={filters.setSelectedRating}
            genres={genres}
            selectedGenres={filters.selectedGenres}
            onToggleGenre={filters.toggleGenre}
            onResetGenres={() => filters.setSelectedGenres([])}
          />

          <div className="flex min-h-0 flex-1 items-start gap-[var(--space-5)] overflow-y-auto p-6">
            <div className="min-w-0 flex-1">
              {library.status === 'loading' && <p className="text-text-secondary">Chargement...</p>}
              {library.status === 'no-folder' && (
                <p className="text-text-secondary">
                  Dossier des jeux non configuré ou introuvable. Veuillez le définir dans les paramètres.
                </p>
              )}
              {library.status === 'empty' && <p className="text-text-secondary">Aucun jeu trouvé dans le dossier sélectionné.</p>}
              {library.status === 'ok' && (
                <GamesGrid
                  games={displayedGames}
                  runningGames={library.runningGames}
                  selectedGameId={selectedGameId}
                  blurAdultContent={settings?.blurAdultContent ?? true}
                  revealedGames={revealedGames}
                  getWorkImageSrc={library.getWorkImageSrc}
                  onOpenInfo={setSelectedGameId}
                  onReveal={handleReveal}
                />
              )}
            </div>

            <GameInfoPanel
              gameId={selectedGameId}
              gameData={selectedGameId ? library.cache[selectedGameId] : undefined}
              carouselIndex={carouselIndex}
              onCarouselIndexChange={setCarouselIndex}
              getWorkImageSrc={library.getWorkImageSrc}
              getSampleImageSrc={library.getSampleImageSrc}
              onClose={() => setSelectedGameId(null)}
              onLaunch={library.launch}
              isRunning={selectedGameId ? library.runningGames.has(selectedGameId) : false}
              isAnyGameRunning={library.isAnyGameRunning}
              onUpdateGame={library.updateGame}
              onReplaceGame={library.replaceGame}
              onRemoveGame={library.removeGame}
              onChooseExecutable={library.chooseExecutable}
              onOpenFolder={openGameFolder}
              onGenreClick={genre => filters.setSelectedGenres([genre])}
              onAfterRetryFetch={library.reloadCache}
              genreAliasGroups={genreAliasGroups}
            />
          </div>
        </div>
      )}

      {activeTab === 'stats' && (
        <StatsScreen cache={presentGamesCache} getWorkImageSrc={library.getWorkImageSrc} genreAliasGroups={genreAliasGroups} />
      )}

      {activeTab === 'settings' && settings && (
        <SettingsScreen settings={settings} onSave={handleSaveSettings} allGenres={rawGenres} />
      )}

      <PanicOverlay active={panicActive} />
    </div>
  );
}
