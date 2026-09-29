import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { resetAndRedownloadImages } from '../../lib/dataFetcher.js';
import { collectCanonicalGenres, isJapaneseText, linkGenres, unlinkGroup, type GenreAliasGroups } from '../../lib/genreAliases.js';
import { getSandboxieStatus, type SandboxieStatus } from '../../lib/gameTools.js';
import type { AppSettings } from '../../hooks/useSettings';

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

export default function SettingsScreen({ settings, onSave, allGenres }: SettingsScreenProps) {
  const [destinationFolder, setDestinationFolder] = useState(settings.destinationFolder);
  const [refreshRate, setRefreshRate] = useState(settings.refreshRate);
  const [language, setLanguage] = useState(settings.language);
  const [blurAdultContent, setBlurAdultContent] = useState(settings.blurAdultContent);
  const [genreAliasGroups, setGenreAliasGroups] = useState<GenreAliasGroups>(settings.genreAliasGroups);
  const [sandboxLaunch, setSandboxLaunch] = useState(settings.sandboxLaunch);
  const [sandboxieStatus, setSandboxieStatus] = useState<SandboxieStatus | null>(null);
  const [isResettingImages, setIsResettingImages] = useState(false);
  const [primaryPick, setPrimaryPick] = useState('');
  const [secondaryPick, setSecondaryPick] = useState('');

  useEffect(() => {
    setDestinationFolder(settings.destinationFolder);
    setRefreshRate(settings.refreshRate);
    setLanguage(settings.language);
    setBlurAdultContent(settings.blurAdultContent);
    setGenreAliasGroups(settings.genreAliasGroups);
    setSandboxLaunch(settings.sandboxLaunch);
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

  const handleBrowse = async () => {
    const folderPath = await window.electronAPI.openFolderDialog();
    if (folderPath) setDestinationFolder(folderPath);
  };

  const handleSave = () => {
    onSave({ ...settings, destinationFolder, refreshRate, language, blurAdultContent, genreAliasGroups, sandboxLaunch });
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
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mb-1 text-[11px] uppercase tracking-widest text-text-secondary opacity-55">Paramètres</div>
      <h1 className="mb-5">Compte et bibliothèque</h1>

      <div className="grid max-w-[520px] gap-4">
        <div className="field">
          <label htmlFor="folder">Dossier de bibliothèque</label>
          <div className="flex gap-2">
            <input id="folder" readOnly value={destinationFolder} className="input" />
            <button type="button" onClick={handleBrowse} className="btn btn-secondary">
              Parcourir
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="refresh">Fréquence de rafraîchissement du cache</label>
          <select
            id="refresh"
            value={nearestPreset(refreshRate)}
            onChange={e => setRefreshRate(Number(e.target.value))}
            className="input cursor-pointer"
          >
            {REFRESH_PRESETS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label id="privacy-label">Contenu adulte (R18)</label>
          <div className="seg" role="radiogroup" aria-labelledby="privacy-label">
            <label className="seg-opt">
              <input type="radio" name="privacy" checked={!blurAdultContent} onChange={() => setBlurAdultContent(false)} />
              Afficher normalement
            </label>
            <label className="seg-opt">
              <input type="radio" name="privacy" checked={blurAdultContent} onChange={() => setBlurAdultContent(true)} />
              Flouter jusqu'au clic
            </label>
          </div>
        </div>

        <div className="field">
          <label id="sandbox-label">Lancement des jeux</label>
          <div className="seg" role="radiogroup" aria-labelledby="sandbox-label">
            <label className="seg-opt">
              <input type="radio" name="sandbox" checked={!sandboxLaunch} onChange={() => setSandboxLaunch(false)} />
              Normal
            </label>
            <label className="seg-opt">
              <input type="radio" name="sandbox" checked={sandboxLaunch} onChange={() => setSandboxLaunch(true)} />
              Dans Sandboxie-Plus
            </label>
          </div>
          <p className="mt-2 text-xs text-text-secondary">
            Chaque jeu tourne dans sa propre sandbox : ce qu'il écrit hors de son dossier (AppData, registre) y est
            isolé au lieu de polluer Windows. Son dossier reste en accès direct (sauvegardes locales, patchs). Ce
            n'est pas une machine virtuelle : ça limite les dégâts d'un exécutable douteux sans les rendre impossibles.
          </p>
          {sandboxieStatus && (
            <p className={`mt-1 text-xs ${!sandboxieStatus.available && sandboxLaunch ? 'text-red-400' : 'text-text-secondary'}`}>
              {sandboxieStatus.available ? (
                `Sandboxie détecté : ${sandboxieStatus.installDir}`
              ) : (
                <>
                  Sandboxie-Plus n'est pas installé
                  {sandboxLaunch && ' — les jeux ne pourront pas être lancés tant que ce sera le cas'}.{' '}
                  <button type="button" className="underline" onClick={() => window.electronAPI.openExternal('https://sandboxie-plus.com/downloads/')}>
                    Télécharger
                  </button>
                </>
              )}
            </p>
          )}
        </div>

        <div className="field">
          <label>Langue</label>
          <div className="seg">
            <label className="seg-opt">
              <input type="radio" name="language" checked={language === 'en_US'} onChange={() => setLanguage('en_US')} />
              🇬🇧 English
            </label>
            <label className="seg-opt">
              <input type="radio" name="language" checked={language === 'ja_JP'} onChange={() => setLanguage('ja_JP')} />
              🇯🇵 日本語
            </label>
          </div>
        </div>

        <div className="field">
          <label>Genres liés</label>
          <p className="mb-2 text-xs text-text-secondary">
            DLsite fournit parfois le même genre en japonais et en anglais selon la langue de récupération (ex: "Anal" /
            "アナル"). Lie-les pour qu'ils comptent comme un seul genre dans les filtres et les statistiques — le premier
            choisi devient le libellé affiché.
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-text-secondary">
                Anglais (principal)
              </label>
              <select value={primaryPick} onChange={e => setPrimaryPick(e.target.value)} className="input cursor-pointer">
                <option value="">Genre anglais…</option>
                {englishGenres.map(g => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-text-secondary">Japonais (fusionné)</label>
              <select value={secondaryPick} onChange={e => setSecondaryPick(e.target.value)} className="input cursor-pointer">
                <option value="">Genre japonais…</option>
                {japaneseGenres.map(g => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={handleLink} disabled={!primaryPick || !secondaryPick} className="btn btn-secondary">
              Lier
            </button>
          </div>
          {genreAliasGroups.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {genreAliasGroups.map(group => (
                <div key={group[0]} className="flex items-center justify-between gap-2 text-sm">
                  <span>{group.join(' ↔ ')}</span>
                  <button
                    type="button"
                    aria-label={`Délier ${group[0]}`}
                    onClick={() => setGenreAliasGroups(prev => unlinkGroup(prev, group[0]))}
                    className="btn btn-ghost btn-icon"
                  >
                    <X size={14} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <label>Cache images</label>
          <button type="button" onClick={handleResetImages} disabled={isResettingImages} className="btn btn-secondary">
            {isResettingImages ? 'Réinitialisation en cours…' : 'Réinitialiser le cache images'}
          </button>
        </div>
      </div>

      <button type="button" onClick={handleSave} className="btn btn-primary blueprint mt-6">
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />
        Enregistrer
      </button>
    </div>
  );
}
