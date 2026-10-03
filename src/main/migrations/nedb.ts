import Datastore from '@seald-io/nedb';

/** Document d'un store (src/main/store.ts) : une clé, une valeur. */
export interface StoredDoc {
  _id: string;
  value: unknown;
}

/**
 * Ouvre un fichier de store NeDB pour une migration. Les migrations tournent
 * avant que les Store de l'app n'ouvrent leurs fichiers : jamais deux
 * Datastore sur le même fichier en même temps. Les écritures doivent être
 * suivies de `compactDatafileAsync()` pour être persistées proprement.
 */
export async function openDataFile(file: string): Promise<Datastore<StoredDoc>> {
  const db = new Datastore<StoredDoc>({ filename: file, autoload: false });
  await db.loadDatabaseAsync();
  return db;
}
