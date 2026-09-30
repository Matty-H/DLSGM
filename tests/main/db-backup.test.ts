import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir, removeTempDir } from '../helpers';
import { snapshotDatabase } from '../../src/main/db-backup';

let dir: string;

beforeEach(() => {
  dir = makeTempDir();
  fs.writeFileSync(path.join(dir, 'cache.db'), '{"_id":"RJ1","value":{}}\n');
});

afterEach(() => removeTempDir(dir));

describe('snapshotDatabase', () => {
  it('copie la base et ne garde que les plus récentes', async () => {
    const first = await snapshotDatabase(dir, 'cache.db', 2);
    expect(fs.readFileSync(first, 'utf8')).toBe('{"_id":"RJ1","value":{}}\n');
    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, 5)); // horodatages distincts
      await snapshotDatabase(dir, 'cache.db', 2);
    }
    const kept = fs.readdirSync(path.join(dir, 'db_backups'));
    expect(kept).toHaveLength(2);
    expect(kept).not.toContain(path.basename(first));
  });
});
