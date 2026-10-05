import { useEffect, useRef, type ReactNode } from 'react';
import { CircleCheck, ExternalLink, FolderOpen, Pencil, Play } from 'lucide-react';
import Carousel from '../Carousel/Carousel';
import RatingStars from '../RatingStars/RatingStars';
import CustomTagsEditor from '../CustomTagsEditor/CustomTagsEditor';
import CollectionsEditor from '../CollectionsEditor/CollectionsEditor';
import GameToolsSection from '../GameToolsSection/GameToolsSection';
import WorkspaceSection from '../WorkspaceSection/WorkspaceSection';
import CaptureGallery from '../CaptureGallery/CaptureGallery';
import LaunchArgumentsInput from '../LaunchArgumentsInput/LaunchArgumentsInput';
import PlatformIcons from '../PlatformIcons/PlatformIcons';
import type { OsPlatform } from '../../../../shared/platforms';
import { useDiskUsage } from '../../hooks/useDiskUsage';
import { formatBytes } from '../../lib/diskUsage.js';
import { categoryLabel, workLanguageLabel } from '../../lib/metadataManager.js';
import { formatLastPlayed, formatPlayTime, formatSessionDuration } from '../../lib/timeFormatter.js';
import type { GenreNames } from '../../lib/genreNames.js';
import { creatorValues, type CreatorField, type CreatorFilter } from '../../lib/filterManager.js';
import { gameCollectionIds, isInCollectionByRulesOnly, toggleGameCollection, type GameCollection } from '../../lib/collections.js';
import type { PlaySession } from '../../../../shared/ipc-types';
import { t, uiLocale } from '../../lib/i18n.js';

// Sessions affichées sur la page du jeu (l'historique complet reste en cache).
const RECENT_SESSIONS = 5;

export interface GameInfoDetailsProps {
  gameId: string;
  gameData: any;
  /** Plateformes dont une version est dans le dossier du jeu. */
  platforms: OsPlatform[];
  carouselIndex: number;
  onCarouselIndexChange: (index: number) => void;
  getWorkImageSrc: (gameId: string) => string;
  getSampleImageSrc: (gameId: string, index: number) => string;
  onLaunch: (gameId: string) => void;
  isRunning: boolean;
  isAnyGameRunning: boolean;
  onUpdateGame: (gameId: string, patch: Record<string, any>) => void;
  onOpenFolder: (gameId: string) => void;
  onChooseExecutable: (gameId: string) => void;
  onGenreClick: (genre: string) => void;
  /** Filtre la bibliothèque sur un cercle, un auteur, une série... */
  onCreatorClick: (filter: CreatorFilter) => void;
  onEdit: () => void;
  genreNames: GenreNames;
  collections: GameCollection[];
  /** Crée une collection ; renvoie son ID, ou null si le nom est vide ou déjà pris. */
  onCreateCollection: (name: string) => string | null;
  /** Images floutées (R18 non révélée, voir lib/adultContent.ts). */
  isBlurred: boolean;
  onReveal: (gameId: string) => void;
}

const formatDate = (dateString?: string) => (dateString && dateString !== 'N/A' ? dateString.split('T')[0] : t('Inconnue'));
const joinIfArray = (value: string[] | string | null | undefined): string =>
  Array.isArray(value) ? value.join(', ') : value || '';

/** Statistique de la barre de lancement (libellé gris en capitales + valeur). */
function PlayBarStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="section-title text-[11px]">{label}</span>
      <div className="text-[15px] font-semibold">{children}</div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="section-title m-0">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Page d'un jeu façon SteamOS : bandeau d'images en haut avec le titre en
 * surimpression, barre de lancement collante (bouton Jouer vert, temps de
 * jeu, note, actions), puis le contenu sur deux colonnes.
 */
