import Carousel from '../Carousel/Carousel';
import RatingStars from '../RatingStars/RatingStars';
import CustomTagsEditor from '../CustomTagsEditor/CustomTagsEditor';
import GameToolsSection from '../GameToolsSection/GameToolsSection';
import { categoryMap } from '../../lib/metadataManager.js';
import { formatPlayTime } from '../../lib/timeFormatter.js';
import { canonicalGenre, type GenreAliasGroups } from '../../lib/genreAliases.js';

export interface GameInfoDetailsProps {
  gameId: string;
  gameData: any;
  carouselIndex: number;
  onCarouselIndexChange: (index: number) => void;
  getWorkImageSrc: (gameId: string) => string;
  getSampleImageSrc: (gameId: string, index: number) => string;
  onClose: () => void;
  onLaunch: (gameId: string) => void;
  isRunning: boolean;
  isAnyGameRunning: boolean;
  onUpdateGame: (gameId: string, patch: Record<string, any>) => void;
  onOpenFolder: (gameId: string) => void;
  onChooseExecutable: (gameId: string) => void;
  onGenreClick: (genre: string) => void;
  onEdit: () => void;
  genreAliasGroups: GenreAliasGroups;
}

const formatDate = (dateString?: string) => (dateString && dateString !== 'N/A' ? dateString.split('T')[0] : 'Inconnue');
const joinIfArray = (value: string[] | string | null | undefined): string =>
  Array.isArray(value) ? value.join(', ') : value || '';

const META_LABEL_CLASS = 'text-[10px] uppercase tracking-wide text-text-secondary';

export default function GameInfoDetails({
  gameId,
  gameData,
  carouselIndex,
  onCarouselIndexChange,
  getWorkImageSrc,
  getSampleImageSrc,
  onClose,
  onLaunch,
  isRunning,
  isAnyGameRunning,
  onUpdateGame,
  onOpenFolder,
  onChooseExecutable,
  onGenreClick,
  onEdit,
  genreAliasGroups
}: GameInfoDetailsProps) {
  const sampleImages: any[] = gameData.sample_images || [];
  const rawGenres: string[] = Array.isArray(gameData.genre) ? gameData.genre : [];
  const genres: string[] = Array.from(new Set(rawGenres.map(g => canonicalGenre(g, genreAliasGroups))));
  const categoryLabel = gameData.category ? (categoryMap as Record<string, string>)[gameData.category] || 'Inconnu' : 'Inconnu';
  const creator = gameData.circle || gameData.author || 'Créateur non disponible';
  const customTags: string[] = gameData.customTags || [];
  const totalImages = 1 + sampleImages.length;
  const playDisabled = isAnyGameRunning && !isRunning;

  const extraFields: { label: string; value?: any }[] = [
    { label: 'Marque', value: gameData.brand },
    { label: 'Éditeur', value: gameData.publisher },
    { label: 'Taille du fichier', value: gameData.file_size },
    { label: 'Langue', value: gameData.language },
    { label: 'Série', value: gameData.series },
    { label: 'Nombre de pages', value: gameData.page_count },
    { label: 'Scénariste', value: joinIfArray(gameData.writer) },
    { label: 'Scénario', value: joinIfArray(gameData.scenario) },
    { label: 'Illustration', value: joinIfArray(gameData.illustration) },
    { label: 'Musique', value: joinIfArray(gameData.music) },
    { label: 'Événements', value: Array.isArray(gameData.event) ? gameData.event.join(', ') : gameData.event }
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="cover-frame aspect-[16/10] overflow-hidden">
        <Carousel
          workImageSrc={getWorkImageSrc(gameId)}
          sampleSrcs={sampleImages.map((_, i) => getSampleImageSrc(gameId, i + 1))}
          activeIndex={carouselIndex}
          onPrev={() => onCarouselIndexChange((carouselIndex - 1 + totalImages) % totalImages)}
          onNext={() => onCarouselIndexChange((carouselIndex + 1) % totalImages)}
          onClose={onClose}
        />
      </div>

      <div>
        <div className="card-kicker">{creator}</div>
        <div className="card-title text-[19px]">{gameData.work_name || 'Nom non disponible'}</div>

        <div className="my-2 flex flex-wrap gap-1">
          <span className="tag tag-neutral text-[10px]">{categoryLabel}</span>
          {genres.map(genre => (
            <span key={genre} onClick={() => onGenreClick(genre)} className="tag tag-accent cursor-pointer text-[10px]">
              {genre}
            </span>
          ))}
        </div>

        {gameData.description && <p className="card-body my-3">{gameData.description}</p>}

        <div className="mb-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className={META_LABEL_CLASS}>Auteur</div>
            <div>{joinIfArray(gameData.author) || '—'}</div>
          </div>
          <div>
            <div className={META_LABEL_CLASS}>Voix</div>
            <div>{joinIfArray(gameData.voice_actor) || '—'}</div>
          </div>
          <div>
            <div className={META_LABEL_CLASS}>Sortie</div>
            <div>{formatDate(gameData.release_date)}</div>
          </div>
          <div>
            <div className={META_LABEL_CLASS}>Temps de jeu</div>
            <div>{formatPlayTime(gameData.totalPlayTime || 0) || '—'}</div>
          </div>
        </div>

        <div className="mb-3">
          <div className={`${META_LABEL_CLASS} mb-1`}>Note</div>
          <RatingStars value={gameData.rating || 0} onChange={val => onUpdateGame(gameId, { rating: val })} />
        </div>

        <button type="button" onClick={() => onLaunch(gameId)} disabled={playDisabled} className="btn btn-primary btn-block blueprint">
          <i className="corner tl" />
          <i className="corner tr" />
          <i className="corner bl" />
          <i className="corner br" />
          {isRunning ? 'En cours…' : 'Lancer le jeu'}
        </button>

        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-text-secondary">
          <span className="min-w-0 truncate" title={gameData.executablePath || undefined}>
            Exécutable : {gameData.executablePath || 'détection automatique'}
          </span>
          <button type="button" onClick={() => onChooseExecutable(gameId)} className="btn btn-ghost flex-shrink-0 text-xs">
            Choisir…
          </button>
        </div>

        <CustomTagsEditor
          tags={customTags}
          onAddTag={tag => onUpdateGame(gameId, { customTags: [...customTags, tag] })}
          onRemoveTag={tag => onUpdateGame(gameId, { customTags: customTags.filter(t => t !== tag) })}
        />

        <div className="hr" />

        <GameToolsSection gameId={gameId} executablePath={gameData.executablePath} />

        <div className="hr" />

        {extraFields
          .filter(f => f.value && f.value !== 'N/A')
          .map(f => (
            <p key={f.label} className="mb-2 text-sm leading-relaxed">
              <strong className="font-semibold text-accent-700">{f.label}:</strong> {f.value}
            </p>
          ))}

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`https://www.dlsite.com/maniax/work/=/product_id/${gameId}.html`}
            onClick={e => {
              e.preventDefault();
              window.electronAPI.openExternal(e.currentTarget.href);
            }}
            className="btn btn-secondary"
          >
            Voir sur DLsite
          </a>
          <button type="button" onClick={() => onOpenFolder(gameId)} className="btn btn-secondary">
            Ouvrir le dossier
          </button>
          <button type="button" onClick={onEdit} className="btn btn-secondary">
            Modifier
          </button>
        </div>
      </div>
    </div>
  );
}
