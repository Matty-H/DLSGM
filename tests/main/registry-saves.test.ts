import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTempDir, removeTempDir } from '../helpers';

const electron = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({ app: { getPath: () => electron.userData } }));

import { importRegistryKey, isAllowedKey, readRegFile, regFileOnlyTouches, registryKeyExists, unityRegistryKey } from '../../src/main/registry-saves';
import { createSaveBackup, listSaveBackups, restoreSaveBackup } from '../../src/main/save-backups';
import type { SaveSource } from '../../src/main/game-tools';

const reg = (content: string) => `Windows Registry Editor Version 5.00\r\n\r\n${content}\r\n`;

describe('registry saves (validation)', () => {
  it('builds the Unity PlayerPrefs key, refusing unusable names', () => {
    expect(unityRegistryKey('猫3', '理想のおとうさん')).toBe('HKCU\\Software\\猫3\\理想のおとうさん');
    expect(unityRegistryKey('A\\B', 'Game')).toBeNull();
    expect(unityRegistryKey('..', 'Game')).toBeNull();
    expect(unityRegistryKey('', 'Game')).toBeNull();
    expect(unityRegistryKey('Co', 'Ga]me')).toBeNull();
  });

  it('only allows keys at least two levels under HKCU\\Software', () => {
    expect(isAllowedKey('HKCU\\Software\\Co\\Game')).toBe(true);
    expect(isAllowedKey('HKCU\\Software\\Co')).toBe(false);
    expect(isAllowedKey('HKLM\\Software\\Co\\Game')).toBe(false);
    expect(isAllowedKey('HKCU\\Software\\Co\\\\Game')).toBe(false);
  });

  it('accepts a .reg touching only the key and its subkeys', () => {
    const key = 'HKCU\\Software\\Co\\Game';
    expect(regFileOnlyTouches(reg('[HKEY_CURRENT_USER\\Software\\Co\\Game]\r\n"a_h1"=dword:00000001\r\n\r\n[HKEY_CURRENT_USER\\Software\\Co\\Game\\Sub]'), key)).toBe(true);
    // Une autre clé, une clé voisine au nom proche, une suppression, rien du tout, un en-tête absent : refusés.
    expect(regFileOnlyTouches(reg('[HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run]\r\n"x"="evil.exe"'), key)).toBe(false);
    expect(regFileOnlyTouches(reg('[HKEY_CURRENT_USER\\Software\\Co\\GameEvil]'), key)).toBe(false);
    expect(regFileOnlyTouches(reg('[-HKEY_CURRENT_USER\\Software\\Co\\Game]'), key)).toBe(false);
    expect(regFileOnlyTouches(reg(''), key)).toBe(false);
    expect(regFileOnlyTouches('[HKEY_CURRENT_USER\\Software\\Co\\Game]', key)).toBe(false);
  });

  it('reads UTF-16 exports', () => {
    const text = reg('[HKEY_CURRENT_USER\\Software\\Co\\Game]');
    expect(readRegFile(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]))).toBe(text);
  });

  it('refuses to import a file touching another key, without deleting anything', async () => {
    const root = makeTempDir();
    try {
      const file = path.join(root, 'evil.reg');
      fs.writeFileSync(file, reg('[HKEY_CURRENT_USER\\Software\\Other\\Key]'));
      const run = vi.fn(async () => undefined);
      await expect(importRegistryKey('HKCU\\Software\\Co\\Game', file, run)).rejects.toThrow();
      expect(run).not.toHaveBeenCalled();
    } finally {
      removeTempDir(root);
    }
  });
});

// Vraie clé jetable sous HKCU\Software (Windows seulement), supprimée après le test.
describe.skipIf(process.platform !== 'win32')('registry saves (real registry)', () => {
  const company = `DLSGM-test-${process.pid}-${Date.now()}`;
  const key = `HKCU\\Software\\${company}\\ゲーム`;
  let root: string;

  const setValue = (name: string, data: string) => execFileSync('reg.exe', ['add', key, '/v', name, '/t', 'REG_DWORD', '/d', data, '/f'], { stdio: 'ignore' });
  const getValue = (name: string): string | null => {
    try {
      return /0x([0-9a-f]+)/i.exec(execFileSync('reg.exe', ['query', key, '/v', name], { encoding: 'utf8' }))?.[1] ?? null;
    } catch {
      return null;
    }
  };

  beforeEach(() => {
    root = makeTempDir();
    electron.userData = root;
  });

  afterEach(() => {
    try {
      execFileSync('reg.exe', ['delete', `HKCU\\Software\\${company}`, '/f'], { stdio: 'ignore' });
    } catch {
      // déjà absente
    }
    removeTempDir(root);
  });

  it('backs up the key, skips an unchanged copy, and restores it exactly (added values removed)', async () => {
    const sources: SaveSource[] = [{ label: 'Unity (registry)', path: key, exists: true, registry: true }];
    expect(registryKeyExists(key)).toBe(false);
    expect(await createSaveBackup('RJ01000001', sources, 'auto')).toBeNull();

    setValue('progress_h1', '5');
    expect(registryKeyExists(key)).toBe(true);
    const backup = await createSaveBackup('RJ01000001', sources, 'auto');
    expect(backup?.locations).toEqual(['Unity (registry)']);
    // Rien n'a changé : pas de seconde copie automatique.
    expect(await createSaveBackup('RJ01000001', sources, 'auto')).toBeNull();

    setValue('progress_h1', '9');
    setValue('added_h2', '1');
    await restoreSaveBackup('RJ01000001', backup!.id, sources);
    expect(getValue('progress_h1')).toBe('5');
    expect(getValue('added_h2')).toBeNull();
    // L'état écrasé a été copié avant (restauration réversible).
    expect((await listSaveBackups('RJ01000001')).map(b => b.reason)).toContain('pre-restore');
  });
});
