import { useEffect, useMemo, useRef, useState } from 'react';
import TopNav, { TABS, type AppTab } from './components/TopNav/TopNav';
import LibraryToolbar from './components/LibraryToolbar/LibraryToolbar';
import AdvancedFilterPanel from './components/AdvancedFilterPanel/AdvancedFilterPanel';
import GamesGrid from './components/GamesGrid/GamesGrid';
import GameInfoPanel from './components/GameInfoPanel/GameInfoPanel';
import StatsScreen from './components/StatsScreen/StatsScreen';
import SettingsScreen from './components/SettingsScreen/SettingsScreen';
import ShareScreen from './components/ShareScreen/ShareScreen';
import PanicOverlay from './components/PanicOverlay/PanicOverlay';
import FooterHints, { type FooterHint } from './components/FooterHints/FooterHints';
import { useSettings } from './hooks/useSettings';
import { useFilters } from './hooks/useFilters';
import { useGamesLibrary } from './hooks/useGamesLibrary';
import { usePanicButton } from './hooks/usePanicButton';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { useGamepadNavigation } from './hooks/useGamepadNavigation';
import { useFullscreen } from './hooks/useFullscreen';
import { useFileDropGuard } from './hooks/useFileDropGuard';
import { useLanShare } from './hooks/useLanShare';
import { collectAllCategories, collectAllGenres } from './lib/metadataManager.js';
import { matchesFilters, compareGames } from './lib/filterManager.js';
import { collectCanonicalGenres } from './lib/genreAliases.js';
import { openGameFolder } from './lib/osHandler.js';
import { PAD_LABELS } from './lib/gamepadLayout.js';

