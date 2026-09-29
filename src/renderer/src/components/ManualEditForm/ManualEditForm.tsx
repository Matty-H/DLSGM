import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import ImageManager, { type DraftImage } from '../ImageManager/ImageManager';
import Select from '../Select/Select';
import { categoryMap } from '../../lib/metadataManager.js';
import { applyImageEdit, type ImageEditSource } from '../../lib/gameImages.js';

/** Convertit une date ISO en format DDMMYYYY pour l'affichage dans le formulaire. */
function isoToDDMMYYYY(isoString?: string): string {
  if (!isoString || isoString === 'N/A') return '';
  const datePart = isoString.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length !== 3) return isoString;
  return `${parts[2]}${parts[1]}${parts[0]}`;
}

/** Convertit une chaîne DDMMYYYY en format ISO pour le stockage. */
function ddmmToISO(ddmmyyyy: string): string {
  if (!ddmmyyyy) return 'N/A';
  const clean = ddmmyyyy.replace(/\D/g, '');
  if (clean.length !== 8) return ddmmyyyy;
  const day = clean.substring(0, 2);
  const month = clean.substring(2, 4);
  const year = clean.substring(4, 8);
  return `${year}-${month}-${day}T00:00:00`;
}

export interface ManualEditFormProps {
  gameId: string;
  gameData: any;
  getWorkImageSrc: (gameId: string) => string;
  getSampleImageSrc: (gameId: string, index: number) => string;
  /** Genres existants dans la bibliothèque, proposés à la sélection. */
  allGenres: string[];
  onCancel: () => void;
  onSave: (data: any) => void;
}

let draftIdCounter = 0;
const nextDraftId = () => `draft-${++draftIdCounter}`;

