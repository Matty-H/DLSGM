import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

/**
 * Auto-update via GitHub Releases (electron-builder `publish` config).
 * Fonctionne pour l'installeur NSIS (Windows) et le zip (macOS, utilisé en
 * interne par l'auto-update même si le dmg reste le moyen d'installation
 * initial proposé aux utilisateurs).
 */
export function initAutoUpdater(): void {
  log.transports.file.level = 'info';
  autoUpdater.logger = log;

  autoUpdater.checkForUpdatesAndNotify().catch(error => {
    console.error('Erreur lors de la vérification des mises à jour:', error);
  });
}
