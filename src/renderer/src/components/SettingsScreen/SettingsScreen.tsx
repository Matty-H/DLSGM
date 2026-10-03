import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Power, Camera, ChevronDown, ChevronRight, Clapperboard, Download, Eye, FolderOpen, Gamepad2, Globe, HardDrive, Layers, Languages, Library, MousePointerClick, PanelsTopLeft, RefreshCw, ScanEye, type LucideIcon } from 'lucide-react';
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
import OcrSettings from '../OcrSettings/OcrSettings';
import type { AppUpdateInfo, OcrTranslateSettings, ScreenshotSettings } from '../../../../shared/ipc-types';
import { HOTKEY_OPTIONS } from '../../lib/autoClicker.js';
import type { MacroRecorderSettings } from '../../lib/macros.js';
import type { PixelTriggerSettings as TriggerSettings } from '../../lib/pixelTrigger.js';
import type { AutoClickerSettings as ClickerSettings } from '../../lib/autoClicker.js';
import Select from '../Select/Select';
import ThemePicker from '../ThemePicker/ThemePicker';
import { normalizeThemeSetting } from '../../../../shared/themes';
import { msg, t, tr, uiLanguages } from '../../lib/i18n.js';


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

/** Version installée et vérification manuelle ; les pop-ups (mise à jour disponible, à jour, erreur) viennent de main. */
function UpdateCheck() {
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.getAppUpdateInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  const check = async () => {
    setChecking(true);
    setError(null);
    try {
      const result = await window.electronAPI.checkForUpdates();
      if (result.status === 'error') setError(result.message);
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const mode = !info ? '' : info.portable
    ? t('Version portable : une nouvelle version est signalée par un pop-up, à télécharger soi-même sur GitHub.')
    : info.selfUpdate
      ? t('Version installée : une nouvelle version peut être téléchargée et installée depuis DLSGM.')
      : t('Version de développement : une nouvelle version est seulement signalée.');

  return (
    <SettingRow
      label={info ? `DLSGM ${info.version}` : 'DLSGM'}
      description={<>{mode}{error && <span className="mt-1 block text-danger">{error}</span>}</>}
    >
      <button type="button" onClick={check} disabled={checking} className="btn">
        {checking ? t('Vérification…') : t('Rechercher une mise à jour')}
      </button>
    </SettingRow>
  );
}

/** Mise à jour groupée des fiches depuis DLsite (Paramètres › Stockage). */
function BulkMetadataUpdate({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<BulkUpdateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const start = async () => {
    const confirmed = window.confirm(
      t('Récupérer à nouveau les métadonnées de toutes les fiches depuis DLsite, en japonais avec leurs traductions anglaises ?') + '\n\n' +
        t('Titres, cercles et tags passeront tous en japonais (langue de référence). Images, notes, tags perso, temps de jeu et collections ne sont pas touchés, ni les fiches modifiées à la main. Une copie de la base est faite avant.')
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
      label={t('Mettre à jour toutes les fiches')}
      description={
        <>
          {t("Récupère à nouveau chaque fiche depuis DLsite en japonais (langue de référence), avec les traductions anglaises : une bibliothèque récupérée en plusieurs langues redevient homogène (ex: « cat 3 » et « 猫3 », même cercle), le dictionnaire des tags se complète, et les anciennes fiches gagnent l'identifiant de cercle. Une fiche dont la récupération échoue (œuvre retirée, restriction régionale) reste telle quelle. Copie de la base dans userData/db_backups avant de commencer.")}
          {progress && (
            <span className="mt-2 block text-text-secondary">
              {progress.done} / {progress.total}…
            </span>
          )}
          {result && (
            <span className="mt-2 block text-text-secondary">
              {result.cancelled ? t('Interrompu.') + ' ' : ''}
              {result.updated.length > 1 ? t('{n} mises à jour', { n: result.updated.length }) : t('{n} mise à jour', { n: result.updated.length })}
              {result.skipped.length > 0 && ' · ' + (result.skipped.length > 1 ? t('{n} ignorées (modifiées à la main ou en échec)', { n: result.skipped.length }) : t('{n} ignorée (modifiée à la main ou en échec)', { n: result.skipped.length }))}
              {result.failed.length > 0 && (
                <span className="block text-danger">
                  {t('Échec, fiche conservée : {ids}', { ids: result.failed.map(f => f.gameId).join(', ') })}
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
          {t('Interrompre')}
        </button>
      ) : (
        <button type="button" onClick={start} className="btn">
          {t('Mettre à jour')}
        </button>
      )}
    </SettingRow>
  );
}

const REFRESH_PRESETS = [
  { value: 0, label: msg('Jamais (manuel)') },
  { value: 30, label: msg('Toutes les 30 min') },
  { value: 60, label: msg('Toutes les heures') },
  { value: 1440, label: msg('Une fois par jour') }
];

/** Ramène une valeur libre de rafraîchissement (minutes) au préréglage le plus proche. */
function nearestPreset(minutes: number): number {
  return REFRESH_PRESETS.reduce((closest, { value }) =>
    Math.abs(value - minutes) < Math.abs(closest - minutes) ? value : closest
  , REFRESH_PRESETS[0].value);
}

export type SettingsSection = 'library' | 'network' | 'display' | 'launch' | 'clicker' | 'collections' | 'genres' | 'storage' | 'updates';

const SECTIONS: { id: SettingsSection; label: string; Icon: LucideIcon }[] = [
  { id: 'library', label: msg('Bibliothèque'), Icon: Library },
  { id: 'network', label: msg('Réseau & VPN'), Icon: Globe },
  { id: 'display', label: msg('Affichage'), Icon: Eye },
  { id: 'launch', label: msg('Lancement'), Icon: Gamepad2 },
  { id: 'clicker', label: msg('Outils en jeu'), Icon: MousePointerClick },
  { id: 'collections', label: msg('Collections'), Icon: Layers },
  { id: 'genres', label: msg('Traduction des tags'), Icon: Languages },
  { id: 'storage', label: msg('Stockage'), Icon: HardDrive },
  { id: 'updates', label: msg('Mises à jour'), Icon: RefreshCw }
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
  const [uiLanguage, setUiLanguageSetting] = useState(settings.uiLanguage ?? 'system');
  const [theme, setTheme] = useState(normalizeThemeSetting(settings.theme));
  const [blurAdultContent, setBlurAdultContent] = useState(settings.blurAdultContent);
  const [sandboxLaunch, setSandboxLaunch] = useState(settings.sandboxLaunch);
  const [startFullscreen, setStartFullscreen] = useState(settings.startFullscreen);
  const storedProxyForm = useMemo(() => parseProxyForm(settings.dlsiteProxy ?? ''), [settings.dlsiteProxy]);
  const [proxyForm, setProxyForm] = useState<ProxyFormValue>(storedProxyForm ?? EMPTY_PROXY_FORM);
  const [proxyTest, setProxyTest] = useState<string | null>(null);
  const [proxyTestFailed, setProxyTestFailed] = useState(false);
  const [collections, setCollections] = useState<GameCollection[]>(settings.collections ?? []);
  const [homeShelves, setHomeShelves] = useState<Record<string, HomeShelfPrefs>>(settings.homeShelves ?? {});
  const [showWipNetwork, setShowWipNetwork] = useState(false);
  const [autoClicker, setAutoClicker] = useState<ClickerSettings>(settings.autoClicker);
  const [pixelTrigger, setPixelTrigger] = useState<TriggerSettings>(settings.pixelTrigger);
  const [macroRecorder, setMacroRecorder] = useState<MacroRecorderSettings>(settings.macroRecorder);
  const [textractorPath, setTextractorPath] = useState(settings.textractorPath ?? '');
  const [textractorOutput, setTextractorOutput] = useState(settings.textractorOutput ?? 'both');
  const [rpgMakerExtractor, setRpgMakerExtractor] = useState(Boolean(settings.rpgMakerExtractor));
  const [ocrTranslate, setOcrTranslate] = useState<OcrTranslateSettings>(settings.ocrTranslate);
  const [localeEmulatorPath, setLocaleEmulatorPath] = useState(settings.localeEmulatorPath ?? '');
  const [screenshot, setScreenshot] = useState<ScreenshotSettings>(settings.screenshot);
  const [leStatus, setLeStatus] = useState<{ found: boolean; installed: boolean } | null>(null);
  const [textractorFound, setTextractorFound] = useState<{ x86: boolean; x64: boolean } | null>(null);
  const [overlayEnabled, setOverlayEnabled] = useState(settings.overlayEnabled);
  const [autoBackupSaves, setAutoBackupSaves] = useState(settings.autoBackupSaves);
  const [closeToTray, setCloseToTray] = useState(settings.closeToTray);
  const [checkUpdatesOnStartup, setCheckUpdatesOnStartup] = useState(settings.checkUpdatesOnStartup !== false);
  const [piaRetry, setPiaRetry] = useState(settings.piaRetry);
  const [piaRegion, setPiaRegion] = useState(settings.piaRegion);
  const [workspaceFolder, setWorkspaceFolder] = useState(settings.workspaceFolder ?? '');
  const [defaultWorkspaceRoot, setDefaultWorkspaceRoot] = useState('');
  const [sandboxieStatus, setSandboxieStatus] = useState<SandboxieStatus | null>(null);
  const [isResettingImages, setIsResettingImages] = useState(false);
  const [section, setSection] = useState<SettingsSection>(initialSection);
  // Version affichée sous « Enregistrer ».
  const [appInfo, setAppInfo] = useState<AppUpdateInfo | null>(null);
  useEffect(() => {
    window.electronAPI.getAppUpdateInfo().then(setAppInfo).catch(() => undefined);
  }, []);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection, initialCollectionId]);

  useEffect(() => {
    setDestinationFolder(settings.destinationFolder);
    setRefreshRate(settings.refreshRate);
    setLanguage(settings.language);
    setUiLanguageSetting(settings.uiLanguage ?? 'system');
    setTheme(normalizeThemeSetting(settings.theme));
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
    setOcrTranslate(settings.ocrTranslate);
    setLocaleEmulatorPath(settings.localeEmulatorPath ?? '');
    setScreenshot(settings.screenshot);
    setOverlayEnabled(settings.overlayEnabled);
    setAutoBackupSaves(settings.autoBackupSaves);
    setCloseToTray(settings.closeToTray);
    setCheckUpdatesOnStartup(settings.checkUpdatesOnStartup !== false);
    setPiaRetry(settings.piaRetry);
    setPiaRegion(settings.piaRegion);
    setWorkspaceFolder(settings.workspaceFolder ?? '');
  }, [settings]);

  // LEProc présent et LE installé dans le dossier choisi.
  useEffect(() => {
    let cancelled = false;
    setLeStatus(null);
    if (!localeEmulatorPath) return;
    window.electronAPI
      .checkLocaleEmulator(localeEmulatorPath)
      .then(status => !cancelled && setLeStatus(status))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [localeEmulatorPath]);

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

  // Racine effective quand le champ est vide (Documents/DLSGM/Work), pour l'afficher.
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
  const ocrDirty = JSON.stringify(ocrTranslate) !== JSON.stringify(settings.ocrTranslate);

  const isDirty =
    destinationFolder !== settings.destinationFolder ||
    refreshRate !== settings.refreshRate ||
    language !== settings.language ||
    uiLanguage !== (settings.uiLanguage ?? 'system') ||
    theme !== normalizeThemeSetting(settings.theme) ||
    blurAdultContent !== settings.blurAdultContent ||
    sandboxLaunch !== settings.sandboxLaunch ||
    startFullscreen !== settings.startFullscreen ||
    proxyDirty ||
    autoBackupSaves !== settings.autoBackupSaves ||
    closeToTray !== settings.closeToTray ||
    checkUpdatesOnStartup !== (settings.checkUpdatesOnStartup !== false) ||
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
    ocrDirty ||
    localeEmulatorPath !== (settings.localeEmulatorPath ?? '') ||
    JSON.stringify(screenshot) !== JSON.stringify(settings.screenshot) ||
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
      uiLanguage,
      theme,
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
      ocrTranslate,
      localeEmulatorPath,
      screenshot,
      overlayEnabled,
      autoBackupSaves,
      closeToTray,
      checkUpdatesOnStartup,
      piaRetry,
      piaRegion,
      workspaceFolder
    });
  };

  const handleResetImages = async () => {
    const confirmed = window.confirm(
      t('Supprimer et retélécharger toutes les jaquettes et images depuis DLsite ? Cette action est irréversible et peut prendre du temps.')
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
        <h1 className="mb-4 px-3">{t('Paramètres')}</h1>
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
            {tr(label)}
          </button>
        ))}

        <div className="mt-auto flex flex-col gap-2 px-1">
          {isDirty && <span className="text-[12px] text-text-muted">{t('Modifications non enregistrées')}</span>}
          <button type="button" onClick={handleSave} disabled={!isDirty || !proxyValid || !collectionsValid} className="btn btn-primary btn-block py-3">
            {t('Enregistrer')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (isDirty && !window.confirm(t('Quitter sans enregistrer les modifications ?'))) return;
              window.electronAPI.quitApp();
            }}
            className="btn btn-ghost btn-block"
          >
            <Power size={16} strokeWidth={2.25} />
            {t('Quitter DLSGM')}
          </button>
          {appInfo && (
            <span className="text-center text-[11px] tabular-nums text-text-muted">
              DLSGM {appInfo.version}
              {appInfo.portable ? ` · ${t('portable')}` : ''}
            </span>
          )}
        </div>
      </nav>

      <div data-scroll-root className="panel max-h-full min-h-0 flex-1 self-start overflow-y-auto px-6 py-2">
        {section === 'library' && (
          <>
            <SettingRow label={t('Dossier de bibliothèque')} description={destinationFolder || t('Aucun dossier sélectionné')}>
              <button type="button" onClick={handleBrowse} className="btn">
                <FolderOpen size={16} strokeWidth={2.25} />
                {t('Parcourir')}
              </button>
            </SettingRow>

            <SettingRow
              label={t('Dossier des travaux')}
              description={
                <>
                  {t('Un sous-dossier par jeu (<ID>) pour ranger ce que tu fais sur un jeu (data mining, extractions, notes), ouvert depuis sa page. Hors du dossier du jeu : jamais envoyé en partage réseau, jamais touché par les patchs ni supprimé.')}
                  <span className="mt-1 block text-text-secondary">{workspaceFolder || t('{path} (par défaut)', { path: defaultWorkspaceRoot })}</span>
                </>
              }
            >
              {workspaceFolder && (
                <button type="button" onClick={() => setWorkspaceFolder('')} className="btn btn-ghost" title={t('Revenir au dossier par défaut')}>
                  {t('Par défaut')}
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
                {t('Parcourir')}
              </button>
            </SettingRow>

            <SettingRow
              label={t("Mots de passe d'archives")}
              description={t("Essayés automatiquement à chaque import (en plus de ceux trouvés dans les fichiers texte de l'archive et du nom du site en tête de son nom). Ajoutés depuis le bilan d'un import ; supprimés ici immédiatement.")}
            >
              <ArchivePasswords />
            </SettingRow>

            <SettingRow label={t('Rafraîchissement du cache')}
 description={t('Relit périodiquement le cache pour afficher les données mises à jour en arrière-plan.')}>
              <Select
                value={nearestPreset(refreshRate)}
                options={REFRESH_PRESETS.map(p => ({ ...p, label: tr(p.label) }))}
                onChange={setRefreshRate}
                aria-label={t('Fréquence de rafraîchissement du cache')}
                className="w-[200px]"
              />
            </SettingRow>

            <SettingRow
              label={t('Langue des tags')}
              description={t('Les fiches sont toujours récupérées en japonais (langue de référence), avec la traduction anglaise de DLsite. Choisis la langue dans laquelle afficher les tags ; titres et cercles restent en japonais (la recherche trouve aussi leur nom anglais).')}
            >
              <div className="seg">
                <label className="seg-opt">
                  <input type="radio" name="language" checked={language === 'en_US'} onChange={() => setLanguage('en_US')} />
                  {t('English (traduction)')}
                </label>
                <label className="seg-opt">
                  <input type="radio" name="language" checked={language === 'ja_JP'} onChange={() => setLanguage('ja_JP')} />
                  {t('日本語 (original)')}
                </label>
              </div>
            </SettingRow>
          </>
        )}

        {section === 'network' && (
          <>
            <div className="mt-4 rounded-md bg-bg-deep px-4 py-3 text-[13px] leading-relaxed text-text-secondary">
              <span className="font-semibold text-text">{t('Section en cours de développement.')}</span>{' '}
              {t('Une prochaine version se branchera de façon plus fiable à un VPN (SOCKS5, OpenVPN ou WireGuard). En attendant, pour les œuvres réservées au Japon : allume ton VPN sur le Japon (ex: PIA, région jp-tokyo) avant de lancer un scan ou « Mettre à jour toutes les fiches », en laissant le proxy vide.')}
            </div>
            <IpChecker />
            <button
              type="button"
              onClick={() => setShowWipNetwork(v => !v)}
              aria-expanded={showWipNetwork}
              className="btn btn-ghost my-2 self-start"
            >
              {showWipNetwork ? <ChevronDown size={16} strokeWidth={2.25} /> : <ChevronRight size={16} strokeWidth={2.25} />}
              {t('Proxy et PIA')} <WipBadge />
            </button>
            {showWipNetwork && (
              <>
                <SettingRow
                  label={
                    <>
                      {t('Proxy pour DLsite')} <WipBadge />
                    </>
                  }
                  description={
                    <>
                      {t("Utilisé pour les fiches et les images DLsite, en permanence (ex: un proxy japonais pour les œuvres restreintes par région). Aucun : proxy de Windows. Le mot de passe est chiffré (Windows) et ne s'affiche plus ensuite. Un proxy de navigateur (extension) n'a pas d'effet ici, il faut son adresse.")}
                      {storedProxyForm === null && (
                        <span className="mt-1 block text-danger">{t('Adresse enregistrée illisible : {address}', { address: settings.dlsiteProxy })}</span>
                      )}
                      {proxyTest && proxyTest !== 'running' && (
                        <span className={`mt-1 block ${proxyTestFailed ? 'text-danger' : 'text-text-secondary'}`}>{proxyTest}</span>
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
                    title={proxyDirty ? t("Enregistre d'abord le proxy") : t('Tester l’accès à DLsite avec ce proxy')}
                    onClick={async () => {
                      setProxyTest('running');
                      setProxyTestFailed(false);
                      try {
                        const { status, ms } = await window.electronAPI.testDlsiteConnection();
                        setProxyTest(status < 400 ? t('DLsite répond (HTTP {status}, {ms} ms).', { status, ms }) : t('DLsite répond, mais avec une erreur HTTP {status}.', { status }));
                      } catch (error) {
                        setProxyTestFailed(true);
                        setProxyTest(t('Échec : {error}', { error: ipcErrorMessage(error) }));
                      }
                    }}
                  >
                    {proxyTest === 'running' ? t('Test…') : t('Tester')}
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
            <SettingRow
              label={t("Langue de l'interface")}
              description={t("Par défaut, celle du système si l'interface y est traduite, sinon l'anglais. Changer de langue recharge la fenêtre.")}
            >
              <Select
                value={uiLanguage}
                options={[
                  { value: 'system', label: t('Langue du système') },
                  ...uiLanguages().map(language => ({ value: language.code, label: language.name }))
                ]}
                onChange={setUiLanguageSetting}
                aria-label={t("Langue de l'interface")}
                className="w-[200px]"
              />
            </SettingRow>
            <div className="border-b border-divider pt-4">
              <div className="text-[15px] font-semibold">{t('Thème')}</div>
              <div className="mb-3 mt-1 text-[13px] leading-relaxed text-text-muted">
                {t("Couleurs de l'interface, du logo et de l'icône. « Aléatoire » tire un thème à chaque démarrage, « Super random turbo 2000 remix » invente les couleurs à chaque démarrage.")}
              </div>
              <ThemePicker value={theme} savedValue={normalizeThemeSetting(settings.theme)} onChange={setTheme} />
            </div>
            <SettingRow label={t('Flouter le contenu adulte (R18)')} description={t("Les jaquettes R18 restent floutées dans la grille jusqu'à un clic.")}>
              <input
                type="checkbox"
                className="toggle"
                aria-label={t('Flouter le contenu adulte')}
                checked={blurAdultContent}
                onChange={e => setBlurAdultContent(e.target.checked)}
              />
            </SettingRow>
            <SettingRow
              label={t('Démarrer en plein écran')}
              description={t('F11, le bouton en haut à droite ou le bouton View de la manette basculent le plein écran à tout moment.')}
            >
              <input
                type="checkbox"
                className="toggle"
                aria-label={t('Démarrer en plein écran')}
                checked={startFullscreen}
                onChange={e => setStartFullscreen(e.target.checked)}
              />
            </SettingRow>
            <SettingRow
              label={t('Réduire dans la zone de notification')}
              description={t("Fermer la fenêtre la cache au lieu de quitter : le suivi du temps de jeu, la copie des sauvegardes et la réception réseau local continuent. Clic sur l'icône pour rouvrir, « Quitter » dans son menu pour quitter.")}
            >
              <input
                type="checkbox"
                className="toggle"
                aria-label={t('Réduire dans la zone de notification')}
                checked={closeToTray}
                onChange={e => setCloseToTray(e.target.checked)}
              />
            </SettingRow>
          </>
        )}

        {section === 'launch' && (
          <>
          <SettingRow
            label={t("Copier les sauvegardes à la fermeture d'un jeu")}
            description={t('Copie les dossiers de sauvegarde détectés (page du jeu › Outils) dans les données de DLSGM à chaque fin de partie, si quelque chose a changé. Les 10 dernières copies automatiques sont gardées par jeu ; restauration depuis la page du jeu.')}
          >
            <input
              type="checkbox"
              className="toggle"
              aria-label={t("Copier les sauvegardes à la fermeture d'un jeu")}
              checked={autoBackupSaves}
              onChange={e => setAutoBackupSaves(e.target.checked)}
            />
          </SettingRow>
          <SettingRow
            label={t('Lancer les jeux dans Sandboxie-Plus')}
            description={
              <>
                {t("Chaque jeu tourne dans sa propre sandbox : ce qu'il écrit hors de son dossier (AppData, registre) y est isolé au lieu de polluer Windows. Son dossier reste en accès direct (sauvegardes locales, patchs). Ce n'est pas une machine virtuelle : ça limite les dégâts d'un exécutable douteux sans les rendre impossibles.")}
                {sandboxieStatus && (
                  <span className={`mt-2 block ${!sandboxieStatus.available && sandboxLaunch ? 'text-danger' : ''}`}>
                    {sandboxieStatus.available ? (
                      t('Sandboxie détecté : {path}', { path: sandboxieStatus.installDir ?? '' })
                    ) : (
                      <>
                        {sandboxLaunch ? t("Sandboxie-Plus n'est pas installé — les jeux ne pourront pas être lancés tant que ce sera le cas.") : t("Sandboxie-Plus n'est pas installé.")}{' '}
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                          onClick={() => window.electronAPI.openExternal('https://sandboxie-plus.com/downloads/')}
                        >
                          <Download size={13} strokeWidth={2.5} />
                          {t('Télécharger')}
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
              aria-label={t('Lancer les jeux dans Sandboxie-Plus')}
              checked={sandboxLaunch}
              onChange={e => setSandboxLaunch(e.target.checked)}
            />
          </SettingRow>
          <SettingRow
            label={t('Dossier de Locale Emulator')}
            description={
              <>
                {t("Pour « Lancer en japonais » (page du jeu) : les jeux qui supposent un Windows japonais (textes illisibles, plantage au démarrage, fichiers mal nommés) tournent en locale japonaise sans changer celle du PC. Jeux 32 bits seulement. Lance une fois LEInstaller.exe après l'avoir décompressé.")}
                <span className={`mt-1 block ${localeEmulatorPath && leStatus && !leStatus.installed ? 'text-danger' : 'text-text-secondary'}`}>
                  {!localeEmulatorPath
                    ? t('Aucun dossier choisi.')
                    : !leStatus
                      ? localeEmulatorPath
                      : !leStatus.found
                        ? t('{path} — LEProc.exe introuvable', { path: localeEmulatorPath })
                        : leStatus.installed
                          ? t('{path} — prêt', { path: localeEmulatorPath })
                          : t('{path} — pas encore installé (lance LEInstaller.exe une fois)', { path: localeEmulatorPath })}
                </span>
                {!localeEmulatorPath && (
                  <button
                    type="button"
                    className="mt-1 inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                    onClick={() => window.electronAPI.openExternal('https://github.com/xupefei/Locale-Emulator/releases')}
                  >
                    <Download size={13} strokeWidth={2.5} />
                    {t('Télécharger Locale Emulator')}
                  </button>
                )}
              </>
            }
          >
            <button
              type="button"
              onClick={async () => {
                const folder = await window.electronAPI.openFolderDialog();
                if (folder) setLocaleEmulatorPath(folder);
              }}
              className="btn"
            >
              <FolderOpen size={16} strokeWidth={2.25} />
              {t('Parcourir')}
            </button>
          </SettingRow>
          <SettingRow
            label={t('Dossier de Textractor')}
            description={
              <>
                {t('Pour « Lancer avec Textractor » (page du jeu) : le dossier de Textractor, avec ses sous-dossiers x86 et x64 (TextractorCLI.exe).')}
                <span className={`mt-1 block ${textractorPath && textractorFound && !textractorFound.x86 && !textractorFound.x64 ? 'text-danger' : 'text-text-secondary'}`}>
                  {!textractorPath
                    ? t('Aucun dossier choisi.')
                    : !textractorFound
                      ? textractorPath
                      : textractorFound.x86 || textractorFound.x64
                        ? `${textractorPath} — ${textractorFound.x86 && textractorFound.x64 ? t('32 et 64 bits') : textractorFound.x86 ? t('32 bits') : t('64 bits')}`
                        : t('{path} — TextractorCLI.exe introuvable', { path: textractorPath })}
                </span>
                {!textractorPath && (
                  <button
                    type="button"
                    className="mt-1 inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                    onClick={() => window.electronAPI.openExternal('https://github.com/Artikash/Textractor/releases')}
                  >
                    <Download size={13} strokeWidth={2.5} />
                    {t('Télécharger Textractor')}
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
              {t('Parcourir')}
            </button>
          </SettingRow>
          <SettingRow label={t('Texte extrait par Textractor')} description={t("Le fil choisi dans l'overlay (Maj+Tab) part au presse-papiers (pour un dictionnaire ou un traducteur), dans un fichier du jour du dossier de travaux, ou les deux.")}>
            <div className="seg">
              {(
                [
                  ['clipboard', t('Presse-papiers')],
                  ['file', t('Fichier')],
                  ['both', t('Les deux')]
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
            label={t("Extracteur d'images RPG Maker")}
            description={t('Ajoute « Extraire images et sons » sur la page des jeux RPG Maker MV / MZ chiffrés (.rpgmvp, .png_, .ogg_…) : les fichiers sont déchiffrés dans le dossier de travaux du jeu, jamais dans le dossier du jeu.')}
          >
            <input type="checkbox" className="toggle" aria-label={t("Extracteur d'images RPG Maker")} checked={rpgMakerExtractor} onChange={e => setRpgMakerExtractor(e.target.checked)} />
          </SettingRow>
          </>
        )}

        {section === 'clicker' && (
          <>
            <ToolGroup Icon={PanelsTopLeft} title={t('Overlay en jeu')} summary={t("Maj+Tab pendant une partie lancée depuis DLSGM — c'est là qu'on ajoute les outils ci-dessous à un jeu.")}>
              <SettingRow
                label={t("Activer l'overlay (Maj+Tab)")}
                description={t("Affiche par-dessus le jeu : temps de session, temps de jeu total, et une case par outil pour l'ajouter à ce jeu. Fenêtré ou plein écran sans bordure seulement (pas le plein écran exclusif). Maj+Tab n'est pris que pendant la partie.")}
              >
                <input type="checkbox" className="toggle" aria-label={t('Overlay en jeu')} checked={overlayEnabled} onChange={e => setOverlayEnabled(e.target.checked)} />
              </SettingRow>
            </ToolGroup>

            <ToolGroup Icon={MousePointerClick} title={t('Auto-clicker')} summary={t('Clics à intervalle régulier, au curseur ou sur un point fixe — raccourci {hotkey}.', { hotkey: autoClicker.hotkey })}>
              <AutoClickerSettings value={autoClicker} onChange={setAutoClicker} isDirty={clickerDirty} />
            </ToolGroup>

            <ToolGroup Icon={ScanEye} title={t('Détecteur de rythme')} summary={t('Clique (ou appuie sur une touche) quand une note passe dans une zone — raccourci {hotkey}.', { hotkey: pixelTrigger.hotkey })}>
              <PixelTriggerSettings value={pixelTrigger} onChange={setPixelTrigger} clickerHotkey={autoClicker.hotkey} isDirty={triggerDirty} />
            </ToolGroup>

            <ToolGroup Icon={Clapperboard} title={t('Enregistreur de macros')} summary={t('Enregistre clics et touches dans le jeu, puis les rejoue — {record} enregistre, {play} rejoue.', { record: macroRecorder.recordHotkey, play: macroRecorder.playHotkey })}>
              <MacroSettings value={macroRecorder} onChange={setMacroRecorder} takenHotkeys={[autoClicker.hotkey, pixelTrigger.hotkey, ocrTranslate.hotkey, screenshot.hotkey]} isDirty={macroDirty} />
            </ToolGroup>

            <ToolGroup Icon={Languages} title={t("Traduction à l'écran")} summary={t('Lit le texte du jeu (OCR de Windows) et affiche sa traduction par-dessus — raccourci {hotkey}.', { hotkey: ocrTranslate.hotkey })}>
              <OcrSettings
                value={ocrTranslate}
                onChange={setOcrTranslate}
                takenHotkeys={[autoClicker.hotkey, pixelTrigger.hotkey, macroRecorder.recordHotkey, macroRecorder.playHotkey, screenshot.hotkey]}
                isDirty={ocrDirty}
              />
            </ToolGroup>

            <ToolGroup Icon={Camera} title={t("Captures d'écran")} summary={t('La fenêtre du jeu seule, dans le dossier de travaux du jeu (captures/) — raccourci {hotkey}.', { hotkey: screenshot.hotkey })}>
              <SettingRow
                label={t('Activer les captures')}
                description={t("Pendant une partie lancée depuis DLSGM, le raccourci capture la fenêtre du jeu (pas tout l'écran) dans <travaux>/<ID>/captures/ : jamais envoyées en partage réseau, gardées si le jeu est supprimé. Galerie sur la page du jeu et dans l'overlay. Les témoins et fenêtres de DLSGM n'apparaissent pas sur les captures.")}
              >
                <input type="checkbox" className="toggle" aria-label={t('Activer les captures')} checked={screenshot.enabled} onChange={e => setScreenshot({ ...screenshot, enabled: e.target.checked })} />
              </SettingRow>
              <SettingRow label={t('Raccourci')} description={t('Différent de ceux des autres outils.')}>
                <Select
                  value={screenshot.hotkey}
                  options={HOTKEY_OPTIONS.filter(o => ![autoClicker.hotkey, pixelTrigger.hotkey, macroRecorder.recordHotkey, macroRecorder.playHotkey, ocrTranslate.hotkey].some(k => k.toLowerCase() === o.value.toLowerCase()))}
                  onChange={hotkey => setScreenshot({ ...screenshot, hotkey })}
                  aria-label={t('Raccourci de capture')}
                  className="w-[150px]"
                />
              </SettingRow>
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
            label={t('Cache images')}
            description={t('Supprime et retélécharge toutes les jaquettes et images depuis DLsite. Irréversible, et peut prendre du temps.')}
          >
            <button type="button" onClick={handleResetImages} disabled={isResettingImages} className="btn">
              {isResettingImages ? t('Réinitialisation en cours…') : t('Réinitialiser')}
            </button>
          </SettingRow>
          </>
        )}

        {section === 'updates' && (
          <>
          <UpdateCheck />
          <SettingRow
            label={t('Rechercher une mise à jour au démarrage')}
            description={t("Quelques secondes après le lancement, DLSGM regarde sur GitHub si une nouvelle version existe et propose de l'installer (version installée) ou la signale (version portable). Rien n'est téléchargé sans votre accord.")}
          >
            <input
              type="checkbox"
              className="toggle"
              aria-label={t('Rechercher une mise à jour au démarrage')}
              checked={checkUpdatesOnStartup}
              onChange={e => setCheckUpdatesOnStartup(e.target.checked)}
            />
          </SettingRow>
          </>
        )}

      </div>
    </div>
  );
}
