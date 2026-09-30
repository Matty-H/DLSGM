import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { makeTempDir, removeTempDir } from '../helpers';

const electron = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({ app: { getPath: () => electron.userData } }));

import Store from '../../src/main/store';
import { parseGameIds, Wishlist } from '../../src/main/wishlist';
import type { GameMetadata } from '../../src/shared/ipc-types';

let root: string;
let library: string;
let covers: string;
let wishlist: Wishlist;
let fetchMetadata: Mock<(gameId: string) => Promise<GameMetadata>>;

const metadata = (gameId: string) =>
  ({ work_name: `Jeu ${gameId}`, circle: 'Cercle', age_category: 'R18', category: 'RPG', release_date: '2026-12-01T00:00:00', work_image: '//img.dlsite.jp/c.jpg' }) as GameMetadata;

beforeEach(async () => {
  root = makeTempDir();
  electron.userData = root;
  library = path.join(root, 'library');
  covers = path.join(root, 'img_cache', '_wishlist');
  fs.mkdirSync(library);
  fetchMetadata = vi.fn(async (gameId: string) => {
    if (gameId === 'RJ09999999') throw new Error('Aucune donnée product-info pour RJ09999999');
    return metadata(gameId);
  });
  const store = new Store('wishlist.db', {});
  // Chargement terminé avant le test : sinon il continuerait après la
  // suppression du dossier temporaire.
  await store.getAll();
  wishlist = new Wishlist({
    store,
    getDestinationFolder: async () => library,
    fetchMetadata,
    downloadImage: async (_url, output) => fs.writeFileSync(output, 'jpg'),
    coverDir: () => covers
  });
});

afterEach(() => removeTempDir(root));

describe('parseGameIds', () => {
  it('trouve les IDs dans des liens, des listes collées, en minuscules, sans doublon', () => {
    const text = 'https://www.dlsite.com/maniax/work/=/product_id/RJ01234567.html, rj01234567\nRJ123456 et VJ01000001 ; pas RJ12';
    expect(parseGameIds(text)).toEqual(['RJ01234567', 'RJ123456', 'VJ01000001']);
  });
});

describe('Wishlist', () => {
  it('ajoute, récupère la fiche et la couverture', async () => {
    expect(await wishlist.add('RJ01000001 RJ01000002')).toEqual({ added: ['RJ01000001', 'RJ01000002'], alreadyListed: [], inLibrary: [] });
    const items = await wishlist.list();
    expect(items.map(i => i.id)).toEqual(['RJ01000002', 'RJ01000001']); // plus récent en premier
    expect(items[0]).toMatchObject({ work_name: 'Jeu RJ01000002', circle: 'Cercle', age_category: 'R18', hasCover: true });
  });

  it("n'ajoute pas un jeu déjà présent dans la liste ou la bibliothèque", async () => {
    fs.mkdirSync(path.join(library, 'RJ01000003'));
    await wishlist.add('RJ01000001');
    expect(await wishlist.add('RJ01000001 RJ01000003')).toEqual({ added: [], alreadyListed: ['RJ01000001'], inLibrary: ['RJ01000003'] });
    expect(fetchMetadata).toHaveBeenCalledTimes(1);
  });

  it('signale une saisie sans ID', async () => {
    expect(await wishlist.add('rien ici')).toMatchObject({ noIdFound: true, added: [] });
  });

  it("garde un ID dont la fiche est introuvable, avec l'erreur, et permet de réessayer", async () => {
    await wishlist.add('RJ09999999');
    const [item] = await wishlist.list();
    expect(item).toMatchObject({ id: 'RJ09999999', work_name: null, hasCover: false });
    expect(item.error).toMatch(/product-info/);

    fetchMetadata.mockImplementation(async (gameId: string) => metadata(gameId));
    await wishlist.refresh('RJ09999999');
    const [fixed] = await wishlist.list();
    expect(fixed.work_name).toBe('Jeu RJ09999999');
    expect(fixed.error).toBeUndefined();
  });

  it('retire tout seul un jeu arrivé dans la bibliothèque, avec sa couverture', async () => {
    await wishlist.add('RJ01000001 RJ01000002');
    fs.mkdirSync(path.join(library, 'RJ01000001'));
    expect((await wishlist.list()).map(i => i.id)).toEqual(['RJ01000002']);
    expect(fs.existsSync(path.join(covers, 'RJ01000001.jpg'))).toBe(false);
  });

  it('retire à la main', async () => {
    await wishlist.add('RJ01000001');
    expect(await wishlist.remove('RJ01000001')).toBe(true);
    expect(await wishlist.list()).toEqual([]);
  });
});
