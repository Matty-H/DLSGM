import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import Datastore from '@seald-io/nedb';

interface StoredDoc {
  _id: string;
  value: unknown;
}

/**
 * Gère le stockage des données de l'application dans le dossier userData de
 * l'utilisateur, via NeDB (pur JS, aucun module natif à recompiler par
 * plateforme). Chaque entrée logique (un jeu, un paramètre) est un document
 * NeDB indépendant : une écriture (`set`/`setAll`) ne touche que les
 * documents réellement modifiés, au lieu de réécrire tout le fichier comme
 * le faisait l'ancien store JSON monobloc. NeDB persiste en log
 * append-only : un crash en pleine écriture laisse au pire une dernière
 * ligne tronquée, détectée et ignorée au chargement, sans affecter le reste
 * des données.
 */
class Store {
  private dbPath: string;
  private legacyPath: string | null;
  private db: Datastore<StoredDoc>;
  private ready: Promise<void>;
  // File d'attente des écritures : chaque opération lecture-modification-
  // écriture s'exécute seule, sinon deux `update` concurrents sur la même clé
  // (ou un `setAll` en parallèle) pourraient écraser le travail de l'autre.
  private writeQueue: Promise<unknown> = Promise.resolve();

  /**
   * @param fileName Nom du fichier NeDB (ex: 'cache.db').
   * @param defaults Valeurs par défaut (clé -> valeur) si le store est vide.
   * @param legacyFileName Nom de l'ancien fichier JSON monobloc (ex: 'cache.json'),
   *   migré une seule fois si le nouveau store NeDB n'existe pas encore.
   */
  constructor(fileName: string, defaults: Record<string, unknown>, legacyFileName?: string) {
    const userDataPath = app.getPath('userData');
    this.dbPath = path.join(userDataPath, fileName);
    this.legacyPath = legacyFileName ? path.join(userDataPath, legacyFileName) : null;
    this.db = new Datastore<StoredDoc>({ filename: this.dbPath, autoload: false });
    // Toutes les méthodes publiques attendent cette promesse avant d'agir,
    // pour ne jamais lire/écrire avant la fin du chargement ou de la migration.
    this.ready = this._init(defaults);
  }

  private async _init(defaults: Record<string, unknown>): Promise<void> {
    await this.db.loadDatabaseAsync();

    const existingCount = await this.db.countAsync({});
    if (existingCount === 0) {
      const legacyData = this._readLegacyFile();
      const seedData = legacyData || defaults || {};
      if (Object.keys(seedData).length > 0) {
        await this._writeAll(seedData);
      }
      if (legacyData) {
        this._archiveLegacyFile();
      }
    }
  }

