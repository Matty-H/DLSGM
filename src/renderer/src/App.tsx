import { useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header/Header';
import AdvancedFilterPanel from './components/AdvancedFilterPanel/AdvancedFilterPanel';
import GamesGrid from './components/GamesGrid/GamesGrid';
import GameInfoPanel from './components/GameInfoPanel/GameInfoPanel';
import SettingsPanel from './components/SettingsPanel/SettingsPanel';
import PanicOverlay from './components/PanicOverlay/PanicOverlay';
import { useSettings } from './hooks/useSettings';
import { useFilters } from './hooks/useFilters';
import { useGamesLibrary } from './hooks/useGamesLibrary';
import { usePanicButton } from './hooks/usePanicButton';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { collectAllCategories, collectAllGenres } from './lib/metadataManager.js';
import { matchesFilters, compareGames } from './lib/filterManager.js';
import { openGameFolder } from './lib/osHandler.js';

export default function App() {
  const { settings, save: saveSettings } = useSettings();
  const library = useGamesLibrary();
  const filters = useFilters('name_asc');
  const panicActive = usePanicButton();

  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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

  const categories = useMemo(() => collectAllCategories(library.cache), [library.cache]);
  const genres = useMemo(() => collectAllGenres(library.cache), [library.cache]);

  const displayedGames = useMemo(() => {
    const filterState = {
      selectedCategoryCode: filters.selectedCategoryCode,
      searchTerm: filters.searchTerm.toLowerCase(),
      selectedGenres: filters.selectedGenres,
      selectedRating: filters.selectedRating
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
    filters.selectedSort
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

  useKeyboardNavigation({
    displayedGameIds,
    selectedGameId,
    isSettingsOpen,
    onSelectGame: setSelectedGameId,
    onClosePanel: () => setSelectedGameId(null),
    onCloseSettings: () => setIsSettingsOpen(false),
    onLaunchGame: library.launch,
    onCarouselPrev: () => setCarouselIndex(i => Math.max(0, i - 1)),
    onCarouselNext: () => setCarouselIndex(i => i + 1)
  });

  return (
    <div className="flex h-screen flex-col overflow-hidden font-sans">
      <Header
        searchTerm={filters.searchTerm}
        onSearchTermChange={filters.setSearchTerm}
        selectedCategoryCode={filters.selectedCategoryCode}
        onCategoryChange={filters.setSelectedCategoryCode}
        categories={categories}
        showAdvancedFilters={showAdvancedFilters}
        onToggleAdvancedFilters={() => setShowAdvancedFilters(prev => !prev)}
        onResetFilters={handleResetFilters}
        onOpenSettings={() => setIsSettingsOpen(prev => !prev)}
      />

      <AdvancedFilterPanel
        show={showAdvancedFilters}
        selectedRating={filters.selectedRating}
        onRatingChange={filters.setSelectedRating}
        genres={genres}
        selectedGenres={filters.selectedGenres}
        onToggleGenre={filters.toggleGenre}
        onResetGenres={() => filters.setSelectedGenres([])}
        selectedSort={filters.selectedSort}
        onSortChange={filters.setSelectedSort}
      />

      <main className="flex flex-1 overflow-hidden">
        <section className="flex-1 overflow-y-auto p-6">
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
              isAnyGameRunning={library.isAnyGameRunning}
              selectedGameId={selectedGameId}
              getWorkImageSrc={library.getWorkImageSrc}
              onOpenInfo={setSelectedGameId}
              onLaunch={library.launch}
            />
          )}
        </section>

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
          onUpdateGame={library.updateGame}
          onReplaceGame={library.replaceGame}
          onRemoveGame={library.removeGame}
          onOpenFolder={openGameFolder}
          onGenreClick={genre => filters.setSelectedGenres([genre])}
          onAfterRetryFetch={library.reloadCache}
        />
      </main>

      {settings && (
        <SettingsPanel
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onSave={handleSaveSettings}
        />
      )}

      <PanicOverlay active={panicActive} />
    </div>
  );
}
