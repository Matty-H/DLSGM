import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_CHEAT_TABLE,
  SESSION_BEGIN,
  SESSION_END,
  TABLE_BACKUPS_DIR,
  backupCheatTable,
  buildSessionTable,
  cheatTablePath,
  defaultCheatTable,
  findCheatEngine,
  freeTableName,
  importCheatTables,
  isCheatTableName,
  isCompleteTable,
  listCheatTables,
  parseGameProcesses,
  pickGameProcess,
  prepareCheatSession,
  resolveCheatEngine,
  sessionScript,
  stripSessionScript
} from '../../src/main/cheat-engine';
import { makeTempDir, removeTempDir, writeTree } from '../helpers';

let root: string;
beforeEach(() => {
  root = makeTempDir();
});
afterEach(() => removeTempDir(root));

describe('isCheatTableName', () => {
  it('accepte un simple nom en .CT, japonais compris', () => {
    expect(isCheatTableName('Game.CT')).toBe(true);
    expect(isCheatTableName('ゲーム v1.2.ct')).toBe(true);
  });

  it('refuse chemins, autres extensions et noms réservés', () => {
    for (const name of ['../evil.CT', '..\\evil.CT', 'C:\\x.CT', 'sub/x.CT', 'x.exe', 'x.CT.exe', 'CON.CT', '.CT', 'x.CT ', '', 42, null]) {
      expect(isCheatTableName(name)).toBe(false);
    }
  });
});

describe('findCheatEngine', () => {
  it('préfère le lanceur, sinon un binaire de Cheat Engine', () => {
    writeTree(root, { 'cheatengine-x86_64.exe': '' });
    expect(findCheatEngine(root)).toBe(path.join(root, 'cheatengine-x86_64.exe'));
    writeTree(root, { 'Cheat Engine.exe': '' });
    expect(findCheatEngine(root)).toBe(path.join(root, 'Cheat Engine.exe'));
  });

  it('rien pour un dossier vide, relatif ou non configuré', () => {
    expect(findCheatEngine(root)).toBeNull();
    expect(findCheatEngine('')).toBeNull();
    expect(findCheatEngine('Cheat Engine')).toBeNull();
  });
});

describe('resolveCheatEngine', () => {
  it('sans dossier choisi, trouve l’installation habituelle, la version la plus récente d’abord', () => {
    const pf = path.join(root, 'Program Files');
    const pf86 = path.join(root, 'Program Files (x86)');
    writeTree(pf, { 'Cheat Engine 7.4/Cheat Engine.exe': '', 'Cheat Engine 7.10/Cheat Engine.exe': '', 'Other/Cheat Engine.exe': '' });
    writeTree(pf86, { 'Cheat Engine/cheatengine-i386.exe': '' });
    const env = { ProgramW6432: pf, ProgramFiles: pf, 'ProgramFiles(x86)': pf86 };
    expect(resolveCheatEngine('', env)).toBe(path.join(pf, 'Cheat Engine 7.10', 'Cheat Engine.exe'));
    expect(resolveCheatEngine('', { 'ProgramFiles(x86)': pf86 })).toBe(path.join(pf86, 'Cheat Engine', 'cheatengine-i386.exe'));
    expect(resolveCheatEngine('', {})).toBeNull();
  });

  it('un dossier choisi prime, sans repli s’il est vide', () => {
    const pf = path.join(root, 'pf');
    writeTree(pf, { 'Cheat Engine/Cheat Engine.exe': '' });
    expect(resolveCheatEngine(path.join(root, 'empty'), { ProgramFiles: pf })).toBeNull();
  });
});

describe('freeTableName', () => {
  it('ne réutilise jamais un nom pris, sans tenir compte de la casse', () => {
    expect(freeTableName(new Set(), 'a.CT')).toBe('a.CT');
    expect(freeTableName(new Set(['a.ct']), 'a.CT')).toBe('a (2).CT');
    expect(freeTableName(new Set(['a.ct', 'a (2).ct']), 'a.CT')).toBe('a (3).CT');
  });
});

describe('importCheatTables', () => {
  it('copie les tables sans écraser, ignore le reste', async () => {
    const src = path.join(root, 'src');
    const dir = path.join(root, 'work', 'RJ01234567', 'cheat-tables');
    writeTree(src, { 'Game.CT': '<CheatTable/>', 'other/Game.CT': '<CheatTable v2/>', 'trainer.exe': 'MZ' });
    writeTree(dir, { 'Game.CT': 'existing' });

    const result = await importCheatTables(dir, [path.join(src, 'Game.CT'), path.join(src, 'other', 'Game.CT'), path.join(src, 'trainer.exe'), path.join(src, 'missing.CT')]);

    expect(result.imported).toEqual(['Game (2).CT', 'Game (3).CT']);
    expect(result.skipped).toEqual(['trainer.exe', 'missing.CT']);
    expect(fs.readFileSync(path.join(dir, 'Game.CT'), 'utf8')).toBe('existing');
    expect(fs.readFileSync(path.join(dir, 'Game (3).CT'), 'utf8')).toBe('<CheatTable v2/>');
    expect(fs.readdirSync(dir).some(name => name.endsWith('.tmp'))).toBe(false);
  });
});

