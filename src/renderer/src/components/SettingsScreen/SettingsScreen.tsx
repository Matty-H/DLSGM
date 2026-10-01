import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, Clapperboard, Download, Eye, FolderOpen, Gamepad2, Globe, HardDrive, Layers, Languages, Library, MousePointerClick, PanelsTopLeft, ScanEye, type LucideIcon } from 'lucide-react';
import { resetAndRedownloadImages, updateAllMetadata, type BulkUpdateResult } from '../../lib/dataFetcher.js';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import GenreTranslationsEditor from '../GenreTranslationsEditor/GenreTranslationsEditor';
import PiaSettings from '../PiaSettings/PiaSettings';
import WipBadge from '../WipBadge/WipBadge';
import IpChecker from '../IpChecker/IpChecker';
import ArchivePasswords from '../ArchivePasswords/ArchivePasswords';
import type { GenreNames, GenreTranslations } from '../../lib/genreNames.js';
import { getSandboxieStatus, type SandboxieStatus } from '../../lib/gameTools.js';
import type { AppSettings } from '../../hooks/useSettings';
import type { GameCollection, HomeShelfPrefs } from '../../lib/collections.js';
import type { GameListItem } from '../../lib/filterManager.js';
import { buildProxyUrl, parseProxyForm, proxyFormError, EMPTY_PROXY_FORM, type ProxyForm as ProxyFormValue } from '../../lib/proxyForm.js';
import CollectionsSettings from '../CollectionsSettings/CollectionsSettings';
import ProxyForm from '../ProxyForm/ProxyForm';
import AutoClickerSettings from '../AutoClickerSettings/AutoClickerSettings';
import PixelTriggerSettings from '../PixelTriggerSettings/PixelTriggerSettings';
import MacroSettings from '../MacroSettings/MacroSettings';
import type { MacroRecorderSettings } from '../../lib/macros.js';
import type { PixelTriggerSettings as TriggerSettings } from '../../lib/pixelTrigger.js';
import type { AutoClickerSettings as ClickerSettings } from '../../lib/autoClicker.js';
import Select from '../Select/Select';


export interface SettingsScreenProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  /** Genres bruts (non canonicalisés) présents dans la bibliothèque, pour les sélecteurs de liaison. */
  allGenres: string[];
  genreTranslations: GenreTranslations;
  onSetGenreTranslation: (japanese: string, english: string | null) => Promise<void>;
  /** Après une mise à jour groupée des fiches : relire le cache. */
  onMetadataUpdated: () => void;
  /** Jeux présents (choix des jeux d'une collection, valeurs proposées pour ses règles). */
  games: GameListItem[];
  genreNames: GenreNames;
  onUpdateGame: (gameId: string, patch: Record<string, unknown>) => void;
  getWorkImageSrc: (gameId: string) => string;
  /** Ouverture sur une section (et une collection dépliée) — lien depuis l'accueil. */
  initialSection?: SettingsSection;
  initialCollectionId?: string | null;
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

export type SettingsSection = 'library' | 'network' | 'display' | 'launch' | 'clicker' | 'collections' | 'genres' | 'storage';

const SECTIONS: { id: SettingsSection; label: string; Icon: LucideIcon }[] = [
  { id: 'library', label: 'Bibliothèque', Icon: Library },
  { id: 'network', label: 'Réseau & VPN', Icon: Globe },
  { id: 'display', label: 'Affichage', Icon: Eye },
  { id: 'launch', label: 'Lancement', Icon: Gamepad2 },
  { id: 'clicker', label: 'Outils en jeu', Icon: MousePointerClick },
  { id: 'collections', label: 'Collections', Icon: Layers },
  { id: 'genres', label: 'Traduction des tags', Icon: Languages },
  { id: 'storage', label: 'Stockage', Icon: HardDrive }
];

