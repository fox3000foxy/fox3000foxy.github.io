---
title: "PiperHub : 536 vozes TTS open source, 7 emoções em um modelo, zero GPU, zero fatura"
description: "VITS, espeak, ONNX, LJSpeech : como o Piper faz um Raspberry Pi falar. Fortune multi em 7 emoções, Kokoro 82M, PocketTTS, sanoTTS, ElevenLabs -- e pipertts nativo 10x mais rápido que o wrapper Python."
date: 2026-11-12
tags:
  - tts
  - piper
  - open-source
  - typescript
  - ai
  - catalogue
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "JTPjEmFBP1a6Is+BD+Mq7WauViJNtiGzx002kmFmIzj4h46iSJxyxB0TPChojgrq8RiQNhRXlpjXZCBtULNW0A=="
---

## Introduction

Fazer um bot do Discord falar custa caro. Não o texto : um LLM local gera frases por alguns centavos de GPU. A voz, essa, se paga a cada frase. As APIs de síntese cobram por caractere, e quando o bot fala a noite inteira, a fatura acompanha.

Foi o problema que eu tive com o Luna Protocol. Meu bot do Discord gera as mensagens com um LLM local, depois manda uma voz Piper ler em voz alta, converte para OGG e envia como mensagem de voz. Tudo no meu próprio servidor, por 0 euro por frase, mesmo às 3h da manhã quando a Luna decide contar a vida dela sozinha.

