import { useMemo, useState } from 'react';
import { Ban, Plus, X } from 'lucide-react';
import Select from '../Select/Select';
import {
  RULE_FIELDS,
  RULE_FIELD_LABELS,
  collectRuleValues,
  describeCondition,
  isValuelessField,
  type CollectionCondition,
  type CollectionRuleField,
  type CollectionRules
} from '../../lib/collections.js';
import type { GameCacheEntry } from '../../lib/cacheManager.js';
import type { GenreNames } from '../../lib/genreNames.js';
import { t, tr } from '../../lib/i18n.js';

export interface CollectionRulesEditorProps {
  rules: CollectionRules;
  onChange: (rules: CollectionRules) => void;
  /** Jeux de la bibliothèque : valeurs proposées pour chaque champ. */
  games: GameCacheEntry[];
  genreNames: GenreNames;
}

const fieldOptions = () => RULE_FIELDS.map(field => ({ value: field, label: tr(RULE_FIELD_LABELS[field]) }));

/** Libellés du choix avec / sans selon le critère. */
function negateLabels(field: CollectionRuleField): [string, string] {
  if (field === 'completed') return [t('fini'), t('pas fini')];
  if (field === 'playTime') return [t('au moins'), t('moins de')];
  return [t('avec'), t('sans')];
}

/**
 * Ligne d'ajout d'une condition : critère, puis valeur tirée de la
 * bibliothèque (tags, cercles…), seuil en heures (temps de jeu) ou rien (fini).
 */
function ConditionAdder({
  games,
  genreNames,
  allowNegate,
  onAdd
}: {
  games: GameCacheEntry[];
  genreNames: GenreNames;
  /** Faux dans « Toujours exclure » : la condition y est déjà une exclusion. */
  allowNegate: boolean;
  onAdd: (condition: CollectionCondition) => void;
}) {
  const [field, setField] = useState<CollectionRuleField>('genre');
  const [negate, setNegate] = useState(false);
  const [hours, setHours] = useState('1');
  const values = useMemo(() => collectRuleValues(games, field, genreNames), [games, field, genreNames]);
  const options = useMemo(() => values.map(v => ({ value: v.key, label: `${v.label} (${v.count})` })), [values]);
  const [withLabel, withoutLabel] = negateLabels(field);
  const negateFlag = allowNegate && negate ? { negate: true } : {};
  // Seuil en minutes (heures décimales acceptées : 0,5 = 30 min), au moins 1 min.
  const thresholdMinutes = Math.max(1, Math.round((Number(hours.replace(',', '.')) || 0) * 60));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {allowNegate && (
        <div className="seg">
          <button type="button" aria-pressed={!negate} onClick={() => setNegate(false)} className="seg-opt">
            {withLabel}
          </button>
          <button type="button" aria-pressed={negate} onClick={() => setNegate(true)} className="seg-opt">
            {withoutLabel}
          </button>
        </div>
      )}
      <Select value={field} options={fieldOptions()} onChange={setField} aria-label={t('Critère')} className="w-[160px]" />

      {field === 'completed' && (
        <button type="button" onClick={() => onAdd({ field, value: 'true', ...negateFlag })} className="btn">
          <Plus size={15} strokeWidth={2.5} />
          {t('Ajouter')}
        </button>
      )}

      {field === 'playTime' && (
        <>
          {!allowNegate && <span className="text-[13px] text-text-secondary">{t('au moins')}</span>}
          <input
            className="input w-[80px] tabular-nums"
            inputMode="decimal"
            aria-label={t('Seuil de temps de jeu, en heures')}
            value={hours}
            onChange={e => setHours(e.target.value.replace(/[^\d.,]/g, '').slice(0, 6))}
          />
          <span className="text-[13px] text-text-secondary">{t('h')}</span>
          <button type="button" onClick={() => onAdd({ field, value: String(thresholdMinutes), ...negateFlag })} className="btn">
            <Plus size={15} strokeWidth={2.5} />
            {t('Ajouter')}
          </button>
        </>
      )}

      {!isValuelessField(field) && (
        <Select
          key={field}
          value=""
          options={options}
          placeholder={options.length ? t('Choisir une valeur…') : t('Aucune valeur dans la bibliothèque')}
          disabled={options.length === 0}
          searchable
          onChange={key => {
            const picked = values.find(v => v.key === key);
            if (!picked) return;
            onAdd({ field, value: picked.value, ...(picked.makerId && { makerId: picked.makerId }), ...negateFlag });
          }}
          aria-label={t('Valeur')}
          className="min-w-[200px] flex-1"
        />
      )}
    </div>
  );
}

