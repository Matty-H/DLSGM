import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ListChecks, Plus, Trash2 } from 'lucide-react';
import Select from '../Select/Select';
import CollectionRulesEditor from '../CollectionRulesEditor/CollectionRulesEditor';
import CollectionGamePicker from '../CollectionGamePicker/CollectionGamePicker';
import {
  AUTO_SHELVES,
  SHELF_SIZE_LABELS,
  addCollection,
  emptyRules,
  gameCollectionIds,
  matchesRules,
  moveCollection,
  removeCollection,
  shelfSize,
  toggleGameCollection,
  updateShelfPrefs,
  userShelfKey,
  withRules,
  type GameCollection,
  type HomeShelfPrefs,
  type ShelfSize
} from '../../lib/collections.js';
import type { GameListItem } from '../../lib/filterManager.js';
import type { GenreNames } from '../../lib/genreNames.js';
import { t, tr } from '../../lib/i18n.js';

export interface CollectionsSettingsProps {
  collections: GameCollection[];
  onCollectionsChange: (update: (prev: GameCollection[]) => GameCollection[]) => void;
  homeShelves: Record<string, HomeShelfPrefs>;
  onHomeShelvesChange: (update: (prev: Record<string, HomeShelfPrefs>) => Record<string, HomeShelfPrefs>) => void;
  /** Jeux présents dans la bibliothèque. */
  games: GameListItem[];
  genreNames: GenreNames;
  /** Écrit tout de suite dans la fiche (l'appartenance manuelle ne passe pas par « Enregistrer »). */
  onUpdateGame: (gameId: string, patch: Record<string, unknown>) => void;
  getWorkImageSrc: (gameId: string) => string;
  /** Collection à déplier à l'ouverture (lien « régler la collection » de l'accueil). */
  initialExpandedId?: string | null;
}

const sizeOptions = () => (Object.keys(SHELF_SIZE_LABELS) as ShelfSize[]).map(size => ({ value: size, label: tr(SHELF_SIZE_LABELS[size]) }));

/** Afficher / taille d'une étagère de l'accueil. */
function ShelfDisplay({
  shelfKey,
  label,
  prefs,
  onChange
}: {
  shelfKey: string;
  label: string;
  prefs: Record<string, HomeShelfPrefs>;
  onChange: (patch: HomeShelfPrefs) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="checkbox"
        className="toggle"
        aria-label={t("Afficher {label} sur l'accueil", { label })}
        checked={!prefs[shelfKey]?.hidden}
        onChange={e => onChange({ hidden: !e.target.checked })}
      />
      <Select
        value={shelfSize(shelfKey, prefs)}
        options={sizeOptions()}
        onChange={size => onChange({ size })}
        aria-label={t('Taille des jaquettes de {label}', { label })}
        className="w-[130px]"
      />
    </div>
  );
}

/**
 * Paramètres › Collections : étagères automatiques de l'accueil (affichées
 * ou non, taille des jaquettes), puis chaque collection de l'utilisateur,
 * dépliable pour choisir ses jeux, ses règles et son affichage.
 */
