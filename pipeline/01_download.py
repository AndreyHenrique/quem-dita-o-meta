"""Baixa os CSVs de partidas profissionais do Oracle's Elixir (2025 e 2026).

Fonte: https://oracleselixir.com/tools/downloads (pasta pública "OE Public Match Data"
no Google Drive). Os arquivos são atualizados diariamente; rode de novo para atualizar.
"""
from pathlib import Path
import sys
import requests

FILES = {
    2025: "1v6LRphp2kYciU4SXp0PCjEMuev1bDejc",
    2026: "1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm",
}
RAW = Path(__file__).resolve().parent.parent / "data" / "raw"


def download(year: int, file_id: str) -> Path:
    RAW.mkdir(parents=True, exist_ok=True)
    out = RAW / f"{year}_LoL_esports_match_data_from_OraclesElixir.csv"
    url = "https://drive.usercontent.google.com/download"
    params = {"id": file_id, "export": "download", "confirm": "t"}
    with requests.get(url, params=params, stream=True, timeout=120) as r:
        r.raise_for_status()
        ctype = r.headers.get("content-type", "")
        if "text/html" in ctype:
            sys.exit(f"{year}: Google Drive devolveu HTML em vez do CSV ({ctype}).")
        with open(out, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    print(f"{year}: {out.stat().st_size / 1e6:.1f} MB -> {out}")
    return out


if __name__ == "__main__":
    for y, fid in FILES.items():
        download(y, fid)
