import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

export interface SelectOption<T extends string | number = string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string | number = string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  id?: string;
  'aria-label'?: string;
  /** Texte affiché si `value` ne correspond à aucune option. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Ajoute un champ de recherche en tête de liste (longues listes, ex: genres). */
  searchable?: boolean;
}

/** Comparaison insensible à la casse et aux accents. */
const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const POPUP_MAX_HEIGHT = 320;
const POPUP_GAP = 4;

interface PopupPosition {
  left: number;
  top?: number;
  bottom?: number;
  minWidth: number;
  maxHeight: number;
}

/** Place la liste sous le champ, ou au-dessus s'il manque de place en bas. */
function computePosition(trigger: HTMLElement): PopupPosition {
  const rect = trigger.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - POPUP_GAP - 8;
  const above = rect.top - POPUP_GAP - 8;
  const openAbove = below < Math.min(POPUP_MAX_HEIGHT, 160) && above > below;
  return {
    left: rect.left,
    minWidth: rect.width,
    maxHeight: Math.min(POPUP_MAX_HEIGHT, openAbove ? above : below),
    ...(openAbove ? { bottom: window.innerHeight - rect.top + POPUP_GAP } : { top: rect.bottom + POPUP_GAP })
  };
}

/**
 * Liste déroulante maison, à la place d'un <select> natif : Chromium ne
 * laisse ouvrir et parcourir la liste native qu'au vrai clavier ou à la
 * souris, jamais depuis la manette (API Gamepad).
 *
 * Les options sont des boutons dans une liste rendue dans <body> (pour ne
 * pas être rognée par un conteneur défilant) et marquée `data-nav-scope` :
 * tant qu'elle est ouverte, la navigation manette reste dedans (haut/bas,
 * A = choisir, B = fermer via Échap — voir useGamepadNavigation).
 * Clavier : Entrée/Espace/flèches ouvrent, flèches/Début/Fin parcourent,
 * Échap ou Tab ferment. Avec `searchable`, la saisie filtre la liste et
 * Entrée dans le champ choisit la première option restante ; le focus
 * s'ouvre sur ce champ, sauf à la manette (sur l'option courante).
 */
export default function Select<T extends string | number = string>({
  value,
  options,
  onChange,
  id,
  'aria-label': ariaLabel,
  placeholder = '',
  disabled = false,
  className = '',
  searchable = false
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopupPosition | null>(null);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);
  const visibleOptions = query ? options.filter(o => normalize(o.label).includes(normalize(query))) : options;

  const close = (refocus: boolean) => {
    setOpen(false);
    setPosition(null);
    setQuery('');
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  };

  const choose = (option: SelectOption<T>) => {
    close(true);
    if (option.value !== value) onChange(option.value);
  };

  useLayoutEffect(() => {
    if (open && triggerRef.current) setPosition(computePosition(triggerRef.current));
  }, [open]);

  // À l'ouverture (une fois la liste placée, pas à chaque repositionnement) :
  // focus sur l'option courante, sinon la première.
  const isPlaced = position !== null;
  useEffect(() => {
    if (!open || !isPlaced || !listRef.current) return;
    if (searchRef.current && document.documentElement.dataset.input !== 'gamepad') {
      searchRef.current.focus({ preventScroll: true });
      return;
    }
    const items = listRef.current.querySelectorAll<HTMLElement>('[role="option"]');
    const target = items[Math.max(0, options.findIndex(o => o.value === value))];
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isPlaced]);

  // Fermeture sur clic extérieur ou redimensionnement. Un défilement de la
  // page (ex: défilement doux lancé par la manette) repositionne la liste,
  // en fixed, pour qu'elle suive son champ.
  useEffect(() => {
    if (!open) return;
    const isInside = (target: EventTarget | null) =>
      target instanceof Node && (listRef.current?.contains(target) || triggerRef.current?.contains(target));
    const onPointerDown = (e: PointerEvent) => {
      if (!isInside(e.target)) close(false);
    };
    const onScroll = (e: Event) => {
      if (!isInside(e.target) && triggerRef.current) setPosition(computePosition(triggerRef.current));
    };
    const onResize = () => close(false);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      // Empêche la navigation clavier globale (grille) de réagir aussi.
      e.stopPropagation();
      setOpen(true);
    }
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const inSearch = document.activeElement === searchRef.current;
    const focusAt = (i: number) => {
      const item = items[Math.max(0, Math.min(items.length - 1, i))];
      item?.focus({ preventScroll: true });
      item?.scrollIntoView({ block: 'nearest' });
    };

    switch (e.key) {
      case 'ArrowDown':
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        // Depuis la première option, remonte au champ de recherche.
        if (index <= 0 && searchRef.current) searchRef.current.focus({ preventScroll: true });
        else focusAt(index - 1);
        break;
      case 'Home':
      case 'End':
        // Dans le champ de recherche : déplacement du curseur, natif.
        if (inSearch) {
          e.stopPropagation();
          return;
        }
        focusAt(e.key === 'Home' ? 0 : items.length - 1);
        break;
      case 'Enter':
        if (!inSearch) {
          e.stopPropagation(); // activation native du bouton d'option
          return;
        }
        if (visibleOptions[0]) choose(visibleOptions[0]);
        break;
      case 'Escape':
        close(true);
        break;
      case 'Tab':
        close(true);
        break;
      default:
        // Espace : activation native des boutons d'option (ou saisie dans la recherche).
        if (e.key === ' ') e.stopPropagation();
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        onKeyDown={onTriggerKeyDown}
        className={`input select-trigger ${className}`}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            data-nav-scope
            data-nav-popup
            onKeyDown={onListKeyDown}
            className="select-popup"
            style={{
              left: position.left,
              top: position.top,
              bottom: position.bottom,
              minWidth: position.minWidth,
              maxHeight: position.maxHeight
            }}
          >
            {searchable && (
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Rechercher…"
                aria-label="Filtrer la liste"
                className="input select-search"
              />
            )}
            {visibleOptions.length === 0 && <div className="px-3 py-2 text-[13px] text-text-muted">Aucun résultat.</div>}
            {visibleOptions.map(option => {
              const isSelected = option.value === value;
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => choose(option)}
                  className={`select-option ${isSelected ? 'is-selected' : ''}`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <Check size={14} strokeWidth={2.75} className="flex-shrink-0" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
