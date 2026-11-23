# Quem dita o meta?

**O CBLOL e o cenário competitivo de League of Legends visto pelos dados**: projeto final de Visualização de Dados (UFC, 2026.2).

Equipe: Andrey Henrique de Abreu Carneiro (555740) e Célio Renan Pereira Costa Araújo (554118).

**Site:** https://andreyhenrique.github.io/quem-dita-o-meta/

Site interativo em D3.js que compara o CBLOL às principais ligas (LCK, LPL, LEC, LCS, LCP) e aos torneios internacionais (First Stand, MSI, EWC, Worlds) em três perspectivas:

1. **O meta**: rede de sinergia de campeões (grafo de força), dispersão pick × vitória, barras de presença/duplas e linha de presença por patch, todas coordenadas pela seleção de campeão e pelos filtros globais (liga, liga comparada, time, lado, intervalo de patches com *brush*).
2. **A partida**: vitória × vantagem de ouro aos 15 min (regressão logística), taxa de viradas por liga e vantagem do lado azul.
3. **Os jogadores**: coordenadas paralelas com *brush* em percentis por posição, tabela filtrada e o confronto dos times brasileiros nos internacionais.

## Estrutura

```
pipeline/            # Python: download, limpeza, agregações e testes das hipóteses
  01_download.py     # CSVs 2025/2026 do Oracle's Elixir (Google Drive)
  02_champions.py    # campeões do Data Dragon (Riot)
  03_build.py        # limpeza + JSONs do site (docs/data)
  04_insights.py     # H1, H2, lado azul, H3 -> docs/data/insights.json
docs/                # site estático (GitHub Pages serve esta pasta)
  index.html, css/, js/ (main.js, data.js, ui.js, charts/*.js)
  data/              # games.json, players.json, meta.json, insights.json
data/raw/            # CSVs brutos (fora do git)
```

## Como reproduzir

```bash
pip install -r requirements.txt
python pipeline/01_download.py   # se o Drive bloquear, baixe os CSVs manualmente para data/raw/
python pipeline/02_champions.py
python pipeline/03_build.py
python pipeline/04_insights.py
python -m http.server 8765 --directory docs   # abra http://localhost:8765
```

## Dados

- [Oracle's Elixir](https://oracleselixir.com/tools/downloads): partidas profissionais, 12 linhas por jogo (10 jogadores + 2 times).
- [Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon): nomes, classes e ícones dos campeões.

Decisões de tratamento: LTA Sul (2025) → CBLOL e LTA Norte (2025) → LCS; os playoffs cruzados da LTA são atribuídos à região de cada equipe. Partidas com cobertura parcial (LPL 2025) entram nas estatísticas de draft, mas não nas de ouro aos 15 min. O ano é o do calendário da partida.

*League of Legends* é marca da Riot Games, que não endossa este projeto.
