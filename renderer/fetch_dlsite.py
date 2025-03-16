import asyncio
from dlsite_async import DlsiteAPI
import sys
import json

# Cette fonction récupère les informations sur un jeu par son ID
async def fetch_game_data(game_id):
    async with DlsiteAPI() as api:
        work_data = await api.get_work(game_id)
        
        # On transforme le résultat en un dictionnaire
        data = {
            "work_name": work_data.work_name,
            "age_category": work_data.age_category.name,
            "circle": work_data.circle,
            "work_image": work_data.work_image,
            "description": work_data.description,
            "genre": work_data.genre,
            "sample_images": work_data.sample_images,
        }
        
        # On retourne les données sous forme de JSON
        return json.dumps(data)

async def main():
    game_id = sys.argv[1]  # On prend l'ID passé en argument
    data = await fetch_game_data(game_id)
    print(data)  # On renvoie les données sous forme de JSON à l'appelant

if __name__ == "__main__":
    asyncio.run(main())
