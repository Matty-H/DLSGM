# Scripts Python

L'application utilise des scripts Python pour effectuer des tâches spécifiques qui bénéficient des bibliothèques disponibles dans cet écosystème.

## Scripts

### `fetch_dlsite.py`
Utilise la bibliothèque `dlsite-async` pour récupérer les informations détaillées d'une œuvre à partir de son ID.
- **Entrée** : ID de l'œuvre (ex: RJ012345) et langue optionnelle.
- **Sortie** : Un objet JSON structuré contenant toutes les métadonnées (nom, cercle, description, images, etc.).
- **Gestion d'erreurs** : Retourne un objet JSON avec une clé `"error"` en cas d'échec du fetch.

### `engine_detector.py`
Analyse les fichiers d'un dossier de jeu pour tenter d'identifier le moteur utilisé.
- **Moteurs supportés** : Unity, RPGMaker (versions variées), Godot, Wolf RPG, TyranoBuilder, Ren'Py, etc.
- **Utilité** : Permet d'affiner la logique de lancement ou d'informer l'utilisateur sur les prérequis du jeu.

## Configuration requise

Les scripts nécessitent Python 3. L'installation de `dlsite-async` est impérative pour le fonctionnement du fetcher :
```bash
pip install dlsite-async
<<<<<<< HEAD
```
=======
```
>>>>>>> 38706a1ed0c5993576098437ec7ae4ec9bddfd8f
