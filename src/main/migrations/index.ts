import { jsonStoresToNedb } from './001-json-stores-to-nedb';
import { workspaceTravauxToWork } from './002-workspace-travaux-to-work';
import { backupLabelsToEnglish } from './003-backup-labels-to-english';
import { genreAliasGroups } from './004-genre-alias-groups';

/**
 * Migrations : tout ce qu'une ancienne version de DLSGM a pu laisser
 * (réglages, cache, dossiers, manifestes) est converti ici au format actuel,
 * au démarrage, avant que les stores et les fonctions ne lisent quoi que ce
 * soit (main.ts, `holdStores`). Le reste du code ne connaît que le format
 * actuel.
 *
 * Un utilisateur peut passer d'une version vieille de plusieurs mois à la
 * dernière d'un coup : chaque migration convertit directement l'ancien
 * format vers l'actuel, détecte elle-même s'il reste quelque chose à faire
 * (elle tourne à chaque démarrage, sans registre « déjà appliquée ») et ne
 * supprime jamais une donnée d'origine avant d'avoir réussi.
 *
 * Politique legacy : on supprime des fonctions, pas des migrations, tant
 * qu'une version publiée peut encore produire les données qu'elles
 * convertissent. Chacune a un test qui part de données au format ancien
 * (tests/main/migrations/), plus un test de bout en bout sur un dossier de
 * données complet d'une vieille version.
 */

export interface MigrationContext {
  /** Dossier des données de DLSGM (app.getPath('userData')). */
  userData: string;
  /** Dossier Documents de l'utilisateur (app.getPath('documents')). */
  documents: string;
  log: (message: string, error?: unknown) => void;
}

export interface Migration {
  id: string;
  /**
   * Touche des données hors du dossier de données (Documents…), partagées
   * par tous les profils : ne tourne que pour le vrai profil, jamais pour
   * le profil leurre (app-lock.ts), dont les réglages ne la concernent pas.
   */
  sharedData?: boolean;
  run(context: MigrationContext): Promise<void>;
}

/** Dans l'ordre d'exécution (une migration peut compter sur les précédentes). */
export const MIGRATIONS: readonly Migration[] = [jsonStoresToNedb, workspaceTravauxToWork, backupLabelsToEnglish, genreAliasGroups];

/** Migrations du profil leurre : seulement ce qui vit dans son propre dossier. */
export const PROFILE_MIGRATIONS: readonly Migration[] = MIGRATIONS.filter(migration => !migration.sharedData);

/**
 * Exécute les migrations dans l'ordre. Un échec est journalisé et n'empêche
 * ni les suivantes ni le démarrage (la migration retentera au prochain).
 * Renvoie les identifiants des migrations en échec.
 */
export async function runMigrations(context: MigrationContext, migrations: readonly Migration[] = MIGRATIONS): Promise<string[]> {
  const failed: string[] = [];
  for (const migration of migrations) {
    try {
      await migration.run(context);
    } catch (error) {
      failed.push(migration.id);
      context.log(`Migration ${migration.id} impossible, nouvel essai au prochain démarrage :`, error);
    }
  }
  return failed;
}
