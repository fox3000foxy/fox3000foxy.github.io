---
title: "valorant-short-maker : o pipeline que gera meus shorts de Valorant sozinho"
description: "Groq/Llama para o roteiro, Piper para as vozes, FFmpeg para todo o resto. Como um cron job produz e publica um vídeo por dia no @valorant_agents, de A a Z."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "F6yb3BUl3vsirv8OYtggqu2O+2DMkdtdrf8LMsPnkdsgx/DvaYneoNyV9JfQeHwepsAF8X+Om9ojZZY5V+pHJw=="
---

# valorant-short-maker : o pipeline que gera meus shorts de Valorant sozinho

Há alguns meses, um canal do YouTube roda sem eu tocar nele : [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). Agentes de Valorant se provocando entre dois rounds, dublados, legendados em karaokê, publicados como Shorts. Tudo é gerado pelo [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker), um pipeline TypeScript/Bun que roda em cron e publica sem ninguém precisar clicar em nada.

Veja como funciona, passo a passo.

## O resultado

Três frames extraídos do vídeo gerado para "Duelist Debate" (Phoenix, Yoru e Jett) :

![Intro de um short, círculo de agente com o título da cena](/images/valorant-short-maker/vsm-01-intro.png)

![Uma fala em andamento, legenda karaokê que se ilumina](/images/valorant-short-maker/vsm-02-dialogue.png)

![Outra fala, a cor da legenda muda conforme o agente](/images/valorant-short-maker/vsm-03-dialogue.png)

O resultado ao vivo neste Short : [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). No canal, os Shorts giram em torno de 1,2 a 1,5k visualizações. Nada enorme, mas é um canal que roda sozinho desde o início, então o número que realmente conta é zero, zero minuto gasto nele depois que o cron foi lançado.

## O pipeline, em ordem

### 1. Escrever o roteiro -- Groq + Llama 3.3

Cada run sorteia 3 a 4 agentes aleatórios entre os 26 disponíveis, e envia ao Llama 3.3 70B (via Groq) um prompt de sistema que contém, para cada agente escolhido, um resumo compacto da personalidade dele e das relações dele com os outros agentes presentes na cena (essas personas vivem em `src/lore/`, um arquivo por agente). O prompt impõe regras precisas : uma frase curta e impactante por fala, rotação justa entre os personagens, humor em prioridade, e principalmente pausas.

Exemplo concreto com "Duelist Debate", Phoenix, Yoru e Jett discutindo quem vai jogar de duelist, gerado em 6 de julho de 2026 :

```
phoenix: I'm telling you, I've got the skills to play duelist this match.
yoru: Skills, you call burning things skills, Phoenix.
jett: I'm the fastest one here, I should play duelist.
phoenix: Fastest, but can you handle the heat, Jett [0.3] I doubt it.
yoru: Heat, ha, you think your flames are hotter than my rifts.
jett: This isn't about heat or flames, it's about speed and agility.
phoenix: Oh, I see, so now you're an expert on duelists, Yoru [0.3] that's rich.
yoru: At least I don't rely on cheap fire tricks.
jett: Cheap fire tricks, that's what you call Phoenix's abilities.
phoenix: Hey, my fire tricks have gotten us out of tight spots before [0.3] can't say the same for your rifts, Yoru.
yoru: Tight spots, you mean like the time I rifted us out of that trap.
jett: Enough, this is getting nowhere, let's just decide already.
phoenix: Fine, but I'm still saying I'm the best duelist here.
yoru: Please, you think you can take on the enemy team alone [0.3] I doubt it.
jett: I can take them on, no problem, I'm the fastest.
phoenix: Fastest, yeah, but can you outmaneuver them [0.3] that's the question.
yoru: Outmaneuver, ha, you think you can outmaneuver anyone, Phoenix.
jett: This is stupid, we're not going to agree on this.
phoenix: Fine, let's just play and see who comes out on top [0.3] I'm game if you are.
yoru: Bring it on, I'll show you what a real duelist looks like.
jett: I'm not backing down, I'm playing duelist.
phoenix: Oh, this should be good [0.3] let's see how you two do.
yoru: We'll see who comes out on top, won't we, Jett.
jett: Yeah, let's end this debate once and for all.
pause: 0.3
phoenix: Alright, let's get started then [0.3] may the best duelist win.
yoru: I'll make sure to burn you, Phoenix, not with fire, but with my rifts.
jett: I'll take you both down, no problem.
```

As pausas são o detalhe que deixa o ritmo natural : `[0.3]` inserido no meio de uma fala cria um silêncio de 0.3s no arquivo de áudio sem cortar o círculo do agente na tela, enquanto uma linha `pause: 1.0` inteira cria um silêncio real entre dois locutores, círculo escondido. Sem isso, um TTS que encadeia falas sem respirar soa robótico.

### 2. Dar uma voz -- Piper, um modelo por agente

Cada agente tem seu próprio modelo Piper (`.onnx`) treinado especificamente, guardado em `voices/<agent>/`. O texto gerado passa pelo modelo correspondente, o que produz um WAV. É a mesma tecnologia que uso para o treinamento de vozes custom em geral (ver o artigo sobre o pipeline Piper/Kaggle), aqui aplicada direto em prod, em tempo real, a cada geração de vídeo.

### 3. Legendas karaokê -- ASS gerado, cor extraída do ícone

