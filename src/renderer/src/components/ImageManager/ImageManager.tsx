import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { ImagePlus, Pencil, Trash2 } from 'lucide-react';
import { PLACEHOLDER_IMAGE } from '../../lib/constants.js';
import { ACCEPTED_IMAGE_TYPES } from '../../lib/gameImages.js';

/** Image de la galerie d'édition : existante (`keep`) ou fichier ajouté, pas encore enregistré. */
export interface DraftImage {
  id: string;
  previewSrc: string;
  source: { keep: number } | { file: File };
}

export interface ImageManagerProps {
  cover: DraftImage | null;
  samples: DraftImage[];
  onSetCover: (file: File) => void;
  onRemoveCover: () => void;
  onReplaceSample: (index: number, file: File) => void;
  onRemoveSample: (index: number) => void;
  onAddSamples: (files: File[]) => void;
}

type PickTarget = { kind: 'cover' } | { kind: 'sample'; index: number } | { kind: 'add' };

/** Garde les images acceptées d'une liste de fichiers ; renvoie aussi les noms refusés. */
function splitImages(fileList: FileList | null): { images: File[]; rejected: string[] } {
  const files = Array.from(fileList ?? []);
  return {
    images: files.filter(f => ACCEPTED_IMAGE_TYPES.includes(f.type)),
    rejected: files.filter(f => !ACCEPTED_IMAGE_TYPES.includes(f.type)).map(f => f.name)
  };
}

/**
 * Zone réagissant au glisser-déposer de fichiers : met en évidence la cible
 * survolée et transmet les images déposées.
 */
function DropTarget({
  onFiles,
  className,
  children
}: {
  onFiles: (fileList: FileList) => void;
  className: string;
  children: (isOver: boolean) => ReactNode;
}) {
  const [isOver, setIsOver] = useState(false);
  // Compteur : dragenter/dragleave se déclenchent aussi en passant sur les enfants.
  const depth = useRef(0);

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  return (
    <div
      className={className}
      onDragEnter={e => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setIsOver(true);
      }}
      onDragOver={e => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        // Sinon le garde global (useFileDropGuard) repasse l'effet à "none".
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setIsOver(false);
      }}
      onDrop={e => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        depth.current = 0;
        setIsOver(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      {children(isOver)}
    </div>
  );
}

function ImageTile({
  image,
  badge,
  onReplace,
  onRemove,
  onDropFiles
}: {
  image: DraftImage;
  badge?: string;
  onReplace: () => void;
  onRemove: () => void;
  onDropFiles: (fileList: FileList) => void;
}) {
  return (
    <DropTarget onFiles={onDropFiles} className="group relative aspect-[4/3] overflow-hidden rounded-md bg-bg-deep">
      {isOver => (
        <>
          <img
            src={image.previewSrc}
            alt=""
            onError={e => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = PLACEHOLDER_IMAGE;
            }}
            className="h-full w-full object-cover"
          />
          <div className="absolute left-2 top-2 flex gap-1">
            {badge && <span className="rounded-sm bg-accent px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">{badge}</span>}
            {'file' in image.source && <span className="rounded-sm bg-black/70 px-2 py-0.5 text-[11px] font-bold">Nouvelle</span>}
          </div>
          <div
            className={`absolute inset-0 flex items-center justify-center gap-2 bg-black/60 transition-opacity ${
              isOver ? 'opacity-100' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
            }`}
          >
            {isOver ? (
              <span className="text-[13px] font-bold">Déposer pour remplacer</span>
            ) : (
              <>
                <button type="button" onClick={onReplace} className="btn btn-icon" title="Remplacer" aria-label="Remplacer l'image">
                  <Pencil size={16} strokeWidth={2.25} />
                </button>
                <button type="button" onClick={onRemove} className="btn btn-icon" title="Supprimer" aria-label="Supprimer l'image">
                  <Trash2 size={16} strokeWidth={2.25} />
                </button>
              </>
            )}
          </div>
          {isOver && <div className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-inset ring-accent" />}
        </>
      )}
    </DropTarget>
  );
}

