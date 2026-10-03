import { useEffect, useRef, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { customToTheme, findTheme, isHexColor, MAX_CUSTOM_THEME_NAME, newCustomThemeId, DEFAULT_THEME, type CustomTheme } from '../../../../shared/themes';
import { t } from '../../lib/i18n.js';
import Logo from '../Logo/Logo';

export interface CustomThemeEditorProps {
  /** Palette perso sélectionnée dans la grille : elle est modifiée ; sinon nouvelle palette. */
  editing: CustomTheme | null;
  /** Nombre maximal de palettes perso pas encore atteint. */
  canAdd: boolean;
  onSave: (theme: CustomTheme) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function blankDraft(): CustomTheme {
  // Départ : la palette officielle.
  const official = findTheme(DEFAULT_THEME)!;
  return { id: newCustomThemeId(), name: '', dls: official.icon.dls, gm: official.icon.gm, bg: official.icon.bg, rounded: false };
}

/** Une couleur : pipette du système et saisie hexadécimale. */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="flex items-center gap-3">
      <span className="w-14 text-[13px] font-semibold">{label}</span>
      <input type="color" value={value} onChange={e => onChange(e.target.value)} aria-label={label} className="h-9 w-12 cursor-pointer rounded-sm border border-divider bg-transparent p-0.5" />
      <input
        className="input w-[110px] font-mono uppercase"
        value={text}
        maxLength={7}
        aria-label={t('{name} (hexadécimal)', { name: label })}
        onChange={e => {
          const next = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
          setText(next);
          if (isHexColor(next)) onChange(next.toLowerCase());
        }}
        onBlur={() => setText(value)}
      />
    </label>
  );
}

/**
 * Menu « Mes palettes » du thème : nom, couleurs du DLS, du GM et du fond de
 * l'icône, coins arrondis ou non, avec l'aperçu de l'icône et du logo sur
 * l'interface (éclairci si besoin pour rester lisible, cf. customToTheme).
 */
export default function CustomThemeEditor({ editing, canAdd, onSave, onDelete }: CustomThemeEditorProps) {
  const [draft, setDraft] = useState<CustomTheme>(() => editing ?? blankDraft());
  const [busy, setBusy] = useState(false);

  // Palette perso choisie dans la grille : chargée pour modification. Une
  // palette prédéfinie choisie pendant une création ne perd pas le brouillon,
  // seulement en quittant une palette perso.
  const wasEditing = useRef(editing !== null);
  useEffect(() => {
    if (editing) setDraft(editing);
    else if (wasEditing.current) setDraft(blankDraft());
    wasEditing.current = editing !== null;
  }, [editing]);

  const isNew = !editing || editing.id !== draft.id;
  const theme = customToTheme(draft);
  const name = draft.name.trim();
  const update = (patch: Partial<CustomTheme>) => setDraft(current => ({ ...current, ...patch }));

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-md border border-divider bg-bg-deep/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[14px] font-semibold">
          {isNew ? t('Nouvelle palette') : t('Modifier « {name} »', { name: editing!.name })}
        </div>
        {!isNew && (
          <button type="button" className="btn btn-ghost" onClick={() => setDraft(blankDraft())}>
            <Plus size={15} strokeWidth={2.25} />
            {t('Nouvelle palette')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-[260px] flex-1 flex-col gap-3">
          <label className="flex max-w-[360px] flex-col gap-1">
            <span className="text-[13px] font-semibold">{t('Nom')}</span>
            <input
              className="input"
              value={draft.name}
              maxLength={MAX_CUSTOM_THEME_NAME}
              placeholder={t('Ma palette')}
              onChange={e => update({ name: e.target.value })}
            />
          </label>
          <ColorField label="DLS" value={draft.dls} onChange={dls => update({ dls })} />
          <ColorField label="GM" value={draft.gm} onChange={gm => update({ gm })} />
          <ColorField label={t('Fond')} value={draft.bg} onChange={bg => update({ bg })} />
          <label className="flex items-center gap-3">
            <input type="checkbox" className="toggle" checked={draft.rounded} onChange={e => update({ rounded: e.target.checked })} />
            <span className="text-[13px] font-semibold">{t('Coins arrondis')}</span>
          </label>
        </div>

        <div className="flex flex-col items-center gap-3">
          <Logo variant="square" height={96} colors={{ background: draft.bg, dls: draft.dls, gm: draft.gm, rounded: draft.rounded }} />
          <div className="flex items-center gap-3 rounded-md bg-bg px-4 py-3">
            <Logo variant="horizontal" height={22} colors={theme.logo} />
            <span className="rounded-full px-3 py-1 text-[12px] font-bold" style={{ background: theme.accent, color: theme.onAccent ?? '#ffffff' }}>
              {t('Accent')}
            </span>
          </div>
          <span className="max-w-[260px] text-center text-[11px] text-text-muted">{t("Sur l'interface sombre, les couleurs trop foncées sont éclaircies pour rester lisibles.")}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !name || (isNew && !canAdd)}
          title={!name ? t('Donne un nom à la palette') : isNew && !canAdd ? t('Nombre maximal de palettes atteint') : undefined}
          onClick={() => run(() => onSave({ ...draft, name }))}
        >
          <Save size={15} strokeWidth={2.25} />
          {t('Enregistrer la palette')}
        </button>
        {!isNew && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => {
              if (window.confirm(t('Supprimer la palette « {name} » ?', { name: editing!.name }))) run(() => onDelete(editing!.id));
            }}
          >
            <Trash2 size={15} strokeWidth={2.25} />
            {t('Supprimer')}
          </button>
        )}
      </div>
    </div>
  );
}
