import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ImageDown, ImagePlus, Pencil, Star, Trash2 } from 'lucide-react';
import { PLACEHOLDER_IMAGE } from '../../lib/constants.js';
import { ACCEPTED_IMAGE_TYPES } from '../../lib/gameImages.js';
import { t } from '../../lib/i18n.js';
import Trans from '../Trans/Trans';

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
  /** Déplace l'échantillon `from` à la position `to`. */
  onMoveSample: (from: number, to: number) => void;
  /** L'échantillon devient la couverture ; l'ancienne couverture prend sa place. */
  onMakeCover: (index: number) => void;
  /** La couverture redevient un échantillon (en tête de liste). */
  onDemoteCover: () => void;
}

type PickTarget = { kind: 'cover' } | { kind: 'sample'; index: number } | { kind: 'add' };

/** Emplacement d'une image de la galerie, transporté pendant un glisser interne. */
type Slot = 'cover' | number;

// Type de donnée propre au glisser interne, distinct des fichiers déposés
// depuis l'explorateur ('Files').
const SLOT_MIME = 'application/x-dlsgm-image-slot';

/** Garde les images acceptées d'une liste de fichiers ; renvoie aussi les noms refusés. */
function splitImages(fileList: FileList | null): { images: File[]; rejected: string[] } {
  const files = Array.from(fileList ?? []);
  return {
    images: files.filter(f => ACCEPTED_IMAGE_TYPES.includes(f.type)),
    rejected: files.filter(f => !ACCEPTED_IMAGE_TYPES.includes(f.type)).map(f => f.name)
  };
}

type DragKind = 'files' | 'slot' | null;

function dragKind(e: DragEvent): DragKind {
  const types = Array.from(e.dataTransfer.types);
  if (types.includes(SLOT_MIME)) return 'slot';
  if (types.includes('Files')) return 'files';
  return null;
}

/**
 * Zone réagissant au glisser-déposer : fichiers venant de l'explorateur, et
 * (si `onSlot` est fourni) images de la galerie déplacées en interne. Met en
 * évidence la cible survolée.
 */
function DropTarget({
  onFiles,
  onSlot,
  className,
  children
}: {
  onFiles: (fileList: FileList) => void;
  onSlot?: (from: Slot) => void;
  className: string;
  children: (over: DragKind) => ReactNode;
}) {
  const [over, setOver] = useState<DragKind>(null);
  // Compteur : dragenter/dragleave se déclenchent aussi en passant sur les enfants.
  const depth = useRef(0);

  const accepts = (e: DragEvent): DragKind => {
    const kind = dragKind(e);
    return kind === 'files' || (kind === 'slot' && onSlot) ? kind : null;
  };

  return (
    <div
      className={className}
      onDragEnter={e => {
        const kind = accepts(e);
        if (!kind) return;
        e.preventDefault();
        depth.current += 1;
        setOver(kind);
      }}
      onDragOver={e => {
        const kind = accepts(e);
        if (!kind) return;
        e.preventDefault();
        // Sinon le garde global (useFileDropGuard) repasse l'effet à "none".
        e.stopPropagation();
        e.dataTransfer.dropEffect = kind === 'slot' ? 'move' : 'copy';
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(null);
      }}
      onDrop={e => {
        const kind = accepts(e);
        if (!kind) return;
        e.preventDefault();
        e.stopPropagation();
        depth.current = 0;
        setOver(null);
        if (kind === 'files') {
          onFiles(e.dataTransfer.files);
        } else {
          const raw = e.dataTransfer.getData(SLOT_MIME);
          onSlot?.(raw === 'cover' ? 'cover' : Number(raw));
        }
      }}
    >
      {children(over)}
    </div>
  );
}

const tileButton = 'btn btn-icon !h-8 !w-8';

