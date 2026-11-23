"""Baixa a lista de campeões do Data Dragon (Riot Games): nome, id, classe e ícone."""
from pathlib import Path
import json
import requests

OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "champions.json"


def main() -> None:
    version = requests.get("https://ddragon.leagueoflegends.com/api/versions.json", timeout=30).json()[0]
    url = f"https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json"
    data = requests.get(url, timeout=30).json()["data"]
    champs = {
        c["name"]: {
            "id": c["id"],
            "name": c["name"],
            "tags": c["tags"],
            "icon": f"https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{c['image']['full']}",
        }
        for c in data.values()
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"version": version, "champions": champs}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(champs)} campeões (Data Dragon {version}) -> {OUT}")


if __name__ == "__main__":
    main()
