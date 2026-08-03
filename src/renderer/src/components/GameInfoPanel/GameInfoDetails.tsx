import Carousel from '../Carousel/Carousel';
import RatingStars from '../RatingStars/RatingStars';
import CustomTagsEditor from '../CustomTagsEditor/CustomTagsEditor';
import { categoryMap } from '../../lib/metadataManager.js';

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
  onUpdateGame: (gameId: string, patch: Record<string, any>) => void;
  onOpenFolder: (gameId: string) => void;
  onGenreClick: (genre: string) => void;
  onEdit: () => void;
}

const formatDate = (dateString?: string) => (dateString ? dateString.split('T')[0] : 'Inconnue');

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
  onUpdateGame,
  onOpenFolder,
  onGenreClick,
  onEdit
}: GameInfoDetailsProps) {
  const sampleImages: any[] = gameData.sample_images || [];
  const genres: string[] = Array.isArray(gameData.genre) ? gameData.genre : [];
  const categoryLabel = gameData.category ? (categoryMap as Record<string, string>)[gameData.category] || 'Inconnu' : 'Inconnu';
  const creator = gameData.circle || gameData.author || 'Créateur non disponible';
  const customTags: string[] = gameData.customTags || [];
  const totalImages = 1 + sampleImages.length;

  const fields: { label: string; value?: any }[] = [
    { label: 'Cercle', value: gameData.circle },
    { label: 'Marque', value: gameData.brand },
    { label: 'Éditeur', value: gameData.publisher },
    { label: 'Date de sortie', value: formatDate(gameData.release_date) },
    { label: 'Taille du fichier', value: gameData.file_size },
    { label: 'Langue', value: gameData.language },
    { label: 'Série', value: gameData.series },
    { label: 'Nombre de pages', value: gameData.page_count },
    { label: 'Auteur', value: gameData.author },
    { label: 'Scénariste', value: gameData.writer },
    { label: 'Scénario', value: gameData.scenario },
    { label: 'Illustration', value: gameData.illustration },
    { label: 'Doublage', value: gameData.voice_actor },
    { label: 'Musique', value: gameData.music },
    { label: 'Événements', value: Array.isArray(gameData.event) ? gameData.event.join(', ') : gameData.event }
  ];

  return (
    <div>
      <Carousel
        workImageSrc={getWorkImageSrc(gameId)}
        sampleSrcs={sampleImages.map((_, i) => getSampleImageSrc(gameId, i + 1))}
        activeIndex={carouselIndex}
        onPrev={() => onCarouselIndexChange((carouselIndex - 1 + totalImages) % totalImages)}
        onNext={() => onCarouselIndexChange((carouselIndex + 1) % totalImages)}
        onClose={onClose}
      />

      <button
        onClick={() => onLaunch(gameId)}
        className="mb-4 flex w-full items-center justify-center gap-3 rounded-app bg-success px-4 py-4 text-lg font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-success-hover active:translate-y-0"
      >
        {isRunning ? '⏳ EN COURS...' : '▶ JOUER'}
      </button>
      <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">{categoryLabel}</div>

      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-2xl font-semibold">{gameData.work_name || 'Nom non disponible'}</h3>
          <h4 className="font-normal text-text-secondary">par {creator}</h4>
        </div>
        <RatingStars value={gameData.rating || 0} onChange={val => onUpdateGame(gameId, { rating: val })} />
      </div>

      <CustomTagsEditor
        tags={customTags}
        onAddTag={tag => onUpdateGame(gameId, { customTags: [...customTags, tag] })}
        onRemoveTag={tag => onUpdateGame(gameId, { customTags: customTags.filter(t => t !== tag) })}
      />

      <div className="mt-5">
        {fields
          .filter(f => f.value && f.value !== 'N/A')
          .map(f => (
            <p key={f.label} className="mb-3 text-sm leading-relaxed">
              <strong className="font-semibold text-primary">{f.label}:</strong> {f.value}
            </p>
          ))}

        {genres.length > 0 && (
          <p className="mb-3 text-sm leading-relaxed">
            <strong className="font-semibold text-primary">Genres:</strong>{' '}
            {genres.map((genre, i) => (
              <span key={genre}>
                <span onClick={() => onGenreClick(genre)} className="cursor-pointer text-primary underline">
                  {genre}
                </span>
                {i < genres.length - 1 ? ', ' : ''}
              </span>
            ))}
          </p>
        )}

        {gameData.description && (
          <div className="mt-5 whitespace-pre-wrap border-t border-border pt-5 text-text-secondary">
            {gameData.description}
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <a
          href={`https://www.dlsite.com/maniax/work/=/product_id/${gameId}.html`}
          onClick={e => {
            e.preventDefault();
            window.electronAPI.openExternal(e.currentTarget.href);
          }}
          className="rounded-md bg-[#ff4500] px-4 py-2.5 text-sm font-semibold text-white no-underline"
        >
          Voir sur DLsite
        </a>
        <button
          onClick={() => onOpenFolder(gameId)}
          className="rounded-md bg-[#0040ff] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Ouvrir le dossier
        </button>
        <button onClick={onEdit} className="rounded-md bg-surface-hover px-4 py-2.5 text-sm font-semibold text-white">
          Modifier
        </button>
      </div>
    </div>
  );
}