function ImageTile({
  image,
  slot,
  isCover,
  canMoveLeft,
  canMoveRight,
  onReplace,
  onRemove,
  onToggleCover,
  onMoveLeft,
  onMoveRight,
  onDropFiles,
  onDropSlot
}: {
  image: DraftImage;
  slot: Slot;
  isCover: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onReplace: () => void;
  onRemove: () => void;
  onToggleCover: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onDropFiles: (fileList: FileList) => void;
  onDropSlot: (from: Slot) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <DropTarget
      onFiles={onDropFiles}
      onSlot={from => from !== slot && onDropSlot(from)}
      className={`group relative aspect-[4/3] overflow-hidden rounded-md bg-bg-deep ${isDragging ? 'opacity-40' : ''}`}
    >
      {over => (
        <div
          draggable
          onDragStart={e => {
            e.dataTransfer.setData(SLOT_MIME, String(slot));
            e.dataTransfer.effectAllowed = 'move';
            setIsDragging(true);
          }}
          onDragEnd={() => setIsDragging(false)}
          className="h-full w-full cursor-grab active:cursor-grabbing"
          title={t('Glisser pour réorganiser')}
        >
          <img
            src={image.previewSrc}
            alt=""
            // Sinon Chromium glisse l'image elle-même (comme un fichier), pas la vignette.
            draggable={false}
            onError={e => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = PLACEHOLDER_IMAGE;
            }}
            className="h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute left-2 top-2 flex gap-1">
            {isCover && <span className="rounded-sm bg-accent px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">{t('Couverture')}</span>}
            {'file' in image.source && <span className="rounded-sm bg-black/70 px-2 py-0.5 text-[11px] font-bold">{t('Nouvelle')}</span>}
          </div>
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 transition-opacity ${
              over ? 'opacity-100' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
            }`}
          >
            {over === 'files' ? (
              <span className="text-[13px] font-bold">{t('Déposer pour remplacer')}</span>
            ) : over === 'slot' ? (
              <span className="text-[13px] font-bold">{isCover ? t('Définir comme couverture') : t('Déplacer ici')}</span>
            ) : (
              <>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={onToggleCover}
                    className={tileButton}
                    title={isCover ? t('Remettre parmi les images') : t('Définir comme couverture')}
                    aria-label={isCover ? t('Remettre la couverture parmi les images') : t("Définir l'image comme couverture")}
                  >
                    {isCover ? <ImageDown size={15} strokeWidth={2.25} /> : <Star size={15} strokeWidth={2.25} />}
                  </button>
                  <button type="button" onClick={onReplace} className={tileButton} title={t('Remplacer')} aria-label={t("Remplacer l'image")}>
                    <Pencil size={15} strokeWidth={2.25} />
                  </button>
                  <button type="button" onClick={onRemove} className={tileButton} title={t('Supprimer')} aria-label={t("Supprimer l'image")}>
                    <Trash2 size={15} strokeWidth={2.25} />
                  </button>
                </div>
                {!isCover && (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={onMoveLeft}
                      disabled={!canMoveLeft}
                      className={tileButton}
                      title={t('Déplacer avant')}
                      aria-label={t("Déplacer l'image avant")}
                    >
                      <ChevronLeft size={16} strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      onClick={onMoveRight}
                      disabled={!canMoveRight}
                      className={tileButton}
                      title={t('Déplacer après')}
                      aria-label={t("Déplacer l'image après")}
                    >
                      <ChevronRight size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          {over && <div className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-inset ring-accent" />}
        </div>
      )}
    </DropTarget>
  );
}

/** Tuile vide façon placeholder : glisser-déposer ou bouton "parcourir". */
function EmptyDropTile({
  label,
  slotLabel,
  onBrowse,
  onDropFiles,
  onDropSlot
}: {
  label: string;
  /** Texte au survol pendant un glisser interne ; sans lui, la tuile ne l'accepte pas. */
  slotLabel?: string;
  onBrowse: () => void;
  onDropFiles: (fileList: FileList) => void;
  onDropSlot?: (from: Slot) => void;
}) {
  return (
    <DropTarget onFiles={onDropFiles} onSlot={onDropSlot} className="aspect-[4/3]">
      {over => (
        <div
          className={`flex h-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-3 text-center transition-colors ${
            over ? 'border-accent bg-accent-soft text-text' : 'border-surface-3 text-text-muted'
          }`}
        >
          <ImagePlus size={26} strokeWidth={1.75} />
          {over === 'slot' && slotLabel ? (
            <span className="text-[13px] font-bold">{slotLabel}</span>
          ) : (
            <span className="text-[13px] leading-snug">
              {label}
              <br />
              <Trans
                text={t('ou {browse}')}
                values={{
                  browse: (
                    <button type="button" onClick={onBrowse} className="rounded-sm font-semibold text-accent hover:underline">
                      {t('parcourir')}
                    </button>
                  )
                }}
              />
            </span>
          )}
        </div>
      )}
    </DropTarget>
  );
}

/**
 * Galerie d'édition des images d'une fiche : couverture et échantillons en
 * vignettes. Chaque vignette se glisse pour réorganiser (sur la couverture :
 * la remplace, l'ancienne prenant la place libérée) ; les mêmes actions
 * existent en boutons (étoile, flèches) pour le clavier et la manette, qui
 * ne peuvent pas glisser. Un fichier déposé sur une vignette la remplace ;
 * la dernière zone ajoute des échantillons. Tout reste un brouillon jusqu'à
 * l'enregistrement du formulaire.
 */
export default function ImageManager({
  cover,
  samples,
  onSetCover,
  onRemoveCover,
  onReplaceSample,
  onRemoveSample,
  onAddSamples,
  onMoveSample,
  onMakeCover,
  onDemoteCover
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

  /** Glisser interne déposé sur la couverture : l'échantillon la remplace. */
  const dropOnCover = (from: Slot) => {
    if (from !== 'cover') onMakeCover(from);
  };

  /** Glisser interne déposé sur l'échantillon `index`. */
  const dropOnSample = (index: number) => (from: Slot) => {
    if (from === 'cover') onMakeCover(index);
    else onMoveSample(from, index);
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        {cover ? (
          <ImageTile
            image={cover}
            slot="cover"
            isCover
            canMoveLeft={false}
            canMoveRight={false}
            onReplace={() => browse({ kind: 'cover' })}
            onRemove={onRemoveCover}
            onToggleCover={onDemoteCover}
            onDropFiles={files => handleFiles({ kind: 'cover' }, files)}
            onDropSlot={dropOnCover}
          />
        ) : (
          <EmptyDropTile
            label={t('Glissez la couverture ici')}
            slotLabel={t('Définir comme couverture')}
            onBrowse={() => browse({ kind: 'cover' })}
            onDropFiles={files => handleFiles({ kind: 'cover' }, files)}
            onDropSlot={dropOnCover}
          />
        )}

        {samples.map((image, index) => (
          <ImageTile
            key={image.id}
            image={image}
            slot={index}
            isCover={false}
            canMoveLeft={index > 0}
            canMoveRight={index < samples.length - 1}
            onReplace={() => browse({ kind: 'sample', index })}
            onRemove={() => onRemoveSample(index)}
            onToggleCover={() => onMakeCover(index)}
            onMoveLeft={() => onMoveSample(index, index - 1)}
            onMoveRight={() => onMoveSample(index, index + 1)}
            onDropFiles={files => handleFiles({ kind: 'sample', index }, files)}
            onDropSlot={dropOnSample(index)}
          />
        ))}

        <EmptyDropTile
          label={t('Glissez des images ici')}
          slotLabel={samples.length > 0 ? t('Déplacer à la fin') : undefined}
          onBrowse={() => browse({ kind: 'add' })}
          onDropFiles={files => handleFiles({ kind: 'add' }, files)}
          onDropSlot={
            samples.length > 0
              ? from => {
                  if (from === 'cover') onDemoteCover();
                  else onMoveSample(from, samples.length - 1);
                }
              : from => from === 'cover' && onDemoteCover()
          }
        />
      </div>

      <p className="mt-2 text-[12px] text-text-muted">
        {t("Glisse les images pour les réorganiser, ou sur la couverture pour la remplacer (l'étoile fait de même).")}
      </p>

      {rejected.length > 0 && (
        <p className="mt-2 text-[12px] text-danger">
          {t('Ignoré (format non pris en charge — JPEG, PNG, GIF ou WebP) : {files}', { files: rejected.join(', ') })}
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
