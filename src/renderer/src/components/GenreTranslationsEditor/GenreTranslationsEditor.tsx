import { useMemo, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { isJapaneseText, type GenreTranslations } from '../../lib/genreNames.js';

export interface GenreTranslationsEditorProps {
  translations: GenreTranslations;
  /** Genres bruts des fiches de la bibliothèque. */
  libraryGenres: string[];
  /** Traduction manuelle ; `null` rend la main à DLsite. */
  onSetTranslation: (japanese: string, english: string | null) => Promise<void>;
}

/**
 * Dictionnaire des tags JP → EN : le japonais fait foi, l'anglais est la
 * traduction affichée quand la langue d'affichage est l'anglais. Les
 * traductions viennent de DLsite (apprises à chaque fetch) ; une traduction
 * corrigée ici est marquée manuelle et n'est plus remplacée.
 */
export default function GenreTranslationsEditor({ translations, libraryGenres, onSetTranslation }: GenreTranslationsEditorProps) {
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const englishToJapanese = useMemo(() => new Set(Object.values(translations).map(t => t.en)), [translations]);
  // Clés japonaises des tags de la bibliothèque : japonais, ou déjà clé du
  // dictionnaire (un tag japonais peut s'écrire en latin, ex: « ASMR »).
  const libraryJapanese = useMemo(
    () => new Set(libraryGenres.filter(g => isJapaneseText(g) || g in translations)),
    [libraryGenres, translations]
  );
  // Genres anglais de fiches récupérées autrefois en anglais, sans clé japonaise connue.
  const orphanEnglish = useMemo(
    () => Array.from(new Set(libraryGenres.filter(g => !isJapaneseText(g) && !(g in translations) && !englishToJapanese.has(g)))).sort(),
    [libraryGenres, translations, englishToJapanese]
  );

  const rows = useMemo(() => {
    const keys = showAll ? new Set([...Object.keys(translations), ...libraryJapanese]) : libraryJapanese;
    const term = filter.trim().toLowerCase();
    return Array.from(keys)
      .filter(jp => !term || jp.toLowerCase().includes(term) || (translations[jp]?.en ?? '').toLowerCase().includes(term))
      .sort((a, b) => a.localeCompare(b, 'ja'));
  }, [translations, libraryJapanese, showAll, filter]);

  const commit = async (japanese: string, value: string) => {
    const current = translations[japanese]?.en ?? '';
    if (value.trim() === current) return;
    try {
      setError(null);
      await onSetTranslation(japanese, value.trim() || null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="py-4">
      <div className="text-[15px] font-semibold">Traduction des tags</div>
      <p className="mb-4 mt-1 text-[13px] leading-relaxed text-text-muted">
        Les fiches sont récupérées en japonais, la langue de référence de DLsite ; chaque tag y est identifié par son nom
        japonais. L'anglais n'est qu'une traduction d'affichage (Bibliothèque › Langue des tags), apprise de DLsite à
        chaque récupération. Corrige une traduction ici : elle devient manuelle et DLsite ne la remplace plus.
      </p>

      <div className="mb-3 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input className="input pl-9" placeholder="Filtrer (japonais ou anglais)" value={filter} onChange={e => setFilter(e.target.value)} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-text-secondary">
          <input type="checkbox" className="toggle" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          Tout le dictionnaire
        </label>
      </div>

      {rows.length === 0 && <p className="text-[13px] text-text-muted">Aucun tag japonais dans la bibliothèque pour l'instant.</p>}

      <div className="flex flex-col">
        {rows.map(japanese => {
          const translation = translations[japanese];
          return (
            <div key={japanese} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_38px] items-center gap-3 border-b border-divider py-1.5 last:border-0">
              <span className="truncate text-[14px]" title={japanese}>
                {japanese}
              </span>
              <input
                // Recréé quand la traduction change ailleurs (fetch, réinitialisation).
                key={`${japanese}:${translation?.en ?? ''}`}
                className={`input py-1.5 text-[13px] ${translation?.manual ? 'border-accent' : ''}`}
                defaultValue={translation?.en ?? ''}
                placeholder="Pas encore de traduction"
                aria-label={`Traduction anglaise de ${japanese}`}
                title={translation?.manual ? 'Traduction manuelle' : translation ? 'Traduction DLsite' : undefined}
                onBlur={e => commit(japanese, e.target.value)}
                onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
              />
              {translation?.manual ? (
                <button
                  type="button"
                  onClick={() => onSetTranslation(japanese, null)}
                  className="btn btn-ghost btn-icon"
                  title="Revenir à la traduction de DLsite"
                  aria-label={`Revenir à la traduction de DLsite pour ${japanese}`}
                >
                  <RotateCcw size={15} strokeWidth={2.25} />
                </button>
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </div>

      {orphanEnglish.length > 0 && (
        <p className="mt-4 text-[13px] leading-relaxed text-text-muted">
          {orphanEnglish.length} tag{orphanEnglish.length > 1 ? 's' : ''} anglais sans équivalent japonais connu (fiches
          récupérées autrefois en anglais) : {orphanEnglish.slice(0, 12).join(', ')}
          {orphanEnglish.length > 12 ? '…' : ''}. « Mettre à jour toutes les fiches » (Stockage) les repasse en japonais.
        </p>
      )}
      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
    </div>
  );
}