export default function GameInfoDetails({
  gameId,
  gameData,
  platforms,
  carouselIndex,
  onCarouselIndexChange,
  getWorkImageSrc,
  getSampleImageSrc,
  onLaunch,
  isRunning,
  isAnyGameRunning,
  onUpdateGame,
  onOpenFolder,
  onChooseExecutable,
  onGenreClick,
  onCreatorClick,
  onEdit,
  genreNames,
  collections,
  onCreateCollection,
  isBlurred,
  onReveal
}: GameInfoDetailsProps) {
  // Taille du dossier : en cache, sinon mesurée en tâche de fond.
  const { report: diskReport } = useDiskUsage([gameId]);
  const diskBytes = diskReport?.games[gameId]?.bytes;
  const sampleImages: any[] = gameData.sample_images || [];
  const rawGenres: string[] = Array.isArray(gameData.genre) ? gameData.genre : [];
  const genres: string[] = Array.from(new Set(rawGenres.map(genreNames.canonical)));
  const category = gameData.category ? categoryLabel(gameData.category) : t('Inconnu');
  const options: string[] = Array.isArray(gameData.options) ? gameData.options : [];
  const circle: string | null =
 typeof gameData.circle === 'string' && gameData.circle ? gameData.circle : null;
  const creator = circle || joinIfArray(gameData.author) || t('Créateur non disponible');
  const collectionIds = gameCollectionIds(gameData);
  const ruleCollectionIds = collections.filter(c => isInCollectionByRulesOnly(gameData, c, genreNames)).map(c => c.id);
  const sessions: PlaySession[] = Array.isArray(gameData.playSessions) ? gameData.playSessions : [];
  const recentSessions = sessions.slice(-RECENT_SESSIONS).reverse();
  const customTags: string[] = gameData.customTags || [];
  const totalImages = 1 + sampleImages.length;
  const playDisabled = isAnyGameRunning && !isRunning;
  const ageCategory: string | undefined = gameData.age_category;
  const playButtonRef = useRef<HTMLButtonElement>(null);

  // Comme sur SteamOS, la page s'ouvre focalisée sur Jouer : A / Entrée lance.
  // Un effet (et non autoFocus) pour passer après celui de la jaquette.
  useEffect(() => {
    playButtonRef.current?.focus({ preventScroll: true });
  }, [gameId]);

  // `field` : valeurs cliquables, qui filtrent la bibliothèque sur ce nom.
  const allDetailFields: { label: string; field?: CreatorField; value?: any }[] = [
    { label: t('Auteur'), field: 'author' },
    { label: t('Voix'), field: 'voice_actor' },
    { label: t('Marque'), field: 'brand' },
    { label: t('Éditeur'), field: 'publisher' },
    { label: t('Label'), field: 'label' },
    { label: t('Taille du fichier'), value: gameData.file_size },
    { label: t('Langue'), value: (Array.isArray(gameData.language) ? gameData.language : gameData.language ? [gameData.language] : []).map(workLanguageLabel).join(', ') },
    { label: t('Série'), field: 'series' },
    { label: t('Nombre de pages'), value: gameData.page_count },
    { label: t('Scénariste'), field: 'writer' },
    { label: t('Scénario'), field: 'scenario' },
    { label: t('Illustration'), field: 'illustration' },
    { label: t('Musique'), field: 'music' },
    { label: t('Événements'), value: joinIfArray(gameData.event) }
  ];
  const detailFields = allDetailFields.filter(f => (f.field ? creatorValues(gameData, f.field).length > 0 : f.value && f.value !== 'N/A'));


  return (
    <div className="flex flex-col">
      <div className="relative h-[46vh] min-h-[280px] flex-shrink-0">
        <Carousel
          workImageSrc={getWorkImageSrc(gameId)}
          sampleSrcs={sampleImages.map((_, i) => getSampleImageSrc(gameId, i + 1))}
          activeIndex={carouselIndex}
          onPrev={() => onCarouselIndexChange((carouselIndex - 1 + totalImages) % totalImages)}
          onNext={() => onCarouselIndexChange((carouselIndex + 1) % totalImages)}
          onSelect={onCarouselIndexChange}
          blurred={isBlurred}
          onReveal={() => onReveal(gameId)}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />
        <div className="pointer-events-none absolute bottom-5 left-8 right-8 [text-shadow:0_2px_12px_rgba(0,0,0,0.85)]">
          {circle ? (
            <button
              type="button"
              onClick={() => onCreatorClick({ field: 'circle', value: circle, makerId: gameData.maker_id, otherNames: [gameData.circle_en] })}
              title={t('Voir les œuvres de ce cercle')}
              className="section-title pointer-events-auto text-text-secondary hover:text-text hover:underline"
            >
              {circle}
            </button>
          ) : (
            <div className="section-title text-text-secondary">{creator}</div>
          )}
          <h1 className="mb-2 mt-1 max-w-[900px] text-[32px] font-extrabold">{gameData.work_name || t('Nom non disponible')}</h1>
          <div className="flex flex-wrap gap-1.5 [text-shadow:none]">
            <span className="tag bg-black/50">{category}</span>
            {(ageCategory === 'R15' || ageCategory === 'R18') && <span className="tag bg-black/50 font-bold text-white">{ageCategory}</span>}
            {options.includes('AIG') && <span className="tag bg-black/50">{t('Généré par IA')}</span>}
            {options.includes('AIP') && <span className="tag bg-black/50">{t('IA en partie')}</span>}
            {options.includes('TRI') && <span className="tag bg-black/50">{t("Version d'essai")}</span>}
            <PlatformIcons platforms={platforms} />
            <span className="tag bg-black/50 font-mono text-text-muted">{gameId}</span>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-8 border-b border-divider bg-bg/85 px-8 py-4 backdrop-blur-md">
        <button
          ref={playButtonRef}
          data-nav-default
          type="button"
          onClick={() => onLaunch(gameId)}
          disabled={playDisabled}
          className={`btn btn-play ${isRunning ? 'is-running' : ''}`}
        >
          {!isRunning && <Play size={18} strokeWidth={0} fill="currentColor" />}
          {isRunning ? t('En cours') : t('Jouer')}
        </button>

        <PlayBarStat label={t('Temps de jeu')}>{formatPlayTime(gameData.totalPlayTime || 0) || '—'}</PlayBarStat>
        <PlayBarStat label={t('Dernière session')}>{formatLastPlayed(gameData.lastPlayed) || t('Jamais')}</PlayBarStat>
        <PlayBarStat label={t('Sortie')}>{formatDate(gameData.release_date)}</PlayBarStat>
        <PlayBarStat label={t('Sur le disque')}>{diskBytes !== undefined ? formatBytes(diskBytes) : '…'}</PlayBarStat>
        <PlayBarStat label={t('Ma note')}>
          <RatingStars value={gameData.rating || 0} onChange={val => onUpdateGame(gameId, { rating: val })} size={17} />
        </PlayBarStat>

        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onEdit} className="btn btn-icon" title={t('Modifier la fiche')} aria-label={t('Modifier la fiche')}>
            <Pencil size={17} strokeWidth={2.25} />
          </button>
          <button type="button" onClick={() => onOpenFolder(gameId)} className="btn btn-icon" title={t('Ouvrir le dossier')} aria-label={t('Ouvrir le dossier')}>
            <FolderOpen size={17} strokeWidth={2.25} />
          </button>
          <a
            href={`https://www.dlsite.com/maniax/work/=/product_id/${gameId}.html`}
            onClick={e => {
              e.preventDefault();
              window.electronAPI.openExternal(e.currentTarget.href);
            }}
            className="btn btn-icon"
            title={t('Voir sur DLsite')}
            aria-label={t('Voir sur DLsite')}
          >
            <ExternalLink size={17} strokeWidth={2.25} />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-5 px-8 py-6">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title={t('À propos')}>
            {gameData.description ? (
              <p className="m-0 whitespace-pre-line text-[14px] leading-relaxed text-text-secondary">{gameData.description}</p>
            ) : (
              <p className="m-0 text-text-muted">{t('Aucune description.')}</p>
            )}
            {genres.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {genres.map(genre => (
                  <button key={genre} type="button" onClick={() => onGenreClick(genre)} className="tag tag-accent" title={genreNames.label(genre) === genre ? t('Filtrer la bibliothèque par ce genre') : genre}>
                    {genreNames.label(genre)}
                  </button>
                ))}
              </div>
            )}
          </Section>

          {detailFields.length > 0 && (
            <Section title={t('Informations')}>
              <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3">
                {detailFields.map(f => (
                  <div key={f.label} className="min-w-0">
                    <dt className="text-[12px] text-text-muted">{f.label}</dt>
                    <dd className="m-0 break-words text-[14px]">
                      {f.field
                        ? creatorValues(gameData, f.field).map((name, i) => (
                            <span key={name}>
                              {i > 0 && ', '}
                              <button
                                type="button"
                                onClick={() => onCreatorClick({ field: f.field!, value: name, makerId: f.field === 'brand' ? gameData.maker_id : undefined })}

                                title={t('Voir les œuvres liées à {name}', { name })}
                                className="text-left text-accent hover:underline"
                              >
                                {name}
                              </button>
                            </span>
                          ))
                        : f.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          <Section title={t('Mes travaux')}>
            <WorkspaceSection gameId={gameId} />
          </Section>
        </div>


        <div className="flex flex-col gap-5">
          <Section
            title={t('Mes tags')}
            action={
              <button
                type="button"
                onClick={() => onUpdateGame(gameId, { completed: !gameData.completed })}
                aria-pressed={Boolean(gameData.completed)}
                title={gameData.completed ? t('Marqué comme fini — cliquer pour annuler') : t('Marquer comme fini')}
                className={`btn py-1 text-[13px] ${gameData.completed ? '!bg-play !text-white' : 'btn-ghost'}`}
              >
                <CircleCheck size={15} strokeWidth={2.25} />
                {t('Fini')}
              </button>
            }
          >
            <CustomTagsEditor
              tags={customTags}
              onAddTag={tag => onUpdateGame(gameId, { customTags: [...customTags, tag] })}
              onRemoveTag={tag => onUpdateGame(gameId, { customTags: customTags.filter(t => t !== tag) })}
            />
          </Section>

          <Section title={t('Collections')}>
            <CollectionsEditor
              collections={collections}
              selectedIds={collectionIds}
              ruleIds={ruleCollectionIds}
              onToggle={id => onUpdateGame(gameId, { collections: toggleGameCollection(gameData, id) })}
              onCreate={name => {
                const id = onCreateCollection(name);
                if (id) onUpdateGame(gameId, { collections: [...collectionIds, id] });
                return id !== null;
              }}
            />
          </Section>

          {recentSessions.length > 0 && (
            <Section title={t('Dernières sessions')}>
              <ul className="m-0 flex list-none flex-col p-0 text-[13px]">
                {recentSessions.map(session => (
                  <li key={session.start} className="flex justify-between border-b border-divider py-1.5 last:border-0">
                    <span className="text-text-secondary">
                      {new Date(session.start).toLocaleString(uiLocale(), { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                    <span className="font-semibold tabular-nums">{formatSessionDuration(session.duration)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title={t('Exécutable')}>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-[13px] text-text-secondary" title={gameData.executablePath || undefined}>
                {gameData.executablePath || t('Détection automatique')}
              </span>
              <button type="button" onClick={() => onChooseExecutable(gameId)} className="btn flex-shrink-0 text-[13px]">
                {t('Choisir…')}
              </button>
            </div>
            <label className="mt-3 block">
              <span className="mb-1 block text-[12px] text-text-secondary">{t('Arguments de lancement')}</span>
              <LaunchArgumentsInput
                value={gameData.launchArguments ?? ''}
                onSave={launchArguments => onUpdateGame(gameId, { launchArguments })}
              />
            </label>
          </Section>

          <Section title={t('Captures')}>
            <CaptureGallery gameId={gameId} limit={8} />
          </Section>

          <Section title={t('Outils')}>
            <GameToolsSection
              gameId={gameId}
              executablePath={gameData.executablePath}
              sandboxDisabled={Boolean(gameData.sandboxDisabled)}
              lastPlayed={gameData.lastPlayed}

              onSandboxDisabledChange={disabled => onUpdateGame(gameId, { sandboxDisabled: disabled })}
              textractorEnabled={Boolean(gameData.textractorEnabled)}
              onTextractorEnabledChange={enabled => onUpdateGame(gameId, { textractorEnabled: enabled })}
              localeEmulator={Boolean(gameData.localeEmulator)}
              onLocaleEmulatorChange={enabled => onUpdateGame(gameId, { localeEmulator: enabled })}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}
