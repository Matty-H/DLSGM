import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir, removeTempDir } from '../helpers';
import {
  LOCK_FILE,
  UnlockThrottle,
  hashSecret,
  matchesSecret,
  parseLockConfig,
  readLockConfig,
  secretProblem,
  unlockTarget,
  writeLockConfig,
  type LockConfig
} from '../../src/main/app-lock';

let dir: string;
beforeEach(() => {
  dir = makeTempDir();
});
afterEach(() => removeTempDir(dir));

describe('secretProblem', () => {
  it('PIN : 4 à 12 chiffres seulement', () => {
    expect(secretProblem('pin', '1234')).toBeNull();
    expect(secretProblem('pin', '123456789012')).toBeNull();
    expect(secretProblem('pin', '123')).toBe('pin');
    expect(secretProblem('pin', '1234567890123')).toBe('pin');
    expect(secretProblem('pin', '12a4')).toBe('pin');
    expect(secretProblem('pin', 1234)).toBe('pin');
  });

  it('mot de passe : 4 à 128 caractères, une ligne', () => {
    expect(secretProblem('password', 'abc1')).toBeNull();
    expect(secretProblem('password', 'mot de passe é')).toBeNull();
    expect(secretProblem('password', 'abc')).toBe('password');
    expect(secretProblem('password', 'a'.repeat(129))).toBe('password');
    expect(secretProblem('password', 'abcd\nefgh')).toBe('password');
  });
});

describe('hachage', () => {
  it("ne stocke jamais le code et ne reconnaît que lui", async () => {
    const stored = await hashSecret('2468');
    expect(JSON.stringify(stored)).not.toContain('2468');
    expect(await matchesSecret('2468', stored)).toBe(true);
    expect(await matchesSecret('2469', stored)).toBe(false);
    // Sel aléatoire : deux hachages du même code diffèrent.
    expect((await hashSecret('2468')).hash).not.toBe(stored.hash);
  });

  it('compare en NFC (même mot de passe tapé sur Mac et sur Windows)', async () => {
    const stored = await hashSecret('café'.normalize('NFC'));
    expect(await matchesSecret('café'.normalize('NFD'), stored)).toBe(true);
  });
});

describe('unlockTarget', () => {
  it('vrai code → vrai profil, leurre → profil leurre, autre → rien', async () => {
    const config: LockConfig = { kind: 'pin', secret: await hashSecret('1111'), decoy: await hashSecret('2222') };
    expect(await unlockTarget(config, '1111')).toBe('real');
    expect(await unlockTarget(config, '2222')).toBe('decoy');
    expect(await unlockTarget(config, '3333')).toBeNull();
    expect(await unlockTarget(config, '')).toBeNull();
    expect(await unlockTarget(config, 1111)).toBeNull();
  });

  it('sans leurre, seul le vrai code ouvre', async () => {
    const config: LockConfig = { kind: 'password', secret: await hashSecret('secret') };
    expect(await unlockTarget(config, 'secret')).toBe('real');
    expect(await unlockTarget(config, 'Secret')).toBeNull();
  });
});

describe('app-lock.json', () => {
  it('absent : pas de verrouillage', () => {
    expect(readLockConfig(dir)).toBeNull();
  });

  it("s'écrit, se relit et se supprime", async () => {
    const config: LockConfig = { kind: 'pin', secret: await hashSecret('1234'), decoy: await hashSecret('5678'), uiLanguage: 'ja', theme: 'neon' };
    writeLockConfig(dir, config);
    expect(fs.existsSync(path.join(dir, `${LOCK_FILE}.tmp`))).toBe(false);
    expect(readLockConfig(dir)).toEqual(config);
    writeLockConfig(dir, null);
    expect(fs.existsSync(path.join(dir, LOCK_FILE))).toBe(false);
    expect(readLockConfig(dir)).toBeNull();
  });

  it("un fichier abîmé est ignoré (signalé) au lieu de bloquer l'accès", () => {
    const warnings: string[] = [];
    fs.writeFileSync(path.join(dir, LOCK_FILE), '{ pas du json');
    expect(readLockConfig(dir, message => warnings.push(message))).toBeNull();
    fs.writeFileSync(path.join(dir, LOCK_FILE), JSON.stringify({ kind: 'face', secret: { salt: 'a', hash: 'b' } }));
    expect(readLockConfig(dir, message => warnings.push(message))).toBeNull();
    expect(warnings).toHaveLength(2);
  });

  it('ne garde que les champs connus, et un leurre mal formé est ignoré', () => {
    expect(parseLockConfig({ kind: 'pin', secret: { salt: 's', hash: 'h', extra: 1 }, decoy: { salt: '' }, other: true })).toEqual({
      kind: 'pin',
      secret: { salt: 's', hash: 'h' }
    });
  });
});

describe('UnlockThrottle', () => {
  it('libre pendant 5 essais, puis attente doublée, plafonnée à une minute', () => {
    const throttle = new UnlockThrottle();
    for (let i = 0; i < 4; i++) throttle.fail(0);
    expect(throttle.remaining(0)).toBe(0);
    throttle.fail(0);
    expect(throttle.remaining(0)).toBe(1000);
    throttle.fail(0);
    expect(throttle.remaining(0)).toBe(2000);
    for (let i = 0; i < 10; i++) throttle.fail(0);
    expect(throttle.remaining(0)).toBe(60_000);
    expect(throttle.remaining(60_000)).toBe(0);
    throttle.succeed();
    throttle.fail(0);
    expect(throttle.remaining(0)).toBe(0);
  });
});
