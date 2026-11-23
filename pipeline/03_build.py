"""Limpa os CSVs do Oracle's Elixir e gera os JSONs agregados que o site consome.

Entrada : data/raw/{2025,2026}_LoL_esports_match_data_from_OraclesElixir.csv
          data/raw/champions.json (Data Dragon)
Saída   : docs/data/games.json    -> uma linha por time em cada partida (draft, lado, resultado, ouro@15...)
          docs/data/players.json  -> estatísticas agregadas por jogador, liga e ano
          docs/data/meta.json     -> listas de ligas, patches, times e campeões (índices usados nos outros arquivos)
          data/processed/summary.json -> números de tratamento (para o relatório e os slides)
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "docs" / "data"
PROC = ROOT / "data" / "processed"
YEARS = [2025, 2026]

# Ligas do Oracle's Elixir -> grupo usado no site.
# Em 2025 as equipes brasileiras jogaram a LTA Sul (com 2 equipes latino-americanas) e as
# norte-americanas a LTA Norte; em 2026 voltaram CBLOL e LCS. "LTA" (playoffs cruzados de 2025)
# é resolvida pela região de cada equipe.
LEAGUE_GROUP = {
    "CBLOL": "CBLOL", "LTA S": "CBLOL",
    "LCS": "LCS", "LTA N": "LCS",
    "LCK": "LCK", "LPL": "LPL", "LEC": "LEC", "LCP": "LCP",
    "MSI": "INT", "WLDs": "INT", "FST": "INT", "EWC": "INT",
}
GROUP_ORDER = ["CBLOL", "LCK", "LPL", "LEC", "LCS", "LCP", "INT"]
GROUP_LABEL = {
    "CBLOL": "CBLOL (LTA Sul em 2025)", "LCK": "LCK (Coreia)", "LPL": "LPL (China)",
    "LEC": "LEC (Europa)", "LCS": "LCS (LTA Norte em 2025)", "LCP": "LCP (Pacífico)",
    "INT": "Internacionais (First Stand, MSI, Worlds)",
}
POSITIONS = ["top", "jng", "mid", "bot", "sup"]
MIN_PLAYER_GAMES = 8


def load() -> pd.DataFrame:
    frames = []
    for y in YEARS:
        f = RAW / f"{y}_LoL_esports_match_data_from_OraclesElixir.csv"
        df = pd.read_csv(f, dtype={"patch": str, "gameid": str, "playerid": str, "teamid": str}, low_memory=False)
        df["src_year"] = y
        frames.append(df)
    return pd.concat(frames, ignore_index=True)


def norm_patch(p) -> str | None:
    if pd.isna(p):
        return None
    s = str(p).strip()
    try:
        major, minor = s.split(".")[:2]
        return f"{int(major)}.{int(minor):02d}"
    except ValueError:
        return None


def main() -> None:
    raw = load()
    summary = {"rows_raw": int(len(raw)), "games_raw": int(raw["gameid"].nunique())}
    summary["leagues_raw"] = sorted(raw["league"].dropna().unique().tolist())

    df = raw[raw["league"].isin(LEAGUE_GROUP.keys()) | (raw["league"] == "LTA")].copy()
    df["patch"] = df["patch"].map(norm_patch)
    df = df[df["patch"].notna()]
    # A coluna "year" do Oracle's Elixir às vezes marca o fim de temporada com o ano seguinte;
    # usamos o ano do calendário da partida.
    df["year"] = pd.to_datetime(df["date"], errors="coerce").dt.year
    summary["games_selected_leagues"] = int(df["gameid"].nunique())

    # Partidas sem as 12 linhas esperadas são descartadas.
    counts = df.groupby("gameid").size()
    bad = counts[counts != 12].index
    df = df[~df["gameid"].isin(bad)]
    summary["games_dropped_incomplete_rows"] = int(len(bad))

    teams = df[df["position"] == "team"].copy()
    players = df[df["position"].isin(POSITIONS)].copy()

    # Região de cada equipe = grupo da liga doméstica onde mais jogou.
    dom = teams[teams["league"].map(LEAGUE_GROUP).isin(GROUP_ORDER[:-1])]
    region = (dom.assign(g=dom["league"].map(LEAGUE_GROUP))
                 .groupby("teamname")["g"].agg(lambda s: s.value_counts().index[0]))

    def group_of(row_league, teamname):
        if row_league == "LTA":
            return region.get(teamname, "LCS")
        return LEAGUE_GROUP[row_league]

    teams["grp"] = [group_of(l, t) for l, t in zip(teams["league"], teams["teamname"])]
    players["grp"] = [group_of(l, t) for l, t in zip(players["league"], players["teamname"])]
    teams["region"] = teams["teamname"].map(region).fillna(teams["grp"])

    # Campeões: picks por posição a partir das linhas de jogadores.
    pk = players.pivot_table(index=["gameid", "side"], columns="position", values="champion", aggfunc="first")
    teams = teams.merge(pk.reset_index(), on=["gameid", "side"], how="left")

    champ_dd = json.loads((RAW / "champions.json").read_text(encoding="utf-8"))
    dd = champ_dd["champions"]
    used = pd.unique(pd.concat([teams[p] for p in POSITIONS] + [teams[f"ban{i}"] for i in range(1, 6)]).dropna())
    champs = sorted(c for c in used if isinstance(c, str))
    missing = [c for c in champs if c not in dd]
    summary["champions_missing_in_datadragon"] = missing
    cidx = {c: i for i, c in enumerate(champs)}

    patches = sorted(teams["patch"].unique(), key=lambda s: tuple(int(x) for x in s.split(".")))
    pidx = {p: i for i, p in enumerate(patches)}
    team_names = sorted(teams["teamname"].dropna().unique())
    tidx = {t: i for i, t in enumerate(team_names)}
    gidx = {g: i for i, g in enumerate(GROUP_ORDER)}

    # Adversário de cada linha de time.
    opp = teams[["gameid", "side", "teamname"]].copy()
    opp["side"] = opp["side"].map({"Blue": "Red", "Red": "Blue"})
    teams = teams.merge(opp.rename(columns={"teamname": "opp"}), on=["gameid", "side"], how="left")

    complete = teams["datacompleteness"].eq("complete")
    summary["team_rows_partial"] = int((~complete).sum())

    def num(col, scale=1.0, nd=0):
        if col not in teams:
            return [None] * len(teams)
        v = pd.to_numeric(teams[col], errors="coerce") * scale
        return [None if pd.isna(x) else (round(float(x), nd) if nd else int(round(x))) for x in v]

    gd15 = pd.to_numeric(teams.get("golddiffat15"), errors="coerce").where(complete)
    gd10 = pd.to_numeric(teams.get("golddiffat10"), errors="coerce").where(complete)
    dates = pd.to_datetime(teams["date"], errors="coerce")

    cols = ["L", "R", "Y", "P", "day", "S", "W", "T", "O", "top", "jng", "mid", "bot", "sup",
            "b1", "b2", "b3", "b4", "b5", "gd10", "gd15", "len", "fb", "fd", "ft", "fbar", "po", "gid"]
    gid_codes = {g: i for i, g in enumerate(teams["gameid"].unique())}

    def ci(x):
        return cidx.get(x, -1) if isinstance(x, str) else -1

    rows = []
    fb, fd, ft, fbar = num("firstblood"), num("firstdragon"), num("firsttower"), num("firstbaron")
    for i, r in enumerate(teams.itertuples(index=False)):
        d = dates.iloc[i]
        rows.append([
            gidx[r.grp], gidx.get(r.region, gidx[r.grp]), int(r.year), pidx[r.patch],
            None if pd.isna(d) else int((d - pd.Timestamp("2025-01-01")).days),
            0 if r.side == "Blue" else 1, int(r.result), tidx.get(r.teamname, -1), tidx.get(r.opp, -1),
            ci(r.top), ci(r.jng), ci(r.mid), ci(r.bot), ci(r.sup),
            ci(r.ban1), ci(r.ban2), ci(r.ban3), ci(r.ban4), ci(r.ban5),
            None if pd.isna(gd10.iloc[i]) else int(gd10.iloc[i]),
            None if pd.isna(gd15.iloc[i]) else int(gd15.iloc[i]),
            int(r.gamelength) if not pd.isna(r.gamelength) else None,
            fb[i], fd[i], ft[i], fbar[i], int(r.playoffs) if not pd.isna(r.playoffs) else 0,
            gid_codes[r.gameid],
        ])

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "games.json").write_text(json.dumps({"cols": cols, "rows": rows}, separators=(",", ":")), encoding="utf-8")

    # ---------------- Jogadores ----------------
    p = players.copy()
    for c in ["kills", "deaths", "assists", "teamkills", "dpm", "damageshare", "cspm", "vspm",
              "earned gpm", "golddiffat15", "csdiffat15", "xpdiffat15", "result"]:
        p[c] = pd.to_numeric(p.get(c), errors="coerce")
    pcomplete = p["datacompleteness"].eq("complete")
    for c in ["golddiffat15", "csdiffat15", "xpdiffat15", "dpm", "damageshare", "cspm", "vspm", "earned gpm"]:
        p.loc[~pcomplete, c] = np.nan
    p["key"] = p["playerid"].fillna(p["playername"])

    agg = p.groupby(["key", "grp", "year", "position"]).agg(
        name=("playername", "last"), team=("teamname", "last"), n=("result", "size"), w=("result", "sum"),
        k=("kills", "sum"), d=("deaths", "sum"), a=("assists", "sum"), tk=("teamkills", "sum"),
        dpm=("dpm", "mean"), dmg=("damageshare", "mean"), cspm=("cspm", "mean"), vspm=("vspm", "mean"),
        egpm=("earned gpm", "mean"), gd15=("golddiffat15", "mean"), csd15=("csdiffat15", "mean"),
        xpd15=("xpdiffat15", "mean"),
    ).reset_index()
    agg = agg[agg["n"] >= MIN_PLAYER_GAMES]
    agg["kda"] = (agg["k"] + agg["a"]) / agg["d"].clip(lower=1)
    agg["kp"] = (agg["k"] + agg["a"]) / agg["tk"].clip(lower=1)

    top_champs = (p.groupby(["key", "grp", "year", "position"])["champion"]
                    .agg(lambda s: [cidx.get(c, -1) for c in s.value_counts().index[:3]]))
    agg = agg.merge(top_champs.rename("champs").reset_index(), on=["key", "grp", "year", "position"], how="left")

    pcols = ["name", "team", "L", "Y", "pos", "n", "w", "kda", "kp", "dpm", "dmg", "cspm", "vspm",
             "egpm", "gd15", "csd15", "xpd15", "champs"]

    def r2(x, nd=2):
        return None if pd.isna(x) else round(float(x), nd)

    prow = [[r.name, r.team, gidx[r.grp], int(r.year), POSITIONS.index(r.position), int(r.n), int(r.w),
             r2(r.kda), r2(r.kp, 3), r2(r.dpm, 0), r2(r.dmg, 3), r2(r.cspm), r2(r.vspm), r2(r.egpm, 0),
             r2(r.gd15, 0), r2(r.csd15, 1), r2(r.xpd15, 0), r.champs]
            for r in agg.itertuples(index=False)]
    (OUT / "players.json").write_text(json.dumps({"cols": pcols, "rows": prow}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # ---------------- Metadados ----------------
    meta = {
        "updated": str(dates.max().date()) if dates.notna().any() else None,
        "groups": [{"id": g, "label": GROUP_LABEL[g]} for g in GROUP_ORDER],
        "patches": patches,
        "teams": team_names,
        "positions": POSITIONS,
        "champions": [{"n": c, "id": dd.get(c, {}).get("id", c.replace(" ", "")),
                        "tags": dd.get(c, {}).get("tags", []), "icon": dd.get(c, {}).get("icon")} for c in champs],
        "ddragon": champ_dd["version"],
    }
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    summary.update({
        "games_final": int(teams["gameid"].nunique()),
        "team_rows": len(rows),
        "player_seasons": len(prow),
        "patches": patches,
        "champions": len(champs),
        "games_by_group_year": teams.groupby(["grp", "year"])["gameid"].nunique().rename(lambda x: f"{x}" if not isinstance(x, tuple) else f"{x[0]}-{x[1]}").to_dict(),
        "data_until": meta["updated"],
    })
    summary["games_by_group_year"] = {f"{k[0]} {k[1]}": int(v) for k, v in teams.groupby(["grp", "year"])["gameid"].nunique().items()}
    PROC.mkdir(parents=True, exist_ok=True)
    keep = ["gameid", "grp", "region", "year", "patch", "side", "teamname", "opp", "result", "datacompleteness",
            "golddiffat10", "golddiffat15", "gamelength", "league", "playoffs"]
    teams[keep].to_parquet(PROC / "teams.parquet", index=False)
    pl = players.merge(teams[["gameid", "side", "region", "opp"]], on=["gameid", "side"], how="left")
    pl.to_parquet(PROC / "players.parquet", index=False)
    (PROC / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k != "patches"}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
