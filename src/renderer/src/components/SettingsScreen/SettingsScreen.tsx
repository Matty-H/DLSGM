import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Download, Eye, FolderOpen, Gamepad2, Globe, HardDrive, Layers, Languages, Library, Plus, Trash2, type LucideIcon } from 'lucide-react';
import { resetAndRedownloadImages, updateAllMetadata, type BulkUpdateResult } from '../../lib/dataFetcher.js';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import GenreTranslationsEditor from '../GenreTranslationsEditor/GenreTranslationsEditor';
import PiaSettings from '../PiaSettings/PiaSettings';
import type { GenreTranslations } from '../../lib/genreNames.js';
import { getSandboxieStatus, type SandboxieStatus } from '../../lib/gameTools.js';
import type { AppSettings } from '../../hooks/useSettings';
import { addCollection, moveCollection, removeCollection, type GameCollection } from '../../lib/collections.js';
import Select from '../Select/Select';

// Même format que la validation côté main (src/main/dlsite-net.ts).
const PROXY_REGEX = /^(https?|socks[45]?):\/\/[A-Za-z0-9.\-[\]:]+:\d{1,5}$/;

export interface SettingsScreenProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  /** Genres bruts (non canonicalisés) présents dans la bibliothèque, pour les sélecteurs de liaison. */
  allGenres: string[];
  genreTranslations: GenreTranslations;
  onSetGenreTranslation: (japanese: string, english: string | null) => Promise<void>;
  /** Après une mise à jour groupée des fiches : relire le cache. */
  onMetadataUpdated: () => void;
}

/** Mise à jour groupée des fiches depuis DLsite (Paramètres › Stockage). */
function BulkMetadataUpdate({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<BulkUpdateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const start = async () => {
    const confirmed = window.confirm(
      'Récupérer à nouveau les métadonnées de toutes les fiches depuis DLsite, en japonais avec leurs traductions anglaises ?\n\n' +
        'Titres, cercles et tags passeront tous en japonais (langue de référence). Images, notes, tags perso, temps de jeu et collections ne sont pas touchés, ni les fiches modifiées à la main. Une copie de la base est faite avant.'
    );
    if (!confirmed) return;
    cancelRef.current = false;
    setResult(null);
    setError(null);
    try {
      await window.electronAPI.snapshotCache();
      setResult(await updateAllMetadata({ onProgress: (done, total) => setProgress({ done, total }), isCancelled: () => cancelRef.current }));
      onDone();
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setProgress(null);
    }
  };

  return (
    <SettingRow
      label="Mettre à jour toutes les fiches"
      description={
        <>
          Récupère à nouveau chaque fiche depuis DLsite en japonais (langue de référence), avec les traductions anglaises :
          une bibliothèque récupérée en plusieurs langues redevient homogène (ex: « cat 3 » et « 猫3 », même cercle), le
          dictionnaire des tags se complète, et les anciennes fiches gagnent l'identifiant de cercle. Une fiche dont la récupération échoue (œuvre
          retirée, restriction régionale) reste telle quelle. Copie de la base dans userData/db_backups avant de commencer.
          {progress && (
            <span className="mt-2 block text-text-secondary">
              {progress.done} / {progress.total}…
            </span>
          )}
          {result && (
            <span className="mt-2 block text-text-secondary">
              {result.cancelled ? 'Interrompu. ' : ''}
              {result.updated.length} mise{result.updated.length > 1 ? 's' : ''} à jour
              {result.skipped.length > 0 && ` · ${result.skipped.length} ignorée${result.skipped.length > 1 ? 's' : ''} (modifiées à la main ou en échec)`}
              {result.failed.length > 0 && (
                <span className="block text-danger">
                  Échec, fiche conservée : {result.failed.map(f => f.gameId).join(', ')}
                </span>
              )}
            </span>
          )}
          {error && <span className="mt-2 block text-danger">{error}</span>}
        </>
      }
    >
      {progress ? (
        <button type="button" onClick={() => (cancelRef.current = true)} className="btn">
          Interrompre
        </button>
      ) : (
        <button type="button" onClick={start} className="btn">
          Mettre à jour
        </button>
      )}
    </SettingRow>
  );
}

const REFRESH_PRESETS = [
  { value: 0, label: 'Jamais (manuel)' },
  { value: 30, label: 'Toutes les 30 min' },
  { value: 60, label: 'Toutes les heures' },
  { value: 1440, label: 'Une fois par jour' }
];

/** Ramène une valeur libre de rafraîchissement (minutes) au préréglage le plus proche. */
function nearestPreset(minutes: number): number {
  return REFRESH_PRESETS.reduce((closest, { value }) =>
    Math.abs(value - minutes) < Math.abs(closest - minutes) ? value : closest
  , REFRESH_PRESETS[0].value);
}

