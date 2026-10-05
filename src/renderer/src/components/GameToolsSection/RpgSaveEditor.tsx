import { useEffect, useMemo, useState } from 'react';
import Select from '../Select/Select';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import { RPG_SAVE_TABS, countChanges, parseVariableInput, slotLabel, visibleEntries, type RpgSaveTab } from '../../lib/rpgSaves.js';
import type { RpgSaveData, RpgSavePatch, RpgSaveSlot } from '../../../../shared/ipc-types';
import { t, tr, uiLocale } from '../../lib/i18n.js';

export interface RpgSaveEditorProps {
  gameId: string;
  /** Change à chaque fin de session : les sauvegardes ont pu changer. */
  lastPlayed?: string;
  /** Après une modification (une copie `pre-edit` vient d'être faite). */
  onSaved: () => void;
}

const LABEL_CLASS = 'text-[12px] text-text-muted';
const MAX_ROWS = 200;

/**
 * Page du jeu › Outils (RPG Maker MV/MZ) : or, objets, armes, armures,
 * variables et interrupteurs d'une sauvegarde. Main copie les sauvegardes
 * avant d'écrire (copie « Avant modification », restaurable ci-dessus).
 */
export default function RpgSaveEditor({ gameId, lastPlayed, onSaved }: RpgSaveEditorProps) {
  const [slots, setSlots] = useState<RpgSaveSlot[]>([]);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  const [data, setData] = useState<RpgSaveData | null>(null);
  const [patch, setPatch] = useState<RpgSavePatch>({});
  const [tab, setTab] = useState<RpgSaveTab>('items');
  const [search, setSearch] = useState('');
  const [namedOnly, setNamedOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      .listRpgMakerSaves(gameId)
      .then(list => {
        if (cancelled) return;
        setSlots(list);
        setFile(current => (current && list.some(s => s.file === current) ? current : list[0]?.file ?? null));
      })
      .catch(() => !cancelled && setSlots([]));
    return () => {
      cancelled = true;
    };
  }, [gameId, lastPlayed]);

  useEffect(() => {
    setOpen(false);
    setData(null);
    setPatch({});
    setMessage(null);
  }, [gameId]);

  useEffect(() => {
    if (!open || !file) return;
    let cancelled = false;
    setData(null);
    setPatch({});
    window.electronAPI
      .readRpgMakerSave(gameId, file)
      .then(result => !cancelled && setData(result))
      .catch(err => !cancelled && setMessage({ text: ipcErrorMessage(err), isError: true }));
    return () => {
      cancelled = true;
    };
  }, [open, file, gameId, lastPlayed]);

  const rows = useMemo(() => (data ? visibleEntries(data, tab, patch, { search, namedOnly }) : []), [data, tab, patch, search, namedOnly]);
  const changes = countChanges(patch);

  if (slots.length === 0) return null;

  const setValue = (group: Exclude<keyof RpgSavePatch, 'gold'>, id: number, value: number | string | boolean) =>
    setPatch(prev => ({ ...prev, [group]: { ...(prev[group] as Record<string, unknown> | undefined), [id]: value } }));

  const save = async () => {
    if (!file || changes === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      setData(await window.electronAPI.writeRpgMakerSave(gameId, file, patch));
      setPatch({});
      setMessage({ text: t('Sauvegarde modifiée. Copie « Avant modification » faite juste avant.'), isError: false });
      onSaved();
    } catch (err) {
      setMessage({ text: ipcErrorMessage(err), isError: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className={`${LABEL_CLASS} mb-1`}>{t('Éditeur de sauvegardes')}</div>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn text-[13px]">
          {t('Modifier une sauvegarde')}
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-white/10 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={file ?? ''}
              options={slots.map(slot => ({
                value: slot.file,
                label: `${slotLabel(slot.slot)} · ${new Date(slot.modified).toLocaleString(uiLocale(), { dateStyle: 'short', timeStyle: 'short' })}`
              }))}
              onChange={setFile}
              aria-label={t('Sauvegarde')}
              className="min-w-0 flex-1"
            />
            {data && (
              <label className="flex items-center gap-2">
                {t('Or')}
                <input
                  type="number"
                  min={0}
                  className="input w-[130px] py-1"
                  value={patch.gold ?? data.gold}
                  onChange={e => setPatch(prev => ({ ...prev, gold: Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
                />
              </label>
            )}
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost ml-auto text-[13px]">
              {t('Fermer')}
            </button>
          </div>

          {data && (
            <>
              <div className="seg flex-wrap">
                {RPG_SAVE_TABS.map(item => (
                  <label key={item.id} className="seg-opt">
                    <input type="radio" name={`rpg-save-tab-${gameId}`} checked={tab === item.id} onChange={() => setTab(item.id)} />
                    {tr(item.label)} ({data[item.id].length})
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="search"
                  className="input flex-1"
                  placeholder={t('Rechercher (nom ou n°)')}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <label className="flex cursor-pointer items-center gap-2 text-[12px]">
                  <input type="checkbox" checked={namedOnly} onChange={e => setNamedOnly(e.target.checked)} />
                  {t('Seulement ceux qui ont un nom')}
                </label>
              </div>
              <ul className="m-0 flex max-h-[320px] list-none flex-col gap-1 overflow-y-auto p-0">
                {rows.slice(0, MAX_ROWS).map(row => (
                  <li key={row.id} className="flex items-center gap-3 text-[13px]">
                    <span className="w-10 flex-shrink-0 text-right font-mono text-text-muted">{row.id}</span>
                    <span className={`min-w-0 flex-1 truncate ${row.changed ? 'text-accent' : ''}`} title={row.name}>
                      {row.name || <span className="text-text-muted">{t('(sans nom)')}</span>}
                    </span>
                    {tab === 'switches' ? (
                      <input type="checkbox" className="toggle" checked={row.value === true} onChange={e => setValue('switches', row.id, e.target.checked)} />
                    ) : tab === 'variables' ? (
                      <input
                        type="text"
                        className="input w-[110px] flex-shrink-0 py-1"
                        value={row.value === null ? '' : String(row.value)}
                        onChange={e => setValue('variables', row.id, parseVariableInput(e.target.value, row.original))}
                      />
                    ) : (
                      <input
                        type="number"
                        min={0}
                        className="input w-[80px] flex-shrink-0 py-1"
                        value={Number(row.value)}
                        onChange={e => setValue(tab, row.id, Math.max(0, Math.round(Number(e.target.value) || 0)))}
                      />
                    )}
                  </li>
                ))}
                {rows.length === 0 && <li className="text-[13px] text-text-muted">{t('Rien à afficher.')}</li>}
                {rows.length > MAX_ROWS && (
                  <li className="text-[12px] text-text-muted">{t('{n} autres : affine la recherche.', { n: rows.length - MAX_ROWS })}</li>
                )}
              </ul>
              <div className="flex items-center gap-2">
                <button type="button" onClick={save} disabled={busy || changes === 0} className="btn btn-primary text-[13px]">
                  {busy ? t('Enregistrement…') : changes > 1 ? t('Enregistrer {n} modifications', { n: changes }) : t('Enregistrer')}
                </button>
                {changes > 0 && (
                  <button type="button" onClick={() => setPatch({})} disabled={busy} className="btn btn-ghost text-[13px]">
                    {t('Annuler')}
                  </button>
                )}
                <span className="text-[12px] text-text-muted">{t('Jeu fermé. Une copie des sauvegardes est faite avant chaque modification.')}</span>
              </div>
            </>
          )}
          {message && <p className={`m-0 text-[13px] ${message.isError ? 'text-danger' : 'text-text-secondary'}`}>{message.text}</p>}
        </div>
      )}
    </div>
  );
}
