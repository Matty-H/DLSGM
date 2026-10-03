import path from 'path';
import type { MigrationContext } from '../../../src/main/migrations';

/** Contexte de migration sur un dossier temporaire (`root/userData`, `root/Documents`). */
export function migrationContext(root: string, logs: string[] = []): MigrationContext {
  return {
    userData: path.join(root, 'userData'),
    documents: path.join(root, 'Documents'),
    log: message => logs.push(message)
  };
}
