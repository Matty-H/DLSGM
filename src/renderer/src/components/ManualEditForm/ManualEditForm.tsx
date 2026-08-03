import { useState } from 'react';
import { categoryMap } from '../../lib/metadataManager.js';

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
  onCancel: () => void;
  onSave: (data: any) => void;
}

export default function ManualEditForm({ gameId, gameData, onCancel, onSave }: ManualEditFormProps) {
  const [name, setName] = useState(gameData.work_name || '');
  const [creator, setCreator] = useState(gameData.circle || gameData.author || '');
  const [releaseDate, setReleaseDate] = useState(isoToDDMMYYYY(gameData.release_date));
  const [category, setCategory] = useState(gameData.category || '');
  const [writer, setWriter] = useState(gameData.writer || '');
  const [scenario, setScenario] = useState(gameData.scenario || '');
  const [illustration, setIllustration] = useState(gameData.illustration || '');
  const [genresInput, setGenresInput] = useState(
    Array.isArray(gameData.genre) ? gameData.genre.join(', ') : gameData.genre || ''
  );
  const [description, setDescription] = useState(gameData.description || '');
  const [manualImagePath, setManualImagePath] = useState<string | null>(null);

  const handlePickImage = async () => {
    const filePath = await window.electronAPI.openImageDialog();
    if (filePath) setManualImagePath(filePath);
  };

  const handleSave = async () => {
    const genreArray = genresInput
      .split(',')
      .map((s: string) => s.trim())
      .filter((s: string) => s !== '');

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
      genre: genreArray,
      description,
      fetchFailed: false,
      error: null
    };

    if (manualImagePath) {
      const userDataPath = await window.electronAPI.getUserDataPath();
      const destPath = await window.electronAPI.pathJoin(userDataPath, 'img_cache', gameId, 'work_image.jpg');
      await window.electronAPI.fsCopy(manualImagePath, destPath);
      updatedData.work_image = 'manual';
    }

    onSave(updatedData);
  };

  const inputClass = 'rounded border border-border bg-bg p-2.5 text-white';
  const labelClass = 'text-sm text-text-secondary';

  return (
    <div>
      <div className="relative mb-4">
        <button
          onClick={onCancel}
          className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-danger font-bold text-white shadow-lg hover:bg-danger-hover"
        >
          ✖
        </button>
        <h3 className="text-xl font-semibold">Modifier {gameId}</h3>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Nom du jeu :</label>
          <input value={name} onChange={e => setName(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Cercle / Auteur :</label>
          <input value={creator} onChange={e => setCreator(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Date de sortie (DDMMYYYY) :</label>
          <input value={releaseDate} onChange={e => setReleaseDate(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Catégorie :</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className={inputClass}>
            {Object.entries(categoryMap).map(([code, catName]) => (
              <option key={code} value={code}>
                {catName as string}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Scénariste :</label>
          <input value={writer} onChange={e => setWriter(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Scénario :</label>
          <input value={scenario} onChange={e => setScenario(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Illustration :</label>
          <input value={illustration} onChange={e => setIllustration(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Genres (séparés par des virgules) :</label>
          <input value={genresInput} onChange={e => setGenresInput(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Résumé :</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            className={`min-h-[100px] resize-y font-sans ${inputClass}`}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Image de couverture :</label>
          <div className="flex items-center gap-3">
            <button onClick={handlePickImage} className="rounded border border-border bg-surface-hover px-3 py-1.5 text-sm text-white">
              Choisir une image
            </button>
            <span className="text-xs text-text-secondary">{manualImagePath ? 'Image sélectionnée' : 'Par défaut'}</span>
          </div>
        </div>
        <div className="mt-2.5 flex gap-3">
          <button onClick={handleSave} className="flex-1 rounded bg-primary px-5 py-2.5 text-white">
            Enregistrer
          </button>
          <button onClick={onCancel} className="rounded border border-border px-5 py-2.5 text-text-secondary">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
