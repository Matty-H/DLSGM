# Processus de Rendu (Renderer)

Ce répertoire contient l'interface utilisateur et la logique côté client de l'application.

## Architecture JS

La logique est modularisée pour faciliter la maintenance :

- **`renderer.js`** : Point d'entrée du rendu, initialise les composants et charge la liste initiale.
- **`uiManager.js`** : Gère la création dynamique de la grille de jeux et les mises à jour de l'interface.
- **`gameScanner.js`** : Coordonne le scan des dossiers locaux et synchronise le résultat avec le cache.
- **`dataFetcher.js`** : Gère les appels aux scripts Python pour récupérer les données manquantes.
- **`cacheManager.js`** : Fournit des méthodes pour lire et mettre à jour le cache des métadonnées.
- **`gameInfoHandler.js`** : Contrôle le panneau latéral de détails et le formulaire d'édition manuelle.
- **`eventListeners.js`** : Centralise tous les écouteurs d'événements (boutons, recherche, filtres).
- **`filterManager.js`** : Applique les filtres de recherche, de catégorie et de genre sur la liste affichée.
- **`metadataManager.js`** : Gère les correspondances de catégories et l'extraction des genres uniques.

## Interface Utilisateur

- **Design** : Basé sur `modern.css` avec un thème sombre, des effets de flou (backdrop-filter) et une disposition flexible (Flexbox/Grid).
- **Interactivité** : Le panneau latéral (`.game-info`) s'ouvre au clic sur un jeu, déclenchant le réagencement automatique de la grille.
- **Récupération des images** : Les images sont servies via le protocole `atom://` pointant vers le cache local dans `userData/img_cache`.

## Abstractions importantes

- **Gestion des erreurs d'images** : Toutes les images utilisent un fallback vers une image SVG de remplacement en cas d'erreur de chargement pour éviter les zones vides.
- **Mise à jour parallèle** : Le `uiManager` utilise `Promise.all` pour générer les éléments de la liste en parallèle, optimisant les performances sur les grosses bibliothèques.
