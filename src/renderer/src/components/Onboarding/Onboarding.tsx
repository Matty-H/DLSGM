import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, FolderOpen, Languages, Palette } from 'lucide-react';
import { DEFAULT_THEME } from '../../../../shared/themes';
import type { AppSettings } from '../../hooks/useSettings';
import { getUiLanguage, t, uiLanguages } from '../../lib/i18n.js';
import Logo from '../Logo/Logo';
import ThemePicker from '../ThemePicker/ThemePicker';

export interface OnboardingProps {
  settings: AppSettings;
  /** Enregistre les paramètres (la langue recharge la fenêtre, voir save-settings). */
  onSave: (settings: AppSettings) => Promise<void>;
}

const STEPS = ['language', 'folder', 'theme'] as const;
type Step = (typeof STEPS)[number];

// Changer de langue recharge la fenêtre : l'étape en cours survit au rechargement.
const STEP_KEY = 'dlsgm-onboarding-step';

function readStep(): Step {
  try {
    const stored = sessionStorage.getItem(STEP_KEY);
    return STEPS.includes(stored as Step) ? (stored as Step) : 'language';
  } catch {
    return 'language';
  }
}

function writeStep(step: Step | null): void {
  try {
    if (step) sessionStorage.setItem(STEP_KEY, step);
    else sessionStorage.removeItem(STEP_KEY);
  } catch {
    // stockage indisponible : on repartira de la première étape après un rechargement.
  }
}

/**
 * Assistant du premier lancement (`onboardingPending`, écrit seulement dans
 * un settings.db neuf — jamais pour une installation existante) : langue de
 * l'interface, dossier de la bibliothèque, thème. Tout reste modifiable
 * ensuite dans les Paramètres ; « Passer » termine en gardant les choix faits.
 */
export default function Onboarding({ settings, onSave }: OnboardingProps) {
  const [step, setStep] = useState<Step>(readStep);
  const [folder, setFolder] = useState(settings.destinationFolder);
  const [theme, setTheme] = useState(settings.theme ?? DEFAULT_THEME);
  const [saving, setSaving] = useState(false);
  const index = STEPS.indexOf(step);

  const go = (next: Step) => {
    writeStep(next);
    setStep(next);
  };

  const finish = async () => {
    setSaving(true);
    writeStep(null);
    await onSave({ ...settings, destinationFolder: folder, theme, onboardingPending: false });
  };

  const chooseLanguage = (uiLanguage: string) => {
    if (uiLanguage === (settings.uiLanguage ?? 'system')) return;
    writeStep('language');
    void onSave({ ...settings, uiLanguage });
  };

  const languageChoice = settings.uiLanguage ?? 'system';
  const languages = [
    { code: 'system', name: t('Langue du système') },
    ...uiLanguages().map(language => ({ code: language.code, name: language.name }))
  ];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-deep/95 p-6">
      <div role="dialog" aria-modal="true" aria-label={t('Bienvenue dans DLSGM')} data-nav-scope className="panel flex max-h-full w-[760px] max-w-full flex-col gap-4 overflow-y-auto p-6">
        <div className="flex items-center gap-4">
          <Logo variant="horizontal" height={36} />
          <div className="ml-auto flex items-center gap-1.5" aria-label={t('Étape {n} sur {total}', { n: index + 1, total: STEPS.length })}>
            {STEPS.map((s, i) => (
              <span key={s} className={`h-2 w-8 rounded-full ${i <= index ? 'bg-accent' : 'bg-white/15'}`} />
            ))}
          </div>
        </div>

        {step === 'language' && (
          <>
            <h2 className="m-0 flex items-center gap-2 text-[20px] font-bold">
              <Languages size={20} strokeWidth={2.25} className="text-accent" />
              {t('Bienvenue dans DLSGM')}
            </h2>
            <p className="m-0 text-[14px] leading-relaxed text-text-secondary">
              {t('Quelques réglages pour commencer. Tout reste modifiable plus tard dans les Paramètres.')}
            </p>
            <div className="section-title">{t("Langue de l'interface")}</div>
            <div className="flex flex-wrap gap-2">
              {languages.map(language => (
                <button
                  key={language.code}
                  type="button"
                  onClick={() => chooseLanguage(language.code)}
                  aria-pressed={languageChoice === language.code}
                  className={`btn ${languageChoice === language.code ? 'btn-primary' : ''}`}
                >
                  {languageChoice === language.code && <Check size={15} strokeWidth={2.5} />}
                  {language.name}
                </button>
              ))}
            </div>
            <p className="m-0 text-[12px] text-text-muted">
              {t('Langue affichée : {name}. Changer de langue recharge la fenêtre.', {
                name: uiLanguages().find(language => language.code === getUiLanguage())?.name ?? getUiLanguage()
              })}
            </p>
          </>
        )}

        {step === 'folder' && (
          <>
            <h2 className="m-0 flex items-center gap-2 text-[20px] font-bold">
              <FolderOpen size={20} strokeWidth={2.25} className="text-accent" />
              {t('Dossier de bibliothèque')}
            </h2>
            <p className="m-0 text-[14px] leading-relaxed text-text-secondary">
              {t("Le dossier où vivent tes jeux : un sous-dossier par œuvre, nommé exactement d'après son ID DLsite (ex: RJ01234567). DLSGM y cherche les jeux, y extrait les archives importées et y reçoit les jeux partagés en réseau local.")}
            </p>
            <div className="flex items-center gap-3 rounded-md bg-bg-deep px-4 py-3">
              <span className={`min-w-0 flex-1 break-all text-[14px] ${folder ? 'text-text' : 'text-text-muted'}`}>{folder || t('Aucun dossier sélectionné')}</span>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const chosen = await window.electronAPI.openFolderDialog();
                  if (chosen) setFolder(chosen);
                }}
              >
                <FolderOpen size={16} strokeWidth={2.25} />
                {t('Parcourir')}
              </button>
            </div>
            {!folder && <p className="m-0 text-[12px] text-text-muted">{t('Tu peux aussi le choisir plus tard (Paramètres › Bibliothèque).')}</p>}
          </>
        )}

        {step === 'theme' && (
          <>
            <h2 className="m-0 flex items-center gap-2 text-[20px] font-bold">
              <Palette size={20} strokeWidth={2.25} className="text-accent" />
              {t('Thème')}
            </h2>
            <p className="m-0 text-[14px] leading-relaxed text-text-secondary">
              {t("Couleurs de l'interface, du logo et de l'icône. « Aléatoire » tire un thème à chaque démarrage, « Super random turbo 2000 remix » invente les couleurs à chaque démarrage.")}
            </p>
            <ThemePicker value={theme} savedValue={settings.theme ?? DEFAULT_THEME} onChange={setTheme} />
          </>
        )}

        <div className="mt-2 flex items-center gap-2">
          <button type="button" onClick={finish} disabled={saving} className="btn btn-ghost">
            {t('Passer')}
          </button>
          <div className="ml-auto flex gap-2">
            {index > 0 && (
              <button type="button" onClick={() => go(STEPS[index - 1])} disabled={saving} className="btn">
                {t('Précédent')}
              </button>
            )}
            {index < STEPS.length - 1 ? (
              <button type="button" onClick={() => go(STEPS[index + 1])} className="btn btn-primary">
                {t('Suivant')}
              </button>
            ) : (
              <button type="button" onClick={finish} disabled={saving} className="btn btn-primary">
                <Check size={16} strokeWidth={2.5} />
                {t('Terminer')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
