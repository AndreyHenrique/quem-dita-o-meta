"""Testa as hipóteses da proposta e grava docs/data/insights.json (usado no site e nos slides).

H1  O meta do CBLOL acompanha o das ligas asiáticas com atraso de patches.
H2  Partidas do CBLOL são menos decididas pela vantagem inicial (mais viradas).
H3  A diferença entre jogadores brasileiros e os das ligas de topo está mais na fase inicial
    (ouro/CS aos 15) do que no dano.
+   Vantagem do lado azul.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

ROOT = Path(__file__).resolve().parent.parent
PROC = ROOT / "data" / "processed"
OUT = ROOT / "docs" / "data"
DOMESTIC = ["CBLOL", "LCK", "LPL", "LEC", "LCS", "LCP"]
MIN_PATCH_GAMES = 8


def patch_key(p: str) -> tuple:
    return tuple(int(x) for x in p.split("."))


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


def logistic_fit(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    """Regressão logística simples (Newton-Raphson): P(vitória) = 1 / (1 + e^-(a + b·x))."""
    X = np.column_stack([np.ones_like(x), x])
    w = np.zeros(2)
    for _ in range(50):
        p = 1 / (1 + np.exp(-X @ w))
        g = X.T @ (y - p)
        H = (X * (p * (1 - p))[:, None]).T @ X
        step = np.linalg.solve(H, g)
        w += step
        if np.abs(step).max() < 1e-10:
            break
    return float(w[0]), float(w[1])


# ---------------------------------------------------------------- H1
def presence_table(teams_draft: pd.DataFrame) -> pd.DataFrame:
    """Presença (pick + ban) por liga, patch e campeão."""
    picks = teams_draft.melt(id_vars=["gameid", "grp", "patch"], value_vars=["top", "jng", "mid", "bot", "sup"],
                             value_name="champ")
    bans = teams_draft.melt(id_vars=["gameid", "grp", "patch"], value_vars=[f"ban{i}" for i in range(1, 6)],
                            value_name="champ")
    both = pd.concat([picks, bans]).dropna(subset=["champ"])
    games = teams_draft.groupby(["grp", "patch"])["gameid"].nunique().rename("games")
    pres = both.groupby(["grp", "patch", "champ"])["gameid"].nunique().rename("n").reset_index()
    pres = pres.merge(games.reset_index(), on=["grp", "patch"])
    pres["presence"] = pres["n"] / pres["games"]
    return pres, games


def h1(teams_draft: pd.DataFrame) -> dict:
    pres, games = presence_table(teams_draft)
    patches = sorted(teams_draft["patch"].unique(), key=patch_key)
    pidx = {p: i for i, p in enumerate(patches)}
    mat = pres.pivot_table(index=["grp", "patch"], columns="champ", values="presence", fill_value=0)
    ok = games[games >= MIN_PATCH_GAMES]

    def vec(g, p):
        return mat.loc[(g, p)].values if (g, p) in ok.index and (g, p) in mat.index else None

    res = {}
    for other in ["LCK", "LPL", "LEC", "LCS", "LCP"]:
        by_lag = {}
        for lag in range(-3, 4):
            sims = []
            for p in patches:
                q_i = pidx[p] - lag
                if not 0 <= q_i < len(patches):
                    continue
                a, b = vec("CBLOL", p), vec(other, patches[q_i])
                if a is None or b is None:
                    continue
                sims.append(np.corrcoef(a, b)[0, 1])
            if sims:
                by_lag[lag] = {"r": float(np.mean(sims)), "n": len(sims)}
        best = max(by_lag, key=lambda k: by_lag[k]["r"])
        res[other] = {"by_lag": by_lag, "best_lag": best}

    # Atraso de adoção: primeiro patch em que o campeão passa de 30% de presença.
    THR = 0.30
    adopt = {}
    hot = pres[(pres["presence"] >= THR) & pres.set_index(["grp", "patch"]).index.isin(ok.index)]
    first = hot.assign(i=hot["patch"].map(pidx)).groupby(["grp", "champ"])["i"].min().unstack(0)
    for other in ["LCK", "LPL", "LEC", "LCS", "LCP"]:
        both = first[["CBLOL", other]].dropna()
        d = (both["CBLOL"] - both[other])
        adopt[other] = {
            "champions": int(len(d)),
            "median_lag": float(d.median()) if len(d) else None,
            "mean_lag": float(d.mean()) if len(d) else None,
            "share_cblol_later": float((d > 0).mean()) if len(d) else None,
            "share_same_patch": float((d == 0).mean()) if len(d) else None,
            "share_cblol_earlier": float((d < 0).mean()) if len(d) else None,
            "wilcoxon_p": float(stats.wilcoxon(d[d != 0]).pvalue) if (d != 0).sum() >= 6 else None,
        }

    # Similaridade média do meta entre ligas no mesmo patch (matriz para o heatmap).
    sim = {}
    for a in DOMESTIC + ["INT"]:
        for b in DOMESTIC + ["INT"]:
            vals = []
            for p in patches:
                va, vb = vec(a, p), vec(b, p)
                if va is not None and vb is not None:
                    vals.append(np.corrcoef(va, vb)[0, 1])
            sim[f"{a}|{b}"] = float(np.mean(vals)) if vals else None
    return {"lag_similarity": res, "adoption": adopt, "threshold": THR, "similarity": sim}


# ---------------------------------------------------------------- H2
def h2(teams: pd.DataFrame) -> dict:
    t = teams[(teams["datacompleteness"] == "complete") & teams["golddiffat15"].notna()]
    out = {}
    for g in DOMESTIC + ["INT"]:
        s = t[t["grp"] == g]
        if len(s) < 50:
            continue
        x = s["golddiffat15"].to_numpy(float) / 1000
        y = s["result"].to_numpy(float)
        a, b = logistic_fit(x, y)
        behind = s[s["golddiffat15"] <= -1500]
        k, n = int(behind["result"].sum()), int(len(behind))
        lo, hi = wilson(k, n)
        out[g] = {
            "games": int(s["gameid"].nunique()), "slope_per_1k": b,
            "p_win_plus1k": float(1 / (1 + np.exp(-(a + b)))),
            "p_win_plus2k": float(1 / (1 + np.exp(-(a + 2 * b)))),
            "comeback_n": n, "comeback_k": k, "comeback_rate": k / n if n else None,
            "comeback_ci": [lo, hi],
            "leader15_wins": float((np.sign(s["golddiffat15"]) == np.where(s["result"] == 1, 1, -1))[s["golddiffat15"] != 0].mean()),
        }
    # Teste: taxa de viradas do CBLOL contra a média das ligas de topo (qui-quadrado).
    top = t[t["grp"].isin(["LCK", "LPL", "LEC"])]
    cb = t[t["grp"] == "CBLOL"]
    tb, cbb = top[top["golddiffat15"] <= -1500], cb[cb["golddiffat15"] <= -1500]
    table = [[int(cbb["result"].sum()), int(len(cbb) - cbb["result"].sum())],
             [int(tb["result"].sum()), int(len(tb) - tb["result"].sum())]]
    chi = stats.chi2_contingency(table)
    return {"by_league": out, "cblol_vs_top3": {"table": table, "p_value": float(chi.pvalue)},
            "note": "LPL 2025 tem cobertura parcial (sem ouro aos 15); entra só com 2026."}


# ---------------------------------------------------------------- Lado azul
def blue(teams: pd.DataFrame) -> dict:
    b = teams[teams["side"] == "Blue"]
    out = {}
    for g in DOMESTIC + ["INT"]:
        s = b[b["grp"] == g]
        k, n = int(s["result"].sum()), int(len(s))
        out[g] = {"n": n, "blue_wr": k / n, "ci": list(wilson(k, n)), "p": float(stats.binomtest(k, n).pvalue)}
    k, n = int(b["result"].sum()), int(len(b))
    out["ALL"] = {"n": n, "blue_wr": k / n, "ci": list(wilson(k, n)), "p": float(stats.binomtest(k, n).pvalue)}
    return out


# ---------------------------------------------------------------- H3
def h3(players: pd.DataFrame) -> dict:
    """Compara jogadores de times brasileiros contra adversários de LCK/LPL em torneios internacionais,
    onde as diferenças aos 15 minutos são medidas contra o mesmo oponente direto."""
    p = players[(players["grp"] == "INT") & (players["datacompleteness"] == "complete")].copy()
    opp_region = p[["gameid", "side", "region"]].drop_duplicates()
    opp_region["side"] = opp_region["side"].map({"Blue": "Red", "Red": "Blue"})
    p = p.merge(opp_region.rename(columns={"region": "opp_region"}), on=["gameid", "side"], how="left")
    for c in ["golddiffat15", "csdiffat15", "xpdiffat15", "dpm", "damageshare", "result"]:
        p[c] = pd.to_numeric(p[c], errors="coerce")
    res = {}
    matchups = {"CBLOL_vs_LCK_LPL": (p["region"] == "CBLOL") & p["opp_region"].isin(["LCK", "LPL"]),
                "CBLOL_vs_all": (p["region"] == "CBLOL") & (p["opp_region"] != "CBLOL")}
    for name, mask in matchups.items():
        s = p[mask]
        by_pos = s.groupby("position").agg(gd15=("golddiffat15", "mean"), csd15=("csdiffat15", "mean"),
                                           xpd15=("xpdiffat15", "mean"), n=("gameid", "nunique")).round(1)
        res[name] = {
            "games": int(s["gameid"].nunique()),
            "win_rate": float(s.groupby("gameid")["result"].first().mean()) if len(s) else None,
            "gd15_mean_player": float(s["golddiffat15"].mean()),
            "csd15_mean_player": float(s["csdiffat15"].mean()),
            "by_position": by_pos.reset_index().to_dict(orient="records"),
        }
    # Dano por minuto: ligas diferentes, então comparamos a distribuição de DPM dentro dos mesmos jogos.
    s = p[matchups["CBLOL_vs_LCK_LPL"]]
    o = p[(p["region"].isin(["LCK", "LPL"])) & (p["opp_region"] == "CBLOL")]
    res["dpm_cblol"] = float(s["dpm"].mean()) if len(s) else None
    res["dpm_opponents"] = float(o["dpm"].mean()) if len(o) else None
    res["dpm_ratio"] = res["dpm_cblol"] / res["dpm_opponents"] if res["dpm_opponents"] else None
    return res


def main() -> None:
    teams = pd.read_parquet(PROC / "teams.parquet")
    players = pd.read_parquet(PROC / "players.parquet")
    picks = players.pivot_table(index=["gameid", "side"], columns="position", values="champion", aggfunc="first").reset_index()
    raw_bans = []
    for y in (2025, 2026):
        f = ROOT / "data" / "raw" / f"{y}_LoL_esports_match_data_from_OraclesElixir.csv"
        raw_bans.append(pd.read_csv(f, usecols=["gameid", "side", "position", "ban1", "ban2", "ban3", "ban4", "ban5"],
                                    low_memory=False).query("position == 'team'").drop(columns="position"))
    bans = pd.concat(raw_bans)
    draft = teams.merge(picks, on=["gameid", "side"]).merge(bans, on=["gameid", "side"], how="left")

    out = {"h1": h1(draft), "h2": h2(teams), "blue": blue(teams), "h3": h3(players)}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "insights.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    # Resumo legível
    print("H1 — melhor defasagem (similaridade do meta CBLOL[p] x liga[p-lag]):")
    for k, v in out["h1"]["lag_similarity"].items():
        r = {lag: round(x["r"], 3) for lag, x in v["by_lag"].items()}
        print(f"  {k}: best_lag={v['best_lag']}  {r}")
    print("H1 — adoção (>=30% presença):")
    for k, v in out["h1"]["adoption"].items():
        print(f"  {k}: {v}")
    print("H2:")
    for k, v in out["h2"]["by_league"].items():
        print(f"  {k}: slope={v['slope_per_1k']:.3f} P(+1k)={v['p_win_plus1k']:.3f} comeback={v['comeback_rate']:.3f} "
              f"({v['comeback_k']}/{v['comeback_n']}) leader15={v['leader15_wins']:.3f}")
    print("  CBLOL vs top3 viradas p =", round(out["h2"]["cblol_vs_top3"]["p_value"], 4))
    print("Lado azul:", {k: (round(v["blue_wr"], 3), round(v["p"], 4)) for k, v in out["blue"].items()})
    print("H3:", json.dumps(out["h3"], ensure_ascii=False, indent=1)[:2500])


if __name__ == "__main__":
    main()