  /**
   * Lit l'ancien fichier JSON monobloc (v1) s'il existe encore, pour la
   * migration ponctuelle vers NeDB.
   */
  private _readLegacyFile(): Record<string, unknown> | null {
    if (!this.legacyPath || !fs.existsSync(this.legacyPath)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.legacyPath, 'utf8'));
      console.log(`Migration des données depuis l'ancien store: ${this.legacyPath}`);
      return parsed;
    } catch (error) {
      console.error(`Ancien store illisible (${this.legacyPath}), migration ignorée:`, error);
      return null;
    }
  }

  /**
   * Renomme (n'efface jamais) l'ancien fichier une fois migré, pour garder
   * une trace récupérable en cas de souci pendant la migration.
   */
  private _archiveLegacyFile(): void {
    if (!this.legacyPath) return;
    try {
      fs.renameSync(this.legacyPath, `${this.legacyPath}.migrated`);
      console.log(`Ancien store archivé: ${this.legacyPath}.migrated`);
    } catch (error) {
      console.error(`Impossible d'archiver l'ancien store (${this.legacyPath}):`, error);
    }
  }

  /**
   * Récupère une valeur à partir d'une clé.
   */
  async get(key: string): Promise<unknown> {
    await this.ready;
    await this.writeQueue; // lit après les écritures déjà demandées
    const doc = await this.db.findOneAsync({ _id: key });
    return doc ? doc.value : undefined;
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(async () => {
      await this.ready;
      return operation();
    });
    // La file continue même si une opération échoue ; l'erreur reste
    // propagée à l'appelant via `result`.
    this.writeQueue = result.catch(() => undefined);
    return result;
  }

  /**
   * Définit une valeur pour une clé et persiste uniquement ce document.
   */
  set(key: string, val: unknown): Promise<void> {
    return this.serialize(async () => {
      await this.db.updateAsync({ _id: key }, { _id: key, value: val }, { upsert: true });
      await this.db.compactDatafileAsync();
    });
  }

  /**
   * Fusionne atomiquement `patch` (ou le résultat de `patch(valeurActuelle)`)
   * dans la valeur objet d'une clé. Ne crée jamais d'entrée : renvoie false si
   * la clé n'existe pas, pour ne pas fabriquer une entrée partielle (ex: un
   * simple `{ imagesComplete }` sans métadonnées) à partir d'une clé supprimée
   * entre-temps.
   */
  update(
    key: string,
    patch: Record<string, unknown> | ((current: Record<string, unknown>) => Record<string, unknown>)
  ): Promise<boolean> {
    return this.serialize(async () => {
      const doc = await this.db.findOneAsync({ _id: key });
      if (!doc) return false;
      const current = (doc.value ?? {}) as Record<string, unknown>;
      const changes = typeof patch === 'function' ? patch(current) : patch;
      await this.db.updateAsync({ _id: key }, { _id: key, value: { ...current, ...changes } }, {});
      await this.db.compactDatafileAsync();
      return true;
    });
  }

  /**
   * Supprime une clé.
   */
  delete(key: string): Promise<boolean> {
    return this.serialize(async () => {
      const removed = await this.db.removeAsync({ _id: key }, {});
      if (removed > 0) await this.db.compactDatafileAsync();
      return removed > 0;
    });
  }

  /**
   * Récupère l'intégralité des données sous forme d'objet clé -> valeur,
   * pour rester compatible avec le format attendu par le reste de l'app.
   */
  async getAll(): Promise<Record<string, unknown>> {
    await this.ready;
    await this.writeQueue; // lit après les écritures déjà demandées
    const docs = await this.db.findAsync({});
    const result: Record<string, unknown> = {};
    docs.forEach(doc => { result[doc._id] = doc.value; });
    return result;
  }

  /**
   * Remplace l'intégralité des données, mais ne réécrit que les clés
   * effectivement ajoutées, modifiées ou supprimées : une corruption ou un
   * crash pendant l'écriture ne peut donc affecter que les entrées qui
   * changent réellement à cet instant, jamais la bibliothèque entière.
   */
  setAll(data: Record<string, unknown>): Promise<void> {
    return this.serialize(() => this._writeAll(data));
  }

  private async _writeAll(data: Record<string, unknown>): Promise<void> {
    const currentDocs = await this.db.findAsync({});
    const currentValues = new Map(currentDocs.map(doc => [doc._id, doc.value]));
    const newKeys = new Set(Object.keys(data));

    const writes: Promise<unknown>[] = [];
    for (const [key, value] of Object.entries(data)) {
      const hasChanged = !currentValues.has(key) || JSON.stringify(currentValues.get(key)) !== JSON.stringify(value);
      if (hasChanged) {
        writes.push(this.db.updateAsync({ _id: key }, { _id: key, value }, { upsert: true }));
      }
    }

    for (const key of currentValues.keys()) {
      if (!newKeys.has(key)) {
        writes.push(this.db.removeAsync({ _id: key }, {}));
      }
    }

    if (writes.length > 0) {
      await Promise.all(writes);
      await this.db.compactDatafileAsync();
    }
  }
}

export default Store;