export default function App() {
  const { settings, save: saveSettings } = useSettings();
  const library = useGamesLibrary();
  const filters = useFilters('name_asc');
  const panicActive = usePanicButton();
  const fullscreen = useFullscreen();
  useFileDropGuard();
  // Un jeu reçu d'un autre PC apparaît dans le dossier : rescan pour l'afficher.
  const lanShare = useLanShare({ onGameReceived: () => library.rescan() });

  const [activeTab, setActiveTab] = useState<AppTab>('library');
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [focusedGameId, setFocusedGameId] = useState<string | null>(null);
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

  const shareableGames = useMemo(
    () => library.gameFolders.map(id => ({ id, name: (library.cache[id]?.work_name as string | undefined) || id })),
    [library.gameFolders, library.cache]
  );

  const handleResetFilters = () => {
    filters.resetFilters();
    setSelectedGameId(null);
    library.rescan();
  };

  const handleSaveSettings = async (newSettings: NonNullable<typeof settings>) => {
    await saveSettings(newSettings);
    library.rescan();
  };

  const handleOpenGame = (gameId: string) => {
    setFocusedGameId(gameId);
    setSelectedGameId(gameId);
  };

  // Au retour à la grille, le focus revient sur la jaquette du jeu quitté
  // (sinon il retombe sur <body> et la navigation repart du début).
  const handleCloseGame = () => {
    const gameId = selectedGameId;
    setSelectedGameId(null);
    if (gameId) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-game-id="${gameId}"]`)?.focus({ preventScroll: true }));
    }
  };

  const handleReveal = (gameId: string) => {
    setRevealedGames(prev => new Set(prev).add(gameId));
  };

  useKeyboardNavigation({
    displayedGameIds,
    selectedGameId,
    focusedGameId,
    isLibraryTab: activeTab === 'library',
    onFocusGame: setFocusedGameId,
    onOpenGame: handleOpenGame,
    onClosePanel: handleCloseGame,
    onLeaveTab: () => setActiveTab('library'),
    onLaunchGame: library.launch,
    onCarouselPrev: () => setCarouselIndex(i => i - 1),
    onCarouselNext: () => setCarouselIndex(i => i + 1)
  });

  const isGamePageOpen = activeTab === 'library' && selectedGameId !== null;

  const { padType, inPopup } = useGamepadNavigation({
    enabled: !panicActive,
    onBack: () => {
      if (isGamePageOpen) handleCloseGame();
      else if (activeTab !== 'library') setActiveTab('library');
    },
    // LB/RB : images sur la page d'un jeu, catégories dans la grille.
    onShoulder: delta => {
      if (isGamePageOpen) {
        setCarouselIndex(i => i + delta);
      } else if (activeTab === 'library') {
        const codes = ['all', ...categories.map(c => c.code)];
        const index = Math.max(0, codes.indexOf(filters.selectedCategoryCode));
        filters.setSelectedCategoryCode(codes[(index + delta + codes.length) % codes.length]);
      }
    },
    // LT/RT : onglets principaux.
    onTrigger: delta => {
      if (isGamePageOpen) return;
      const index = TABS.findIndex(t => t.id === activeTab);
      setActiveTab(TABS[(index + delta + TABS.length) % TABS.length].id);
    },
    onSearch: () => {
      if (isGamePageOpen) return;
      setActiveTab('library');
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-search-input]')?.focus());
    },
    onToggleFullscreen: fullscreen.toggle
  });

  // Indications du bas : boutons de manette si elle est le dernier
  // périphérique utilisé (avec les symboles de sa famille : Xbox,
  // PlayStation, Switch), raccourcis clavier sinon.
  const pad = padType ? PAD_LABELS[padType] : null;
  const footerHints: FooterHint[] = pad
    ? inPopup
      ? [
          { keys: ['↑', '↓'], label: 'Parcourir' },
          { keys: [pad.south], label: 'Choisir' },
          { keys: [pad.east], label: 'Fermer' }
        ]
      : activeTab !== 'library'
        ? [
            { keys: [pad.lt, pad.rt], label: 'Onglets' },
            { keys: [pad.south], label: 'Valider' },
            { keys: [pad.east], label: 'Bibliothèque' }
          ]
        : isGamePageOpen
          ? [
              { keys: [pad.lb, pad.rb], label: 'Images' },
              { keys: [pad.south], label: 'Valider' },
              { keys: [pad.east], label: 'Retour' }
            ]
          : [
              { keys: [pad.lb, pad.rb], label: 'Catégories' },
              { keys: [pad.lt, pad.rt], label: 'Onglets' },
              { keys: [pad.north], label: 'Rechercher' },
              { keys: [pad.south], label: 'Ouvrir' }
            ]
    : activeTab !== 'library'
      ? [{ keys: ['Échap'], label: 'Bibliothèque' }]
      : isGamePageOpen
        ? [
            { keys: ['←', '→'], label: 'Images' },
            { keys: ['Entrée'], label: 'Jouer' },
            { keys: ['Échap'], label: 'Retour' }
          ]
        : [
            { keys: ['←', '↑', '↓', '→'], label: 'Naviguer' },
            { keys: ['Entrée'], label: 'Ouvrir' }
          ];
  footerHints.push(
    pad ? { keys: [pad.view], label: 'Plein écran' } : { keys: ['F11'], label: 'Plein écran' },
    { keys: ['Alt', 'Espace'], label: "Masquer l'application" }
  );

  return (
    <div className="flex h-screen flex-col overflow-clip font-body">
      <TopNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isFullscreen={fullscreen.isFullscreen}
        onToggleFullscreen={fullscreen.toggle}
        isReceiving={lanShare.receiver?.running ?? false}
      />

      {activeTab === 'library' && (
        // overflow-clip (et non hidden) : un conteneur overflow-hidden reste
        // défilable par script, et le scrollIntoView de la jaquette ciblée le
        // décalerait, masquant le haut de la page de jeu superposée.
        <div className="relative flex min-h-0 flex-1 flex-col overflow-clip">
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
            resultCount={displayedGames.length}
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

          <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-2">
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
                focusedGameId={focusedGameId}
                blurAdultContent={settings?.blurAdultContent ?? true}
                revealedGames={revealedGames}
                getWorkImageSrc={library.getWorkImageSrc}
                onOpenInfo={handleOpenGame}
                onReveal={handleReveal}
                onFocusGame={setFocusedGameId}
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
            onClose={handleCloseGame}
            onLaunch={library.launch}
            isRunning={selectedGameId ? library.runningGames.has(selectedGameId) : false}
            isAnyGameRunning={library.isAnyGameRunning}
            onUpdateGame={library.updateGame}
            onReplaceGame={library.replaceGame}
            onRemoveGame={library.removeGame}
            onChooseExecutable={library.chooseExecutable}
            onOpenFolder={openGameFolder}
            onGenreClick={genre => {
              filters.setSelectedGenres([genre]);
              setSelectedGameId(null);
            }}
            onAfterRetryFetch={library.reloadCache}
            genreAliasGroups={genreAliasGroups}
            allGenres={rawGenres}
          />
        </div>
      )}

      {activeTab === 'stats' && (
        <StatsScreen
          cache={presentGamesCache}
          getWorkImageSrc={library.getWorkImageSrc}
          genreAliasGroups={genreAliasGroups}
          onOpenGame={gameId => {
            setActiveTab('library');
            handleOpenGame(gameId);
          }}
        />
      )}

      {activeTab === 'share' && settings && (
        <ShareScreen
          share={lanShare}
          games={shareableGames}
          port={settings.lanSharePort}
          onPortChange={lanSharePort => saveSettings({ ...settings, lanSharePort })}
        />
      )}

      {activeTab === 'settings' && settings && (
        <SettingsScreen settings={settings} onSave={handleSaveSettings} allGenres={rawGenres} />
      )}

      <FooterHints hints={footerHints} />

      <PanicOverlay active={panicActive} />
    </div>
  );
}
