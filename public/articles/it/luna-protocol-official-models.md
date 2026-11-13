---
title: "Luna Protocol: perché ho fine-tunato un modello da 1,5 miliardi di parametri su 50k campioni Discord, e perché il few-shot priming ha cambiato tutto"
description: "Un modello più piccolo allenato su meno dati può superare un modello più grosso: a condizione di saperlo innescare bene. Ecco perché Luna Protocol è passato da un Hermes 3B a un fine-tune Qwen 1,5B, e perché il few-shot priming è diventato il vero fattore di progresso."
date: 2026-07-17
authors:
  - fox3000foxy
tags:
  - discord
  - llm
  - fine-tuning
  - few-shot-learning
  - qwen
  - unsloth
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "96N1WcxSeSmWRUOwhMXb+YSNql31M99H9O+riTsevCw7PxsMZS0oIIfCTvp9tuHeqcu7Tc9XywULd+LMNDvKBQ=="
---

# Luna Protocol: perché ho fine-tunato un modello da 1,5 miliardi di parametri su 50k campioni Discord, e perché il few-shot priming ha cambiato tutto

Nel [primo articolo](/articles/it/luna-protocol-discord-bot), ho costruito un bot Discord che simula un essere umano: sonno, refusi, esitazioni, dimenticanze, messaggi spontanei. Il sistema comportamentale teneva. L'LLM dietro tutto questo era un modello Hermes da 3 miliardi di parametri, quantizzato in Q8_0, che consumava 3 GB di VRAM.

Funzionava. Ma era sovradimensionato.

Un bot Discord non ha bisogno di un modello da 3 miliardi di parametri per dire "nm just chillin, u". Ciò di cui ha bisogno, è **coerenza stilistica**: la capacità di tenere un tono conversazionale preciso, messaggio dopo messaggio, senza derivare verso una modalità "assistente corporate". E si scopre che un modello più piccolo, allenato su meno dati e innescato con qualche esempio, ci riesce meglio di un modello più grosso che forza il passaggio via un semplice prompt di sistema.

Questo articolo riguarda i modelli ufficiali di Luna Protocol: perché esistono, perché 1,5B invece di 3B, perché 50k campioni di allenamento invece di 7,3M, e perché il few-shot priming è passato dallo status di "bonus simpatico" a quello di cuore di tutto l'approccio.

---

## Il problema col modello 3B

La configurazione originale usava `Discord-Micae-Hermes-3-3B.Q8_0.gguf`, un modello da 3 miliardi di parametri fine-tunato su dati Discord. Produceva buone risposte, ma:

| Metrica | Hermes-3-3B Q8_0 | Obiettivo |
|--------|-------------------|--------|
| Uso VRAM | circa 3 GB | < 1 GB |
| Generazione di token | circa 30 tok/s | circa 60+ tok/s |
| Taglia del file modello | circa 3,2 GB | < 1 GB |
| Tempo di avvio a freddo | circa 8s | circa 3s |

Per un bot che gira 24/7 su un server modesto, 3 GB di VRAM, sono tanti. E la velocità di generazione, corretta per messaggi occasionali, sembrava lenta durante risposte a raffica o con più canali attivi.

La domanda era: si può ottenere lo stesso stile Discord-Dialogues con metà parametri?

---

## La decisione di fine-tuning: perché 50k, non 7,3M

Il dataset [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) contiene **7,3M scambi** e **17M turni di parola**. È un corpus enorme di vere conversazioni Discord. L'approccio ovvio sarebbe stato allenare su tutto il dataset.

Ho fatto l'inverso. Ho allenato su **50 000 campioni**, cioè meno dell'1% dei dati disponibili.

Ecco perché: **la taglia del set di allenamento influisce direttamente sul grado di overfitting del modello verso la sua distribuzione di allenamento**.

Un modello allenato su 7,3M esempi impara una distribuzione statistica molto specifica delle conversazioni. Diventa ottimo a riprodurre questa distribuzione, ma diventa anche **rigido**: ha meno margine per adattarsi a nuovi pattern forniti al momento dell'inferenza.

