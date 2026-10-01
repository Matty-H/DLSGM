import { describe, expect, it } from 'vitest';
import { groupOcrLines, joinCjk, sanitizeOcrSettings, DEFAULT_OCR } from '../../src/main/ocr';
import { deeplEndpoint, localPrompt, parseNumbered, translateTexts, type FetchLike } from '../../src/main/translator';
import type { OcrTranslateSettings } from '../../src/shared/ipc-types';

describe('OCR : texte et blocs', () => {
  it('retire les espaces que l’OCR met entre les caractères japonais, garde ceux du texte latin', () => {
    expect(joinCjk('お は よ う 、 先 輩 ！')).toBe('おはよう、先輩！');
    expect(joinCjk('HP 1 0 0 / 1 0 0 ア イ テ ム')).toBe('HP 1 0 0 / 1 0 0 アイテム');
    expect(joinCjk('Good morning, senpai.')).toBe('Good morning, senpai.');
  });

  it('regroupe les lignes d’une même bulle, sépare les blocs éloignés (mesure réelle de l’OCR Windows)', () => {
    // Lignes renvoyées par Windows.Media.Ocr sur la fenêtre de test (en-US).
    const lines = [
      { y: 38, height: 26, width: 274, text: 'Good morning, senpai.', x: 34 },
      { y: 74, height: 26, width: 305, text: 'The weather is nice today.', x: 34 },
      { y: 288, height: 18, width: 163, text: 'Save Load Quit', x: 34 }
    ];
    expect(groupOcrLines(lines)).toEqual([
      { text: 'Good morning, senpai. The weather is nice today.', x: 34, y: 38, width: 305, height: 62 },
      { text: 'Save Load Quit', x: 34, y: 288, width: 163, height: 18 }
    ]);
  });

  it('japonais : lignes d’une bulle collées sans espace ; deux colonnes restent deux blocs', () => {
    const blocks = groupOcrLines([
      { text: '今 日 は い い', x: 10, y: 10, width: 200, height: 30 },
      { text: '天 気 で す ね 。', x: 10, y: 44, width: 220, height: 30 },
      { text: '保 存', x: 600, y: 10, width: 60, height: 30 }
    ]);
    expect(blocks.map(b => b.text)).toEqual(['今日はいい天気ですね。', '保存']);
  });

  it('réglages ramenés à des valeurs sûres', () => {
    expect(sanitizeOcrSettings(undefined)).toEqual(DEFAULT_OCR);
    expect(sanitizeOcrSettings({ enabled: true, source: 'zh-Hans', target: 'en', engine: 'deepl', hotkey: ' F9 ' })).toMatchObject({
      enabled: true,
      source: 'zh-Hans',
      target: 'en',
      engine: 'deepl',
      hotkey: 'F9'
    });
    expect(sanitizeOcrSettings({ source: 'ja; rm -rf', target: 'français', engine: 'autre' as never })).toMatchObject({ source: 'ja', target: 'fr', engine: 'dictionary' });
    expect(sanitizeOcrSettings({ engine: 'none' }).engine).toBe('none');
  });
});

const settings = (patch: Partial<OcrTranslateSettings>): OcrTranslateSettings => ({ ...DEFAULT_OCR, enabled: true, ...patch });

/** fetch simulé : enregistre l'appel, répond `body`. */
function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; init: Parameters<FetchLike>[1] }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
  };
  return { fetch, calls };
}

describe('traduction', () => {
  it('aucun moteur : rien n’est envoyé', async () => {
    const { fetch, calls } = fakeFetch({});
    expect(await translateTexts(['a'], { settings: settings({ engine: 'none' }), fetch })).toEqual([null]);
    expect(calls).toHaveLength(0);
  });

  it('serveur local (compatible OpenAI) : lignes numérotées, réponse remise dans l’ordre, <think> ignoré', async () => {
    const { fetch, calls } = fakeFetch({ choices: [{ message: { content: '<think>hmm 1. non</think>\n2. Sauvegarder\n1. Bonjour, senpai.' } }] });
    const result = await translateTexts(['おはよう、先輩。', '保存'], {
      settings: settings({ engine: 'local', localUrl: 'http://127.0.0.1:11434/v1/', localModel: 'qwen2.5:7b' }),
      fetch
    });
    expect(result).toEqual(['Bonjour, senpai.', 'Sauvegarder']);
    expect(calls[0].url).toBe('http://127.0.0.1:11434/v1/chat/completions');
    const body = JSON.parse(calls[0].init.body);
    expect(body.model).toBe('qwen2.5:7b');
    expect(body.messages[1].content).toBe('1. おはよう、先輩。\n2. 保存');
    expect(body.messages[0].content).toMatch(/Japanese.*French/);
  });

  it('DeepL : clé gratuite → api-free, en-tête d’autorisation, langues en majuscules', async () => {
    const { fetch, calls } = fakeFetch({ translations: [{ text: 'Bonjour' }, { text: 'Sauvegarder' }] });
    const result = await translateTexts(['おはよう', '保存'], { settings: settings({ engine: 'deepl' }), apiKey: 'abc:fx', fetch });
    expect(result).toEqual(['Bonjour', 'Sauvegarder']);
    expect(calls[0].url).toBe('https://api-free.deepl.com/v2/translate');
    expect(calls[0].init.headers.Authorization).toBe('DeepL-Auth-Key abc:fx');
    expect(JSON.parse(calls[0].init.body)).toEqual({ text: ['おはよう', '保存'], target_lang: 'FR', source_lang: 'JA' });
    expect(deeplEndpoint('pro-key')).toBe('https://api.deepl.com/v2/translate');
  });

  it('Google : clé dans l’URL, langues courtes (en-US → en)', async () => {
    const { fetch, calls } = fakeFetch({ data: { translations: [{ translatedText: 'Bonjour' }] } });
    const result = await translateTexts(['Good morning'], { settings: settings({ engine: 'google', source: 'en-US' }), apiKey: 'k&y', fetch });
    expect(result).toEqual(['Bonjour']);
    expect(calls[0].url).toBe('https://translation.googleapis.com/language/translate/v2?key=k%26y');
    expect(JSON.parse(calls[0].init.body)).toEqual({ q: ['Good morning'], source: 'en', target: 'fr', format: 'text' });
  });

  it('erreurs claires : clé manquante, réponse HTTP en erreur, adresse locale invalide', async () => {
    const { fetch } = fakeFetch({ message: 'Forbidden' }, 403);
    await expect(translateTexts(['a'], { settings: settings({ engine: 'deepl' }), apiKey: null, fetch })).rejects.toThrow(/Clé DeepL non enregistrée/);
    await expect(translateTexts(['a'], { settings: settings({ engine: 'deepl' }), apiKey: 'k', fetch })).rejects.toThrow(/HTTP 403/);
    await expect(translateTexts(['a'], { settings: settings({ engine: 'local', localUrl: 'ftp://x' }), fetch })).rejects.toThrow(/Adresse du serveur local invalide/);
  });

  it('réponse numérotée incomplète : les blocs manquants restent vides ; un seul bloc sans numéro = toute la réponse', () => {
    expect(parseNumbered('1) Un\n3. Trois', 3)).toEqual(['Un', null, 'Trois']);
    expect(parseNumbered('Bonjour.', 1)).toEqual(['Bonjour.']);
    expect(localPrompt(['a\nb'], 'ja', 'en').user).toBe('1. a b');
  });
});
