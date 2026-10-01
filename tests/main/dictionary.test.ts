import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ utilityProcess: { fork: () => { throw new Error('non disponible en test'); } } }));

import { buildIndex, deinflect, lookupText } from '../../src/main/dictionary';
import { downloadVerified, sha256 } from '../../src/main/dictionary-store';

/** Mot au format jmdict-simplified. */
const word = (id: string, kanji: string[], kana: string[], pos: string[], glosses: string[][], common = true) => ({
  id,
  kanji: kanji.map(text => ({ text, common })),
  kana: kana.map(text => ({ text, common })),
  sense: glosses.map(g => ({ partOfSpeech: pos, gloss: g.map(text => ({ text })) }))
});

// Extraits réels de JMdict (sens raccourcis), dont les pièges rencontrés en vrai.
const eng = {
  words: [
    word('1579110', ['今日'], ['きょう', 'こんにち'], ['n', 'adv'], [['today']]),
    word('1289400', ['今日は'], ['こんにちは'], ['int'], [['hello']]),
    word('2028920', [], ['は'], ['prt'], [['indicates sentence topic']]),
    word('1601100', ['羽'], ['は'], ['n'], [['feather']]),
    word('1188270', ['良い', '善い'], ['よい', 'いい'], ['adj-ix'], [['good']]),
    word('1438690', ['天気'], ['てんき'], ['n'], [['weather']]),
    word('1628500', [], ['です'], ['cop'], [['be', 'is']]),
    word('1358280', ['食べる'], ['たべる'], ['v1', 'vt'], [['to eat']]),
    word('1578850', ['行く'], ['いく', 'ゆく'], ['v5k-s', 'vi'], [['to go']]),
    word('1590330', ['行う'], ['おこなう'], ['v5u', 'vt'], [['to perform']]),
    word('1260670', ['元', '本'], ['もと'], ['n'], [['origin']]),
    word('1522150', ['本'], ['ほん'], ['n'], [['book']]),
    word('1157170', ['為る'], ['する'], ['vs-i'], [['to do']]),
    word('1547720', ['来る'], ['くる'], ['vk'], [['to come']]),
    word('1586130', ['美味しい'], ['おいしい'], ['adj-i'], [['delicious']]),
    word('1077170', [], ['セーブ'], ['n', 'vs'], [['saving']])
  ]
};
const fre = {
  words: [word('1579110', ['今日'], ['きょう'], ['n'], [["aujourd'hui"]]), word('1358280', ['食べる'], ['たべる'], ['v1'], [['manger']])]
};
const kanjidic = {
  characters: [
    { literal: '天', readingMeaning: { groups: [{ readings: [{ type: 'ja_on', value: 'テン' }, { type: 'ja_kun', value: 'あまつ' }], meanings: [{ lang: 'en', value: 'heavens' }, { lang: 'fr', value: 'ciel' }] }] } },
    { literal: '気', readingMeaning: { groups: [{ readings: [{ type: 'ja_on', value: 'キ' }], meanings: [{ lang: 'en', value: 'spirit' }] }] } },
    { literal: '魔', readingMeaning: { groups: [{ readings: [{ type: 'ja_on', value: 'マ' }], meanings: [{ lang: 'en', value: 'witch' }, { lang: 'fr', value: 'démon' }] }] } }
  ]
};
const index = buildIndex(eng, fre, kanjidic, 'test');
const words = (text: string, lang: 'fr' | 'en' = 'fr') => lookupText(index, text, lang).map(t => `${t.text}${t.base ? `>${t.base}` : ''}`);

describe('dictionnaire hors ligne', () => {
  it('déconjugue verbes et adjectifs vers la forme du dictionnaire', () => {
    const bases = (w: string) => deinflect(w).map(d => d.text);
    expect(bases('食べました')).toContain('食べる');
    expect(bases('行ってしまった')).toContain('行く');
    expect(bases('美味しかった')).toContain('美味しい');
    expect(bases('します')).toContain('する');
    expect(bases('来ました')).toContain('来る');
    expect(bases('食べに')).toContain('食べる');
    // Jamais de terminaison seule (« す » depuis « します »).
    expect(bases('します')).not.toContain('す');
  });

  it("découpe une phrase : particule séparée du mot en kanji, です entier, lecture cohérente avec les kana", () => {
    expect(words('今日はいい天気ですね。')).toEqual(['今日', 'は', 'いい', '天気', 'です', 'ね。']);
    const good = lookupText(index, 'いい天気', 'fr');
    expect(good[0]).toMatchObject({ text: 'いい', reading: null });
  });

  it('formes conjuguées : forme de base, 行く avant 行う, する et 来る', () => {
    expect(words('食べました')).toEqual(['食べました>食べる']);
    expect(words('行ってしまった')).toEqual(['行ってしまった>行く']);
    expect(words('セーブします')).toEqual(['セーブ', 'します>する']);
  });

  it('graphie principale d’abord (本 : ほん « livre », pas もと), particule = entrée « particule »', () => {
    const [book, topic] = lookupText(index, '本は', 'fr');
    expect(book).toMatchObject({ reading: 'ほん', senses: [['book']] });
    expect(topic.senses).toEqual([['indicates sentence topic']]);
  });

  it('sens en français quand JMdict en a, sinon en anglais ; kanji avec leur sens et lectures', () => {
    const [today] = lookupText(index, '今日', 'fr');
    expect(today).toMatchObject({ reading: 'きょう', senses: [["aujourd'hui"]], french: true });
    const [weather] = lookupText(index, '天気', 'fr');
    expect(weather).toMatchObject({ senses: [['weather']], french: false });
    expect(weather.kanji).toEqual([
      { char: '天', meanings: ['ciel'], french: true, on: ['テン'], kun: ['あまつ'] },
      { char: '気', meanings: ['spirit'], french: false, on: ['キ'], kun: [] }
    ]);
    expect(lookupText(index, '今日', 'en')[0].senses).toEqual([['today']]);
  });

  it('kanji inconnu comme mot : garde son sens de kanji ; ponctuation et latin en texte simple', () => {
    const tokens = lookupText(index, '魔！ HP', 'fr');
    expect(tokens[0]).toMatchObject({ text: '魔', senses: [], kanji: [{ char: '魔', meanings: ['démon'] }] });
    expect(tokens[1]).toMatchObject({ text: '！ HP', senses: [] });
  });
});

describe('téléchargement épinglé', () => {
  const body = (data: Buffer) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(data.subarray(0, 3)));
        controller.enqueue(new Uint8Array(data.subarray(3)));
        controller.close();
      }
    });

  it('suit la progression et vérifie le SHA-256', async () => {
    const data = Buffer.from('contenu du dictionnaire');
    const seen: number[] = [];
    const got = await downloadVerified(async () => ({ ok: true, status: 200, body: body(data) }), 'u', sha256(data), n => seen.push(n));
    expect(got).toEqual(data);
    expect(seen.reduce((a, b) => a + b, 0)).toBe(data.length);
  });

  it('refuse un fichier altéré ou une erreur HTTP', async () => {
    const data = Buffer.from('autre chose');
    await expect(downloadVerified(async () => ({ ok: true, status: 200, body: body(data) }), 'u', '0'.repeat(64), () => undefined)).rejects.toThrow(/Somme de contrôle/);
    await expect(downloadVerified(async () => ({ ok: false, status: 404, body: null }), 'u', 'x', () => undefined)).rejects.toThrow(/HTTP 404/);
  });
});