Un modello allenato su 50k esempi impara il tono e il registro generale delle conversazioni Discord (informale, corto, abbreviazioni, minuscole), ma conserva abbastanza flessibilità per essere **pilotato da esempi in contesto**. Gli esempi few-shot non lottano contro una distribuzione enorme già appresa: vengono a completare una distribuzione più leggera.

È l'intuizione centrale: **dati di allenamento limitati rendono il few-shot priming più efficace**.

---

## Il modello: dettagli tecnici

Il modello Luna Protocol è un **fine-tune QLoRA** di [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct):

| Parametro | Valore |
|-----------|-------|
| Modello di base | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| Metodo | QLoRA (4-bit) |
| Rango LoRA | `r=16`, `lora_alpha=16` |
| Moduli puntati | `q/k/v/o_proj`, `gate/up/down_proj` |
| Parametri allenabili | 18 464 768 / 1 562 179 072 (1,18%) |
| Dati di allenamento | circa 50 000 esempi (sottoinsieme di Discord-Dialogues) |
| Filtro | 8-512 token per campione |
| Epoche | 2-3 |
| Hardware | Kaggle T4 |
| Framework | [Unsloth](https://github.com/unslothai/unsloth) |

Il dataset è un fork pre-elaborato di Discord-Dialogues, filtrato per tenere solo turni `user`/`assistant` puliti: solo scambi utente e assistente, senza messaggi di sistema né metadati né comandi di bot. È importante per il seguito.

### Quantizzazioni disponibili

| File | Quantizzazione | Taglia | Note |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 MB | Nettamente degradato: sconsigliato |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 MB | Buon compromesso taglia/qualità (raccomandato) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1,65 GB | Migliore fedeltà stilistica |

Il modello raccomandato è **Q4_K_M**: meno di 1 GB, rapido, e preserva bene lo stile conversazionale. Il Q2_K si degrada troppo per un modello di questa taglia. Il Q8_0 offre la migliore qualità ma consuma il 68% di memoria in più.

---

## La svolta del few-shot priming

Ecco la parte che ha cambiato tutto.

La scheda del modello su HuggingFace comporta un avviso:

> Con un prompt nudo e senza innesco, questo modello tende a ricadere nel tono di default "assistente" di Qwen. Un corto innesco few-shot fa una grande differenza.

È una conseguenza diretta del modo in cui i dati di allenamento sono stati strutturati.

### Perché i prompt di sistema da soli non funzionano

I dati di allenamento Discord-Dialogues contengono solo turni `user`/`assistant`. Non c'è **alcun esempio di ruolo sistema** nel set di allenamento. Il modello non è mai stato allenato a seguire prompt di sistema come direttive di stile.

Quando gli diamo un prompt di sistema tipo "Ti chiami Luna, parla in modo rilassato", sente l'istruzione ma non ha un pattern appreso solido per tradurla in uscita. Ricade allora sul comportamento di default di Qwen: servizievole, strutturato, leggermente formale.

### Perché gli esempi few-shot funzionano

Quando iniettiamo esempi di conversazione nello stesso formato ChatML usato all'allenamento (con la struttura di turni `user`/`assistant`), qualcosa scatta. Il modello riconosce il pattern dal suo allenamento e allinea la sua uscita di conseguenza.

Ecco come è un innesco few-shot in pratica:

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

Questi esempi sono iniettati dopo il prompt di sistema e prima della vera conversazione. Il modello li percepisce come parte dello storico di conversazione, quindi come uno scambio reale invece che come istruzioni. È una distinzione essenziale: gli *mostriamo* come è il tono rilassato invece di *ordinarglielo*.

### Prima / dopo

Senza innesco few-shot (prompt di sistema nudo):

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

Con innesco few-shot (3 esempi):

```
User: yo whats good
Bot: nm just chillin, u
```

La differenza è lampante. Il modello adotta tutto il registro: minuscole, abbreviazioni, tono rilassato, risposte corte. Ricalca lo stile degli esempi invece di quello dei dati di allenamento di Qwen.

---

## Memoria e velocità: i numeri concreti

Il passaggio da Hermes-3-3B a Luna-Protocol-1.5B porta guadagni misurabili:

| Metrica | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | Miglioramento |
|--------|-------------------|----------------------|-------------|
| Uso VRAM | circa 3 GB | circa 986 MB | **67% in meno** |
| Taglia del file modello | circa 3,2 GB | circa 986 MB | **69% più piccolo** |
| Generazione di token | circa 30 tok/s | circa 60+ tok/s | **2x più rapido** |
| Avvio a freddo | circa 8s | circa 3s | **62% più rapido** |
| Finestra di contesto | 8192 | 8192 | Identica |

### Perché il guadagno di velocità è reale

I modelli più piccoli sono fondamentalmente più rapidi in inferenza. Con 1,5B parametri invece di 3B:

- **Meno moltiplicazioni matriciali** per token: gli strati di attention, gli strati FFN e la proiezione di uscita evolvono tutti linearmente col numero di parametri
- **Migliore uso della cache**: il modello più piccolo fa stare più dei suoi pesi nella cache L2/L3
- **Meno pressione sulla banda di memoria**: meno byte da leggere dalla VRAM per token

Su una configurazione modesta, solo CPU (2 core, senza GPU), il modello 1,5B genera token a circa **2 volte la velocità** del modello 3B. È la differenza tra "si sente il bot" e "sembra una vera persona che digita".

### La cache di prompt amplifica il vantaggio

Luna Protocol usa `llama-server` con la cache di prompt attivata (`--cache-reuse 256`). Questo significa che:

1. Il primo messaggio di una sessione paga il costo completo dell'elaborazione del prompt (prompt di sistema + esempi few-shot + messaggio utente)
2. I messaggi seguenti elaborano solo i *nuovi* token, perché il prefisso in cache è riusato
3. Con 5 esempi few-shot (circa 50-150 token), il sovraccosto diventa trascurabile dopo la prima richiesta

Gli esempi few-shot diventano in pratica "gratis" dopo il primo messaggio di una sessione. Il modello beneficia di una guida di stile a costo marginale nullo.

---

## L'implementazione: come funziona in codice

Il sistema few-shot di Luna Protocol è pulito e minimo. Tre file gestiscono tutto.

### 1. Configurazione (`config.yml`)

```yaml
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
  - user: "whats up"
    assistant: "yooo not much, what about you"
  - user: "how was your day"
    assistant: "it was alright, nothing crazy happened lol"
```

La configurazione è ricaricabile a caldo. Modifichi gli esempi, salvi, e il bot adotta subito il nuovo stile, senza riavvio.

### 2. Formattazione e iniezione (`src/core/few-shot.ts`)

La funzione `formatFewShotExamples()` converte gli esempi YAML in oggetti di messaggio ChatML:

```typescript
// converte gli esempi YAML in messaggi ChatML
export function formatFewShotExamples(
  examples: FewShotExample[],
  username = "user"
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages = [];
  for (const example of examples) {
    messages.push({ role: "user", content: `${username}: ${example.user}` });
    messages.push({ role: "assistant", content: example.assistant });
  }
  return messages;
}
```

La funzione `injectFewShotIntoConversation()` li piazza subito dopo il prompt di sistema:

```typescript
// inserisce gli esempi dopo il prompt di sistema
export function injectFewShotIntoConversation(
  messages: Message[],
  fewShotMessages: Message[]
): Message[] {
  const systemMessage = messages[0];
  const userMessages = messages.slice(1);
  return [systemMessage, ...fewShotMessages, ...userMessages];
}
```

### 3. Integrazione (`src/core/llm-client.ts`)

Prima di ogni chiamata all'LLM, gli esempi few-shot sono iniettati se attivati:

```typescript
// inietta few-shot prima di ogni chiamata LLM
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

Il modello riceve: `[prompt_sistema] + [esempi_few_shot] + [storico_di_conversazione]`

---

## Conservare lo stile Discord-Dialogues

Il dataset Discord-Dialogues originale ha una firma conversazionale molto specifica:

- **Messaggi corti**: 32,8 token in media per turno
- **Registro informale**: abbreviazioni, minuscole, assenza di punteggiatura
- **Scambi rapidi**: più scambi corti invece di lunghi monologhi
- **Imperfezioni naturali**: refusi, "lol", "fr", "ngl", "tbh"

Il modello Luna Protocol preserva questo stile grazie a due meccanismi:

### 1. Il fine-tuning sposta la distribuzione di base

I 50k campioni di allenamento insegnano al modello l'**impronta statistica** delle conversazioni Discord. Impara che le risposte sono tipicamente corte, in minuscole e informali. Allontana l'uscita di default del modello dalla modalità "assistente servizievole" di Qwen.

### 2. Il few-shot priming blocca il risultato

Gli esempi few-shot rafforzano esattamente i pattern appresi durante il fine-tuning. Agiscono come un **ancoraggio stilistico**: anche se il modello deriva leggermente verso un tono più formale nel corso di una lunga conversazione, gli esempi presenti nel contesto lo riportano indietro.

La combinazione è più potente di ogni meccanismo preso isolatamente:
- Fine-tuning senza few-shot: il modello è *globalmente* rilassato ma inconsistente
- Few-shot senza fine-tuning: il modello prova a seguire gli esempi ma ricade senza sosta in modalità assistente
- Fine-tuning + few-shot: il modello resta **costantemente** nel personaggio

---

## La filosofia: modello più piccolo, prompting più furbo

La saggezza convenzionale in deploy di LLM dice "più grosso, meglio è". Più parametri, più dati di allenamento, più VRAM. Luna Protocol prende la strada inversa:

- **1,5B invece di 3B**: metà parametri, metà memoria, due volte più rapido
- **50k campioni invece di 7,3M**: meno dati di allenamento, più flessibilità per l'apprendimento in contesto
- **Few-shot priming invece di prompt di sistema**: mostrare al modello ciò che vogliamo, non solo dirglielo

È una scelta di progettazione assunta, molto più di una semplice ottimizzazione tecnica. Un bot Discord deve restare un compagno conversazionale leggero invece di un assistente generalista. Deve dire "nm just chillin, u" in modo coerente, rapido, e senza ingoiare tutto il budget VRAM del server.

Risultato: un bot che gira su un VPS da 5 $/mese, genera token abbastanza in fretta da dare l'impressione di una digitazione in tempo reale, e mantiene una personalità coerente grazie a una combinazione di fine-tuning e few-shot priming che vale più della somma delle sue parti.

---

## Setup

### Scarica il modello

```bash
npm run download-model
# Scarica Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf
```

O manualmente da [HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues).

### Configura

```yaml
# config.yml
llama_model_path: "./models/Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf"
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

### Lancia

```bash
npm run dev                    # dev (ricaricamento a caldo)
npm run build && npm start     # produzione
./start.sh                     # PM2 (produzione con llama-server)
```

---

## Conclusione

I modelli Luna Protocol provano che per un'IA conversazionale incentrata sullo stile, **meno, è meglio**. Un modello da 1,5B allenato su 50k campioni scelti con cura, innescato con qualche esempio, supera un modello da 3B allenato su milioni di esempi, per una frazione del costo in memoria e una velocità di generazione doppia.

Il few-shot priming costituisce il meccanismo centrale per i piccoli modelli. È lui che li rende sostenibili per app conversazionali in tempo reale. Gli esempi fanno molto più che "aiutare": cambiano fondamentalmente il comportamento del modello, ricalcando esattamente il formato su cui è stato allenato.

Il codice è open source, il modello è su HuggingFace, e il dataset è pubblico. Se vuoi costruire un bot conversazionale che dà l'impressione di essere umano, la ricetta è: piccolo modello, fine-tuning limitato, innesco few-shot solido.

| Risorsa | Link |
|----------|------|
| Deposito GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Modello (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Primo articolo | [Luna Protocol: ho creato un bot Discord autonomo](/articles/it/luna-protocol-discord-bot) |
