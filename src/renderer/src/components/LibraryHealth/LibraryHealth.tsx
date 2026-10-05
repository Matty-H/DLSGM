import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, CircleCheck, RefreshCw, Stethoscope } from 'lucide-react';
import { checkLibraryHealth, healthIssueCount, renamableFolders, type LibraryHealthReport } from '../../lib/libraryHealth.js';
import { fetchGameMetadata, retryMissingImages } from '../../lib/dataFetcher.js';
import { updateCacheEntry } from '../../lib/cacheManager.js';
import { addToWishlist, describeAddResult } from '../../lib/wishlist.js';
import { ipcErrorMessage, uninstallLastPatch } from '../../lib/gameTools.js';
import { misnamedPath } from '../../lib/libraryFolders.js';
import { t } from '../../lib/i18n.js';

export interface LibraryHealthProps {
  /** Nom affiché d'un jeu présent (titre de sa fiche, sinon l'ID). */
  nameOf: (gameId: string) => string;
  onOpenGame: (gameId: string) => void;
  onChooseExecutable: (gameId: string) => Promise<void>;
  /** Fiches ou dossiers modifiés par une correction : relire le cache / rescanner. */
  onChanged: () => void;
}

function IssueGroup({ title, count, action, children }: { title: string; count: number; action?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div className="border-t border-white/5 py-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen(o => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-[14px] font-semibold">
          {open ? <ChevronDown size={16} strokeWidth={2.25} /> : <ChevronRight size={16} strokeWidth={2.25} />}
          <span className="truncate">{title}</span>
          <span className="rounded-full bg-danger/20 px-2 text-[12px] tabular-nums text-danger">{count}</span>
        </button>
        {action}
      </div>
      {open && <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0 pl-6">{children}</ul>}
    </div>
  );
}

function IssueRow({ label, detail, children }: { label: string; detail?: string | null; children?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-[13px]">
      <span className="min-w-0 flex-1">
        <span className="block truncate" title={label}>{label}</span>
        {detail && <span className="block truncate text-text-secondary" title={detail}>{detail}</span>}
      </span>
      {children}
    </li>
  );
}

/**
 * Bilan de santé (Paramètres › Santé de la bibliothèque) : ce qui cloche dans la bibliothèque,
 * chaque problème avec sa correction. Rien n'est corrigé ni supprimé sans clic.
 */
export default function LibraryHealth({ nameOf, onOpenGame, onChooseExecutable, onChanged }: LibraryHealthProps) {
  const [report, setReport] = useState<LibraryHealthReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      setReport(await checkLibraryHealth());
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Lance une correction (une à la fois), puis refait le bilan. */
  const run = async (key: string, work: () => Promise<string | void>) => {
    setBusy(key);
    setMessage(null);
    setError(null);
    try {
      const result = await work();
      if (result) setMessage(result);
      onChanged();
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  const retryFetches = (gameIds: string[]) =>
    run(`fetch:${gameIds.join(',')}`, async () => {
      let fixed = 0;
      for (const gameId of gameIds) if (await fetchGameMetadata(gameId)) fixed++;
      return t('{n} fiche(s) récupérée(s) sur {total}.', { n: fixed, total: gameIds.length });
    });

  const retryImages = (gameIds: string[]) =>
    run(`img:${gameIds.join(',')}`, async () => {
      for (const gameId of gameIds) {
        // imagesComplete repassé à false : retryMissingImages ne retente que dans ce cas.
        await updateCacheEntry(gameId, { imagesComplete: false });
        await retryMissingImages(gameId);
      }
    });

  const button = (key: string, label: string, onClick: () => void, primary = false) => (
    <button type="button" onClick={onClick} disabled={busy !== null} className={`btn flex-shrink-0 py-1 text-[12px] ${primary ? 'btn-primary' : ''}`}>
      {busy === key ? '…' : label}
    </button>
  );

  const count = report ? healthIssueCount(report) : 0;
  const renamable = report ? renamableFolders(report) : [];

  return (
    <div className="py-4">
      <div className="flex items-center gap-3">
        <Stethoscope size={18} strokeWidth={2.25} className="text-accent" />
        <div className="section-title flex-1">{t('Bilan de santé de la bibliothèque')}</div>
        <button type="button" onClick={refresh} disabled={checking || busy !== null} className="btn btn-ghost py-1 text-[12px]">
          <RefreshCw size={14} strokeWidth={2.25} className={checking ? 'animate-spin' : ''} />
          {t('Revérifier')}
        </button>
      </div>

      {report && count === 0 && (
        <p className="mb-0 mt-3 flex items-center gap-2 text-[13px] text-text-secondary">
          <CircleCheck size={16} strokeWidth={2.25} className="text-play" />
          {t('Rien à signaler sur {n} jeux.', { n: report.gameCount })}
        </p>
      )}
      {report && count > 0 && (
        <p className="mb-2 mt-3 text-[13px] text-text-secondary">
          {count > 1 ? t('{n} problèmes trouvés. Rien n’est corrigé ni supprimé sans ton clic.', { n: count }) : t('1 problème trouvé. Rien n’est corrigé ni supprimé sans ton clic.')}
        </p>
      )}
      {message && <p className="mb-2 mt-2 text-[13px] text-text-secondary">{message}</p>}
      {error && <p className="mb-2 mt-2 text-[13px] text-danger">{error}</p>}

      {report && (
        <>
          <IssueGroup title={t('Jeux sans exécutable trouvé')} count={report.noExecutable.length}>
            {report.noExecutable.map(issue => (
              <IssueRow
                key={issue.gameId}
                label={`${issue.gameId} · ${nameOf(issue.gameId)}`}
                detail={issue.chosenMissing ? t('Exécutable choisi introuvable : {path}', { path: issue.chosenMissing }) : t('Aucun .exe dans le dossier')}
              >
                {button(`exe:${issue.gameId}`, t("Choisir l'exécutable"), () => run(`exe:${issue.gameId}`, () => onChooseExecutable(issue.gameId)))}
                {button(`open:${issue.gameId}`, t('Ouvrir'), () => onOpenGame(issue.gameId))}
              </IssueRow>
            ))}
          </IssueGroup>

          <IssueGroup
            title={t('Fiches en échec')}
            count={report.fetchFailed.length}
            action={report.fetchFailed.length > 1 && button(`fetch:${report.fetchFailed.map(i => i.gameId).join(',')}`, t('Tout réessayer'), () => retryFetches(report.fetchFailed.map(i => i.gameId)), true)}
          >
            {report.fetchFailed.map(issue => (
              <IssueRow key={issue.gameId} label={issue.gameId} detail={issue.error}>
                {button(`fetch:${issue.gameId}`, t('Réessayer'), () => retryFetches([issue.gameId]))}
                {button(`open:${issue.gameId}`, t('Ouvrir'), () => onOpenGame(issue.gameId))}
              </IssueRow>
            ))}
          </IssueGroup>

          <IssueGroup
            title={t('Images manquantes')}
            count={report.missingImages.length}
            action={report.missingImages.length > 1 && button(`img:${report.missingImages.map(i => i.gameId).join(',')}`, t('Tout retélécharger'), () => retryImages(report.missingImages.map(i => i.gameId)), true)}
          >
            {report.missingImages.map(issue => (
              <IssueRow
                key={issue.gameId}
                label={`${issue.gameId} · ${nameOf(issue.gameId)}`}
                detail={[issue.cover ? t('jaquette') : null, issue.samples > 0 ? t('{n} échantillon(s)', { n: issue.samples }) : null].filter(Boolean).join(' · ') || t('téléchargement incomplet')}
              >
                {button(`img:${issue.gameId}`, t('Retélécharger'), () => retryImages([issue.gameId]))}
              </IssueRow>
            ))}
          </IssueGroup>

          <IssueGroup
            title={t('Dossiers mal nommés (invisibles)')}
            count={report.misnamed.length}
            action={
              renamable.length > 0 &&
              button('rename', t('Renommer ({n})', { n: renamable.length }), () =>
                run('rename', async () => {
                  const results = await window.electronAPI.renameMisnamedFolders(renamable);
                  const failed = results.filter(r => r.error);
                  if (failed.length > 0) throw new Error(failed.map(r => `${r.folder} : ${r.error}`).join('\n'));
                }), true)
            }
          >
            {report.misnamed.map(folder => (
              <IssueRow
                key={misnamedPath(folder)}
                label={`${misnamedPath(folder)} → ${folder.gameId}`}
                detail={folder.conflict === 'exists' ? t('un dossier porte déjà cet ID') : folder.conflict === 'duplicate' ? t('plusieurs dossiers pour cet ID') : null}
              />
            ))}
          </IssueGroup>

          <IssueGroup title={t('Dossiers de bibliothèque introuvables')} count={report.missingRoots.length}>
            <li className="text-[12px] text-text-secondary">
              {t('Disque débranché ou dossier renommé : ses jeux sont cachés (et listés plus bas comme disparus) jusqu’à son retour.')}
            </li>
            {report.missingRoots.map(root => (
              <IssueRow key={root} label={root} />
            ))}
          </IssueGroup>

          <IssueGroup title={t('Jeux présents dans plusieurs dossiers')} count={report.duplicates.length}>
            <li className="text-[12px] text-text-secondary">
              {t('Seule la copie du premier dossier est utilisée ; supprime ou déplace l’autre à la main.')}
            </li>
            {report.duplicates.map(issue => (
              <IssueRow key={issue.gameId} label={`${issue.gameId} · ${nameOf(issue.gameId)}`} detail={issue.roots.join(' · ')}>
                {button(`open:${issue.gameId}`, t('Ouvrir'), () => onOpenGame(issue.gameId))}
              </IssueRow>
            ))}
          </IssueGroup>

          <IssueGroup title={t('Fiches dont le dossier a disparu')} count={report.orphans.length}>
            <li className="text-[12px] text-text-secondary">
              {t('Gardées (note, temps de jeu, images) et invisibles dans la bibliothèque : elles réapparaissent si le dossier revient.')}
            </li>
            {report.orphans.map(orphan => (
              <IssueRow key={orphan.gameId} label={`${orphan.gameId} · ${orphan.name}`}>
                {button(`wish:${orphan.gameId}`, t('Ajouter aux souhaits'), () =>
                  run(`wish:${orphan.gameId}`, async () => describeAddResult(await addToWishlist(orphan.gameId)))
                )}
              </IssueRow>
            ))}
          </IssueGroup>

          <IssueGroup title={t('Patchs dont des fichiers ont disparu')} count={report.brokenPatches.length}>
            {report.brokenPatches.map(issue => (
              <IssueRow
                key={`${issue.gameId}:${issue.patchId}`}
                label={`${issue.gameId} · ${issue.name}`}
                detail={[
                  issue.missingFiles.length > 0 ? t('{n} fichier(s) du patch absent(s)', { n: issue.missingFiles.length }) : null,
                  issue.missingBackups.length > 0 ? t("{n} copie(s) d'origine absente(s)", { n: issue.missingBackups.length }) : null
                ].filter(Boolean).join(' · ')}
              >
                {issue.isLast
                  ? button(`patch:${issue.gameId}`, t('Désinstaller'), () => {
                      if (!window.confirm(t('Désinstaller le patch « {name} » ? Les fichiers d’origine encore sauvegardés sont restaurés.', { name: issue.name }))) return;
                      run(`patch:${issue.gameId}`, async () => {
                        await uninstallLastPatch(issue.gameId);
                      });
                    })
                  : button(`open:${issue.gameId}`, t('Ouvrir'), () => onOpenGame(issue.gameId))}
              </IssueRow>
            ))}
          </IssueGroup>
        </>
      )}
    </div>
  );
}