/** Tuile vide façon placeholder : glisser-déposer ou bouton "parcourir". */
function EmptyDropTile({ label, onBrowse, onDropFiles }: { label: string; onBrowse: () => void; onDropFiles: (fileList: FileList) => void }) {
  return (
    <DropTarget onFiles={onDropFiles} className="aspect-[4/3]">
      {isOver => (
        <div
          className={`flex h-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-3 text-center transition-colors ${
            isOver ? 'border-accent bg-accent-soft text-text' : 'border-surface-3 text-text-muted'
          }`}
        >
          <ImagePlus size={26} strokeWidth={1.75} />
          <span className="text-[13px] leading-snug">
            {label}
            <br />
            ou{' '}
            <button type="button" onClick={onBrowse} className="rounded-sm font-semibold text-accent hover:underline">
              parcourir
            </button>
          </span>
        </div>
      )}
    </DropTarget>
  );
}

/**
 * Galerie d'édition des images d'une fiche : couverture et échantillons en
 * vignettes (remplacer / supprimer, ou déposer un fichier dessus pour le
 * remplacer), plus une zone de dépôt pour ajouter des échantillons. Les
 * changements restent un brouillon jusqu'à l'enregistrement du formulaire.
 */
export default function ImageManager({
  cover,
  samples,
  onSetCover,
  onRemoveCover,
  onReplaceSample,
  onRemoveSample,
  onAddSamples
}: ImageManagerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickTarget = useRef<PickTarget>({ kind: 'add' });
  const [rejected, setRejected] = useState<string[]>([]);

  const browse = (target: PickTarget) => {
    pickTarget.current = target;
    if (!inputRef.current) return;
    inputRef.current.multiple = target.kind === 'add';
    inputRef.current.click();
  };

  // Une seule image utile pour la couverture ou un remplacement ; les
  // suivantes éventuelles sont ajoutées comme échantillons.
  const handleFiles = (target: PickTarget, fileList: FileList | null) => {
    const { images, rejected: refused } = splitImages(fileList);
    setRejected(refused);
    if (images.length === 0) return;
    if (target.kind === 'add') {
      onAddSamples(images);
      return;
    }
    const [first, ...rest] = images;
    if (target.kind === 'cover') onSetCover(first);
    else onReplaceSample(target.index, first);
    if (rest.length > 0) onAddSamples(rest);
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        {cover ? (
          <ImageTile
            image={cover}
            badge="Couverture"
            onReplace={() => browse({ kind: 'cover' })}
            onRemove={onRemoveCover}
            onDropFiles={files => handleFiles({ kind: 'cover' }, files)}
          />
        ) : (
          <EmptyDropTile
            label="Glissez la couverture ici"
            onBrowse={() => browse({ kind: 'cover' })}
            onDropFiles={files => handleFiles({ kind: 'cover' }, files)}
          />
        )}

        {samples.map((image, index) => (
          <ImageTile
            key={image.id}
            image={image}
            onReplace={() => browse({ kind: 'sample', index })}
            onRemove={() => onRemoveSample(index)}
            onDropFiles={files => handleFiles({ kind: 'sample', index }, files)}
          />
        ))}

        <EmptyDropTile
          label="Glissez des images ici"
          onBrowse={() => browse({ kind: 'add' })}
          onDropFiles={files => handleFiles({ kind: 'add' }, files)}
        />
      </div>

      {rejected.length > 0 && (
        <p className="mt-2 text-[12px] text-danger">
          Ignoré (format non pris en charge — JPEG, PNG, GIF ou WebP) : {rejected.join(', ')}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={e => {
          handleFiles(pickTarget.current, e.target.files);
          // Permet de re-choisir le même fichier ensuite.
          e.target.value = '';
        }}
      />
    </div>
  );
}
