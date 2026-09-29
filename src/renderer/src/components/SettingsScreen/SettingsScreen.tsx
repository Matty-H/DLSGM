import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Download, Eye, FolderOpen, Gamepad2, HardDrive, Library, Link2, X, type LucideIcon } from 'lucide-react';
import { resetAndRedownloadImages } from '../../lib/dataFetcher.js';
import { collectCanonicalGenres, isJapaneseText, linkGenres, unlinkGroup, type GenreAliasGroups } from '../../lib/genreAliases.js';
import { getSandboxieStatus, type SandboxieStatus } from '../../lib/gameTools.js';
import type { AppSettings } from '../../hooks/useSettings';
import Select from '../Select/Select';

export interface SettingsScreenProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  /** Genres bruts (non canonicalisés) présents dans la bibliothèque, pour les sélecteurs de liaison. */
  allGenres: string[];
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

type SettingsSection = 'library' | 'display' | 'launch' | 'genres' | 'storage';

const SECTIONS: { id: SettingsSection; label: string; Icon: LucideIcon }[] = [
  { id: 'library', label: 'Bibliothèque', Icon: Library },
  { id: 'display', label: 'Affichage', Icon: Eye },
  { id: 'launch', label: 'Lancement', Icon: Gamepad2 },
  { id: 'genres', label: 'Genres liés', Icon: Link2 },
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
export default function SettingsScreen({ settings, onSave, allGenres }: SettingsScreenProps) {
  const [destinationFolder, setDestinationFolder] = useState(settings.destinationFolder);
  const [refreshRate, setRefreshRate] = useState(settings.refreshRate);
  const [language, setLanguage] = useState(settings.language);
  const [blurAdultContent, setBlurAdultContent] = useState(settings.blurAdultContent);
  const [genreAliasGroups, setGenreAliasGroups] = useState<GenreAliasGroups>(settings.genreAliasGroups);
  const [sandboxLaunch, setSandboxLaunch] = useState(settings.sandboxLaunch);
  const [startFullscreen, setStartFullscreen] = useState(settings.startFullscreen);
  const [sandboxieStatus, setSandboxieStatus] = useState<SandboxieStatus | null>(null);
  const [isResettingImages, setIsResettingImages] = useState(false);
  const [primaryPick, setPrimaryPick] = useState('');
  const [secondaryPick, setSecondaryPick] = useState('');
  const [section, setSection] = useState<SettingsSection>('library');

  useEffect(() => {
    setDestinationFolder(settings.destinationFolder);
    setRefreshRate(settings.refreshRate);
    setLanguage(settings.language);
    setBlurAdultContent(settings.blurAdultContent);
    setGenreAliasGroups(settings.genreAliasGroups);
    setSandboxLaunch(settings.sandboxLaunch);
    setStartFullscreen(settings.startFullscreen);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    getSandboxieStatus()
      .then(status => !cancelled && setSandboxieStatus(status))
      .catch(() => !cancelled && setSandboxieStatus({ available: false, installDir: null }));
    return () => {
      cancelled = true;
    };
  }, []);

  const canonicalGenres = useMemo(() => collectCanonicalGenres(allGenres, genreAliasGroups), [allGenres, genreAliasGroups]);
  const englishGenres = useMemo(() => canonicalGenres.filter(g => !isJapaneseText(g)), [canonicalGenres]);
  const japaneseGenres = useMemo(() => canonicalGenres.filter(g => isJapaneseText(g)), [canonicalGenres]);

  const isDirty =
    destinationFolder !== settings.destinationFolder ||
    refreshRate !== settings.refreshRate ||
    language !== settings.language ||
    blurAdultContent !== settings.blurAdultContent ||
    sandboxLaunch !== settings.sandboxLaunch ||
    startFullscreen !== settings.startFullscreen ||
    JSON.stringify(genreAliasGroups) !== JSON.stringify(settings.genreAliasGroups);

  const handleBrowse = async () => {
    const folderPath = await window.electronAPI.openFolderDialog();
    if (folderPath) setDestinationFolder(folderPath);
  };

  const handleSave = () => {
    onSave({ ...settings, destinationFolder, refreshRate, language, blurAdultContent, genreAliasGroups, sandboxLaunch, startFullscreen });
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

  const handleLink = () => {
    if (!primaryPick || !secondaryPick || primaryPick === secondaryPick) return;
    setGenreAliasGroups(prev => linkGenres(prev, primaryPick, secondaryPick));
    setPrimaryPick('');
    setSecondaryPick('');
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
          <button type="button" onClick={handleSave} disabled={!isDirty} className="btn btn-primary btn-block py-3">
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

            <SettingRow label="Rafraîchissement du cache" description="Relit périodiquement le cache pour afficher les données mises à jour en arrière-plan.">
              <Select
                value={nearestPreset(refreshRate)}
                options={REFRESH_PRESETS}
                onChange={setRefreshRate}
                aria-label="Fréquence de rafraîchissement du cache"
                className="w-[200px]"
              />
            </SettingRow>

            <SettingRow label="Langue des métadonnées" description="Langue utilisée pour récupérer les fiches depuis DLsite.">
              <div className="seg">
                <label className="seg-opt">
                  <input type="radio" name="language" checked={language === 'en_US'} onChange={() => setLanguage('en_US')} />
                  English
                </label>
                <label className="seg-opt">
                  <input type="radio" name="language" checked={language === 'ja_JP'} onChange={() => setLanguage('ja_JP')} />
                  日本語
                </label>
              </div>
            </SettingRow>
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
          </>
        )}

        {section === 'launch' && (
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
        )}

        {section === 'genres' && (
          <div className="py-4">
            <div className="text-[15px] font-semibold">Lier des genres</div>
            <p className="mb-4 mt-1 text-[13px] leading-relaxed text-text-muted">
              DLsite fournit parfois le même genre en japonais et en anglais selon la langue de récupération (ex: "Anal" /
              "アナル"). Lie-les pour qu'ils comptent comme un seul genre dans les filtres et les statistiques — le premier
              choisi devient le libellé affiché.
            </p>
            <div className="flex items-end gap-2">
              <div className="field flex-1">
                <label htmlFor="genre-primary">Anglais (principal)</label>
                <Select
                  id="genre-primary"
                  value={primaryPick}
                  options={englishGenres.map(g => ({ value: g, label: g }))}
                  onChange={setPrimaryPick}
                  placeholder="Genre anglais…"
                />
              </div>
              <div className="field flex-1">
                <label htmlFor="genre-secondary">Japonais (fusionné)</label>
                <Select
                  id="genre-secondary"
                  value={secondaryPick}
                  options={japaneseGenres.map(g => ({ value: g, label: g }))}
                  onChange={setSecondaryPick}
                  placeholder="Genre japonais…"
                />
              </div>
              <button type="button" onClick={handleLink} disabled={!primaryPick || !secondaryPick} className="btn">
                <Link2 size={16} strokeWidth={2.25} />
                Lier
              </button>
            </div>
            {genreAliasGroups.length > 0 && (
              <div className="mt-5 flex flex-col">
                {genreAliasGroups.map(group => (
                  <div key={group[0]} className="flex items-center justify-between gap-2 border-b border-divider py-1.5 text-sm last:border-0">
                    <span>{group.join(' ↔ ')}</span>
                    <button
                      type="button"
                      aria-label={`Délier ${group[0]}`}
                      onClick={() => setGenreAliasGroups(prev => unlinkGroup(prev, group[0]))}
                      className="btn btn-ghost btn-icon"
                    >
                      <X size={16} strokeWidth={2.25} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {section === 'storage' && (
          <SettingRow
            label="Cache images"
            description="Supprime et retélécharge toutes les jaquettes et images depuis DLsite. Irréversible, et peut prendre du temps."
          >
            <button type="button" onClick={handleResetImages} disabled={isResettingImages} className="btn">
              {isResettingImages ? 'Réinitialisation en cours…' : 'Réinitialiser'}
            </button>
          </SettingRow>
        )}
      </div>
    </div>
  );
}
