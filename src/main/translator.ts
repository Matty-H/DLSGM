import type { OcrTranslateSettings } from '../shared/ipc-types';

/**
 * Traduction des blocs lus par l'OCR. Trois moteurs :
 * - `local` : un serveur compatible OpenAI sur ce PC (Ollama, LM Studio,
 *   llama.cpp, KoboldCpp...) — le texte ne quitte pas la machine ;
 * - `deepl` : API DeepL (clé ; les clés gratuites finissent par `:fx`) ;
 * - `google` : API Cloud Translation v2 (clé).
 * Pour DeepL et Google, **le texte reconnu quitte la machine** (jamais
 * l'image). Un appel par capture : tous les blocs ensemble, dans l'ordre.
 */

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export interface TranslateOptions {
  settings: OcrTranslateSettings;
  /** Clé de l'API (DeepL / Google), déchiffrée par l'appelant. */
  apiKey?: string | null;
  fetch: FetchLike;
  timeoutMs?: number;
}

const LANGUAGE_NAMES: Record<string, string> = { fr: 'French', en: 'English', ja: 'Japanese', es: 'Spanish', de: 'German', it: 'Italian', pt: 'Portuguese', zh: 'Chinese', ko: 'Korean' };

/** `ja`, `en-US`, `zh-Hans` → code court (`ja`, `en`, `zh`). */
export function shortLanguage(tag: string): string {
  return tag.toLowerCase().split('-')[0];
}

async function request(fetch: FetchLike, url: string, init: Parameters<FetchLike>[1], timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 200);
      throw new Error(`HTTP ${response.status}${detail ? ` : ${detail}` : ''}`);
    }
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`pas de réponse en ${Math.round(timeoutMs / 1000)} s`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Point d'accès DeepL selon la clé (gratuite `:fx` ou payante). */
export function deeplEndpoint(key: string): string {
  return key.trim().endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
}

/**
 * Consigne du serveur local : une ligne numérotée par bloc, réponse au même
 * format (les modèles respectent mieux une numérotation qu'un JSON).
 */
export function localPrompt(texts: string[], source: string, target: string): { system: string; user: string } {
  const from = LANGUAGE_NAMES[shortLanguage(source)] ?? source;
  const to = LANGUAGE_NAMES[shortLanguage(target)] ?? target;
  return {
    system: `You translate ${from} video game text into natural ${to}. Each input line is "<number>. <text>". Answer with exactly the same numbered lines, translated, and nothing else. Keep names; translate menu words briefly.`,
    user: texts.map((text, i) => `${i + 1}. ${text.replace(/\s*\n\s*/g, ' ')}`).join('\n')
  };
}

/** Réponse numérotée du modèle → une traduction par bloc (null si une ligne manque). */
export function parseNumbered(answer: string, count: number): (string | null)[] {
  const out: (string | null)[] = Array.from({ length: count }, () => null);
  for (const line of answer.split(/\r?\n/)) {
    const m = /^\s*(\d+)[.)、:：]\s*(.*)$/.exec(line);
    if (!m) continue;
    const index = Number(m[1]) - 1;
    if (index >= 0 && index < count && out[index] === null && m[2].trim()) out[index] = m[2].trim();
  }
  // Un seul bloc et pas de numéro : toute la réponse.
  if (count === 1 && out[0] === null && answer.trim()) out[0] = answer.trim();
  return out;
}

/** Traduit `texts` (un par bloc) ; rend une traduction par bloc, dans l'ordre. */
export async function translateTexts(texts: string[], { settings, apiKey, fetch, timeoutMs = 30_000 }: TranslateOptions): Promise<(string | null)[]> {
  if (texts.length === 0 || settings.engine === 'none') return texts.map(() => null);
  const target = shortLanguage(settings.target);
  const source = shortLanguage(settings.source);

  if (settings.engine === 'local') {
    const base = settings.localUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(base)) throw new Error('Adresse du serveur local invalide (ex: http://127.0.0.1:11434/v1).');
    const prompt = localPrompt(texts, settings.source, settings.target);
    const data = (await request(
      fetch,
      `${base}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.localModel.trim() || 'default',
          temperature: 0.2,
          stream: false,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user }
          ]
        })
      },
      timeoutMs
    )) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Réponse du serveur local illisible.');
    // Modèles « à raisonnement » : la réflexion entre <think> n'est pas la réponse.
    return parseNumbered(content.replace(/<think>[\s\S]*?<\/think>/g, ''), texts.length);
  }

  if (!apiKey) throw new Error(`Clé ${settings.engine === 'deepl' ? 'DeepL' : 'Google'} non enregistrée (Paramètres › Outils en jeu).`);

  if (settings.engine === 'deepl') {
    const data = (await request(
      fetch,
      deeplEndpoint(apiKey),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `DeepL-Auth-Key ${apiKey.trim()}` },
        body: JSON.stringify({ text: texts, target_lang: target.toUpperCase(), source_lang: source.toUpperCase() })
      },
      timeoutMs
    )) as { translations?: { text?: string }[] };
    return texts.map((_, i) => data.translations?.[i]?.text ?? null);
  }

  const data = (await request(
    fetch,
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey.trim())}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: texts, source, target, format: 'text' })
    },
    timeoutMs
  )) as { data?: { translations?: { translatedText?: string }[] } };
  return texts.map((_, i) => data.data?.translations?.[i]?.translatedText ?? null);
}