Ficar no 0 euro significa achar vozes gratuitas e hospedar você mesmo. E foi aí que complicou : modelos espalhados por dezenas de repositórios no Hugging Face, licenças vagas, nenhum jeito de saber de onde vem tal voz nem se ela ainda funciona. Então eu construí o [PiperHub](https://piperhub.org/), um catálogo open source de vozes para Piper TTS.

Os números de hoje : **536 modelos** exibidos, **71 idiomas** representados, **3755 speakers** listados. Cada modelo é ligado ao seu dataset de origem quando a gente conhece -- a proveniência faz parte do som, como diz a homepage.

Resta uma pergunta que me fazem direto : o que o Piper vale contra Kokoro, PocketTTS, sanoTTS e ElevenLabs ? E por que o módulo `pipertts` da Fortune é 10x mais rápido que o wrapper Python oficial ? Este artigo abre os motores, com o código para provar.

## PiperHub, le catalogue

Antes de abrir os motores, vamos ver o problema que o PiperHub resolve.

### D'où viennent les voix

O código está em [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank). Astro, site estático, zero servidor : o inglês na raiz, 15 outros locales em `/<code>/` (fr, de, es, it, pt, ru, tr, ja, ko, zh, id, hi, ar, vi, th). Mesmo esquema do meu blog, na prática.

A fonte da verdade, ninguém edita na mão. É um pipeline :

```bash
npm install
npm run data    # regenera src/data/*.json (python3 scripts/generate_data.py)
npx astro dev   # dev local
npm run build   # build estático em dist/
```

Na prática : um repo crawler mantém `models_mapping.csv` e `datasets_mapping.csv`, as vozes espelhadas vivem no Hugging Face, os samples são arquivos de áudio. `npm run data` puxa tudo isso e cospe `src/data/*.json`. O site só lê JSON estático.

Nos dados brutos do momento (555 entradas, o site mostra 536 -- o crawl está sempre um pouco na frente da exibição) :

| Qualité | Modèles |
|---|---|
| medium | 437 |
| high | 67 |
| low | 50 |

| Sample rate | Modèles |
|---|---|
| 22050 Hz | 486 |
| 16000 Hz | 47 |

486 vozes em 22050 Hz, o padrão Piper. 47 em 16000 Hz, as vozinhas rápidas para embarcados. O phonemizer é `espeak` em 509 casos -- já já volto nisso, é o coração do sistema.

### La provenance, ou pourquoi chaque modèle a un dataset

O que faz o PiperHub ser útil em vez de só uma lista é a ligação modelo <-> dataset. Exemplo tirado da home : a voz **Astra - Valorant Piper TTS** é ligada ao dataset **Astra - LJSpeech Dataset**. Você abre as duas páginas, confere os repos e as licenças de cada lado.

130 datasets referenciados. E o catálogo é honesto sobre o estado das tropas : 25 modelos estão marcados `usable: false` (arquivos quebrados, ou formato `piperPlus` que pede um runtime fork). O módulo `pipertts` recusa essas vozes com um erro explícito em vez de quebrar de um jeito estranho mais tarde. 48 modelos são multi-speaker -- incluindo os dois que vão interessar a gente.

No lado dos guias, o site faz o trabalho em três passos : **Build a dataset**, **Train a voice**, **Use a voice**, mais uma página Piper Plus. Dataset no formato LJSpeech na entrada, ONNX na saída. Fácil de falar, longo de fazer -- daí a próxima seção.

## Piper sous le capot : VITS, espeak, ONNX

### Une phrase, trois étapes

Quando você pede para o Piper dizer "bonjour", acontece isso :

```
"bonjour"
  -> [phonémisation espeak-ng] -> b O~ Z u R
  -> [encodeur VITS + flow + décodeur] -> waveform 22050 Hz
```

Zero vocoder separado. Isso é o VITS : um modelo end-to-end que vai do texto (fonemizado) ao waveform direto. Onde os pipelines antigos faziam texto -> espectrograma (Tacotron) e depois espectrograma -> áudio (HiFi-GAN, dois modelos, dois treinamentos), o VITS aprende tudo de uma vez com um VAE condicional, flows normalizantes e um discriminador estilo GAN no decodificador. Um só treinamento, um só modelo, um só export ONNX.

O decodificador cospe 22050 Hz direto. Nesse sample rate, um segundo de fala = 22050 números. O modelo é pequeno (algumas dezenas de MB em qualidade medium) e a inferência é CPU pura : multiplicações de matrizes num grafo ONNX otimizado. Daí o Raspberry Pi como alvo oficial -- o Piper nasceu no Rhasspy, um assistente de voz open source feito para rodar em Pi.

### espeak-ng, le phonémiseur qui fait tout le sale boulot

Antes do VITS, tem que transformar texto em fonemas. 509 modelos em 555 usam `espeak` :

```bash
echo "bonjour" | espeak-ng --ipa -v fr
# bO~'ZuR
```

O espeak-ng conhece a pronúncia de dezenas de idiomas. O modelo VITS nunca aprende a ortografia francesa com aqueles `eau` que se pronunciam `o` -- ele aprende de fonemas para som. Isso simplifica demais o treinamento e explica por que o Piper cobre 71 idiomas : para um idioma novo, você liga a voz espeak correspondente e treina.

As que dispensam o espeak têm seu próprio fonemizador, e é aí que fica exótico : `hebrew` (Nakdimon ONNX + 494 linhas de regras IPA), `pinyin` (BERT g2pW completo com desambiguação de polifones -- o mesmo caractere chinês se pronuncia diferente conforme a palavra), `thai` (TLTK de verdade, não modificado), `japanese` (segmentação lindera + UniDic). O módulo `pipertts` traz os sete, verificados idênticos à referência Python. Já volto nisso.

### Le dataset : du LJSpeech, toujours du LJSpeech

O formato padrão de treinamento é o LJSpeech : uma pasta `wavs/` cheia de clips, mais um `metadata.csv` :

```
LJ001-0001|Printing, in the only sense with which we are at present concerned...|printing in the only sense...
LJ001-0002|in being comparatively modern...|in being comparatively modern...
```

`fileid|transcription|normalized`, um clip = uma frase, alguns segundos. O dataset original são 13.000 frases em inglês lidas por uma única locutora, domínio público. Para treinar uma voz em português, você grava a mesma estrutura em português : texto + áudio alinhados, algumas horas bastam para um medium decente, mais para um high.

As três qualidades do catálogo correspondem grosso modo ao tamanho do modelo + a duração do treinamento. Low : pequeno, rápido, robótico. Medium : o ponto ideal, com 437 modelos. High : maior, mais lento, mais natural -- 67 modelos, incluindo os Fortune.

### Les trois boutons magiques

Cada voz Piper expõe três parâmetros de inferência, com defaults quase universais :

```json
"inference": { "noise_scale": 0.667, "length_scale": 1, "noise_w": 0.8 }
```

- `noise_scale` (0.667) : variabilidade da voz. Mais alto = mais expressivo, mais baixo = mais estável. A saída é estocástica : duas sínteses da mesma frase dão dois áudios um pouco diferentes.
- `noise_w` (0.8) : variabilidade do timing, o ritmo.
- `length_scale` (1.0) : velocidade. Acima de 1 desacelera, abaixo acelera. O jeito mais simples de fazer a Luna falar mais rápido quando ela se irrita.

Guarda o `noise_scale`, ele vai servir para as emoções.

## Fortune multi : 7 émotions, 1 seul ONNX

Bom, vamos para a estrela local.

O catálogo lista três modelos Fortune treinados pela ItsRealFortune (oi) :

| Modèle | Repo | Voix |
|---|---|---|
| ItsRealFortune - French (FR) High | `fox3000foxy/piper-fortune-v6` | 1 (voice-0) |
| ItsRealFortune - French (FR) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-fr-multi` | **7** |
| ItsRealFortune - English (EN) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-en-multi` | **7** |

O multi FR é isso :

```
normal, joyeuse, storytelling, colere, triste, surprise, interrogative
```

Sete variações emocionais em **um só arquivo ONNX**. O multi EN igual, com um typo histórico nos nomes : `suprised` em vez de `surprised`. Está nos pesos, a gente mantém, faz parte do folclore.

### Comment ça marche, un speakerId ?

VITS multi-speaker é o mesmo modelo com uma entrada a mais : um embedding de speaker. No treinamento, cada clip é marcado com seu estilo, o modelo aprende uma tabela de embeddings (uma por estilo) junto com o resto. Na inferência, você escolhe a linha da tabela :

```ts
import { PiperNativeTTS } from "pipertts";

const tts = await PiperNativeTTS.load({
  model: "hub:itsrealfortune-french-fr-multi-high",
  modelsDir: "./models",
});

const styles = [
  "normal", "joyeuse", "storytelling",
  "colere", "triste", "surprise", "interrogative",
];

for (let i = 0; i < styles.length; i++) {
  const r = await tts.synthesize("Quelle merveilleuse nouvelle !", {
    speakerId: i,           // 0 = normal ... 5 = surpresa
    outputFile: `./fortune-${styles[i]}.wav`,
  });
}
```

Mesma frase, sete leituras. `speakerId: 5` (surpresa) com um `noise_scale` um pouco alto, e você tem uma exclamação convincente. `speakerId: 4` (triste), `length_scale: 1.1` para desacelerar, e você tem um anúncio fúnebre. É assim que a Luna modula a voz : o cérebro escolhe a emoção (valência/arousal, cf. meu artigo sobre centroides), o TTS escolhe o speakerId.

O dataset por trás se chama sobriamente **Fortune French - Dataset**, com uma licença chamada "Fortune's Café". Sim, a licença se chama como um café. Não, ela fica.

### Pourquoi c'est malin économiquement

Sete emoções = um só download, um só carregamento em RAM, uma só sessão ONNX. A alternativa (sete modelos separados) multiplicaria o armazenamento e forçaria recarregar o grafo a cada troca de emoção -- injogável para um bot que muda de tom no meio da frase. Aí o `speakerId` é só um índice num tensor. Custo marginal : zero.

## Les concurrents : Kokoro, PocketTTS, sanoTTS

O Piper divide a CPU com três desafiantes sérios, três filosofias diferentes.

### Kokoro 82M, le roi qualité/prix

[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), pelo hexgrad. 82 milhões de parâmetros, arquitetura StyleTTS 2 modificada com decodificador ISTFTNet, **sem etapa de difusão**. É a ausência de difusão que faz tudo : nenhum loop iterativo de denoising, então inferência ultra rápida.

| | Kokoro-82M |
|---|---|
| Params | 82M |
| Poids | ~300 Mo (164 Mo en FP16) |
| Licence | Apache 2.0 (commercial OK) |
| Langues | 8, 54 voix preset + blending |
| CPU | quasi temps réel |
| GPU | 36 à 96x temps réel |
| Tests aveugles | au niveau de Google et Amazon |

Treinado com menos de 100h de áudio por uns 1000 dólares, e os ouvintes cegos classificam ele no nível das vozes premium do Google e da Amazon. Foi por isso que explodiu : qualidade premium, grátis, local, permissivo.

Contra o Piper : o Kokoro ganha na naturalidade pura (StyleTTS 2 > VITS pequeno) e na licença (Apache 2.0 contra motor em GPL-3.0 no Piper). O Piper ganha na cobertura (71 idiomas contra 8, 3755 speakers contra 54 vozes) e no ecossistema de vozes da comunidade. Para narração em inglês, o Kokoro é duro de bater. Para francês com 7 emoções, turco ou suaíli, o Piper muitas vezes é o único na disputa.

### PocketTTS (Kyutai), le clonage sur CPU

A [Kyutai](https://kyutai.org/tts/) joga outra partida : modelo pequeno **com clonagem de voz**, que roda em CPU.

| Modèle | Params | WER | UTMOS | SIM | Vitesse CPU (1 thread) |
|---|---|---|---|---|---|
| Pocket TTS | ~100M | 0.92% | 4.364 | 0.923 | 2.8x temps réel |
| Pocket TTS small | 1.9M / 6.9M / 18.2M | - | - | - | CPU, clonage inclus |

WER abaixo de 1% (pronuncia certo), UTMOS 4.36 (qualidade percebida excelente), SIM 0.923 (o clone parece mesmo com o alvo). E as versões small descem a **1.9M parâmetros** com clonagem. 1.9M. Meu roteador Sabaki tem quase esse tamanho em JSON.

Contra o Piper : o PocketTTS ganha na clonagem (o Piper lê com vozes fixas) e na compactação do flagship. O Piper ganha nos idiomas (o small por enquanto é só inglês) e na maturidade do ecossistema (536 vozes prontas contra "treine a sua").

### sanoTTS, le modèle qui tient sur une puce à 3 dollars

O [sanoTTS](https://github.com/ampixa/sanoTTS) (`sano` = "pequeno" em nepalês), é o Bareiron do TTS : um stack neural completo que vai dos fonemas ao PCM 22.05 kHz **em microcontrolador**.

| Système | Params | SCOREQ | UTMOS | DNS-SIG |
|---|---|---|---|---|
| sanoTTS (heart-nano) | 0.29M | 2.29 | 2.45 | 3.35 |
| TinyTTS | 1.62M | 3.94 | 3.65 | 3.62 |

0.29M parâmetros. 2 MB a voz. `pip install sanotts`, `sanotts say "Hello" --voice amy`, e fala. No navegador também.

Mas olha as notas : SCOREQ 2.29 contra 3.94 do TinyTTS, UTMOS 2.45. Fala, sim. Canta, não. É o tradeoff final : com 0.29M você cabe em todo lugar mas a qualidade acompanha o tamanho. O Piper medium tem 100x mais peso para uma voz de outra liga.

### Le tableau qui résume

| | Piper | Kokoro 82M | PocketTTS | sanoTTS |
|---|---|---|---|---|
| Params typiques | ~10-60M | 82M | ~100M / 2-18M | 0.3-1.4M |
| Langues | 71 | 8 | EN (+ smalls EN) | multilingue, petit |
| Voix dispos | 3755 speakers | 54 + blending | clonage (la tienne) | quelques voix |
| Clonage | non | non (natif) | **oui, CPU** | non |
| Licence moteur | GPL-3.0 | Apache 2.0 | open (Kyutai) | open |
| Entraînable maison | oui (LJSpeech) | oui (plus lourd) | oui | oui |
| Qualité FR | bonne (multi émotions) | correcte (EN-first) | EN-only | faible |

A escolha depende da sua restrição, não tem vencedor absoluto : qualidade EN pura -> Kokoro. Clonagem em CPU -> PocketTTS. Microcontrolador -> sanoTTS. Cobertura de idiomas + vozes francesas emocionais + zero infra -> Piper.

## ElevenLabs, le Goliath facturé

E aí tem a ElevenLabs. 70+ idiomas, Eleven v3 expressivo com audio tags e diálogos dramáticos, qualidade topo nos blind tests. O Jev do TTS, de certo modo : todo mundo já viu passar, todo mundo já fez benchmark contra.

O pricing 2026, em números redondos :

| Modèle API | Prix / 1000 caractères |
|---|---|
| Flash / Turbo, v3 Conversational | $0.05 |
| Multilingual v2, Eleven v3 | $0.10 |

1000 caracteres dão uns 1 minuto de áudio. Então de $0.05 a $0.10 o minuto. O plano Pro a $99 inclui uns 990k caracteres, o overage bate na mesma tarifa. Para um canal do YouTube que solta um vídeo por dia com narração (meu `valorant-short-maker` faz exatamente isso, mas com Piper grátis), conta de $1.50 a $3 por mês para cada minuto diário de narração. Dez minutos por dia : $15 a $30/mês. Dá para pagar, mas dá para contar.

Quando vale a pena : quando a voz **é** o produto (dublagem, audiobook, pub), quando precisa de 70 idiomas para amanhã de manhã, quando a clonagem tem que ser perfeita de primeira. Por outro lado nunca vale a pena para : bot do Discord que fala a noite inteira, notificações internas, dev, volumes que explodem. A Luna contando a vida dela às 3h da manhã em ElevenLabs é minha conta de luz chorando.

A conta é simples : Piper = 0 euro marginal, qualidade "boa". ElevenLabs = contador girando, qualidade "excelente". Entre os dois tem um mundo onde "boa e grátis" ganha -- é toda a aposta do PiperHub.

## pipertts : pourquoi le natif met 10x au wrapper Python

O repo [itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts), 75 commits : um port nativo do Piper em TypeScript. Título do README : "In-process Piper TTS for Node.js. No Python required."

### Le coût du spawn

O wrapper histórico (`PiperTTS`) é `python3 -m piper` spawnado em subprocesso **a cada síntese** :

```
synthèse = spawn(python) + chargement du modèle + inférence + kill
```

Cada frase paga a inicialização do interpretador + o carregamento dos pesos. Medido em `en_US-lessac-medium` : **~2.2s por linha**.

O nativo (`PiperNativeTTS`) mantém a sessão ONNX **quente na memória** :

```
load une fois -> session persistante -> inférence par phrase
```

Medido igual : **~0.22s por linha**. O 10x vem daí : a gente mata o spawn e o reload, a inferência milagrosa não tem nada a ver com isso. A inferência ONNX em si é a mesma dos dois lados.

De bônus, o primeiro load guarda em cache o grafo otimizado ao lado do `.onnx` (`<model>.ortopt-<platform>-<arch>-v<ort>.onnx`), o que deixa os carregamentos seguintes uns 35% mais rápidos. A chave do cache combina platform, arch e versão do ORT, e se atualiza se o modelo mudar. Dá para desativar com `cacheOptimizedModel: false`.

### Le pont espeak : 0.4ms contre 15ms

Mesma lógica para a fonemização. O wrapper chama o binário `espeak-ng` em CLI por frase : uns 15ms de spawn cada vez. O nativo embute uma bridge N-API (`src/native/espeak-bridge/`, port do `espeakbridge.c`), com prebuilds para Linux x64/arm64 : **~0.4ms por chamada**, fonemas byte-idênticos. Sem o addon, fallback automático para a CLI. `PIPER_ESPEAK_BRIDGE=0` para forçar a CLI.

### Les 7 phoneme_type, tous portés

| Type | Moteur | Notes |
|---|---|---|
| `espeak` | bridge N-API ou CLI | clauses byte-identiques |
| `text` | passthrough codepoints | trivial |
| `hebrew` | Nakdimon ONNX + règles IPA | sorties identiques |
| `lithuanian` | espeak + dico de stress 189k entrées | sorties identiques |
| `pinyin` | BERT g2pW ONNX + WordPiece | désambiguïsation des polyphones OK |
| `thai` | vrai TLTK non modifié sous Pyodide/WASM | 7/7 identiques (1er appel lent, suite rapide) |
| `japanese` | lindera-wasm + UniDic + moteur de mores TS | segmentation exacte, **pas d'accent lexical** |

E o árabe é diacritizado automaticamente (tashkeel, dá para desativar). 509 vozes espeak do catálogo passam pela bridge rápida, as exóticas pelo motor dedicado. 71 testes na suite, restrição documentada onde emperra (o acento japonês, o UniDic não entrega nenhum dado -- assumido, nada escondido).

### Les formats et le streaming

`wav` por default, `raw` PCM, `mp3`, `ogg`, `opus` : ffmpeg quando tem, senão fallbacks JS puro (lamejs para mp3, opusscript + muxer Ogg para opus, correlação 0.993 com a fonte). E principalmente `synthesizeChunks()` : um gerador async que yield por frase, com `sentenceSilence` entre as frases. Para a Luna, isso significa começar a tocar o áudio enquanto o fim se sintetiza -- streaming de TTS sem servidor dedicado.

Uso completo, com o catálogo PiperHub integrado (`hub:` + fallback mirror automático se o repo do autor não servir mais os arquivos) :

```ts
const tts = await PiperNativeTTS.load({
  model: "hub:glados-french-medium-voice",
  modelsDir: "./models",
});

const r = await tts.synthesize("Bonjour, je suis GLaDOS.", {
  outputFormat: "ogg",   // direto para o Discord
  lengthScale: 0.95,     // um pouco mais rápido
});
```

Vozes da comunidade (GLaDOS e personagens de jogos) ausentes do manifest oficial -- é exatamente para isso que o PiperHub existe, e o `pipertts` sabe bem : `hub:<slug>`, URL de página piperhub, ou slug nu, tudo funciona. As vozes marcadas `usable: false` são recusadas com um erro claro.

## Ce qui a été sacrifié

Cada feature ausente financia outra. A lista honesta :

**O Piper soa robótico ao lado da ElevenLabs.** VITS medium em 22050 Hz é limpo mas plano comparado a um modelão expressivo. O multi-emoções compensa em parte (7 estilos > 1 estilo plano), mas um audiobook ElevenLabs v3 continua acima. É o preço das dezenas de MB.

**O espeak erra.** Nomes próprios, anglicismos, abreviações : a fonemização por regras tem seus pontos cegos. "Spoiler" em francês, o espeak lê como dá. Os modelos grandes com G2P neural erram menos. Em prod, precisa de um dicionário de exceções para os termos do negócio.

**Zero clonagem nativa.** O Piper lê com vozes fixas. Se você quer A SUA voz, vai de PocketTTS ou ElevenLabs. O multi-speaker dá variações, nunca o seu timbre.

**O japonês continua sem acento lexical.** O UniDic não entrega nenhum dado de acento, então a segmentação é exata mas a melodia é aproximada. Documentado no README, nada debaixo do tapete.

**O thai engasga na primeira chamada.** O TLTK roda sob Pyodide/WASM não modificado : a primeira chamada leva segundos (carregamento), as seguintes são rápidas. 7/7 idênticos à referência, mas prevê um warm-up.

**Os dados têm fome.** Uma voz high decente pede horas de áudio limpo alinhado. O dataset Fortune são horas de gravação + limpeza. Zero mágica : garbage in, robot out.

**O catálogo tem vozes mortas.** 25 modelos marcados `usable: false`. É assumido e filtrado, mas lembra que crowdsourcing de vozes também é crowdsourcing de abandono.

## Le résultat final

De um lado um contador ElevenLabs, do outro um Raspberry Pi :

- PiperHub : 536 modelos exibidos, 71 idiomas, 3755 speakers, 130 datasets ligados, guias dataset -> training -> usage
- Piper : VITS end-to-end, espeak, ONNX CPU, LJSpeech, low/medium/high, 22050 Hz padrão
- Fortune multi : 7 emoções FR + 7 EN, 1 ONNX cada, `speakerId` para trocar, licença "Fortune's Café"
- Kokoro 82M : qualidade premium EN, Apache 2.0, 54 vozes, quase tempo real em CPU
- PocketTTS : clonagem em CPU, ~100M depois 2-18M, WER 0.92%
- sanoTTS : 0.29M, 2 MB, microcontrolador, qualidade que acompanha o tamanho
- ElevenLabs : $0.05-0.10/1000 caracteres, 70+ idiomas, topo de qualidade, contador girando
- pipertts nativo : ~0.22s/linha contra ~2.2s do wrapper, bridge espeak 0.4ms, 7 phoneme_type, wav/raw/mp3/ogg/opus, streaming por frase

A Luna fala com isso todo dia. 0 euro de TTS, emoções pilotadas pelo cérebro, OGG direto para o Discord. Contra a ElevenLabs dá para ouvir, claro. Mas às 3h da manhã quando ela decide contar a vida dela, minha fatura dorme tranquila.

## La philo

p2r3 dizia : *"J'aime juste l'idée que cette toute petite puce à 1 balles puisse faire tourner quelque chose d'aussi avancé que Minecraft."*

Mesma vibe aqui, aplicada à voz : eu gosto da ideia de que algumas dezenas de MB de ONNX façam um Raspberry Pi falar em 71 idiomas, sem cloud, sem conta, sem contador. Isso obviamente não substitui nenhum estúdio de dublagem. Substitui o caso chato onde você quer uma voz decente, local, grátis, que fala de noite sem te faturar.

Os tradeoffs, escritos em preto no branco :
- qualidade premium -> VITS pequeno : um pouco robótico, mas local e grátis
- um modelo por emoção -> speakerId : 7 vozes pelo preço de uma em RAM
- spawn Python -> sessão persistente : 10x mais rápido, zero Python para instalar
- catálogo selvagem -> proveniência ligada : cada voz sabe de onde vem e se ainda funciona
- API faturada -> 0 euro marginal : menos bonito que ElevenLabs, mas a fatura dorme tranquila

**As 3 coisas para lembrar :**

1. **Piper = o TTS da CPU** -- VITS + espeak + ONNX, 71 idiomas, vozes de dezenas de MB que rodam em Pi. Menos bonito que ElevenLabs, infinitamente mais barato.
2. **Fortune multi = 7 emoções pelo preço de uma** -- um só ONNX, `speakerId` para trocar, FR + EN. O embedding de speaker em vez de 7 modelos.
3. **O nativo mata o spawn** -- o `pipertts` mantém a sessão ONNX quente : 0.22s/linha contra 2.2s, bridge espeak 0.4ms contra 15ms CLI. Mesma inferência, 10x menos espera.

Se o projeto te interessa, o catálogo é [piperhub.org](https://piperhub.org/), o código do site [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank), o módulo nativo [github.com/itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts). E se você quiser ouvir a Luna contando a vida dela às 3h da manhã, é no Discord xD