export default function ManualEditForm({ gameId, gameData, getWorkImageSrc, getSampleImageSrc, allGenres, onCancel, onSave }: ManualEditFormProps) {
  const [name, setName] = useState(gameData.work_name || '');
  const [creator, setCreator] = useState(gameData.circle || gameData.author || '');
  const [releaseDate, setReleaseDate] = useState(isoToDDMMYYYY(gameData.release_date));
  const [category, setCategory] = useState(gameData.category || '');
  const [writer, setWriter] = useState(gameData.writer || '');
  const [scenario, setScenario] = useState(gameData.scenario || '');
  const [illustration, setIllustration] = useState(gameData.illustration || '');
  const [genres, setGenres] = useState<string[]>(() =>
    Array.isArray(gameData.genre) ? gameData.genre : gameData.genre ? [gameData.genre] : []
  );
  // Genres proposés : ceux de la bibliothèque, moins ceux déjà attribués.
  const genreOptions = useMemo(
    () =>
      allGenres
        .filter(g => !genres.includes(g))
        .sort((a, b) => a.localeCompare(b))
        .map(g => ({ value: g, label: g })),
    [allGenres, genres]
  );
  const genresRef = useRef<HTMLDivElement>(null);

  // Le bouton retiré disparaît : le focus passe au genre suivant (ou au
  // champ d'ajout), sinon il retomberait sur <body> et la navigation
  // clavier/manette repartirait du haut de la page.
  const removeGenre = (genre: string, index: number) => {
    setGenres(prev => prev.filter(g => g !== genre));
    requestAnimationFrame(() => {
      const buttons = genresRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)');
      if (buttons && buttons.length > 0) buttons[Math.min(index, buttons.length - 1)].focus({ preventScroll: true });
    });
  };
  const [description, setDescription] = useState(gameData.description || '');

  // Galerie : brouillon des images, appliqué seulement à l'enregistrement.
  const [cover, setCover] = useState<DraftImage | null>(() =>
    gameData.work_image ? { id: nextDraftId(), previewSrc: getWorkImageSrc(gameId), source: { keep: 0 } } : null
  );
  const [samples, setSamples] = useState<DraftImage[]>(() =>
    (Array.isArray(gameData.sample_images) ? gameData.sample_images : []).map((_: string, i: number) => ({
      id: nextDraftId(),
      previewSrc: getSampleImageSrc(gameId, i + 1),
      source: { keep: i + 1 }
    }))
  );
  const [imagesDirty, setImagesDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // URLs d'aperçu des fichiers ajoutés, libérées au démontage.
  const objectUrls = useRef<string[]>([]);
  useEffect(() => () => objectUrls.current.forEach(url => URL.revokeObjectURL(url)), []);

  const draftFromFile = (file: File): DraftImage => {
    const previewSrc = URL.createObjectURL(file);
    objectUrls.current.push(previewSrc);
    return { id: nextDraftId(), previewSrc, source: { file } };
  };

  const editImages = (change: () => void) => {
    change();
    setImagesDirty(true);
  };

  const toEditSource = async (image: DraftImage): Promise<ImageEditSource> =>
    'keep' in image.source ? { keep: image.source.keep } : { data: new Uint8Array(await image.source.file.arrayBuffer()) };

  const handleSave = async () => {
    if (isSaving) return;
    const updatedData: any = {
      ...gameData,
      work_name: name,
      circle: creator,
      author: creator,
      release_date: ddmmToISO(releaseDate),
      category,
      writer,
      scenario,
      illustration,
      genre: genres,
      description,
      fetchFailed: false,
      error: null
    };

    if (imagesDirty) {
      setIsSaving(true);
      setSaveError(null);
      try {
        const imagesPatch = await applyImageEdit(gameId, gameData, {
          cover: cover ? await toEditSource(cover) : null,
          samples: await Promise.all(samples.map(toEditSource))
        });
        Object.assign(updatedData, imagesPatch);
      } catch (error) {
        setSaveError(`Enregistrement des images impossible : ${(error as Error).message}`);
        setIsSaving(false);
        return;
      }
      setIsSaving(false);
    }

    onSave(updatedData);
  };

  const inputClass = 'input';
  const labelClass = 'text-[13px] text-text-secondary';

  return (
    <div className="panel p-6">
      <div className="relative mb-5">
        <button type="button" onClick={onCancel} aria-label="Annuler" className="btn btn-ghost btn-icon absolute right-0 top-0">
          <X size={17} strokeWidth={2.25} />
        </button>
        <div className="section-title">Modifier la fiche</div>
        <h3 className="mt-1 pr-10 font-mono">{gameId}</h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 flex flex-col gap-2">
          <label className={labelClass}>Nom du jeu</label>
          <input value={name} onChange={e => setName(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Cercle / Auteur</label>
          <input value={creator} onChange={e => setCreator(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Date de sortie (DDMMYYYY)</label>
          <input value={releaseDate} onChange={e => setReleaseDate(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Catégorie</label>
          <Select
            value={category}
            options={Object.entries(categoryMap).map(([code, catName]) => ({ value: code, label: catName as string }))}
            onChange={setCategory}
            aria-label="Catégorie"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Scénariste</label>
          <input value={writer} onChange={e => setWriter(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Scénario</label>
          <input value={scenario} onChange={e => setScenario(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Illustration</label>
          <input value={illustration} onChange={e => setIllustration(e.target.value)} className={inputClass} />
        </div>
        <div ref={genresRef} className="col-span-2 flex flex-col gap-2">
          <label className={labelClass}>Genres</label>
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {genres.map((genre, index) => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => removeGenre(genre, index)}
                  title="Retirer ce genre"
                  aria-label={`Retirer le genre ${genre}`}
                  className="tag flex items-center gap-1.5"
                >
                  {genre}
                  <X size={12} strokeWidth={2.5} />
                </button>
              ))}
            </div>
          )}
          <Select
            value=""
            options={genreOptions}
            onChange={genre => setGenres(prev => [...prev, genre])}
            placeholder={genreOptions.length > 0 ? 'Ajouter un genre…' : 'Aucun autre genre dans la bibliothèque'}
            aria-label="Ajouter un genre"
            disabled={genreOptions.length === 0}
            searchable
          />
        </div>
        <div className="col-span-2 flex flex-col gap-2">
          <label className={labelClass}>Résumé</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            className={`min-h-[120px] resize-y ${inputClass}`}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-2">
          <label className={labelClass}>Images</label>
          <ImageManager
            cover={cover}
            samples={samples}
            onSetCover={file => editImages(() => setCover(draftFromFile(file)))}
            onRemoveCover={() => editImages(() => setCover(null))}
            onReplaceSample={(index, file) =>
              editImages(() => setSamples(prev => prev.map((image, i) => (i === index ? draftFromFile(file) : image))))
            }
            onRemoveSample={index => editImages(() => setSamples(prev => prev.filter((_, i) => i !== index)))}
            onAddSamples={files => editImages(() => setSamples(prev => [...prev, ...files.map(draftFromFile)]))}
          />
        </div>
        {saveError && <p className="col-span-2 m-0 text-[13px] text-danger">{saveError}</p>}
        <div className="col-span-2 mt-2 flex justify-end gap-2">
          <button type="button" onClick={handleSave} disabled={isSaving} className="btn btn-primary min-w-[140px]">
            {isSaving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button type="button" onClick={onCancel} className="btn">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
