import os
import sys
import argparse

def detect_unity(directory):
    """Détecte si le jeu a été créé avec Unity en parcourant le répertoire et ses sous-dossiers."""
    unity_files = ["UnityCrashHandler64.exe", "UnityPlayer.dll"]
    
    for dirpath, _, files in os.walk(directory):
        for file in unity_files:
            if file in files:
                return True
    
    # Vérifie la présence d'un dossier XXX_Data à côté d'un fichier XXX.exe
    for dirpath, _, files in os.walk(directory):
        exe_files = [f for f in files if f.endswith(".exe")]
        for exe_file in exe_files:
            data_folder = exe_file.replace(".exe", "_Data")
            if data_folder in files and os.path.isdir(os.path.join(dirpath, data_folder)):
                return True
    
    return False

def detect_gamemaker(directory):
    """Détecte si le jeu a été créé avec GameMaker Studio en parcourant le répertoire et ses sous-dossiers."""
    for dirpath, _, files in os.walk(directory):
        if "data.win" in files:
            return True
    return False

def detect_godot(directory):
    """Détecte si le jeu a été créé avec Godot en parcourant le répertoire et ses sous-dossiers."""
    for dirpath, _, files in os.walk(directory):
        for file in files:
            if file.endswith(".pck"):
                return True
    return False

def detect_rpgmaker(directory):
    """Détecte si le jeu a été créé avec RPG Maker en parcourant le répertoire et ses sous-dossiers."""
    for dirpath, _, files in os.walk(directory):
        if "locales" in files and "www" in files:
            return True
    return False

def detect_game_engine(directory):
    """Détecte le moteur de jeu utilisé pour le jeu situé dans le répertoire spécifié."""
    if not os.path.exists(directory):
        print(f"Erreur: Le répertoire {directory} n'existe pas.")
        return None
    
    if detect_unity(directory):
        return "Unity"
    
    if detect_gamemaker(directory):
        return "GameMaker Studio"

    if detect_godot(directory):
        return "Godot Engine"
    
    if detect_rpgmaker(directory):
        return "RPG Maker"
    
    return "Moteur inconnu"

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Détecter le moteur de jeu utilisé")
    parser.add_argument("-d", "--directory", type=str, required=True, help="Le répertoire du jeu à analyser")
    parser.add_argument("-v", "--verbose", action="store_true", help="Affiche les informations détaillées")
    
    args = parser.parse_args()

    engine = detect_game_engine(args.directory)
    
    if engine:
        if args.verbose:
            print(f"Moteur de jeu détecté: {engine}")
        print(f"{engine} ({args.directory})")
