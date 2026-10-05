import { useEffect, useMemo, useRef, useState } from 'react';
import TopNav, { TABS, type AppTab } from './components/TopNav/TopNav';
import UpdateProgressBar from './components/UpdateProgressBar/UpdateProgressBar';
import { useUpdateDownloadProgress } from './hooks/useUpdateDownloadProgress';
import LibraryToolbar from './components/LibraryToolbar/LibraryToolbar';
import AdvancedFilterPanel from './components/AdvancedFilterPanel/AdvancedFilterPanel';
import GamesGrid from './components/GamesGrid/GamesGrid';
import GameInfoPanel from './components/GameInfoPanel/GameInfoPanel';
import StatsScreen from './components/StatsScreen/StatsScreen';
import { PackagePlus, RotateCcw } from 'lucide-react';
import SettingsScreen, { type SettingsSection } from './components/SettingsScreen/SettingsScreen';
import ShareScreen from './components/ShareScreen/ShareScreen';
import HomeScreen from './components/HomeScreen/HomeScreen';
import WishlistScreen from './components/WishlistScreen/WishlistScreen';
import ImportResults from './components/ImportResults/ImportResults';
import ArchiveCleanupToast from './components/ArchiveCleanupToast/ArchiveCleanupToast';
import { useArchiveImport } from './hooks/useArchiveImport';
import ArchivePasswordDialog from './components/ArchivePasswordDialog/ArchivePasswordDialog';
import { useDiskUsage } from './hooks/useDiskUsage';
import { useGamePlatforms } from './hooks/useGamePlatforms';
import { currentPlatform, isPlayableHere } from './lib/platforms.js';
import FolderRenameAssistant from './components/FolderRenameAssistant/FolderRenameAssistant';
import { useFolderRename } from './hooks/useFolderRename';
import PanicOverlay from './components/PanicOverlay/PanicOverlay';
import Onboarding from './components/Onboarding/Onboarding';
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
import { matchesFilters, compareGames, type CreatorFilter } from './lib/filterManager.js';
import { addCollection, buildShelves, collectionFilterOptions, normalizeCollectionFilter, type Shelf } from './lib/collections.js';
import { collectCanonicalGenres, makeGenreNames } from './lib/genreNames.js';
import { useGenreTranslations } from './hooks/useGenreTranslations';
import { getPiaStatus } from './lib/vpn.js';
import { openGameFolder } from './lib/osHandler.js';
import { PAD_LABELS } from './lib/gamepadLayout.js';
import { t } from './lib/i18n.js';