type SettingsSection = 'library' | 'network' | 'display' | 'launch' | 'collections' | 'genres' | 'storage';

const SECTIONS: { id: SettingsSection; label: string; Icon: LucideIcon }[] = [
  { id: 'library', label: 'Bibliothèque', Icon: Library },
  { id: 'network', label: 'Réseau & VPN', Icon: Globe },
  { id: 'display', label: 'Affichage', Icon: Eye },
  { id: 'launch', label: 'Lancement', Icon: Gamepad2 },
  { id: 'collections', label: 'Collections', Icon: Layers },
  { id: 'genres', label: 'Traduction des tags', Icon: Languages },
  { id: 'storage', label: 'Stockage', Icon: HardDrive }
];

/** Ligne de réglage SteamOS : libellé et description à gauche, contrôle à droite. */
function SettingRow({ label, description, children }: { label: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-divider py-4 last:border-0">
      <div className="min-w-0">
        <div className="text-[15px] font-semibold">{label}</div>
        {description && <div className="mt-1 text-[13px] leading-relaxed text-text-muted">{description}</div>}
      </div>
      {children && <div className="flex flex-shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

/**
 * Paramètres façon SteamOS : menu de sections à gauche, lignes de réglage à
 * droite. Les modifications restent locales jusqu'à "Enregistrer" (le
 * parent rescanne la bibliothèque à l'enregistrement).
 */
export default function SettingsScreen({
  settings,
  onSave,
  allGenres,
  onMetadataUpdated,
  genreTranslations,
  onSetGenreTranslation
}: SettingsScreenProps) {
  const [destinationFolder, setDestinationFolder] = useState(settings.destinationFolder);
  const [refreshRate, setRefreshRate] = useState(settings.refreshRate);
  const [language, setLanguage] = useState(settings.language);
  const [blurAdultContent, setBlurAdultContent] = useState(settings.blurAdultContent);
  const [sandboxLaunch, setSandboxLaunch] = useState(settings.sandboxLaunch);
  const [startFullscreen, setStartFullscreen] = useState(settings.startFullscreen);
  const [dlsiteProxy, setDlsiteProxy] = useState(settings.dlsiteProxy ?? '');
  const [collections, setCollections] = useState<GameCollection[]>(settings.collections ?? []);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [autoBackupSaves, setAutoBackupSaves] = useState(settings.autoBackupSaves);
  const [closeToTray, setCloseToTray] = useState(settings.closeToTray);
  const [piaRetry, setPiaRetry] = useState(settings.piaRetry);
  const [piaRegion, setPiaRegion] = useState(settings.piaRegion);
  const [workspaceFolder, setWorkspaceFolder] = useState(settings.workspaceFolder ?? '');
  const [defaultWorkspaceRoot, setDefaultWorkspaceRoot] = useState('');
  const [sandboxieStatus, setSandboxieStatus] = useState<SandboxieStatus | null>(null);
  const [isResettingImages, setIsResettingImages] = useState(false);
  const [section, setSection] = useState<SettingsSection>('library');

  useEffect(() => {
    setDestinationFolder(settings.destinationFolder);
    setRefreshRate(settings.refreshRate);
    setLanguage(settings.language);
    setBlurAdultContent(settings.blurAdultContent);
    setSandboxLaunch(settings.sandboxLaunch);
    setStartFullscreen(settings.startFullscreen);
    setDlsiteProxy(settings.dlsiteProxy ?? '');
    setCollections(settings.collections ?? []);
    setAutoBackupSaves(settings.autoBackupSaves);
    setCloseToTray(settings.closeToTray);
    setPiaRetry(settings.piaRetry);
    setPiaRegion(settings.piaRegion);
    setWorkspaceFolder(settings.workspaceFolder ?? '');
  }, [settings]);

  // Racine effective quand le champ est vide (Documents/DLSGM/Travaux), pour l'afficher.
  useEffect(() => {
    if (settings.workspaceFolder) return;
    window.electronAPI.getWorkspaceRoot().then(setDefaultWorkspaceRoot).catch(() => undefined);
  }, [settings.workspaceFolder]);

  useEffect(() => {
    let cancelled = false;
    getSandboxieStatus()
      .then(status => !cancelled && setSandboxieStatus(status))
      .catch(() => !cancelled && setSandboxieStatus({ available: false, installDir: null }));
    return () => {
      cancelled = true;
    };
  }, []);


  const isDirty =
    destinationFolder !== settings.destinationFolder ||
    refreshRate !== settings.refreshRate ||
    language !== settings.language ||
    blurAdultContent !== settings.blurAdultContent ||
    sandboxLaunch !== settings.sandboxLaunch ||
    startFullscreen !== settings.startFullscreen ||
    dlsiteProxy.trim() !== (settings.dlsiteProxy ?? '') ||
    autoBackupSaves !== settings.autoBackupSaves ||
    closeToTray !== settings.closeToTray ||
    piaRetry !== settings.piaRetry ||
    piaRegion !== settings.piaRegion ||
    workspaceFolder !== (settings.workspaceFolder ?? '') ||
    JSON.stringify(collections) !== JSON.stringify(settings.collections ?? []);

  const handleBrowse = async () => {
    const folderPath = await window.electronAPI.openFolderDialog();
    if (folderPath) setDestinationFolder(folderPath);
  };

  const proxyValid = dlsiteProxy.trim() === '' || PROXY_REGEX.test(dlsiteProxy.trim());
  // Noms de collections renommées : ni vides, ni en double.
  const collectionNames = collections.map(c => c.name.trim().toLocaleLowerCase());
  const collectionsValid = collectionNames.every((name, i) => name !== '' && collectionNames.indexOf(name) === i);

  const handleAddCollection = () => {
    const result = addCollection(collections, newCollectionName);
    if (!result) return;
    setCollections(result.collections);
    setNewCollectionName('');
  };

  const handleSave = () => {
    if (!proxyValid || !collectionsValid) return;
    onSave({
      ...settings,
      destinationFolder,
      refreshRate,
      language,
      blurAdultContent,
      sandboxLaunch,
      startFullscreen,
      dlsiteProxy: dlsiteProxy.trim(),
      collections: collections.map(c => ({ ...c, name: c.name.trim().replace(/\s+/g, ' ') })),
      autoBackupSaves,
      closeToTray,
      piaRetry,
      piaRegion,
      workspaceFolder
    });
  };

  const handleResetImages = async () => {
    const confirmed = window.confirm(
      'Supprimer et retélécharger toutes les jaquettes et images depuis DLsite ? Cette action est irréversible et peut prendre du temps.'
    );
    if (!confirmed) return;
    setIsResettingImages(true);
    try {
      await resetAndRedownloadImages();
    } finally {
      setIsResettingImages(false);
    }
  };


  return (
    <div className="animate-steam-in flex min-h-0 flex-1 gap-6 overflow-hidden px-6 pb-6 pt-4">
      <nav className="flex w-[240px] flex-shrink-0 flex-col gap-1">
        <h1 className="mb-4 px-3">Paramètres</h1>
        {SECTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={`flex items-center gap-3 rounded-sm px-3 py-2.5 text-left text-[15px] font-semibold transition-colors ${
              section === id ? 'bg-focus text-on-focus' : 'text-text-secondary hover:bg-white/10 hover:text-text'
            }`}
          >
            <Icon size={18} strokeWidth={2.25} />
            {label}
          </button>
        ))}

        <div className="mt-auto flex flex-col gap-2 px-1">
          {isDirty && <span className="text-[12px] text-text-muted">Modifications non enregistrées</span>}
          <button type="button" onClick={handleSave} disabled={!isDirty || !proxyValid || !collectionsValid} className="btn btn-primary btn-block py-3">
            Enregistrer
          </button>
        </div>
      </nav>

      <div data-scroll-root className="panel max-h-full min-h-0 flex-1 self-start overflow-y-auto px-6 py-2">
        {section === 'library' && (
          <>
            <SettingRow label="Dossier de bibliothèque" description={destinationFolder || 'Aucun dossier sélectionné'}>
              <button type="button" onClick={handleBrowse} className="btn">
                <FolderOpen size={16} strokeWidth={2.25} />
                Parcourir
              </button>
            </SettingRow>

            <SettingRow
              label="Dossier des travaux"
              description={
                <>
                  Un sous-dossier par jeu (<span className="font-mono">&lt;ID&gt;</span>) pour ranger ce que tu fais sur un jeu
                  (data mining, extractions, notes), ouvert depuis sa page. Hors du dossier du jeu : jamais envoyé en
                  partage réseau, jamais touché par les patchs ni supprimé.
                  <span className="mt-1 block text-text-secondary">{workspaceFolder || `${defaultWorkspaceRoot} (par défaut)`}</span>
                </>
              }
            >
              {workspaceFolder && (
                <button type="button" onClick={() => setWorkspaceFolder('')} className="btn btn-ghost" title="Revenir au dossier par défaut">
                  Par défaut
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  const folder = await window.electronAPI.openFolderDialog();
                  if (folder) setWorkspaceFolder(folder);
                }}
                className="btn"
              >
                <FolderOpen size={16} strokeWidth={2.25} />
                Parcourir
              </button>
            </SettingRow>

            <SettingRow label="Rafraîchissement du cache"
 description="Relit périodiquement le cache pour afficher les données mises à jour en arrière-plan.">
              <Select
                value={nearestPreset(refreshRate)}
                options={REFRESH_PRESETS}
                onChange={setRefreshRate}
                aria-label="Fréquence de rafraîchissement du cache"
                className="w-[200px]"
              />
            </SettingRow>

            <SettingRow
              label="Langue des tags"
              description="Les fiches sont toujours récupérées en japonais (langue de référence), avec la traduction anglaise de DLsite. Choisis la langue dans laquelle afficher les tags ; titres et cercles restent en japonais (la recherche trouve aussi leur nom anglais)."
            >
              <div className="seg">
                <label className="seg-opt">
                  <input type="radio" name="language" checked={language === 'en_US'} onChange={() => setLanguage('en_US')} />
                  English (traduction)
                </label>
                <label className="seg-opt">
                  <input type="radio" name="language" checked={language === 'ja_JP'} onChange={() => setLanguage('ja_JP')} />
                  日本語 (original)
                </label>
              </div>
            </SettingRow>
          </>
        )}

        {section === 'network' && (
          <>
            <SettingRow
              label="Proxy pour DLsite"
              description={
                <>
                  Utilisé pour les fiches et les images DLsite (ex: un proxy japonais pour les œuvres restreintes par
                  région), en permanence — pour un VPN à la demande, voir PIA ci-dessous. Vide : proxy de Windows. Formats : http://hôte:port ou socks5://hôte:port — un proxy de
                  navigateur (extension) n'a pas d'effet ici, il faut son adresse.
                  {!proxyValid && <span className="mt-1 block text-danger">Adresse invalide (ex: http://127.0.0.1:8080).</span>}
                </>
              }
            >
              <input
                className="input w-[260px]"
                placeholder="Proxy système"
                aria-label="Proxy pour DLsite"
                spellCheck={false}
                value={dlsiteProxy}
                onChange={e => setDlsiteProxy(e.target.value)}
              />
            </SettingRow>

            <PiaSettings
              enabled={piaRetry}
              region={piaRegion}
              onEnabledChange={setPiaRetry}
              onRegionChange={setPiaRegion}
              regionDirty={piaRegion !== settings.piaRegion}
              onRetried={onMetadataUpdated}
            />
          </>
        )}

        {section === 'display' && (
          <>
            <SettingRow label="Flouter le contenu adulte (R18)" description="Les jaquettes R18 restent floutées dans la grille jusqu'à un clic.">
              <input
                type="checkbox"
                className="toggle"
                aria-label="Flouter le contenu adulte"
                checked={blurAdultContent}
                onChange={e => setBlurAdultContent(e.target.checked)}
              />
            </SettingRow>
            <SettingRow
              label="Démarrer en plein écran"
              description="F11, le bouton en haut à droite ou le bouton View de la manette basculent le plein écran à tout moment."
            >
              <input
                type="checkbox"
                className="toggle"
                aria-label="Démarrer en plein écran"
                checked={startFullscreen}
                onChange={e => setStartFullscreen(e.target.checked)}
              />
            </SettingRow>
            <SettingRow
              label="Réduire dans la zone de notification"
              description="Fermer la fenêtre la cache au lieu de quitter : le suivi du temps de jeu, la copie des sauvegardes et la réception réseau local continuent. Clic sur l'icône pour rouvrir, « Quitter » dans son menu pour quitter."
            >
              <input
                type="checkbox"
                className="toggle"
                aria-label="Réduire dans la zone de notification"
                checked={closeToTray}
                onChange={e => setCloseToTray(e.target.checked)}
              />
            </SettingRow>
          </>
        )}

        {section === 'launch' && (
          <>
          <SettingRow
            label="Copier les sauvegardes à la fermeture d'un jeu"
            description="Copie les dossiers de sauvegarde détectés (page du jeu › Outils) dans les données de DLSGM à chaque fin de partie, si quelque chose a changé. Les 10 dernières copies automatiques sont gardées par jeu ; restauration depuis la page du jeu."
          >
            <input
              type="checkbox"
              className="toggle"
              aria-label="Copier les sauvegardes à la fermeture d'un jeu"
              checked={autoBackupSaves}
              onChange={e => setAutoBackupSaves(e.target.checked)}
            />
          </SettingRow>
          <SettingRow
            label="Lancer les jeux dans Sandboxie-Plus"
            description={
              <>
                Chaque jeu tourne dans sa propre sandbox : ce qu'il écrit hors de son dossier (AppData, registre) y est
                isolé au lieu de polluer Windows. Son dossier reste en accès direct (sauvegardes locales, patchs). Ce
                n'est pas une machine virtuelle : ça limite les dégâts d'un exécutable douteux sans les rendre impossibles.
                {sandboxieStatus && (
                  <span className={`mt-2 block ${!sandboxieStatus.available && sandboxLaunch ? 'text-danger' : ''}`}>
                    {sandboxieStatus.available ? (
                      `Sandboxie détecté : ${sandboxieStatus.installDir}`
                    ) : (
                      <>
                        Sandboxie-Plus n'est pas installé
                        {sandboxLaunch && ' — les jeux ne pourront pas être lancés tant que ce sera le cas'}.{' '}
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                          onClick={() => window.electronAPI.openExternal('https://sandboxie-plus.com/downloads/')}
                        >
                          <Download size={13} strokeWidth={2.5} />
                          Télécharger
                        </button>
                      </>
                    )}
                  </span>
                )}
              </>
            }
          >
            <input
              type="checkbox"
              className="toggle"
              aria-label="Lancer les jeux dans Sandboxie-Plus"
              checked={sandboxLaunch}
              onChange={e => setSandboxLaunch(e.target.checked)}
            />
          </SettingRow>
          </>
        )}

        {section === 'collections' && (
          <div className="py-4">
            <div className="text-[15px] font-semibold">Mes collections</div>
            <p className="mb-4 mt-1 text-[13px] leading-relaxed text-text-muted">
              Chaque collection a son étagère sur l'accueil, dans cet ordre, et sert de filtre dans la bibliothèque. On y
              ajoute un jeu depuis sa page. « À finir », « Jamais lancés » et « Finis » sont automatiques.
            </p>
            {collections.map((collection, index) => (
              <div key={collection.id} className="flex items-center gap-2 border-b border-divider py-1.5 last:border-0">
                <input
                  className="input flex-1"
                  aria-label={`Nom de la collection ${collection.name}`}
                  value={collection.name}
                  onChange={e => setCollections(prev => prev.map(c => (c.id === collection.id ? { ...c, name: e.target.value } : c)))}
                />
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => setCollections(prev => moveCollection(prev, collection.id, -1))}
                  aria-label={`Monter ${collection.name}`}
                  className="btn btn-ghost btn-icon"
                >
                  <ArrowUp size={16} strokeWidth={2.25} />
                </button>
                <button
                  type="button"
                  disabled={index === collections.length - 1}
                  onClick={() => setCollections(prev => moveCollection(prev, collection.id, 1))}
                  aria-label={`Descendre ${collection.name}`}
                  className="btn btn-ghost btn-icon"
                >
                  <ArrowDown size={16} strokeWidth={2.25} />
                </button>
                <button
                  type="button"
                  onClick={() => setCollections(prev => removeCollection(prev, collection.id))}
                  aria-label={`Supprimer ${collection.name}`}
                  title="Supprimer la collection (les jeux ne sont pas touchés)"
                  className="btn btn-ghost btn-icon"
                >
                  <Trash2 size={16} strokeWidth={2.25} />
                </button>
              </div>
            ))}
            {!collectionsValid && <p className="mt-2 text-[13px] text-danger">Chaque collection doit avoir un nom, différent des autres.</p>}
            <div className="mt-4 flex gap-2">
              <input
                className="input flex-1"
                placeholder="Nouvelle collection…"
                aria-label="Nom de la nouvelle collection"
                value={newCollectionName}
                onChange={e => setNewCollectionName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCollection()}
              />
              <button type="button" onClick={handleAddCollection} className="btn">
                <Plus size={16} strokeWidth={2.25} />
                Créer
              </button>
            </div>
          </div>
        )}


        {section === 'genres' && (
          <GenreTranslationsEditor translations={genreTranslations} libraryGenres={allGenres} onSetTranslation={onSetGenreTranslation} />
        )}

        {section === 'storage' && (
          <>
          <BulkMetadataUpdate onDone={onMetadataUpdated} />
          <SettingRow
            label="Cache images"
            description="Supprime et retélécharge toutes les jaquettes et images depuis DLsite. Irréversible, et peut prendre du temps."
          >
            <button type="button" onClick={handleResetImages} disabled={isResettingImages} className="btn">
              {isResettingImages ? 'Réinitialisation en cours…' : 'Réinitialiser'}
            </button>
          </SettingRow>
          </>
        )}

      </div>
    </div>
  );
}
