const fs = require('fs');
import { cacheFilePath } from './osHandler.js';

export function loadCache() {
  try {
    // Check if the cache file exists at the specified path
    if (fs.existsSync(cacheFilePath)) {
      // Read the content of the cache file as a string
      const cacheContent = fs.readFileSync(cacheFilePath, 'utf8');
      // Parse the string content to a JSON object and return it
      return JSON.parse(cacheContent);
    } else {
      // If the file does not exist, create an empty cache file
      fs.writeFileSync(cacheFilePath, JSON.stringify({}));
    }
  } catch (error) {
    // Log any error that occurs during the loading process
    console.error('Error loading cache:', error);
    // In case of error, create an empty cache file to ensure the file exists
    fs.writeFileSync(cacheFilePath, JSON.stringify({}));
  }
  // Return an empty object if the cache file does not exist or an error occurs
  return {};
}

export function saveCache() {
  // Initialize an object to hold the cache data
  const cacheData = {};

  try {
    // Write the cache data to the file at the specified path
    // The JSON.stringify method converts the JavaScript object into a JSON string
    // The second argument 'null' indicates no custom replacer function
    // The third argument '2' adds indentation for readability in the JSON file
    fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData, null, 2));

    // Return true to indicate that the cache was saved successfully
    return true;
  } catch (error) {
    // Log any error that occurs during the saving process
    console.error('Error saving cache:', error);

    // Return false to indicate that there was an error saving the cache
    return false;
  }
}

// Update a specific entry in the cache
// This function takes in three arguments:
// - The existing cache object
// - The ID of the game to update
// - An object containing new data to add to the existing game data
//   This object will be merged with the existing game data in the cache
export function updateCacheEntry(cache, gameId, newData) {
  // Merge the new data with the existing data for this game
  // If the game does not exist in the cache, create a new entry for it
  cache[gameId] = {
    // Start with any existing data for this game
    ...(cache[gameId] || {}),
    // Add the new data to the existing data
    ...newData
  };

  // Save the updated cache to the file system
  // This will persist the changes even if the app is restarted
  return saveCache();
}
