---
title: "valorant-short-maker: o pipeline que gera os meus shorts de Valorant sozinho"
description: "Groq/Llama para o guião, Piper para as vozes, FFmpeg para o resto. Como um cron job produz e publica um vídeo por dia no @valorant_agents, de A a Z."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
---

# valorant-short-maker: o pipeline que gera os meus shorts de Valorant sozinho

Há uns meses, um canal do YouTube funciona sem que eu lhe toque: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). Agentes do Valorant a picarem-se entre rondas, com dobragem, legendas karaoke, publicados como Shorts. Tudo é gerado pelo [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker), um pipeline TypeScript/Bun que corre em cron e publica sem que ninguém tenha de clicar em nada.

Aqui está como funciona, passo a passo.

## O resultado

Três frames tirados do vídeo gerado para "Duelist Debate" (Phoenix, Yoru e Jett):

![Intro de um short, círculo do agente com o título da cena](/images/valorant-short-maker/vsm-01-intro.png)

![Uma fala em andamento, legenda karaoke a iluminar-se](/images/valorant-short-maker/vsm-02-dialogue.png)

![Outra fala, a cor da legenda muda conforme o agente que fala](/images/valorant-short-maker/vsm-03-dialogue.png)

O resultado ao vivo neste Short: [Duelist Debate — youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). No canal, os Shorts andam pelas 1,2 a 1,5k visualizações. Nada de extraordinário, mas é um canal que anda sozinho desde o início, por isso o número que realmente importa é zero — zero minutos gastos nele desde que o cron foi lançado.

## O pipeline, por ordem

### 1. Escrever o guião — Groq + Llama 3.3

Cada execução escolhe 3 a 4 agentes aleatoriamente entre os 26 disponíveis, e envia ao Llama 3.3 70B (via Groq) um prompt de sistema que contém, para cada agente escolhido, um resumo compacto da sua personalidade e das suas relações com os outros agentes presentes na cena (estas personas vivem em `src/lore/`, um ficheiro por agente). O prompt impõe regras rigorosas: uma frase curta e impactante por fala, rotação justa entre personagens, humor em primeiro lugar, e sobretudo pausas.

Exemplo concreto com "Duelist Debate" — Phoenix, Yoru e Jett discutem sobre quem vai de duelista, gerado a 6 de julho de 2026:

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

As pausas são o detalhe que torna o ritmo natural: um `[0.3]` metido no meio de uma fala cria um silêncio de 0,3s no áudio sem cortar o círculo do agente no ecrã, enquanto uma linha `pause: 1.0` completa cria um verdadeiro silêncio entre dois interlocutores, círculo escondido. Sem isto, um TTS a debitar falas sem respirar soa robótico.

### 2. Dar voz — Piper, um modelo por agente

Cada agente tem o seu próprio modelo Piper (`.onnx`) treinado especificamente, guardado em `voices/<agent>/`. O texto gerado passa pelo modelo correspondente, que cospe um WAV. É a mesma tecnologia que uso para o treino de vozes custom em geral (ver o artigo sobre o pipeline Piper/Kaggle) — aqui aplicada diretamente em produção, on-the-fly, em cada geração de vídeo.

### 3. Legendas karaoke — ASS gerado, cor extraída do ícone

As legendas não são um simples `.srt`. É um ficheiro `.ass` (Advanced SubStation Alpha) gerado palavra a palavra, com efeito karaoke: cada palavra acende-se numa cor à medida que é pronunciada, enquanto o resto do texto fica numa cor neutra. A cor de destaque não é fixa — é extraída dinamicamente do ícone do agente que fala (um script Python corre o PIL sobre o PNG do ícone, amostra os pixels não transparentes e devolve as cores dominantes). Resultado: a legenda da Killjoy acende-se a roxo, a da Jett a azul-petróleo, sem que nenhuma cor tenha sido hardcoded em lado nenhum.

### 4. O círculo audio-reativo — uma expressão FFmpeg por frame

Esta é a parte mais retorcida do pipeline, e provavelmente aquela de que mais me orgulho. O ícone redondo do agente que fala não fica quieto: faz um ligeiro zoom ao ritmo da sua própria voz.