export default function App() {
  const { settings, save: saveSettings } = useSettings();
  const library = useGamesLibrary();
  const filters = useFilters('name_asc');
  const panicActive = usePanicButton();
  const fullscreen = useFullscreen();
  useFileDropGuard();
  // Un jeu reçu d'un autre PC apparaît dans le dossier : rescan pour l'afficher.
  const lanShare = useLanShare({ onGameReceived: () => library.rescan() });
  // Même principe pour un jeu extrait de son archive.
  const archiveImport = useArchiveImport(library.rescan);
  // Taille des jeux présents : mesurée en tâche de fond (tri, statistiques).
  const diskUsage = useDiskUsage(library.gameFolders);
  const diskSizes = useMemo(
    () => Object.fromEntries(Object.entries(diskUsage.report?.games ?? {}).map(([id, usage]) => [id, usage.bytes])),
    [diskUsage.report]
  );
  // Versions présentes dans chaque dossier (.exe, .app/.dmg, .apk) : filtre
  // « Jouable sur ce Mac » et icônes de la page du jeu.
  const gamePlatforms = useGamePlatforms(library.gameFolders, library.status);
  const host = currentPlatform(window.electronAPI.platform);
  // Le filtre n'est proposé que sur Mac (sous Windows, presque tout est jouable).
  const playableFilterAvailable = host === 'mac';
  const playableOnly = playableFilterAvailable && (settings?.playableOnly ?? false);
  // Dossiers mal nommés (« [RJ…] Titre v1.2 ») : revus à chaque scan, renommés sur confirmation.
  const folderRename = useFolderRename(`${library.status}:${library.gameFolders.join('|')}`, library.rescan);
  // PIA installé : proposé sur les fiches en échec (restriction régionale).
  const [vpnAvailable, setVpnAvailable] = useState(false);
  useEffect(() => {
    getPiaStatus().then(status => setVpnAvailable(status.available)).catch(() => undefined);
  }, []);
  const importStatus = archiveImport.running
    ? archiveImport.progress
      ? t('Import {index}/{total}…', { index: archiveImport.progress.index, total: archiveImport.progress.total })
      : t('Import…')
    : null;

  const [activeTab, setActiveTab] = useState<AppTab>('library');
  // Onglet d'où la page de jeu a été ouverte (accueil, statistiques) : on
  // y revient en la fermant, au lieu de tomber sur la grille.
  const [returnTab, setReturnTab] = useState<AppTab | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [focusedGameId, setFocusedGameId] = useState<string | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [revealedGames, setRevealedGames] = useState<Set<string>>(new Set());
  const updateProgress = useUpdateDownloadProgress();

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

  useEffect(() => {
    if (activeTab !== 'library') setReturnTab(null);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'settings') setSettingsTarget(null);
  }, [activeTab]);

  // Les fiches des jeux absents du dossier sont conservées dans le cache (pas
  // de purge), mais seuls les jeux présents alimentent les filtres
  // et les statistiques.
  const presentGamesCache = useMemo(
    () => Object.fromEntries(library.gameFolders.filter(id => library.cache[id]).map(id => [id, library.cache[id]])),
    [library.gameFolders, library.cache]
  );

  const categories = useMemo(() => collectAllCategories(presentGamesCache), [presentGamesCache]);
  const rawGenres = useMemo(() => collectAllGenres(presentGamesCache), [presentGamesCache]);
  // Tags : clé japonaise (référence), affichés selon la langue choisie.
  const genreTranslations = useGenreTranslations(library.cache);
  const displayLanguage = settings?.language ?? 'ja_JP';
  const genreNames = useMemo(
    () => makeGenreNames(genreTranslations.translations, displayLanguage),
    [genreTranslations.translations, displayLanguage]
  );
  const genres = useMemo(() => collectCanonicalGenres(rawGenres, genreNames), [rawGenres, genreNames]);

  const collections = useMemo(() => settings?.collections ?? [], [settings?.collections]);
  // Une collection supprimée depuis les paramètres ne doit pas laisser un filtre fantôme.
  const collectionFilter = normalizeCollectionFilter(filters.collectionFilter, collections);
  const collectionOptions = useMemo(() => collectionFilterOptions(collections), [collections]);

  const presentGames = useMemo(
    () => library.gameFolders.filter(id => library.cache[id]).map(id => ({ id, data: library.cache[id] })),
    [library.gameFolders, library.cache]
  );
  const homeShelves = settings?.homeShelves;
  const shelves = useMemo(
    () => buildShelves(presentGames, collections, { genreNames, prefs: homeShelves }),
    [presentGames, collections, genreNames, homeShelves]
  );
  // Paramètres ouverts sur une collection précise (lien d'une étagère vide de l'accueil).
  const [settingsTarget, setSettingsTarget] = useState<{ section: SettingsSection; collectionId: string | null } | null>(null);

  const displayedGames = useMemo(() => {
    const filterState = {
      selectedCategoryCode: filters.selectedCategoryCode,
      searchTerm: filters.searchTerm.toLowerCase(),
      selectedGenres: filters.selectedGenres,
      selectedRating: filters.selectedRating,
      genreNames,
      creatorFilter: filters.creatorFilter,
      collectionFilter,
      collections,
      hideCompleted: settings?.hideCompleted ?? false
    };

    return presentGames
      .filter(game => !playableOnly || isPlayableHere(gamePlatforms[game.id], host))
      .filter(game => matchesFilters(game.data, filterState))
      .sort((a, b) => compareGames(a, b, filters.selectedSort, diskSizes));
  }, [
    presentGames,
    filters.selectedCategoryCode,
    filters.searchTerm,
    filters.selectedGenres,
    filters.selectedRating,
    filters.selectedSort,
    diskSizes,
    filters.creatorFilter,
    collectionFilter,
    collections,
    settings?.hideCompleted,
    genreNames,
    playableOnly,
    gamePlatforms,
    host
  ]);

  const displayedGameIds = useMemo(() => displayedGames.map(g => g.id), [displayedGames]);

  const shareableGames = useMemo(
    () =>
      library.gameFolders.map(id => ({
        id,
        name: (library.cache[id]?.work_name as string | undefined) || id,
        isAdult: library.cache[id]?.age_category === 'R18'
      })),
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

  /** Ouvre la page d'un jeu depuis un autre onglet, qui redeviendra l'onglet actif à sa fermeture. */
  const handleOpenGameFrom = (tab: AppTab, gameId: string) => {
    setActiveTab('library');
    handleOpenGame(gameId);
    setReturnTab(tab);
  };

  // Au retour à la grille, le focus revient sur la jaquette du jeu quitté
  // (sinon il retombe sur <body> et la navigation repart du début).
  const handleCloseGame = () => {
    const gameId = selectedGameId;
    setSelectedGameId(null);
    if (returnTab) {
      setActiveTab(returnTab);
      return;
    }
    if (gameId) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-game-id="${gameId}"]`)?.focus({ preventScroll: true }));
    }
  };

  // L'onglet Bibliothèque de la barre du haut mène toujours à la grille, même
  // depuis la page d'un jeu (ouverte ici ou laissée derrière un autre onglet).
  const handleTabChange = (tab: AppTab) => {
    if (tab === 'library' && selectedGameId) {
      const gameId = selectedGameId;
      setReturnTab(null);
      setSelectedGameId(null);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-game-id="${gameId}"]`)?.focus({ preventScroll: true }));
    }
    setActiveTab(tab);
  };

  const handleReveal = (gameId: string) => {
    setRevealedGames(prev => new Set(prev).add(gameId));
  };

  /** Quitte la page de jeu vers la grille filtrée (genre, cercle...), quel que soit l'onglet d'origine. */
  const showFilteredLibrary = () => {
    setReturnTab(null);
    setSelectedGameId(null);
  };

  // "Œuvres de ce cercle" : dans toute la bibliothèque, pas dans la
  // collection ou la recherche en cours.
  const handleCreatorClick = (creator: CreatorFilter) => {
    const sort = filters.selectedSort;
    filters.resetFilters();
    filters.setSelectedSort(sort);
    filters.setCreatorFilter(creator);
    showFilteredLibrary();
  };

  const handleShowShelf = (showAll: Shelf['showAll']) => {
    filters.resetFilters();
    if (showAll.collectionFilter) filters.setCollectionFilter(showAll.collectionFilter);
    if (showAll.sort) filters.setSelectedSort(showAll.sort);
    setActiveTab('library');
  };

  /** Crée une collection (paramètres) ; renvoie son ID, ou null si le nom est vide ou déjà pris. */
  const handleCreateCollection = (name: string): string | null => {
    if (!settings) return null;
    const result = addCollection(collections, name);
    if (!result) return null;
    saveSettings({ ...settings, collections: result.collections });
    return result.created.id;
  };

  useKeyboardNavigation({
    displayedGameIds,
    selectedGameId,
    focusedGameId,
    isLibraryTab: activeTab === 'library',
    isHomeTab: activeTab === 'home',
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
          { keys: ['↑', '↓'], label: t('Parcourir') },
          { keys: [pad.south], label: t('Choisir') },
          { keys: [pad.east], label: t('Fermer') }
        ]
      : activeTab !== 'library'
        ? [
            { keys: [pad.lt, pad.rt], label: t('Onglets') },
            { keys: [pad.south], label: t('Valider') },
            { keys: [pad.east], label: t('Bibliothèque') }
          ]
        : isGamePageOpen
          ? [
              { keys: [pad.lb, pad.rb], label: t('Images') },
              { keys: [pad.south], label: t('Valider') },
              { keys: [pad.east], label: t('Retour') }
            ]
          : [
              { keys: [pad.lb, pad.rb], label: t('Catégories') },
              { keys: [pad.lt, pad.rt], label: t('Onglets') },
              { keys: [pad.north], label: t('Rechercher') },
              { keys: [pad.south], label: t('Ouvrir') }
            ]
    : activeTab !== 'library'
      ? [{ keys: [t('Échap')], label: t('Bibliothèque') }]
      : isGamePageOpen
        ? [
            { keys: ['←', '→'], label: t('Images') },
            { keys: [t('Entrée')], label: t('Jouer') },
            { keys: [t('Échap')], label: t('Retour') }
          ]
        : [
            { keys: ['←', '↑', '↓', '→'], label: t('Naviguer') },
            { keys: [t('Entrée')], label: t('Ouvrir') }
          ];
  footerHints.push(
    pad ? { keys: [pad.view], label: t('Plein écran') } : { keys: ['F11'], label: t('Plein écran') },
    { keys: ['Alt', t('Espace')], label: t("Masquer l'application") }
  );

  return (
    <div className="flex h-screen flex-col overflow-clip font-body">
      <TopNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
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
            resultCount={displayedGames.length}
            collectionFilter={collectionFilter}
            collectionOptions={collectionOptions}
            onCollectionFilterChange={filters.setCollectionFilter}
            creatorFilter={filters.creatorFilter}
            onClearCreatorFilter={() => filters.setCreatorFilter(null)}
            hideCompleted={settings?.hideCompleted ?? false}
            onHideCompletedChange={hideCompleted => settings && saveSettings({ ...settings, hideCompleted })}
            playableOnly={playableFilterAvailable ? playableOnly : null}
            onPlayableOnlyChange={value => settings && saveSettings({ ...settings, playableOnly: value })}
          />

          {archiveImport.results && (
            <ImportResults
              results={archiveImport.results}
              onDismiss={archiveImport.dismiss}
              onOpenGame={handleOpenGame}
              onAskPassword={archiveImport.askPassword}
            />
          )}
          {archiveImport.passwordPrompt?.retryId && !panicActive && (
            <ArchivePasswordDialog
              file={archiveImport.passwordPrompt.file}
              wrongPassword={archiveImport.passwordPrompt.wrongPassword === true}
              busy={archiveImport.running}
              onSubmit={(password, remember) => archiveImport.retry(archiveImport.passwordPrompt!.retryId!, password, remember)}
              onSkip={() => archiveImport.skipPassword(archiveImport.passwordPrompt!.retryId!)}
            />
          )}

          <FolderRenameAssistant
            folders={folderRename.folders}
            results={folderRename.results}
            busy={folderRename.busy}
            onRename={folderRename.rename}
            onDismiss={folderRename.dismiss}
            onDismissResults={folderRename.dismissResults}
          />


          <AdvancedFilterPanel
            show={showAdvancedFilters}
            selectedRating={filters.selectedRating}
            onRatingChange={filters.setSelectedRating}
            genres={genres}
            selectedGenres={filters.selectedGenres}
            onToggleGenre={filters.toggleGenre}
            onResetGenres={() => filters.setSelectedGenres([])}
            genreLabel={genreNames.label}
          />

          <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-2">
            {library.status === 'loading' && <p className="text-text-secondary">{t('Chargement…')}</p>}
            {library.status === 'no-folder' && (
              <p className="text-text-secondary">
                {t('Dossier des jeux non configuré ou introuvable. Veuillez le définir dans les paramètres.')}
              </p>
            )}
            {library.status === 'empty' && <p className="text-text-secondary">{t('Aucun jeu trouvé dans le dossier sélectionné.')}</p>}
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
            platforms={selectedGameId ? gamePlatforms[selectedGameId] : undefined}
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
              showFilteredLibrary();
            }}
            onCreatorClick={handleCreatorClick}
            onAfterRetryFetch={library.reloadCache}
            genreNames={genreNames}
            allGenres={rawGenres}
            collections={collections}
            onCreateCollection={handleCreateCollection}
            vpnAvailable={vpnAvailable}
            blurAdultContent={settings?.blurAdultContent ?? true}
            revealedGames={revealedGames}
            onReveal={handleReveal}
          />
        </div>
      )}

      {activeTab === 'home' && (
        <HomeScreen
          shelves={shelves}
          isLibraryEmpty={library.status !== 'loading' && presentGames.length === 0}
          runningGames={library.runningGames}
          blurAdultContent={settings?.blurAdultContent ?? true}
          revealedGames={revealedGames}
          getWorkImageSrc={library.getWorkImageSrc}
          onOpenGame={gameId => handleOpenGameFrom('home', gameId)}
          onReveal={handleReveal}
          onShowAll={handleShowShelf}
          onEditCollection={collectionId => {
            setSettingsTarget({ section: 'collections', collectionId });
            setActiveTab('settings');
          }}
        />
      )}

      {activeTab === 'wishlist' && (
        <WishlistScreen gameFolders={library.gameFolders} blurAdultContent={settings?.blurAdultContent ?? true} />
      )}

      {activeTab === 'stats' && (

        <StatsScreen
          cache={presentGamesCache}
          getWorkImageSrc={library.getWorkImageSrc}
          genreNames={genreNames}
          diskUsage={diskUsage.report}
          onRecomputeSizes={diskUsage.recompute}
          onOpenGame={gameId => handleOpenGameFrom('stats', gameId)}
          blurAdultContent={settings?.blurAdultContent ?? true}
          revealedGames={revealedGames}

        />
      )}

      {activeTab === 'share' && settings && (
        <ShareScreen
          share={lanShare}
          games={shareableGames}
          port={settings.lanSharePort}
          onPortChange={lanSharePort => saveSettings({ ...settings, lanSharePort })}
          getWorkImageSrc={library.getWorkImageSrc}
          blurAdultContent={settings.blurAdultContent}

        />
      )}

      {activeTab === 'settings' && settings && (
        <SettingsScreen settings={settings} onSave={handleSaveSettings} allGenres={rawGenres} onMetadataUpdated={library.reloadCache}
          onLibraryMoved={library.rescan}
          genreTranslations={genreTranslations.translations}
          onSetGenreTranslation={genreTranslations.setTranslation}
          games={presentGames}
          genreNames={genreNames}
          onUpdateGame={library.updateGame}
          getWorkImageSrc={library.getWorkImageSrc}
          initialSection={settingsTarget?.section}
          initialCollectionId={settingsTarget?.collectionId}
        />

      )}

      <UpdateProgressBar progress={updateProgress} />
      <FooterHints
        hints={footerHints}
        actions={
          activeTab === 'library' &&
          !isGamePageOpen && (
            <>
              <button
                type="button"
                onClick={archiveImport.start}
                disabled={importStatus !== null}
                className="btn btn-ghost py-1 text-[12px]"
                title={t('Extraire des archives de jeux (.zip, .rar, .7z, .part1.exe) dans le dossier de la bibliothèque')}
              >
                <PackagePlus size={14} strokeWidth={2.25} />
                {importStatus ?? t('Importer')}
              </button>
              <button type="button" onClick={handleResetFilters} className="btn btn-ghost py-1 text-[12px]" title={t('Réinitialiser les filtres et rescanner')}>
                <RotateCcw size={14} strokeWidth={2.25} />
                {t('Réinitialiser')}
              </button>
            </>
          )
        }
      />

      {archiveImport.cleanup && !panicActive && (
        <ArchiveCleanupToast
          cleanup={archiveImport.cleanup}
          onTrash={archiveImport.trashArchives}
          onDismiss={archiveImport.dismissCleanup}
        />
      )}

      {settings?.onboardingPending === true && !panicActive && <Onboarding settings={settings} onSave={handleSaveSettings} />}

      <PanicOverlay active={panicActive} />
    </div>
  );
}
