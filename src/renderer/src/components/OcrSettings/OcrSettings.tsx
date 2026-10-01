import { useEffect, useState, type ReactNode } from 'react';
import Select from '../Select/Select';
import DictionaryInstall from './DictionaryInstall';
import { HOTKEY_OPTIONS } from '../../lib/autoClicker.js';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import { OCR_ENGINES, OCR_SOURCE_LANGUAGES, OCR_TARGET_LANGUAGES, ocrLanguageInstalled } from '../../lib/ocr.js';
import type { OcrTranslateSettings } from '../../../../shared/ipc-types';

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
          placeholder={saved ? 'Clé enregistrée — en saisir une autre' : 'Clé d’API'}
          aria-label={`Clé ${engine === 'deepl' ? 'DeepL' : 'Google'}`}
          autoComplete="off"
          className="input w-[260px]"
        />
        <button type="button" className="btn" disabled={!key.trim()} onClick={() => save(key)}>
          Enregistrer
        </button>
        {saved && (
          <button type="button" className="btn btn-ghost" onClick={() => save(null)}>
            Effacer
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
        label="Activer la traduction à l'écran"
        description={
          <>
            Pendant une partie lancée depuis DLSGM, le raccourci lit le texte de la fenêtre du jeu avec l'OCR de Windows et
            affiche sa traduction par-dessus ; une seconde pression (ou Échap) la cache. Aussi dans l'overlay (Maj+Tab).
            {isDirty && <span className="mt-1 block text-text-secondary">Enregistre pour appliquer les changements.</span>}
          </>
        }
      >
        <input type="checkbox" className="toggle" aria-label="Activer la traduction à l'écran" checked={value.enabled} onChange={e => set({ enabled: e.target.checked })} />
      </Row>
      <Row label="Raccourci" description="Différent de ceux des autres outils.">
        <Select value={value.hotkey} options={hotkeyOptions} onChange={hotkey => set({ hotkey })} aria-label="Raccourci de la traduction" className="w-[150px]" />
      </Row>
      <Row
        label="Langue du jeu (OCR)"
        description={
          installed === false ? (
            <span className="text-danger">
              Cette langue n'est pas installée pour l'OCR de Windows. Paramètres Windows › Heure et langue › Langue › Ajouter
              la langue (japonais : la reconnaissance optique suffit), ou en PowerShell administrateur :{' '}
              <span className="font-mono">Add-WindowsCapability -Online -Name "Language.OCR~~~ja-JP~0.0.1.0"</span>
            </span>
          ) : (
            `Langues OCR installées : ${languages?.join(', ') || '…'}`
          )
        }
      >
        <Select value={value.source} options={OCR_SOURCE_LANGUAGES} onChange={source => set({ source })} aria-label="Langue du jeu" className="w-[150px]" />
      </Row>
      <Row
        label="Traduction"
        description={
          value.engine === 'dictionary'
            ? 'Le sens de chaque mot et de chaque kanji (pas une phrase traduite), lecture en furigana ; fiche détaillée au survol d’un mot. Hors ligne : rien ne quitte ce PC. Japonais seulement ; sens en français quand JMdict en a, sinon en anglais.'
            : value.engine === 'none'
            ? 'Texte reconnu seulement, sans traduction (rien ne quitte ce PC).'
            : value.engine === 'local'
              ? 'Serveur LLM local compatible OpenAI (Ollama, LM Studio, llama.cpp…) : phrases traduites, le texte ne quitte pas ce PC.'
              : `Le texte reconnu (jamais l'image) est envoyé à ${value.engine === 'deepl' ? 'DeepL' : 'Google'} à chaque lecture.`
        }
      >
        <Select value={value.engine} options={OCR_ENGINES} onChange={engine => set({ engine: engine as OcrTranslateSettings['engine'] })} aria-label="Moteur de traduction" className="w-[190px]" />
        <Select value={value.target} options={OCR_TARGET_LANGUAGES} onChange={target => set({ target })} aria-label="Langue de traduction" className="w-[130px]" />
      </Row>
      {value.engine === 'dictionary' && (
        <Row
          label="Dictionnaire hors ligne"
          description={
            <>
              Téléchargé une fois, puis utilisé sans connexion. Données{' '}
              <button type="button" className="text-accent hover:underline" onClick={() => window.electronAPI.openExternal('https://www.edrdg.org/edrdg/licence.html')}>
                JMdict et KANJIDIC de l'EDRDG
              </button>{' '}
              (CC BY-SA 4.0), via jmdict-simplified.
              {!value.source.startsWith('ja') && <span className="mt-1 block text-danger">Le dictionnaire ne sert que pour le japonais.</span>}
            </>
          }
        >
          <DictionaryInstall />
        </Row>
      )}
      {value.engine === 'local' && (
        <Row label="Serveur local" description="Adresse de l'API compatible OpenAI (Ollama : http://127.0.0.1:11434/v1, LM Studio : http://127.0.0.1:1234/v1) et nom du modèle.">
          <input type="text" className="input w-[230px]" value={value.localUrl} onChange={e => set({ localUrl: e.target.value })} aria-label="Adresse du serveur local" spellCheck={false} />
          <input type="text" className="input w-[160px]" value={value.localModel} onChange={e => set({ localModel: e.target.value })} placeholder="modèle (ex: qwen2.5:7b)" aria-label="Modèle" spellCheck={false} />
        </Row>
      )}
      {(value.engine === 'deepl' || value.engine === 'google') && (
        <Row
          label={value.engine === 'deepl' ? 'Clé DeepL' : 'Clé Google Cloud Translation'}
          description="Chiffrée par Windows, jamais affichée ni envoyée ailleurs. Enregistrée tout de suite."
        >
          <KeyField engine={value.engine} saved={keys[value.engine]} onSaved={refreshKeys} />
        </Row>
      )}
    </>
  );
}