O cálculo lê o WAV bruto da fala, calcula o envelope RMS (root mean square, uma medida da energia do sinal) frame a frame a 60 fps, normaliza pelo máximo e suaviza numa janela de 3 frames para evitar solavancos. Cada valor do envelope é depois convertido num fator de escala limitado por `MAX_ZOOM_VARIATION` (0,2, ou seja ±20% em torno do tamanho base).

O resultado deste cálculo não é aplicado por código que manipula pixels — é traduzido numa enorme expressão condicional FFmpeg (`lt(n,K)*val + between(n,K,K')*val + ...`, um ramo por grupo de frames) que controla diretamente o parâmetro `scale` do filtro de vídeo. O FFmpeg avalia esta expressão a cada frame do render. Para uma fala de alguns segundos a 60 fps, são rapidamente centenas de ramos numa única expressão — daí o parâmetro `STEP` que agrupa os frames para limitar a profundidade.

### 5. Render por segmento, depois fisheye na intro

Cada fala é renderizada individualmente: fundo de vídeo (um clip de gameplay aleatório de `bg-video/`, cortado à duração certa), o círculo do agente por cima com o zoom audio-reativo, legendas incrustadas via o filtro `ass` do FFmpeg, áudio TTS misturado com o som do gameplay de fundo.

O primeiríssimo segmento recebe um tratamento especial: uma distorção fisheye que se dissipa gradualmente nos primeiros 20% dos frames (filtro `lenscorrection` avaliado frame a frame, mais um `tmix=frames=3` que mistura frames adjacentes para simular motion blur), sincronizado com um som de "whoosh". É a transição de intro que dá a sensação de que a câmara "entra" na cena.

### 6. Concatenação e mistura final

Todos os segmentos são concatenados de ponta a ponta, a música de fundo (Sneaky Snitch, Kevin MacLeod, licença Creative Commons) é misturada por cima com **audio ducking** — uma compressão sidechain que baixa automaticamente o volume da música enquanto um agente fala, e volta a subir durante os silêncios. Tudo corre a 60 fps do início ao fim, sem conversão de framerate entre etapas.

### 7. Publicação automática

O script `run-cron.sh`, lançado por um cron normal, ativa o ambiente Python, carrega o `.env` e executa `bun src/workflow.ts --upload`. A flag `--upload` dispara também a geração de metadados (título, descrição, tags) e chama `uploaders/upload.py`, que publica o vídeo no YouTube e Instagram através de dois scripts separados (`uploaders/youtube/upload.py` e `uploaders/instagram/`). Toda a cadeia, do prompt LLM ao vídeo online, corre sem intervenção humana.

## Porquê TypeScript/Bun em vez de tudo Python

A escolha não é ideológica — é que o Bun dá acesso direto e rápido ao `Bun.spawn` para pilotar o FFmpeg como subprocesso, tipagem forte nas estruturas de dados do pipeline (`Phrase`, `SegmentInfo`), e um runtime bem mais rápido a arrancar que o Node para um script que corre em cron de X em X horas. Os únicos dois bocadinhos de Python no projeto estão onde Python é realmente a melhor ferramenta: PIL para extração de cores, e as APIs de upload (`google-api-python-client` para YouTube, o stack Instagram Graph API para IG).

## O que isto ilustra

Este projeto é um bom exemplo do que se pode construir hoje com blocos totalmente gratuitos ou open source: um LLM rápido e grátis via a API Groq, um motor TTS local que corre sem GPU dedicada, FFmpeg para toda a renderização de vídeo — e a cola são apenas umas centenas de linhas de TypeScript. Nenhum destes blocos é novo individualmente. O que faz o pipeline é a organização: gerar um guião coerente com relações reais entre personagens, transformá-lo em áudio expressivo com pausas naturais, sincronizar uma renderização visual com a energia desse áudio frame a frame, e automatizar toda a cadeia até à publicação.

---

**Recursos**

- **Repo**: [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **Canal**: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 pontos-chave**

1. O guião é gerado por um LLM (Groq/Llama 3.3) com personas e relações por agente, não uma simples lista de piadas pré-escritas.
2. O zoom do círculo do agente é controlado por uma expressão FFmpeg calculada frame a frame a partir do envelope RMS do WAV — nada de animação por keyframes clássica.
3. Toda a cadeia, do prompt ao post no YouTube/Instagram, corre através de um único cron job sem qualquer intervenção humana.
