import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ net: {}, session: {} }));

import { pairGenreTranslations, parseAjaxTimestamp, parseOptions, parseTableDate, parseWorkHtml } from '../../src/main/dlsite-fetcher';

describe('parseTableDate', () => {
  it.each([
    ['2024年05月01日', '2024-05-01T00:00:00'],
    ['2024年5月1日 0時', '2024-05-01T00:00:00'],
    ['May/01/2024', '2024-05-01T00:00:00'],
    ['September/9/2023', '2023-09-09T00:00:00'],
    ['bientôt', null]
  ])('%s → %s', (text, expected) => {
    expect(parseTableDate(text)).toBe(expected);
  });
});

describe('parseAjaxTimestamp', () => {
  it('convertit le format ajax en ISO local', () => {
    expect(parseAjaxTimestamp('2024-05-01 16:00:00')).toBe('2024-05-01T16:00:00');
    expect(parseAjaxTimestamp('2024/05/01')).toBeNull();
  });
});

describe('parseOptions', () => {
  it('garde les codes connus et ignore les autres (comme dlsite-async)', () => {
    expect(parseOptions('SND#JPN#DLP#REV#TRI#XYZ')).toEqual(['SND', 'JPN', 'DLP', 'REV', 'TRI']);
    expect(parseOptions('')).toBeNull();
    expect(parseOptions(undefined)).toBeNull();
    expect(parseOptions('XYZ')).toBeNull();
  });
});

// Structure réduite d'une vraie page d'œuvre DLsite (tables work_maker et
// work_outline, galerie, meta description).
const WORK_HTML = `<!doctype html><html><head>
<meta name="description" content="Un RPG d'aventure. 「DLsite同人」は同人誌・同人ゲーム・同人ボイス・ASMRのダウンロードショップ。お気に入りの作品をすぐダウンロードできてすぐ楽しめる！毎日更新しているのであなたが探している作品にきっと出会えます。国内最大級の二次元総合ダウンロードショップ「DLsite」！">
</head><body>
<table id="work_maker"><tr><th>サークル名</th><td><span class="maker_name"><a href="/maniax/circle/profile/=/maker_id/RG01001209.html">猫3</a></span></td></tr></table>
<table id="work_outline">
<tr><th>販売日</th><td>2024年05月01日</td></tr>
<tr><th>最終更新日</th><td>2024年06月02日</td></tr>
<tr><th>シリーズ名</th><td><a href="#">理想の生活</a></td></tr>
<tr><th>作者</th><td><a href="#">猫3</a></td></tr>
<tr><th>声優</th><td><a href="#">声優A</a> / <a href="#">声優Ｂ</a></td></tr>
<tr><th>ジャンル</th><td><div class="main_genre"><a href="https://www.dlsite.com/maniax/fsr/=/genre/509/from/work.genre">3D作品</a><a href="https://www.dlsite.com/maniax/fsr/=/genre/004/from/work.genre">ラブラブ/あまあま</a></div></td></tr>
<tr><th>ファイル容量</th><td>1.2GB</td></tr>
<tr><th>ページ数</th><td>120</td></tr>
</table>
<div class="product-slider-data">
  <div data-src="//img.dlsite.jp/modpub/images2/work/doujin/RJ01452000/RJ01452526_img_main.jpg"></div>
  <div data-src="//img.dlsite.jp/modpub/images2/work/doujin/RJ01452000/RJ01452526_img_smp1.jpg"></div>
</div>
</body></html>`;

describe('parseWorkHtml', () => {
  it('extrait les champs des tables, la galerie et la description', () => {
    const details = parseWorkHtml(WORK_HTML);
    expect(details).toMatchObject({
      circle: '猫3',
      // Identifiant du cercle, indépendant de la langue.
      maker_id: 'RG01001209',
      modified_date: '2024-06-02T00:00:00',
      title_name_masked: '理想の生活',
      author: ['猫3'],
      // NFKC : les caractères pleine chasse sont normalisés.
      voice_actor: ['声優A', '声優B'],
      genre: ['3D作品', 'ラブラブ/あまあま'],
      genre_ids: ['509', '004'],
      file_size: '1.2GB',
      page_count: 120,
      sample_images: ['//img.dlsite.jp/modpub/images2/work/doujin/RJ01452000/RJ01452526_img_smp1.jpg']
    });
    // Le texte publicitaire DLsite est retiré de la description.
    expect(details.description).toBe("Un RPG d'aventure.");
  });

  it('apparie les genres JP et EN par identifiant, pas par position', () => {
    const ja = { genre: ['3D作品', 'ラブラブ/あまあま', '断面図'], genre_ids: ['509', '004', '071'] };
    // Page anglaise dans un autre ordre, et sans l'un des genres.
    const en = { genre: ['Lovey Dovey / Sweet Love', '3D Works'], genre_ids: ['004', '509'] };
    expect(pairGenreTranslations(ja, en)).toEqual({ '3D作品': '3D Works', 'ラブラブ/あまあま': 'Lovey Dovey / Sweet Love' });
    expect(pairGenreTranslations(ja, null)).toEqual({});
  });

  it('renvoie un objet vide pour une page sans données', () => {
    expect(parseWorkHtml('<html><body></body></html>')).toEqual({});
  });
});
