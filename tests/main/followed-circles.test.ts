import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTempDir, removeTempDir } from '../helpers';

const electron = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({ app: { getPath: () => electron.userData } }));

import Store from '../../src/main/store';
import { FollowedCircles, parseCircleProfile, profileUrl } from '../../src/main/followed-circles';

/** Page profil telle que DLsite la sert (structure relevée sur une vraie page, contenu réduit). */
const profileHtml = ({ announce = [] as [string, string][], sale = [] as [string, string][] } = {}) => `
<html><head><title>Big S Studio サークルプロフィール | 作品一覧「DLsite 同人 - R18」</title></head><body>
<h3 class="work_subheading">発売予告作品</h3>
<table class="work_1col_table prof_ana_work n_worklist">
${announce.map(([id, title]) => `
  <tr><td class="work_1col_thumb"><div class="work_category type_RPG"><a href="#">ロールプレイング</a></div></td>
  <td><dl class="work_1col"><dt class="work_name">
    <p class="expected_date">
      2027年06月下旬 発売予定
    </p>
    <a href="https://www.dlsite.com/maniax/announce/=/product_id/${id}.html">${title}</a></dt></dl></td></tr>`).join('')}
</table>
<h3 class="work_subheading">販売作品</h3>
<ul id="search_result_img_box" class="n_worklist">
${sale.map(([id, title]) => `
  <li data-list_item_product_id="${id}" class="search_result_img_box_inner">
    <dl class="work_img_main"><dd><div class="work_category type_SOU "><a href="#">ボイス・ASMR</a></div></dd>
    <dd class="work_name"><div class="multiline_truncate"><a href="https://www.dlsite.com/maniax/work/=/product_id/${id}.html" title="${title}">${title}</a></div></dd></dl>
  </li>`).join('')}
</ul></body></html>`;

let root: string;
let pages: Record<string, string>;
let circles: FollowedCircles;
let clock: Date;

beforeEach(async () => {
  root = makeTempDir();
  electron.userData = root;
  pages = {};
  clock = new Date('2026-10-01T10:00:00Z');
  const store = new Store('followed-circles.db', {});
  await store.getAll();
  circles = new FollowedCircles({
    store,
    fetchHtml: async url => {
      if (!(url in pages)) throw new Error('HTTP 404');
      return pages[url];
    },
    now: () => clock,
    wait: async () => undefined
  });
});

afterEach(() => removeTempDir(root));

describe('parseCircleProfile', () => {
  it('reads the circle name, announces (with expected date) and works on sale', () => {
    const parsed = parseCircleProfile(profileHtml({ announce: [['RJ01733017', 'バーサーカーホリック']], sale: [['RJ01386956', 'Lifeguard Holic']] }));
    expect(parsed.name).toBe('Big S Studio');
    expect(parsed.works).toEqual([
      { id: 'RJ01733017', title: 'バーサーカーホリック', kind: 'announce', category: 'RPG', expected: '2027年06月下旬 発売予定' },
      { id: 'RJ01386956', title: 'Lifeguard Holic', kind: 'sale', category: 'SOU', expected: null }
    ]);
  });
});

describe('FollowedCircles', () => {
  const url = profileUrl('maniax', 'RG58616');

  it('records the catalogue as a baseline, then reports only what appears later', async () => {
    pages[url] = profileHtml({ announce: [['RJ01733017', 'Annonce']], sale: [['RJ01386956', 'Ancien']] });
    await circles.follow('RG58616', 'maniax', 'Big S Studio');
    await circles.check();
    // Le catalogue existant n'est pas une nouveauté ; une annonce est toujours montrée.
    expect((await circles.feed()).map(w => [w.id, w.isNew])).toEqual([['RJ01733017', false]]);

    clock = new Date('2026-10-03T10:00:00Z');
    pages[url] = profileHtml({ sale: [['RJ01733017', 'Annonce sortie'], ['RJ01800000', 'Nouveau'], ['RJ01386956', 'Ancien']] });
    await circles.check();
    const feed = await circles.feed();
    expect(feed.map(w => [w.id, w.kind, w.isNew])).toEqual([['RJ01800000', 'sale', true]]);
    expect(feed[0].firstSeen).toBe('2026-10-03T10:00:00.000Z');
  });

  it('keeps known works when a check fails and notes the error', async () => {
    pages[url] = profileHtml({ announce: [['RJ01733017', 'Annonce']] });
    await circles.follow('RG58616', 'maniax', 'Big S Studio');
    await circles.check();
    delete pages[url];
    await circles.check();
    expect((await circles.list())[0]).toMatchObject({ error: 'HTTP 404', workCount: 1 });
    expect((await circles.feed()).map(w => w.id)).toEqual(['RJ01733017']);
  });

  it('only checks circles not checked for a while', async () => {
    pages[url] = profileHtml();
    await circles.follow('RG58616', 'maniax', 'Big S Studio');
    await circles.check({ olderThanMs: 24 * 3600_000 });
    const first = (await circles.list())[0].lastCheck;
    clock = new Date('2026-10-01T20:00:00Z');
    await circles.check({ olderThanMs: 24 * 3600_000 });
    expect((await circles.list())[0].lastCheck).toBe(first);
  });

  it('auto-follows library circles but never one the user removed', async () => {
    expect(await circles.syncLibraryCircles([{ makerId: 'RG58616', site: 'maniax', name: 'Big S Studio' }, { makerId: '../x', site: 'maniax', name: 'x' }])).toBe(1);
    await circles.unfollow('RG58616');
    expect(await circles.list()).toEqual([]);
    expect(await circles.syncLibraryCircles([{ makerId: 'RG58616', site: 'maniax', name: 'Big S Studio' }])).toBe(0);
    await circles.follow('RG58616', 'maniax', 'Big S Studio');
    expect((await circles.list()).map(c => [c.makerId, c.auto])).toEqual([['RG58616', false]]);
  });

  it('rejects invalid ids', async () => {
    await expect(circles.follow('RG1/../x', 'maniax', 'x')).rejects.toThrow();
    await expect(circles.follow('RG58616', 'man/iax', 'x')).rejects.toThrow();
  });
});
