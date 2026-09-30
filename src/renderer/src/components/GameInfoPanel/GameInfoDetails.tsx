import { useEffect, useRef, type ReactNode } from 'react';
import { CircleCheck, ExternalLink, FolderOpen, Pencil, Play } from 'lucide-react';
import Carousel from '../Carousel/Carousel';
import RatingStars from '../RatingStars/RatingStars';
import CustomTagsEditor from '../CustomTagsEditor/CustomTagsEditor';
import CollectionsEditor from '../CollectionsEditor/CollectionsEditor';
import GameToolsSection from '../GameToolsSection/GameToolsSection';
import WorkspaceSection from '../WorkspaceSection/WorkspaceSection';
import { categoryMap } from '../../lib/metadataManager.js';
import { formatLastPlayed, formatPlayTime, formatSessionDuration } from '../../lib/timeFormatter.js';
import type { GenreNames } from '../../lib/genreNames.js';
import { creatorValues, type CreatorField, type CreatorFilter } from '../../lib/filterManager.js';
import { gameCollectionIds, toggleGameCollection, type GameCollection } from '../../lib/collections.js';
import type { PlaySession } from '../../../../shared/ipc-types';

// Sessions affichées sur la page du jeu (l'historique complet reste en cache).
const RECENT_SESSIONS = 5;

export interface GameInfoDetailsProps {
  gameId: string;
  gameData: any;
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
}

