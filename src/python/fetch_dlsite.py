import asyncio
from dlsite_async import DlsiteAPI
import sys
import json
import io
from datetime import datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Fonction pour convertir les objets en JSON-friendly format
def serialize(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()  # Convertit datetime en chaîne lisible
    elif isinstance(obj, list):
        return [serialize(item) for item in obj]  # Gère les listes récursivement
    elif isinstance(obj, dict):
        return {key: serialize(value) for key, value in obj.items()}  # Gère les dictionnaires
    return obj  # Renvoie tel quel si ce n'est pas un type problématique

# Fonction principale pour récupérer les infos du jeu
async def fetch_game_data(game_id, lang="en_US"):
    try:
        async with DlsiteAPI(locale=lang) as api:
            work_data = await api.get_work(game_id)
    except Exception as e:
        return json.dumps({"error": str(e), "game_id": game_id}, ensure_ascii=False)

    try:
        # Création du dictionnaire des données
        data = {
            "work_name": work_data.work_name,
            "title_name_masked": work_data.title_name_masked,
            "age_category": work_data.age_category.name,
            "circle": work_data.circle,
            "brand": getattr(work_data, "brand", "N/A"),
            "publisher": getattr(work_data, "publisher", "N/A"),
            "label": getattr(work_data, "label", "N/A"),
            "work_image": work_data.work_image,
            "description": work_data.description,
            "genre": work_data.genre,
            "sample_images": work_data.sample_images,
            "category": work_data.work_type,
            "announce_date": serialize(getattr(work_data, "announce_date", "N/A")),
            "release_date": serialize(getattr(work_data, "release_date", "N/A")),
            "regist_date": serialize(getattr(work_data, "regist_date", "N/A")),
            "modified_date": serialize(getattr(work_data, "modified_date", "N/A")),
            "file_format": getattr(work_data, "file_format", "N/A"),
            "file_size": getattr(work_data, "file_size", "N/A"),
            "language": getattr(work_data, "language", "N/A"),
            "platform": getattr(work_data, "site_id", "N/A"),
            "series": getattr(work_data, "series", "N/A"),
            "page_count": getattr(work_data, "page_count", "N/A"),
            "author": getattr(work_data, "author", "N/A"),
            "writer": getattr(work_data, "writer", "N/A"),
            "scenario": getattr(work_data, "scenario", "N/A"),
            "illustration": getattr(work_data, "illustration", "N/A"),
            "voice_actor": getattr(work_data, "voice_actor", "N/A"),
            "music": getattr(work_data, "music", "N/A"),
            "event": getattr(work_data, "event", "N/A"),
        }

        # Convertir les données en JSON avec encodage propre
        return json.dumps(data, ensure_ascii=False, indent=4)
    except Exception as e:
        return json.dumps({"error": f"Erreur lors du traitement des données: {str(e)}", "game_id": game_id}, ensure_ascii=False)

async def main():
    if len(sys.argv) < 2:
        print("Usage: python fetch_dlsite.py <game_id> [lang]")
        return

    game_id = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else "en_US"

    data = await fetch_game_data(game_id, lang)
    print(data)  # Affichage des données

if __name__ == "__main__":
    asyncio.run(main())
