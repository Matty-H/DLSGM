import { app } from 'electron';
import path from 'path';
import Datastore from '@seald-io/nedb';

interface StoredDoc {
  _id: string;
  value: unknown;
}

// Ouverture des fichiers retenue pendant les migrations (src/main/migrations),
// qui convertissent ces mêmes fichiers au format actuel avant que l'app ne
// les lise : jamais deux Datastore sur un fichier en même temps.
let storesGate: Promise<void> = Promise.resolve();

/**
 * Retient l'ouverture de tous les stores jusqu'à l'appel de la fonction
 * renvoyée (main.ts : avant les migrations, relâché après). Un store utilisé
 * entre-temps attend simplement.
 */
export function holdStores(): () => void {
  let release!: () => void;
  storesGate = new Promise(resolve => {
    release = resolve;
  });
  return release;
}

/**
 * Gère le stockage des données de l'application dans le dossier userData de
 * l'utilisateur, via NeDB (pur JS, aucun module natif à recompiler par
 * plateforme). Chaque entrée logique (un jeu, un paramètre) est un document
 * NeDB indépendant : une écriture (`set`/`setAll`) ne touche que les
 * documents réellement modifiés, au lieu de réécrire tout le fichier comme
 * le faisait l'ancien store JSON monobloc (converti par la migration 001).
 * Le fichier n'est ouvert qu'à la première utilisation, après les
 * migrations (`holdStores`). NeDB persiste en log
 * append-only : un crash en pleine écriture laisse au pire une dernière
 * ligne tronquée, détectée et ignorée au chargement, sans affecter le reste
 * des données.
 */
class Store {
  private fileName: string;
  // Créé à l'ouverture (après `holdStores`), pas dans le constructeur : les
  // stores sont construits à l'import, avant que main.ts ne sache quel
  // profil ouvrir (profil leurre du verrouillage, app-lock.ts).
  private db!: Datastore<StoredDoc>;
  private defaults: Record<string, unknown>;
  private ready: Promise<void> | null = null;
  // File d'attente des écritures : chaque opération lecture-modification-
  // écriture s'exécute seule, sinon deux `update` concurrents sur la même clé
  // (ou un `setAll` en parallèle) pourraient écraser le travail de l'autre.
  private writeQueue: Promise<unknown> = Promise.resolve();

  /**
   * @param fileName Nom du fichier NeDB (ex: 'cache.db').
   * @param defaults Valeurs par défaut (clé -> valeur) si le store est vide.
   */
  constructor(fileName: string, defaults: Record<string, unknown>) {
    this.fileName = fileName;
    this.defaults = defaults;
  }

  /** Chargement au premier usage, après les migrations ; toutes les méthodes l'attendent. */
  private whenReady(): Promise<void> {
    this.ready ??= storesGate.then(() => this._init());
    return this.ready;
  }

  private async _init(): Promise<void> {
    this.db = new Datastore<StoredDoc>({ filename: path.join(app.getPath('userData'), this.fileName), autoload: false });
    await this.db.loadDatabaseAsync();
    if ((await this.db.countAsync({})) === 0 && Object.keys(this.defaults).length > 0) {
      await this._writeAll(this.defaults);
    }
  }

  /**
   * Récupère une valeur à partir d'une clé.
   */
  async get(key: string): Promise<unknown> {
    await this.whenReady();
    await this.writeQueue; // lit après les écritures déjà demandées
    const doc = await this.db.findOneAsync({ _id: key });
    return doc ? doc.value : undefined;
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(async () => {
      await this.whenReady();
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
   * Crée la clé avec `val` seulement si elle n'existe pas encore (vérification
   * et écriture dans la même opération sérialisée). Renvoie false, sans rien
   * écrire, si la clé existe déjà.
   */
  insert(key: string, val: unknown): Promise<boolean> {
    return this.serialize(async () => {
      if (await this.db.findOneAsync({ _id: key })) return false;
      await this.db.insertAsync({ _id: key, value: val });
      await this.db.compactDatafileAsync();
      return true;
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
    await this.whenReady();
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
