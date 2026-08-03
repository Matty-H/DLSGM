import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

/**
 * Auto-update via GitHub Releases (electron-builder `publish` config).
 * Ne fonctionne que pour la build NSIS installée — la build `portable`
 * n'a pas de dossier d'installation à mettre à jour en place, c'est un
 * comportement Windows inhérent, pas une limitation à corriger ici.
 */
export function initAutoUpdater(): void {
  log.transports.file.level = 'info';
  autoUpdater.logger = log;

  autoUpdater.checkForUpdatesAndNotify().catch(error => {
    console.error('Erreur lors de la vérification des mises à jour:', error);
  });
}