describe('listCheatTables / cheatTablePath', () => {
  it('liste seulement les tables, et ne résout jamais hors du dossier', async () => {
    const dir = path.join(root, 'cheat-tables');
    writeTree(root, { 'outside.CT': 'x' });
    writeTree(dir, { 'a.CT': 'a', 'notes.txt': 'n', 'sub/b.CT': 'b' });

    expect((await listCheatTables(dir)).map(table => table.name)).toEqual(['a.CT']);
    expect(await listCheatTables(path.join(root, 'absent'))).toEqual([]);
    expect(cheatTablePath(dir, 'a.CT')).toBe(path.join(dir, 'a.CT'));
    expect(cheatTablePath(dir, '../outside.CT')).toBeNull();
    expect(cheatTablePath(dir, 'missing.CT')).toBeNull();
    expect(cheatTablePath(dir, 'notes.txt')).toBeNull();
  });
});

describe('session Cheat Engine', () => {
  const TABLE = '<?xml version="1.0" encoding="utf-8"?>\n<CheatTable>\n  <CheatEntries/>\n</CheatTable>\n';
  const WITH_LUA = '<?xml version="1.0" encoding="utf-8"?>\n<CheatTable>\n  <CheatEntries/>\n  <LuaScript>print("auteur &lt; 2")\n</LuaScript>\n</CheatTable>\n';
  const options = { pid: 4242, processNames: ['Game.exe'], tablePath: 'D:\\Work\\RJ01234567\\cheat-tables\\ゲーム.CT' };

  it('le script porte le PID, les noms et le chemin, entre les marqueurs', () => {
    const lua = sessionScript(options);
    expect(lua.startsWith(SESSION_BEGIN)).toBe(true);
    expect(lua.trimEnd().endsWith(SESSION_END)).toBe(true);
    expect(lua).toContain('local pid = 4242');
    expect(lua).toContain('[==[Game.exe]==]');
    expect(lua).toContain('[==[D:\\Work\\RJ01234567\\cheat-tables\\ゲーム.CT]==]');
    // Les marqueurs n'apparaissent qu'aux deux bouts : le nettoyage coupe sur eux.
    expect(lua.split(SESSION_BEGIN).length).toBe(2);
    expect(lua.split(SESSION_END).length).toBe(2);
  });

  it('refuse une valeur qui fermerait la chaîne Lua', () => {
    expect(() => sessionScript({ ...options, tablePath: 'x]==] os.execute("calc") --[==[' })).toThrow();
    expect(() => sessionScript({ ...options, processNames: ['a\nb'] })).toThrow();
  });

  it('un PID invalide vaut 0 (attente du processus par son nom)', () => {
    expect(sessionScript({ ...options, pid: NaN })).toContain('local pid = 0');
    expect(sessionScript({ ...options, pid: -3 })).toContain('local pid = 0');
  });

  it('la table de session se nettoie en la table d’origine', () => {
    const lua = sessionScript(options);
    for (const table of [TABLE, WITH_LUA]) {
      const session = buildSessionTable(table, lua);
      expect(session).toContain(SESSION_BEGIN);
      expect(isCompleteTable(session)).toBe(true);
      expect(stripSessionScript(session)).toBe(table);
      // Reconstruire depuis une table déjà de session n'empile pas deux blocs.
      expect(buildSessionTable(session, lua)).toBe(session);
    }
  });

  it('le bloc passe avant le script de l’auteur, échappé pour XML', () => {
    const session = buildSessionTable(WITH_LUA, sessionScript(options));
    expect(session.indexOf(SESSION_BEGIN)).toBeLessThan(session.indexOf('print("auteur'));
    expect(session).toContain('last &gt; from');
    expect(session.match(/<LuaScript>/g)?.length).toBe(1);
  });

  it('isCompleteTable repère une table coupée', () => {
    expect(isCompleteTable(TABLE)).toBe(true);
    expect(isCompleteTable(TABLE.slice(0, -20))).toBe(false);
    expect(isCompleteTable('')).toBe(false);
  });

  it('prepareCheatSession : copie de secours, copie de session, table intacte', () => {
    const dir = path.join(root, 'cheat-tables');
    const sessions = path.join(root, 'sessions');
    writeTree(dir, { 'ゲーム.CT': '\uFEFF' + TABLE });

    const session = prepareCheatSession(dir, 'ゲーム.CT', sessions, { pid: 7, processNames: ['Game.exe'] });

    expect(session).toBe(path.join(sessions, 'ゲーム.CT'));
    const written = fs.readFileSync(session, 'utf8');
    expect(written).toContain(`[==[${path.join(dir, 'ゲーム.CT')}]==]`);
    expect(stripSessionScript(written)).toBe(TABLE);
    expect(fs.readFileSync(path.join(dir, 'ゲーム.CT'), 'utf8')).toBe('\uFEFF' + TABLE);
    expect(fs.readdirSync(path.join(dir, TABLE_BACKUPS_DIR)).length).toBe(1);
    // Les copies de secours ne sont pas des tables de la liste.
    expect(fs.readdirSync(dir).filter(name => isCheatTableName(name))).toEqual(['ゲーム.CT']);
  });

  it('une table coupée est remplacée par sa dernière copie de secours, l’abîmée gardée', () => {
    const dir = path.join(root, 'cheat-tables');
    writeTree(dir, { 'a.CT': TABLE });
    prepareCheatSession(dir, 'a.CT', path.join(root, 's'), { pid: 0, processNames: [] });
    fs.writeFileSync(path.join(dir, 'a.CT'), TABLE.slice(0, 30));

    prepareCheatSession(dir, 'a.CT', path.join(root, 's'), { pid: 0, processNames: [] });

    expect(fs.readFileSync(path.join(dir, 'a.CT'), 'utf8')).toBe(TABLE);
    expect(fs.readFileSync(path.join(dir, 'a.CT.broken'), 'utf8')).toBe(TABLE.slice(0, 30));
  });

  it('une table coupée sans copie de secours est refusée, sans y toucher', () => {
    const dir = path.join(root, 'cheat-tables');
    writeTree(dir, { 'a.CT': '<CheatTable><CheatEntr' });
    expect(() => prepareCheatSession(dir, 'a.CT', path.join(root, 's'), { pid: 0, processNames: [] })).toThrow();
    expect(fs.readFileSync(path.join(dir, 'a.CT'), 'utf8')).toBe('<CheatTable><CheatEntr');
  });

  it('backupCheatTable : rien si identique à la dernière, 5 copies au plus', () => {
    const dir = path.join(root, 'cheat-tables');
    fs.mkdirSync(dir, { recursive: true });
    const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n));
    backupCheatTable(dir, 'a.CT', 'v0', at(0));
    backupCheatTable(dir, 'a.CT', 'v0', at(1));
    expect(fs.readdirSync(path.join(dir, TABLE_BACKUPS_DIR)).length).toBe(1);
    for (let n = 1; n <= 7; n++) backupCheatTable(dir, 'a.CT', `v${n}`, at(n + 1));
    backupCheatTable(dir, 'b.CT', 'autre', at(20));
    const kept = fs.readdirSync(path.join(dir, TABLE_BACKUPS_DIR)).filter(name => name.startsWith('a.CT.')).sort();
    expect(kept.length).toBe(5);
    expect(kept.map(name => fs.readFileSync(path.join(dir, TABLE_BACKUPS_DIR, name), 'utf8'))).toEqual(['v3', 'v4', 'v5', 'v6', 'v7']);
    expect(fs.readdirSync(path.join(dir, TABLE_BACKUPS_DIR)).filter(name => name.startsWith('b.CT.')).length).toBe(1);
  });

  it('defaultCheatTable : la table « au lancement », sinon la plus récente, sinon une table vide créée', async () => {
    const dir = path.join(root, 'cheat-tables');
    expect(await defaultCheatTable(dir, 'RJ01234567', undefined)).toBe('RJ01234567.CT');
    expect(fs.readFileSync(path.join(dir, 'RJ01234567.CT'), 'utf8')).toBe(EMPTY_CHEAT_TABLE);
    expect(isCompleteTable(EMPTY_CHEAT_TABLE)).toBe(true);
    writeTree(dir, { 'pref.CT': TABLE });
    fs.utimesSync(path.join(dir, 'pref.CT'), new Date(2020, 0, 1), new Date(2020, 0, 1));
    expect(await defaultCheatTable(dir, 'RJ01234567', 'pref.CT')).toBe('pref.CT');
    expect(await defaultCheatTable(dir, 'RJ01234567', 'disparue.CT')).toBe('RJ01234567.CT');
  });

  it('pickGameProcess : la fenêtre d’abord, puis la mémoire', () => {
    const list = parseGameProcesses('10|0|900\r\n11|65942|300\r\n12|0|500\r\nbruit\r\n');
    expect(list).toEqual([
      { pid: 10, hasWindow: false, memory: 900 },
      { pid: 11, hasWindow: true, memory: 300 },
      { pid: 12, hasWindow: false, memory: 500 }
    ]);
    expect(pickGameProcess(list)).toBe(11);
    expect(pickGameProcess(list.filter(p => !p.hasWindow))).toBe(10);
    expect(pickGameProcess([])).toBe(0);
  });
});