A legendagem não é um simples `.srt`. É um arquivo `.ass` (Advanced SubStation Alpha) gerado palavra por palavra, com efeito karaokê : cada palavra se ilumina em uma cor à medida que é pronunciada, enquanto o resto do texto fica em uma cor neutra. A cor de destaque não é fixa, ela é extraída dinamicamente do ícone do agente que fala (um script Python roda PIL sobre o PNG do ícone, amostra os pixels não transparentes, e devolve as cores dominantes). Resultado : a legenda da Killjoy se ilumina em roxo, a da Jett em azul esverdeado, sem nenhuma cor ter sido fixada no código em lugar algum.

### 4. O círculo audiorreativo -- uma expressão FFmpeg por frame

É a parte mais estranha do pipeline, e provavelmente a de que mais me orgulho. O ícone redondo do agente que fala não fica estático : ele dá zoom in e out suave no ritmo da própria voz dele.

O cálculo é feito lendo o WAV bruto da fala, calculando o envelope RMS (root mean square, uma medida da energia do sinal) frame por frame a 60 fps, normalizando pelo máximo, e depois suavizando em uma janela de 3 frames para evitar solavancos. Cada valor de envelope é então convertido em um fator de escala limitado por `MAX_ZOOM_VARIATION` (0.2, ou seja ±20% em torno do tamanho base).

O resultado desse cálculo não é aplicado via código que manipula pixels, é traduzido em uma imensa expressão condicional FFmpeg (`lt(n,K)*val + between(n,K,K')*val + ...`, uma ramificação por grupo de frames) que controla diretamente o parâmetro `scale` do filtro de vídeo. O FFmpeg avalia essa expressão a cada frame da renderização. Para uma fala de alguns segundos a 60 fps, isso dá rápido centenas de ramificações em uma única expressão, daí o parâmetro `STEP` que agrupa os frames para limitar a profundidade.

### 5. Render por segmento, depois fisheye na intro

Cada fala é renderizada individualmente : vídeo de fundo (trecho aleatório de um dos clipes de gameplay em `bg-video/`, cortado na duração certa), círculo do agente por cima com o zoom audiorreativo, legendas embutidas via filtro `ass` do FFmpeg, áudio TTS mixado com o som do gameplay de fundo.

O primeiríssimo segmento recebe um tratamento especial : uma distorção fisheye que se dissipa progressivamente nos primeiros 20% dos frames (filtro `lenscorrection` avaliado frame por frame, mais um `tmix=frames=3` que mistura frames adjacentes para simular motion blur), sincronizada com um som de "whoosh". É a transição de intro que dá a impressão de que a câmera "entra" na cena.

### 6. Concatenação e mixagem final

Todos os segmentos são concatenados um após o outro, a música de fundo (Sneaky Snitch, Kevin MacLeod, licença Creative Commons) é mixada por cima com **ducking de áudio**, uma compressão sidechain que baixa automaticamente o volume da música enquanto um agente fala, e que sobe de novo nos silêncios. Tudo roda em 60 fps do início ao fim, sem nenhuma conversão de framerate entre as etapas.

### 7. Publicação automática

O script `run-cron.sh`, lançado por um cron clássico, ativa o ambiente Python, carrega o `.env`, e lança `bun src/workflow.ts --upload`. A flag `--upload` dispara ainda a geração de metadados (título, descrição, tags) e chama `uploaders/upload.py`, que publica o vídeo no YouTube e no Instagram via dois scripts separados (`uploaders/youtube/upload.py` e `uploaders/instagram/`). Toda a cadeia, do prompt do LLM ao vídeo online, roda sem intervenção humana.

## Por que TypeScript/Bun em vez de algo todo em Python

A escolha não é ideológica, é que o Bun dá acesso direto e rápido ao `Bun.spawn` para controlar o FFmpeg em subprocesso, uma tipagem forte sobre as estruturas de dados do pipeline (`Phrase`, `SegmentInfo`), e um runtime bem mais rápido na inicialização do que o Node para um script que roda em cron a cada X horas. Os dois únicos trechos de Python no projeto estão onde Python é realmente a melhor ferramenta : PIL para extração de cores, e as APIs de upload (`google-api-python-client` para o YouTube, a stack da Instagram Graph API para o IG).

## O que isso ilustra

Este projeto é um bom exemplo do que dá para construir hoje com peças inteiramente gratuitas ou open source : um LLM rápido e gratuito via API Groq, um motor TTS local que roda sem GPU dedicada, FFmpeg para toda a renderização de vídeo, e a cola, que são só algumas centenas de linhas de TypeScript. Nenhuma dessas peças é nova individualmente. O que faz o pipeline é o arranjo : gerar um roteiro coerente com relações reais entre personagens, transformá-lo em áudio expressivo com pausas naturais, sincronizar uma renderização visual sobre a energia desse áudio frame por frame, e automatizar toda a cadeia até a publicação.

---

**Recursos**

- **Repo** : [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **Canal** : [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 pontos principais**

1. O roteiro é gerado por um LLM (Groq/Llama 3.3) com personas e relações por agente, não uma simples lista de piadas pré-escritas.
2. O zoom do círculo do agente é controlado por uma expressão FFmpeg calculada frame por frame a partir do envelope RMS do WAV, sem animação clássica por keyframes.
3. Toda a cadeia, do prompt ao post no YouTube/Instagram, roda via um único cron job sem intervenção humana.