/** Ligne de réglage SteamOS : libellé et description à gauche, contrôle à droite. */
function SettingRow({ label, description, children }: { label: ReactNode; description?: ReactNode; children?: ReactNode }) {
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

/** Un outil de l'onglet « Outils en jeu » : en-tête (icône, nom, résumé) puis ses réglages, dans son propre cadre. */
function ToolGroup({ Icon, title, summary, children }: { Icon: LucideIcon; title: string; summary: ReactNode; children: ReactNode }) {
  return (
    <section className="panel mb-6 border border-divider px-5 pb-1 pt-4">
      <div className="flex items-center gap-3 border-b border-divider pb-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
          <Icon size={18} strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <h3 className="m-0 text-[17px] font-bold">{title}</h3>
          <p className="m-0 text-[12px] text-text-muted">{summary}</p>
        </div>
      </div>
      {children}
    </section>
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
  onSetGenreTranslation,
  games,
  genreNames,
  onUpdateGame,
  getWorkImageSrc,
  initialSection = 'library',
  initialCollectionId
}: SettingsScreenProps) {
  const [destinationFolder, setDestinationFolder] = useState(settings.destinationFolder);
  const [refreshRate, setRefreshRate] = useState(settings.refreshRate);
  const [language, setLanguage] = useState(settings.language);
  const [blurAdultContent, setBlurAdultContent] = useState(settings.blurAdultContent);
  const [sandboxLaunch, setSandboxLaunch] = useState(settings.sandboxLaunch);
  const [startFullscreen, setStartFullscreen] = useState(settings.startFullscreen);
  const storedProxyForm = useMemo(() => parseProxyForm(settings.dlsiteProxy ?? ''), [settings.dlsiteProxy]);
  const [proxyForm, setProxyForm] = useState<ProxyFormValue>(storedProxyForm ?? EMPTY_PROXY_FORM);
  const [proxyTest, setProxyTest] = useState<string | null>(null);
  const [collections, setCollections] = useState<GameCollection[]>(settings.collections ?? []);
  const [homeShelves, setHomeShelves] = useState<Record<string, HomeShelfPrefs>>(settings.homeShelves ?? {});
  const [showWipNetwork, setShowWipNetwork] = useState(false);
  const [autoClicker, setAutoClicker] = useState<ClickerSettings>(settings.autoClicker);
  const [pixelTrigger, setPixelTrigger] = useState<TriggerSettings>(settings.pixelTrigger);
  const [macroRecorder, setMacroRecorder] = useState<MacroRecorderSettings>(settings.macroRecorder);
  const [textractorPath, setTextractorPath] = useState(settings.textractorPath ?? '');
  const [textractorOutput, setTextractorOutput] = useState(settings.textractorOutput ?? 'both');
  const [rpgMakerExtractor, setRpgMakerExtractor] = useState(Boolean(settings.rpgMakerExtractor));
  const [textractorFound, setTextractorFound] = useState<{ x86: boolean; x64: boolean } | null>(null);
  const [overlayEnabled, setOverlayEnabled] = useState(settings.overlayEnabled);
  const [autoBackupSaves, setAutoBackupSaves] = useState(settings.autoBackupSaves);
  const [closeToTray, setCloseToTray] = useState(settings.closeToTray);
  const [piaRetry, setPiaRetry] = useState(settings.piaRetry);
  const [piaRegion, setPiaRegion] = useState(settings.piaRegion);
  const [workspaceFolder, setWorkspaceFolder] = useState(settings.workspaceFolder ?? '');
  const [defaultWorkspaceRoot, setDefaultWorkspaceRoot] = useState('');
  const [sandboxieStatus, setSandboxieStatus] = useState<SandboxieStatus | null>(null);
  const [isResettingImages, setIsResettingImages] = useState(false);
  const [section, setSection] = useState<SettingsSection>(initialSection);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection, initialCollectionId]);

  useEffect(() => {
    setDestinationFolder(settings.destinationFolder);
    setRefreshRate(settings.refreshRate);
    setLanguage(settings.language);
    setBlurAdultContent(settings.blurAdultContent);
    setSandboxLaunch(settings.sandboxLaunch);
    setStartFullscreen(settings.startFullscreen);
    setProxyForm(parseProxyForm(settings.dlsiteProxy ?? '') ?? EMPTY_PROXY_FORM);
    setCollections(settings.collections ?? []);
    setHomeShelves(settings.homeShelves ?? {});
    setAutoClicker(settings.autoClicker);
    setPixelTrigger(settings.pixelTrigger);
    setMacroRecorder(settings.macroRecorder);
    setTextractorPath(settings.textractorPath ?? '');
    setTextractorOutput(settings.textractorOutput ?? 'both');
    setRpgMakerExtractor(Boolean(settings.rpgMakerExtractor));
    setOverlayEnabled(settings.overlayEnabled);
    setAutoBackupSaves(settings.autoBackupSaves);
    setCloseToTray(settings.closeToTray);
    setPiaRetry(settings.piaRetry);
    setPiaRegion(settings.piaRegion);
    setWorkspaceFolder(settings.workspaceFolder ?? '');
  }, [settings]);

  // TextractorCLI présent (x86 / x64) dans le dossier choisi.
  useEffect(() => {
    let cancelled = false;
    setTextractorFound(null);
    if (!textractorPath) return;
    window.electronAPI
      .checkTextractor(textractorPath)
      .then(found => !cancelled && setTextractorFound(found))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [textractorPath]);

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


  const dlsiteProxy = buildProxyUrl(proxyForm, storedProxyForm?.username);
  const proxyError = proxyFormError(proxyForm);
  const proxyValid = proxyError === null;
  const proxyDirty = dlsiteProxy !== (settings.dlsiteProxy ?? '').trim();

  const clickerDirty = JSON.stringify(autoClicker) !== JSON.stringify(settings.autoClicker);
  const triggerDirty = JSON.stringify(pixelTrigger) !== JSON.stringify(settings.pixelTrigger);
  const macroDirty = JSON.stringify(macroRecorder) !== JSON.stringify(settings.macroRecorder);

  const isDirty =
    destinationFolder !== settings.destinationFolder ||
    refreshRate !== settings.refreshRate ||
    language !== settings.language ||
    blurAdultContent !== settings.blurAdultContent ||
    sandboxLaunch !== settings.sandboxLaunch ||
    startFullscreen !== settings.startFullscreen ||
    proxyDirty ||
    autoBackupSaves !== settings.autoBackupSaves ||
    closeToTray !== settings.closeToTray ||
    piaRetry !== settings.piaRetry ||
    piaRegion !== settings.piaRegion ||
    workspaceFolder !== (settings.workspaceFolder ?? '') ||
    JSON.stringify(collections) !== JSON.stringify(settings.collections ?? []) ||
    JSON.stringify(homeShelves) !== JSON.stringify(settings.homeShelves ?? {}) ||
    clickerDirty ||
    triggerDirty ||
    macroDirty ||
    textractorPath !== (settings.textractorPath ?? '') ||
    textractorOutput !== (settings.textractorOutput ?? 'both') ||
    rpgMakerExtractor !== Boolean(settings.rpgMakerExtractor) ||
    overlayEnabled !== settings.overlayEnabled;

  const handleBrowse = async () => {
    const folderPath = await window.electronAPI.openFolderDialog();
    if (folderPath) setDestinationFolder(folderPath);
  };

  // Noms de collections renommées : ni vides, ni en double.
  const collectionNames = collections.map(c => c.name.trim().toLocaleLowerCase());
  const collectionsValid = collectionNames.every((name, i) => name !== '' && collectionNames.indexOf(name) === i);

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
      dlsiteProxy,
      collections: collections.map(c => ({ ...c, name: c.name.trim().replace(/\s+/g, ' ') })),
      homeShelves,
      autoClicker,
      pixelTrigger,
      macroRecorder,
      textractorPath,
      textractorOutput,
      rpgMakerExtractor,
      overlayEnabled,
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

            <SettingRow
              label="Mots de passe d'archives"
              description="Essayés automatiquement à chaque import (en plus de ceux trouvés dans les fichiers texte de l'archive et du nom du site en tête de son nom). Ajoutés depuis le bilan d'un import ; supprimés ici immédiatement."
            >
              <ArchivePasswords />
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
            <div className="mt-4 rounded-md bg-bg-deep px-4 py-3 text-[13px] leading-relaxed text-text-secondary">
              <span className="font-semibold text-text">Section en cours de développement.</span> Une prochaine version se
              branchera de façon plus fiable à un VPN (SOCKS5, OpenVPN ou WireGuard). En attendant, pour les œuvres réservées
              au Japon : allume ton VPN sur le Japon (ex: PIA, région jp-tokyo) avant de lancer un scan ou « Mettre à jour
              toutes les fiches », en laissant le proxy vide.
            </div>
            <IpChecker />
            <button
              type="button"
              onClick={() => setShowWipNetwork(v => !v)}
              aria-expanded={showWipNetwork}
              className="btn btn-ghost my-2 self-start"
            >
              {showWipNetwork ? <ChevronDown size={16} strokeWidth={2.25} /> : <ChevronRight size={16} strokeWidth={2.25} />}
              Proxy et PIA <WipBadge />
            </button>
            {showWipNetwork && (
              <>
                <SettingRow
                  label={
                    <>
                      Proxy pour DLsite <WipBadge />
                    </>
                  }
                  description={
                    <>
                      Utilisé pour les fiches et les images DLsite, en permanence (ex: un proxy japonais pour les œuvres
                      restreintes par région). Aucun : proxy de Windows. Le mot de passe est chiffré (Windows) et ne
                      s'affiche plus ensuite. Un proxy de navigateur (extension) n'a pas d'effet ici, il faut son adresse.
                      {storedProxyForm === null && (
                        <span className="mt-1 block text-danger">Adresse enregistrée illisible : {settings.dlsiteProxy}</span>
                      )}
                      {proxyTest && proxyTest !== 'running' && (
                        <span className={`mt-1 block ${proxyTest.startsWith('Échec') ? 'text-danger' : 'text-text-secondary'}`}>{proxyTest}</span>
                      )}
                      {proxyError && <span className="mt-1 block text-danger">{proxyError}</span>}
                      <span className="mt-3 block">
                        <ProxyForm value={proxyForm} onChange={setProxyForm} storedType={storedProxyForm?.type ?? ''} />
                      </span>
                    </>
                  }
                >
                  <button
                    type="button"
                    className="btn"
                    disabled={proxyTest === 'running' || proxyDirty}
                    title={proxyDirty ? "Enregistre d'abord le proxy" : 'Tester l’accès à DLsite avec ce proxy'}
                    onClick={async () => {
                      setProxyTest('running');
                      try {
                        const { status, ms } = await window.electronAPI.testDlsiteConnection();
                        setProxyTest(status < 400 ? `DLsite répond (HTTP ${status}, ${ms} ms).` : `DLsite répond, mais avec une erreur HTTP ${status}.`);
                      } catch (error) {
                        setProxyTest(`Échec : ${ipcErrorMessage(error)}`);
                      }
                    }}
                  >
                    {proxyTest === 'running' ? 'Test…' : 'Tester'}
                  </button>
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
          <SettingRow
            label="Dossier de Textractor"
            description={
              <>
                Pour « Lancer avec Textractor » (page du jeu) : le dossier de Textractor, avec ses sous-dossiers
                <span className="font-mono"> x86</span> et <span className="font-mono">x64</span> (TextractorCLI.exe).
                <span className={`mt-1 block ${textractorPath && textractorFound && !textractorFound.x86 && !textractorFound.x64 ? 'text-danger' : 'text-text-secondary'}`}>
                  {!textractorPath
                    ? 'Aucun dossier choisi.'
                    : !textractorFound
                      ? textractorPath
                      : textractorFound.x86 || textractorFound.x64
                        ? `${textractorPath} — ${[textractorFound.x86 && '32 bits', textractorFound.x64 && '64 bits'].filter(Boolean).join(' et ')}`
                        : `${textractorPath} — TextractorCLI.exe introuvable`}
                </span>
                {!textractorPath && (
                  <button
                    type="button"
                    className="mt-1 inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                    onClick={() => window.electronAPI.openExternal('https://github.com/Artikash/Textractor/releases')}
                  >
                    <Download size={13} strokeWidth={2.5} />
                    Télécharger Textractor
                  </button>
                )}
              </>
            }
          >
            <button
              type="button"
              onClick={async () => {
                const folder = await window.electronAPI.openFolderDialog();
                if (folder) setTextractorPath(folder);
              }}
              className="btn"
            >
              <FolderOpen size={16} strokeWidth={2.25} />
              Parcourir
            </button>
          </SettingRow>
          <SettingRow label="Texte extrait par Textractor" description="Le fil choisi dans l'overlay (Maj+Tab) part au presse-papiers (pour un dictionnaire ou un traducteur), dans un fichier du jour du dossier de travaux, ou les deux.">
            <div className="seg">
              {(
                [
                  ['clipboard', 'Presse-papiers'],
                  ['file', 'Fichier'],
                  ['both', 'Les deux']
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="seg-opt">
                  <input type="radio" name="textractorOutput" checked={textractorOutput === value} onChange={() => setTextractorOutput(value)} />
                  {label}
                </label>
              ))}
            </div>
          </SettingRow>
          <SettingRow
            label="Extracteur d'images RPG Maker"
            description="Ajoute « Extraire images et sons » sur la page des jeux RPG Maker MV / MZ chiffrés (.rpgmvp, .png_, .ogg_…) : les fichiers sont déchiffrés dans le dossier de travaux du jeu, jamais dans le dossier du jeu."
          >
            <input type="checkbox" className="toggle" aria-label="Extracteur d'images RPG Maker" checked={rpgMakerExtractor} onChange={e => setRpgMakerExtractor(e.target.checked)} />
          </SettingRow>
          </>
        )}

        {section === 'clicker' && (
          <>
            <ToolGroup Icon={PanelsTopLeft} title="Overlay en jeu" summary={<>Maj+Tab pendant une partie lancée depuis DLSGM — c'est là qu'on ajoute les outils ci-dessous à un jeu.</>}>
              <SettingRow
                label="Activer l'overlay (Maj+Tab)"
                description="Affiche par-dessus le jeu : temps de session, temps de jeu total, et une case par outil pour l'ajouter à ce jeu. Fenêtré ou plein écran sans bordure seulement (pas le plein écran exclusif). Maj+Tab n'est pris que pendant la partie."
              >
                <input type="checkbox" className="toggle" aria-label="Overlay en jeu" checked={overlayEnabled} onChange={e => setOverlayEnabled(e.target.checked)} />
              </SettingRow>
            </ToolGroup>

            <ToolGroup Icon={MousePointerClick} title="Auto-clicker" summary={<>Clics à intervalle régulier, au curseur ou sur un point fixe — raccourci {autoClicker.hotkey}.</>}>
              <AutoClickerSettings value={autoClicker} onChange={setAutoClicker} isDirty={clickerDirty} />
            </ToolGroup>

            <ToolGroup Icon={ScanEye} title="Détecteur de rythme" summary={<>Clique (ou appuie sur une touche) quand une note passe dans une zone — raccourci {pixelTrigger.hotkey}.</>}>
              <PixelTriggerSettings value={pixelTrigger} onChange={setPixelTrigger} clickerHotkey={autoClicker.hotkey} isDirty={triggerDirty} />
            </ToolGroup>

            <ToolGroup Icon={Clapperboard} title="Enregistreur de macros" summary={<>Enregistre clics et touches dans le jeu, puis les rejoue — {macroRecorder.recordHotkey} enregistre, {macroRecorder.playHotkey} rejoue.</>}>
              <MacroSettings value={macroRecorder} onChange={setMacroRecorder} takenHotkeys={[autoClicker.hotkey, pixelTrigger.hotkey]} isDirty={macroDirty} />
            </ToolGroup>
          </>
        )}

        {section === 'collections' && (
          <CollectionsSettings
            collections={collections}
            onCollectionsChange={setCollections}
            homeShelves={homeShelves}
            onHomeShelvesChange={setHomeShelves}
            games={games}
            genreNames={genreNames}
            onUpdateGame={onUpdateGame}
            getWorkImageSrc={getWorkImageSrc}
            initialExpandedId={initialCollectionId}
          />
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