/** Pastille d'une condition ; `excluded` : dans « Toujours exclure ». */
function ConditionPill({
  condition,
  genreNames,
  excluded = false,
  onRemove
}: {
  condition: CollectionCondition;
  genreNames: GenreNames;
  excluded?: boolean;
  onRemove: () => void;
}) {
  const label = describeCondition(condition, genreNames);
  const negative = excluded || condition.negate;
  return (
    <span className={`tag ${negative ? '' : 'tag-accent'}`}>
      {negative && <Ban size={12} strokeWidth={2.5} />}
      {label}
      <button type="button" onClick={onRemove} aria-label={t('Retirer {label}', { label })} className="-mr-1 ml-0.5 opacity-70 hover:opacity-100">
        <X size={12} strokeWidth={3} />
      </button>
    </span>
  );
}

const sameCondition = (a: CollectionCondition, b: CollectionCondition) =>
  a.field === b.field && a.value === b.value && (a.makerId ?? null) === (b.makerId ?? null) && Boolean(a.negate) === Boolean(b.negate);

/**
 * Règles d'une collection : (groupe 1 OU groupe 2 …) ET aucune exclusion,
 * chaque groupe exigeant toutes ses conditions (« avec » ou « sans »).
 * Ex : (tag X ET cercle Y) OU (tag Z), jamais l'auteur A.
 */
export default function CollectionRulesEditor({ rules, onChange, games, genreNames }: CollectionRulesEditorProps) {
  // Toujours au moins un groupe affiché, pour avoir où ajouter la première condition.
  const groups = rules.groups.length > 0 ? rules.groups : [[]];

  const setGroup = (index: number, group: CollectionCondition[]) =>
    onChange({ ...rules, groups: groups.map((g, i) => (i === index ? group : g)) });

  const addTo = (list: CollectionCondition[], condition: CollectionCondition) =>
    list.some(c => sameCondition(c, condition)) ? list : [...list, condition];

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group, index) => (
        <div key={index}>
          {index > 0 && <div className="section-title mb-2 text-center">{t('— ou —')}</div>}
          <div className="rounded-md bg-bg-deep p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="section-title flex-1">{groups.length > 1 ? t('Groupe {n} : tous ces critères', { n: index + 1 }) : t('Tous ces critères')}</span>
              {groups.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange({ ...rules, groups: groups.filter((_, i) => i !== index) })}
                  className="btn btn-ghost py-0.5 text-[12px]"
                >
                  {t('Supprimer le groupe')}
                </button>
              )}
            </div>
            {group.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {group.map((condition, i) => (
                  <ConditionPill key={i} condition={condition} genreNames={genreNames} onRemove={() => setGroup(index, group.filter((_, j) => j !== i))} />
                ))}
              </div>
            )}
            <ConditionAdder games={games} genreNames={genreNames} allowNegate onAdd={c => setGroup(index, addTo(group, c))} />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange({ ...rules, groups: [...groups, []] })}
        disabled={groups[groups.length - 1].length === 0}
        className="btn btn-ghost self-start text-[13px]"
      >
        <Plus size={15} strokeWidth={2.5} />
        {t('Ajouter un groupe (OU)')}
      </button>

      <div className="rounded-md bg-bg-deep p-3">
        <div className="section-title mb-2">{t('Toujours exclure')}</div>
        {rules.exclude.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {rules.exclude.map((condition, i) => (
              <ConditionPill
                key={i}
                condition={condition}
                genreNames={genreNames}
                excluded
                onRemove={() => onChange({ ...rules, exclude: rules.exclude.filter((_, j) => j !== i) })}
              />
            ))}
          </div>
        )}
        <ConditionAdder games={games} genreNames={genreNames} allowNegate={false} onAdd={c => onChange({ ...rules, exclude: addTo(rules.exclude, c) })} />
      </div>
    </div>
  );
}
