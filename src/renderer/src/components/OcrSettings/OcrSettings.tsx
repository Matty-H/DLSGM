import { useEffect, useState, type ReactNode } from 'react';
import Select from '../Select/Select';
import DictionaryInstall from './DictionaryInstall';
import Trans from '../Trans/Trans';
import { HOTKEY_OPTIONS } from '../../lib/autoClicker.js';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import { OCR_ENGINES, OCR_SOURCE_LANGUAGES, OCR_TARGET_LANGUAGES, ocrLanguageInstalled } from '../../lib/ocr.js';
import type { OcrTranslateSettings } from '../../../../shared/ipc-types';
import { t, tr } from '../../lib/i18n.js';

export interface OcrSettingsProps {
  value: OcrTranslateSettings;
  onChange: (value: OcrTranslateSettings) => void;
  /** Raccourcis des autres outils : pas proposés ici. */
  takenHotkeys: string[];
  isDirty: boolean;
}

function Row({ label, description, children }: { label: ReactNode; description?: ReactNode; children?: ReactNode }) {
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

/** Saisie d'une clé d'API : jamais réaffichée, enregistrée chiffrée tout de suite. */
function KeyField({ engine, saved, onSaved }: { engine: 'deepl' | 'google'; saved: boolean; onSaved: () => void }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = async (value: string | null) => {
    setError(null);
    try {
      await window.electronAPI.setTranslationKey(engine, value);
      setKey('');
      onSaved();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input
          type="password"
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder={saved ? t('Clé enregistrée — en saisir une autre') : t('Clé d’API')}
          aria-label={t('Clé {service}', { service: engine === 'deepl' ? 'DeepL' : 'Google' })}
          autoComplete="off"
          className="input w-[260px]"
        />
        <button type="button" className="btn" disabled={!key.trim()} onClick={() => save(key)}>
          {t('Enregistrer')}
        </button>
        {saved && (
          <button type="button" className="btn btn-ghost" onClick={() => save(null)}>
            {t('Effacer')}
          </button>
        )}
      </div>
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </div>
  );
}

/**
 * Paramètres › Outils en jeu › Traduction à l'écran : interrupteur,
 * raccourci, langues, moteur (aucun, serveur local, DeepL, Google) et clés.
 */
export default function OcrSettings({ value, onChange, takenHotkeys, isDirty }: OcrSettingsProps) {
  const [languages, setLanguages] = useState<string[] | null>(null);
  const [keys, setKeys] = useState<{ deepl: boolean; google: boolean }>({ deepl: false, google: false });
  const set = (patch: Partial<OcrTranslateSettings>) => onChange({ ...value, ...patch });

  const refreshKeys = () => window.electronAPI.getTranslationKeys().then(setKeys).catch(() => undefined);
  useEffect(() => {
    window.electronAPI.getOcrLanguages().then(setLanguages).catch(() => setLanguages([]));
    refreshKeys();
  }, []);

  const installed = languages === null ? null : ocrLanguageInstalled(languages, value.source);
  const hotkeyOptions = HOTKEY_OPTIONS.filter(o => !takenHotkeys.some(k => k.toLowerCase() === o.value.toLowerCase()));

  return (
    <>
      <Row
        label={t("Activer la traduction à l'écran")}
        description={
          <>
            {t("Pendant une partie lancée depuis DLSGM, le raccourci lit le texte de la fenêtre du jeu avec l'OCR de Windows et affiche sa traduction par-dessus ; une seconde pression (ou Échap) la cache. Aussi dans l'overlay (Maj+Tab).")}
            {isDirty && <span className="mt-1 block text-text-secondary">{t('Enregistre pour appliquer les changements.')}</span>}
          </>
        }
      >
        <input type="checkbox" className="toggle" aria-label={t("Activer la traduction à l'écran")} checked={value.enabled} onChange={e => set({ enabled: e.target.checked })} />
      </Row>
      <Row label={t('Raccourci')} description={t('Différent de ceux des autres outils.')}>
        <Select value={value.hotkey} options={hotkeyOptions} onChange={hotkey => set({ hotkey })} aria-label={t('Raccourci de la traduction')} className="w-[150px]" />
      </Row>
      <Row
        label={t('Langue du jeu (OCR)')}
        description={
          installed === false ? (
            <span className="text-danger">
              {t("Cette langue n'est pas installée pour l'OCR de Windows. Paramètres Windows › Heure et langue › Langue › Ajouter la langue (japonais : la reconnaissance optique suffit), ou en PowerShell administrateur :")}{' '}
              <span className="font-mono">Add-WindowsCapability -Online -Name "Language.OCR~~~ja-JP~0.0.1.0"</span>
            </span>
          ) : (
            t('Langues OCR installées : {list}', { list: languages?.join(', ') || '…' })
          )
        }
      >
        <Select value={value.source} options={OCR_SOURCE_LANGUAGES.map(o => ({ ...o, label: tr(o.label) }))} onChange={source => set({ source })} aria-label={t('Langue du jeu')} className="w-[150px]" />
      </Row>
      <Row
        label={t('Traduction')}
        description={
          value.engine === 'dictionary'
            ? t('Le sens de chaque mot et de chaque kanji (pas une phrase traduite), lecture en furigana ; fiche détaillée au survol d’un mot. Hors ligne : rien ne quitte ce PC. Japonais seulement ; sens en français quand JMdict en a, sinon en anglais.')
            : value.engine === 'none'
            ? t('Texte reconnu seulement, sans traduction (rien ne quitte ce PC).')
            : value.engine === 'local'
              ? t('Serveur LLM local compatible OpenAI (Ollama, LM Studio, llama.cpp…) : phrases traduites, le texte ne quitte pas ce PC.')
              : t("Le texte reconnu (jamais l'image) est envoyé à {service} à chaque lecture.", { service: value.engine === 'deepl' ? 'DeepL' : 'Google' })
        }
      >
        <Select value={value.engine} options={OCR_ENGINES.map(o => ({ ...o, label: tr(o.label) }))} onChange={engine => set({ engine: engine as OcrTranslateSettings['engine'] })} aria-label={t('Moteur de traduction')} className="w-[190px]" />
        <Select value={value.target} options={OCR_TARGET_LANGUAGES.map(o => ({ ...o, label: tr(o.label) }))} onChange={target => set({ target })} aria-label={t('Langue de traduction')} className="w-[130px]" />
      </Row>
      {value.engine === 'dictionary' && (
        <Row
          label={t('Dictionnaire hors ligne')}
          description={
            <>
              <Trans
                text={t('Téléchargé une fois, puis utilisé sans connexion. Données {source} (CC BY-SA 4.0), via jmdict-simplified.')}
                values={{
                  source: (
                    <button type="button" className="text-accent hover:underline" onClick={() => window.electronAPI.openExternal('https://www.edrdg.org/edrdg/licence.html')}>
                      {t("JMdict et KANJIDIC de l'EDRDG")}
                    </button>
                  )
                }}
              />
              {!value.source.startsWith('ja') && <span className="mt-1 block text-danger">{t('Le dictionnaire ne sert que pour le japonais.')}</span>}
            </>
          }
        >
          <DictionaryInstall />
        </Row>
      )}
      {value.engine === 'local' && (
        <Row label={t('Serveur local')} description={t("Adresse de l'API compatible OpenAI (Ollama : http://127.0.0.1:11434/v1, LM Studio : http://127.0.0.1:1234/v1) et nom du modèle.")}>
          <input type="text" className="input w-[230px]" value={value.localUrl} onChange={e => set({ localUrl: e.target.value })} aria-label={t('Adresse du serveur local')} spellCheck={false} />
          <input type="text" className="input w-[160px]" value={value.localModel} onChange={e => set({ localModel: e.target.value })} placeholder={t('modèle (ex: qwen2.5:7b)')} aria-label={t('Modèle')} spellCheck={false} />
        </Row>
      )}
      {(value.engine === 'deepl' || value.engine === 'google') && (
        <Row
          label={t('Clé {service}', { service: value.engine === 'deepl' ? 'DeepL' : 'Google Cloud Translation' })}
          description={t('Chiffrée par Windows, jamais affichée ni envoyée ailleurs. Enregistrée tout de suite.')}
        >
          <KeyField engine={value.engine} saved={keys[value.engine]} onSaved={refreshKeys} />
        </Row>
      )}
    </>
  );
}