const formatDate = (dateString?: string) => (dateString && dateString !== 'N/A' ? dateString.split('T')[0] : 'Inconnue');
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
  onCreateCollection
}: GameInfoDetailsProps) {
  const sampleImages: any[] = gameData.sample_images || [];
  const rawGenres: string[] = Array.isArray(gameData.genre) ? gameData.genre : [];
  const genres: string[] = Array.from(new Set(rawGenres.map(genreNames.canonical)));
  const categoryLabel = gameData.category ? (categoryMap as Record<string, string>)[gameData.category] || 'Inconnu' : 'Inconnu';
  const options: string[] = Array.isArray(gameData.options) ? gameData.options : [];
  const circle: string | null =
 typeof gameData.circle === 'string' && gameData.circle ? gameData.circle : null;
  const creator = circle || joinIfArray(gameData.author) || 'Créateur non disponible';
  const collectionIds = gameCollectionIds(gameData);
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
    { label: 'Auteur', field: 'author' },
    { label: 'Voix', field: 'voice_actor' },
    { label: 'Marque', field: 'brand' },
    { label: 'Éditeur', field: 'publisher' },
    { label: 'Label', field: 'label' },
    { label: 'Taille du fichier', value: gameData.file_size },
    { label: 'Langue', value: joinIfArray(gameData.language) },
    { label: 'Série', field: 'series' },
    { label: 'Nombre de pages', value: gameData.page_count },
    { label: 'Scénariste', field: 'writer' },
    { label: 'Scénario', field: 'scenario' },
    { label: 'Illustration', field: 'illustration' },
    { label: 'Musique', field: 'music' },
    { label: 'Événements', value: joinIfArray(gameData.event) }
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
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />
        <div className="pointer-events-none absolute bottom-5 left-8 right-8 [text-shadow:0_2px_12px_rgba(0,0,0,0.85)]">
          {circle ? (
            <button
              type="button"
              onClick={() => onCreatorClick({ field: 'circle', value: circle, makerId: gameData.maker_id, otherNames: [gameData.circle_en] })}
              title="Voir les œuvres de ce cercle"
              className="section-title pointer-events-auto text-text-secondary hover:text-text hover:underline"
            >
              {circle}
            </button>
          ) : (
            <div className="section-title text-text-secondary">{creator}</div>
          )}
          <h1 className="mb-2 mt-1 max-w-[900px] text-[32px] font-extrabold">{gameData.work_name || 'Nom non disponible'}</h1>
          <div className="flex flex-wrap gap-1.5 [text-shadow:none]">
            <span className="tag bg-black/50">{categoryLabel}</span>
            {(ageCategory === 'R15' || ageCategory === 'R18') && <span className="tag bg-black/50 font-bold text-white">{ageCategory}</span>}
            {options.includes('AIG') && <span className="tag bg-black/50">Généré par IA</span>}
            {options.includes('AIP') && <span className="tag bg-black/50">IA en partie</span>}
            {options.includes('TRI') && <span className="tag bg-black/50">Version d'essai</span>}
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
          {isRunning ? 'En cours' : 'Jouer'}
        </button>

        <PlayBarStat label="Temps de jeu">{formatPlayTime(gameData.totalPlayTime || 0) || '—'}</PlayBarStat>
        <PlayBarStat label="Dernière session">{formatLastPlayed(gameData.lastPlayed) || 'Jamais'}</PlayBarStat>
        <PlayBarStat label="Sortie">{formatDate(gameData.release_date)}</PlayBarStat>
        <PlayBarStat label="Ma note">
          <RatingStars value={gameData.rating || 0} onChange={val => onUpdateGame(gameId, { rating: val })} size={17} />
        </PlayBarStat>

        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onEdit} className="btn btn-icon" title="Modifier la fiche" aria-label="Modifier la fiche">
            <Pencil size={17} strokeWidth={2.25} />
          </button>
          <button type="button" onClick={() => onOpenFolder(gameId)} className="btn btn-icon" title="Ouvrir le dossier" aria-label="Ouvrir le dossier">
            <FolderOpen size={17} strokeWidth={2.25} />
          </button>
          <a
            href={`https://www.dlsite.com/maniax/work/=/product_id/${gameId}.html`}
            onClick={e => {
              e.preventDefault();
              window.electronAPI.openExternal(e.currentTarget.href);
            }}
            className="btn btn-icon"
            title="Voir sur DLsite"
            aria-label="Voir sur DLsite"
          >
            <ExternalLink size={17} strokeWidth={2.25} />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-5 px-8 py-6">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="À propos">
            {gameData.description ? (
              <p className="m-0 whitespace-pre-line text-[14px] leading-relaxed text-text-secondary">{gameData.description}</p>
            ) : (
              <p className="m-0 text-text-muted">Aucune description.</p>
            )}
            {genres.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {genres.map(genre => (
                  <button key={genre} type="button" onClick={() => onGenreClick(genre)} className="tag tag-accent" title={genreNames.label(genre) === genre ? 'Filtrer la bibliothèque par ce genre' : genre}>
                    {genreNames.label(genre)}
                  </button>
                ))}
              </div>
            )}
          </Section>

          {detailFields.length > 0 && (
            <Section title="Informations">
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

                                title={`Voir les œuvres liées à ${name}`}
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

          <Section title="Mes travaux">
            <WorkspaceSection gameId={gameId} />
          </Section>
        </div>


        <div className="flex flex-col gap-5">
          <Section
            title="Mes tags"
            action={
              <button
                type="button"
                onClick={() => onUpdateGame(gameId, { completed: !gameData.completed })}
                aria-pressed={Boolean(gameData.completed)}
                title={gameData.completed ? 'Marqué comme fini — cliquer pour annuler' : 'Marquer comme fini'}
                className={`btn py-1 text-[13px] ${gameData.completed ? '!bg-play !text-white' : 'btn-ghost'}`}
              >
                <CircleCheck size={15} strokeWidth={2.25} />
                Fini
              </button>
            }
          >
            <CustomTagsEditor
              tags={customTags}
              onAddTag={tag => onUpdateGame(gameId, { customTags: [...customTags, tag] })}
              onRemoveTag={tag => onUpdateGame(gameId, { customTags: customTags.filter(t => t !== tag) })}
            />
          </Section>

          <Section title="Collections">
            <CollectionsEditor
              collections={collections}
              selectedIds={collectionIds}
              onToggle={id => onUpdateGame(gameId, { collections: toggleGameCollection(gameData, id) })}
              onCreate={name => {
                const id = onCreateCollection(name);
                if (id) onUpdateGame(gameId, { collections: [...collectionIds, id] });
                return id !== null;
              }}
            />
          </Section>

          {recentSessions.length > 0 && (
            <Section title="Dernières sessions">
              <ul className="m-0 flex list-none flex-col p-0 text-[13px]">
                {recentSessions.map(session => (
                  <li key={session.start} className="flex justify-between border-b border-divider py-1.5 last:border-0">
                    <span className="text-text-secondary">
                      {new Date(session.start).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                    <span className="font-semibold tabular-nums">{formatSessionDuration(session.duration)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Exécutable">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-[13px] text-text-secondary" title={gameData.executablePath || undefined}>
                {gameData.executablePath || 'Détection automatique'}
              </span>
              <button type="button" onClick={() => onChooseExecutable(gameId)} className="btn flex-shrink-0 text-[13px]">
                Choisir…
              </button>
            </div>
          </Section>

          <Section title="Outils">
            <GameToolsSection
              gameId={gameId}
              executablePath={gameData.executablePath}
              sandboxDisabled={Boolean(gameData.sandboxDisabled)}
              lastPlayed={gameData.lastPlayed}

              onSandboxDisabledChange={disabled => onUpdateGame(gameId, { sandboxDisabled: disabled })}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}
