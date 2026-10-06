import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTempDir, removeTempDir } from '../helpers';

const electron = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({ app: { getPath: () => electron.userData } }));

import Store from '../../src/main/store';

beforeEach(() => {
  electron.userData = makeTempDir();
});

afterEach(() => removeTempDir(electron.userData));

describe('Store', () => {
  it("update fusionne, mais ne crée jamais d'entrée", async () => {
    const store = new Store('cache.db', {});
    await store.set('RJ1', { work_name: 'A', rating: 1 });
    expect(await store.update('RJ1', { rating: 5 })).toBe(true);
    expect(await store.get('RJ1')).toEqual({ work_name: 'A', rating: 5 });
    expect(await store.update('RJ2', { imagesComplete: true })).toBe(false);
    expect(await store.get('RJ2')).toBeUndefined();
  });

  it("insert n'écrase jamais une entrée existante", async () => {
    const store = new Store('cache.db', {});
    expect(await store.insert('RJ1', { work_name: 'A' })).toBe(true);
    expect(await store.insert('RJ1', { work_name: 'B' })).toBe(false);
    expect(await store.get('RJ1')).toEqual({ work_name: 'A' });
  });

  it('applique toutes les mises à jour concurrentes (file sérialisée)', async () => {
    const store = new Store('cache.db', {});
    await store.set('RJ1', { totalPlayTime: 0 });
    await Promise.all(
      Array.from({ length: 20 }, () => store.update('RJ1', current => ({ totalPlayTime: (current.totalPlayTime as number) + 10 })))
    );
    expect(await store.get('RJ1')).toEqual({ totalPlayTime: 200 });
  });

  it('persiste sur disque et relit au redémarrage', async () => {
    const store = new Store('cache.db', {});
    await store.setAll({ RJ1: { a: 1 }, RJ2: { b: 2 } });
    await store.setAll({ RJ1: { a: 1 } });
    const reopened = new Store('cache.db', {});
    expect(await reopened.getAll()).toEqual({ RJ1: { a: 1 } });
  });

  // L'assistant du premier lancement (`onboardingPending`) repose là-dessus :
  // une installation existante ne doit jamais recevoir la valeur par défaut.
  it("n'écrit les valeurs par défaut que dans un store vide", async () => {
    const fresh = new Store('settings.db', { onboardingPending: true, refreshRate: 5 });
    expect(await fresh.getAll()).toEqual({ onboardingPending: true, refreshRate: 5 });

    removeTempDir(electron.userData);
    electron.userData = makeTempDir();
    const old = new Store('settings.db', {});
    await old.set('refreshRate', 10);
    const upgraded = new Store('settings.db', { onboardingPending: true, refreshRate: 5 });
    expect(await upgraded.getAll()).toEqual({ refreshRate: 10 });
  });

  // Profil leurre (app-lock.ts) : les stores sont construits à l'import, main
  // choisit le dossier de données ensuite ; le fichier doit suivre ce choix.
  it("ouvre son fichier dans le dossier de données du moment de l'ouverture, pas de la construction", async () => {
    const first = electron.userData;
    const store = new Store('cache.db', {});
    const decoy = makeTempDir();
    electron.userData = decoy;
    try {
      await store.set('RJ1', { work_name: 'A' });
      expect(fs.existsSync(path.join(decoy, 'cache.db'))).toBe(true);
      expect(fs.existsSync(path.join(first, 'cache.db'))).toBe(false);
    } finally {
      removeTempDir(first);
    }
  });

});
