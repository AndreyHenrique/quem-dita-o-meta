# Roteiro do vídeo de checkpoint (≈ 5 min)

Slides: https://claude.ai/artifact/SjznusmU31jHTRkyqb1ubN (fontes em `slides/deck/`).
Site: https://andreyhenrique.github.io/quem-dita-o-meta/ (local: `python -m http.server 8765 --directory docs` → http://localhost:8765).

## Como gravar

1. Abra os slides em modo apresentação e o site numa segunda aba.
2. Grave a tela (Win + G na Xbox Game Bar, ou OBS) com o microfone.
3. No slide 5, troque para o site e faça a demonstração descrita abaixo (≈ 40 s); depois volte aos slides.
4. Divisão sugerida: Andrey fala os slides 1 a 5, Célio fala os slides 6 a 11.

### Demonstração ao vivo (slide 5)

1. Na barra de filtros: Liga = CBLOL, Comparar com = LCK.
2. Clique no Rumble na rede (ou digite em "Buscar campeão"): rede, dispersão, barras e linha se atualizam.
3. Clique em uma dupla nas barras (ex.: Alistar) para trocar a seleção.
4. Arraste na linha do tempo de patches para selecionar só 2026; mostre que tudo muda.
5. Troque o Lado para Azul e o Time para um time (ex.: LOUD).
6. Role até "Os jogadores": arraste no eixo "Δ ouro @15" e mostre a tabela filtrando; clique num jogador.

## Falas por slide

### 1. Quem dita o meta?

Olá! Somos Andrey e Célio, e este é o checkpoint do nosso projeto final: “Quem dita o meta?”. A ideia é usar os dados de todas as partidas profissionais de League of Legends de 2025 e 2026 para comparar o CBLOL, a liga brasileira, com as ligas mais fortes do mundo. Nos próximos cinco minutos vamos mostrar o que já está pronto: os dados tratados, o site interativo funcionando com dados reais e o que os dados responderam sobre as nossas hipóteses.

### 2. O problema: o Brasil joga o mesmo jogo?

O problema: a cobertura do cenário competitivo costuma parar em tabelas de classificação, e as perguntas que a comunidade discute quase nunca são respondidas com dados. Organizamos o projeto em três perspectivas: o meta, a partida e os jogadores. Cada uma tem uma hipótese. H1: o CBLOL copia o meta asiático com alguns patches de atraso. H2: no CBLOL há mais viradas. H3: a diferença para as ligas de topo está no início do jogo. E testamos também se o lado azul tem vantagem.

### 3. Os dados: Oracle’s Elixir, 2025 e 2026

Os dados vêm do Oracle’s Elixir, que publica um CSV por ano com todas as partidas profissionais: doze linhas por jogo, dez jogadores e dois times. Dos quase vinte mil jogos de 2025 e 2026, ficamos com 5.579 das seis ligas principais e dos internacionais: First Stand, MSI, Esports World Cup e Worlds. Na limpeza, mapeamos a LTA Sul de 2025 para o CBLOL e a LTA Norte para a LCS. Como a LPL de 2025 não tem os dados de ouro, ela entra só nas análises de draft.

### 4. A solução: cinco tipos de gráfico, coordenados

A solução segue o que a professora pediu: pelo menos três gráficos básicos e dois especiais, todos em D3. Os especiais são a rede de sinergia, porque duplas de campeões são um dado de rede e uma matriz com 167 campeões em cada eixo seria ilegível, e as coordenadas paralelas, que escolhemos no lugar do radar: o radar usa área e ângulo, canais menos precisos, e não dá para comparar dezenas de jogadores. Os básicos são dispersão, barras e linhas, que codificam taxas por posição. E tudo é coordenado: os filtros globais e a seleção de campeão atualizam todas as visões.

### 5. O site: a visão coordenada do meta

[Aqui entra a gravação de tela do site.] Esta é a primeira seção do site, o meta. Quando clico em um campeão, por exemplo o Rumble no CBLOL, a rede de sinergia destaca as duplas dele em dourado, a dispersão de pick por vitória marca os parceiros e as barras listam as duplas mais frequentes, mostrando se a dupla vence mais ou menos que o Rumble sozinho. Os filtros do topo, liga, liga de comparação, time, lado do mapa e o brush na linha do tempo de patches, atualizam todas as visões ao mesmo tempo.

### 6. H1 · O meta chega ~1 patch depois

O que os dados responderam. H1, parcialmente confirmada. Para cada campeão que passou de 30% de presença no draft, comparamos em que patch isso aconteceu no CBLOL e nas outras ligas. Em 61% dos casos o CBLOL chegou depois da LCK, e em 64% depois da LPL, com atraso mediano de um patch e diferença significativa. A similaridade do meta confirma: o CBLOL de hoje se parece mais com a LCK do patch anterior. Mas em relação à LEC e à LCS não existe atraso.

### 7. H2 · Mais viradas no CBLOL? Não.

H2 foi refutada. À esquerda, a probabilidade de vitória em função da vantagem de ouro aos 15 minutos: as curvas do CBLOL e da LCK praticamente se sobrepõem. À direita, a taxa de viradas, ou seja, quem estava atrás por 1.500 de ouro e venceu: 16% no CBLOL, 17% na LCK e 15% na LPL, sem diferença estatística. A liga com mais viradas é a europeia, com 22%. E um bônus: o lado azul vence 54% dos jogos, uma vantagem significativa que aparece em todas as ligas.

### 8. Os jogadores: coordenadas paralelas com brush

A terceira seção é a dos jogadores. Cada linha é um jogador da mesma posição, aqui os atiradores de 2026, com as estatísticas em percentis: KDA, participação em abates, dano, CS, visão e as diferenças aos 15 minutos. A linha branca é o jogador escolhido; o tracejado é a média da liga comparada. Arrastando sobre um eixo, o brush filtra os jogadores e a tabela ao lado se atualiza. Durante a análise percebemos um problema: as diferenças aos 15 minutos são medidas contra o adversário da mesma liga, então não servem para comparar regiões.

### 9. H3 · A diferença começa cedo

Por isso reformulamos o teste da H3: usamos só os torneios internacionais, onde o brasileiro enfrenta diretamente o coreano ou o chinês. Resultado: contra LCK e LPL, os jogadores dos times do CBLOL chegam aos 15 minutos com quase 600 de ouro a menos, em todas as posições, e não venceram nenhum dos 14 jogos. O dano também é menor, mas isso é efeito de estar perdendo, então consideramos a hipótese confirmada com ressalvas, e a amostra é pequena.

### 10. O que mudou desde a proposta

Algumas decisões mudaram em relação à proposta. Incluímos LCS, LCP e a Esports World Cup, que trazem mais confrontos entre regiões. Em vez de descartar os jogos incompletos da LPL, eles entram nas análises de draft. A H3 passou a ser medida só nos internacionais. O lado azul ganhou pontos com intervalo de confiança, porque o eixo não começa em zero. A presença por patch usa média móvel. E a rede ganhou os ícones dos campeões.

### 11. Onde estamos e o que falta até 01/12

Para fechar, o resumo: H1 parcialmente confirmada, o CBLOL segue a Ásia com cerca de um patch de atraso; H2 refutada, não há mais viradas no CBLOL; o lado azul tem vantagem real; e a H3 se confirma com ressalvas nos internacionais. O cronograma está em dia: dados, hipóteses e todas as visualizações coordenadas já estão prontos, e o site já está publicado no GitHub Pages. Nesta semana fazemos a narrativa guiada, a estética, a versão para celular e testes com colegas; no dia 1º entregamos, e no dia 2 apresentamos. Obrigado!