export default function CollectionsSettings({
  collections,
  onCollectionsChange,
  homeShelves,
  onHomeShelvesChange,
  games,
  genreNames,
  onUpdateGame,
  getWorkImageSrc,
  initialExpandedId
}: CollectionsSettingsProps) {
  const [newName, setNewName] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId ?? null);
  const [pickerId, setPickerId] = useState<string | null>(null);
  const expandedRef = useRef<HTMLDivElement>(null);
  const gameEntries = useMemo(() => games.map(g => g.data), [games]);

  useEffect(() => {
    if (!initialExpandedId) return;
    setExpandedId(initialExpandedId);
    requestAnimationFrame(() => expandedRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }, [initialExpandedId]);

  const names = collections.map(c => c.name.trim().toLocaleLowerCase());
  const valid = names.every((name, i) => name !== '' && names.indexOf(name) === i);

  const handleAdd = () => {
    const result = addCollection(collections, newName);
    if (!result) return;
    onCollectionsChange(() => result.collections);
    setNewName('');
    setExpandedId(result.created.id);
  };

  const setShelf = (key: string, patch: HomeShelfPrefs) => onHomeShelvesChange(prev => updateShelfPrefs(prev, key, patch));
  const pickerCollection = collections.find(c => c.id === pickerId) ?? null;

  const membersOf = (collection: GameCollection) => {
    const manual = new Set<string>();
    const byRules = new Set<string>();
    for (const { id, data } of games) {
      if (gameCollectionIds(data).includes(collection.id)) manual.add(id);
      else if (matchesRules(data, collection.rules, genreNames)) byRules.add(id);
    }
    return { manual, byRules };
  };
  const pickerMembers = pickerCollection ? membersOf(pickerCollection) : null;

  return (
    <div className="py-4">
      <div className="text-[15px] font-semibold">{t('Étagères automatiques')}</div>
      <p className="mb-2 mt-1 text-[13px] leading-relaxed text-text-muted">
        {t("Affichées sur l'accueil, avec la taille de leurs jaquettes (des tailles différentes rythment la page).")}
      </p>
      {AUTO_SHELVES.map(shelf => (
        <div key={shelf.key} className="flex items-center justify-between gap-4 border-b border-divider py-2 last:border-0">
          <span className="text-[14px] font-semibold">{tr(shelf.label)}</span>
          <ShelfDisplay shelfKey={shelf.key} label={tr(shelf.label)} prefs={homeShelves} onChange={patch => setShelf(shelf.key, patch)} />
        </div>
      ))}

      <div className="mt-6 text-[15px] font-semibold">{t('Mes collections')}</div>
      <p className="mb-4 mt-1 text-[13px] leading-relaxed text-text-muted">
        {t("Chaque collection a son étagère sur l'accueil, dans cet ordre, et sert de filtre dans la bibliothèque. Un jeu y entre si tu l'ajoutes (ici ou depuis sa page) ou s'il correspond à ses règles : tags, cercle, auteur… avec des groupes « ou » et des exclusions. Les jeux choisis sont enregistrés tout de suite ; nom, règles et affichage avec « Enregistrer ».")}
      </p>

      {collections.map((collection, index) => {
        const expanded = expandedId === collection.id;
        const members = expanded ? membersOf(collection) : null;
        return (
          <div key={collection.id} ref={expanded ? expandedRef : undefined} className="border-b border-divider py-1.5 last:border-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : collection.id)}
                aria-expanded={expanded}
                aria-label={expanded ? t('Replier {name}', { name: collection.name }) : t('Régler {name}', { name: collection.name })}
                className="btn btn-ghost btn-icon"
              >
                {expanded ? <ChevronDown size={16} strokeWidth={2.25} /> : <ChevronRight size={16} strokeWidth={2.25} />}
              </button>
              <input
                className="input flex-1"
                aria-label={t('Nom de la collection {name}', { name: collection.name })}
                value={collection.name}
                onChange={e => onCollectionsChange(prev => prev.map(c => (c.id === collection.id ? { ...c, name: e.target.value } : c)))}
              />
              <button
                type="button"
                disabled={index === 0}
                onClick={() => onCollectionsChange(prev => moveCollection(prev, collection.id, -1))}
                aria-label={t('Monter {name}', { name: collection.name })}
                className="btn btn-ghost btn-icon"
              >
                <ArrowUp size={16} strokeWidth={2.25} />
              </button>
              <button
                type="button"
                disabled={index === collections.length - 1}
                onClick={() => onCollectionsChange(prev => moveCollection(prev, collection.id, 1))}
                aria-label={t('Descendre {name}', { name: collection.name })}
                className="btn btn-ghost btn-icon"
              >
                <ArrowDown size={16} strokeWidth={2.25} />
              </button>
              <button
                type="button"
                onClick={() => onCollectionsChange(prev => removeCollection(prev, collection.id))}
                aria-label={t('Supprimer {name}', { name: collection.name })}
                title={t('Supprimer la collection (les jeux ne sont pas touchés)')}
                className="btn btn-ghost btn-icon"
              >
                <Trash2 size={16} strokeWidth={2.25} />
              </button>
            </div>

            {expanded && members && (
              <div className="mb-3 ml-11 mt-3 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[13px] text-text-secondary">
                    {t('{total} jeu(x) : {manual} ajouté(s) à la main, {rules} par les règles', { total: members.manual.size + members.byRules.size, manual: members.manual.size, rules: members.byRules.size })}
                  </div>
                  <button type="button" onClick={() => setPickerId(collection.id)} className="btn">
                    <ListChecks size={16} strokeWidth={2.25} />
                    {t('Choisir les jeux')}
                  </button>
                </div>

                <div>
                  <div className="section-title mb-2">{t('Accueil')}</div>
                  <ShelfDisplay
                    shelfKey={userShelfKey(collection.id)}
                    label={collection.name}
                    prefs={homeShelves}
                    onChange={patch => setShelf(userShelfKey(collection.id), patch)}
                  />
                </div>

                <div>
                  <div className="section-title mb-2">{t('Règles (ajout automatique)')}</div>
                  <CollectionRulesEditor
                    rules={collection.rules ?? emptyRules()}
                    onChange={rules => onCollectionsChange(prev => prev.map(c => (c.id === collection.id ? withRules(c, rules) : c)))}
                    games={gameEntries}
                    genreNames={genreNames}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {!valid && <p className="mt-2 text-[13px] text-danger">{t('Chaque collection doit avoir un nom, différent des autres.')}</p>}
      <div className="mt-4 flex gap-2">
        <input
          className="input flex-1"
          placeholder={t('Nouvelle collection…')}
          aria-label={t('Nom de la nouvelle collection')}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button type="button" onClick={handleAdd} className="btn">
          <Plus size={16} strokeWidth={2.25} />
          {t('Créer')}
        </button>
      </div>

      {pickerCollection && pickerMembers && (
        <CollectionGamePicker
          collectionName={pickerCollection.name}
          games={games}
          selectedIds={pickerMembers.manual}
          ruleIds={pickerMembers.byRules}
          onToggle={gameId => {
            const game = games.find(g => g.id === gameId);
            if (game) onUpdateGame(gameId, { collections: toggleGameCollection(game.data, pickerCollection.id) });
          }}
          getWorkImageSrc={getWorkImageSrc}
          onClose={() => setPickerId(null)}
        />
      )}
    </div>
  );
}
