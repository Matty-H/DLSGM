import { updateCategoryDropdown, updateGenreDropdown, refreshInterface } from './uiManager.js';
import { globalCache } from '../renderer.js';
import { fetchGameMetadata } from './dataFetcher.js';
import { getGamesFolderPath } from './osHandler.js';
import { purgeObsoleteGamesFromCache } from './dataFetcher.js';
const fs = require('fs');

export function scanGames() {
  // Scans the SCAN folder for new games and updates the game list
  // 1. Purge obsolete games from the cache
  // 2. Find all folders in the SCAN folder
  // 3. Check which ones are not in the cache yet
  // 4. Fetch metadata for uncached games
  // 5. Update the category and genre dropdown menus
  // 6. Refresh the game list

  try {
    const gamesFolderPath = getGamesFolderPath();
    if (!fs.existsSync(gamesFolderPath)) {
      console.error('Games folder does not exist');
      // If the SCAN folder does not exist, show an error message
      document.querySelector('.games-list').innerHTML = '<p>Games folder not found. Please create a folder named "SCAN" on your desktop.</p>';
      return;
    }

    // Purge obsolete games from the cache
    purgeObsoleteGamesFromCache();

    const files = fs.readdirSync(gamesFolderPath);
    const gameFolders = files.filter(file => /^[A-Z]{2}\d{6,9}$/.test(file));

    if (gameFolders.length === 0) {
      // If there are no games in the SCAN folder, show an error message
      document.querySelector('.games-list').innerHTML = '<p>No games found in SCAN folder.</p>';
      return;
    }

    // Check and retrieve metadata for uncached games
    gameFolders.forEach(gameFolder => {
      const gameId = gameFolder;
      if (!globalCache[gameId]) {
        // If the game is not in the cache, retrieve its metadata
        fetchGameMetadata(gameId); // Retrieve metadata
      }
    });

    // Update dropdown menus
    updateCategoryDropdown(globalCache);
    updateGenreDropdown(globalCache);

    refreshInterface();

  } catch (error) {
    console.error('Error scanning games:', error);
    // If there is an error, show an error message
    document.querySelector('.games-list').innerHTML = '<p>Error scanning games.</p>';
  }
}
