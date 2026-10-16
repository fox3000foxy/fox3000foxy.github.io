---
title: "Luna Protocol: perché ho fatto il fine-tuning di un modello da 1.5B su 50k campioni Discord e perché il few-shot priming è diventato l'arma segreta"
description: "Un modello più piccolo addestrato su meno dati può superare uno più grande -- se sai come fare priming. Ecco perché Luna Protocol è passato da un Hermes 3B a un fine-tune Qwen 1.5B, e perché il few-shot priming è diventato il vero punto di svolta."
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "z+aBgud8UduYXSgv8XqJ26lxf8t6UnmyDP8IXYBGDHu6fgfPSUOvaJ2ViWKCh81e386KN1+DKxgKoaPb9tpuQw=="
---

# Luna Protocol: perché ho fatto il fine-tuning di un modello da 1.5B su 50k campioni Discord e perché il few-shot priming è diventato l'arma segreta

Nel [primo articolo](/articles/en/luna-protocol-discord-bot), ho costruito un bot Discord che simula un essere umano -- sonno, errori di battitura, esitazioni, dimenticanze, messaggi spontanei. Il sistema comportamentale era solido. Il LLM dietro era un modello Hermes da 3B, quantizzato in Q8_0, che consumava 3 GB di VRAM.

Funzionava. Ma era eccessivo.

Un bot Discord non ha bisogno di un modello da 3B parametri per dire "nm just chillin, u". Ciò di cui ha bisogno è **coerenza stilistica** -- la capacità di mantenere un tono conversazionale specifico, messaggio dopo messaggio, senza scivolare in modalità assistente aziendale. E a quanto pare, un modello più piccolo addestrato su meno dati, con pochi esempi di priming, funziona meglio di un modello più grande che forza la strada con un system prompt.

Questo articolo parla dei modelli ufficiali di Luna Protocol: perché esistono, perché sono da 1.5B invece che 3B, perché 50k campioni di addestramento invece di 7.3M, e perché il few-shot priming è passato da un "carino da avere" al centro dell'intero approccio.

---

## Il problema con il modello da 3B

La configurazione originale utilizzava `Discord-Micae-Hermes-3-3B.Q8_0.gguf` -- un modello da 3B parametri con fine-tuning su dati Discord. Produceva buone risposte, ma:

| Metrica | Hermes-3-3B Q8_0 | Obiettivo |
|--------|-------------------|--------|
| Utilizzo VRAM | ~3 GB | < 1 GB |
| Generazione token | ~30 tok/s | ~60+ tok/s |
| Dimensione file modello | ~3.2 GB | < 1 GB |
| Avvio a freddo | ~8s | ~3s |

Per un bot che gira 24/7 su un server modesto, 3 GB di VRAM sono tanti. E la velocità di generazione -- ok per messaggi occasionali -- risultava lenta durante risposte in raffica o con più canali attivi.

La domanda era: possiamo ottenere lo stesso stile Discord-Dialogues con la metà dei parametri?

---

## La decisione del fine-tuning: perché 50k, non 7.3M

Il dataset [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) contiene **7.3M di scambi** e **17M di turni**. È un corpus massiccio di conversazioni Discord reali. L'approccio ovvio sarebbe stato addestrare sull'intero dataset.

Ho fatto l'opposto. Ho addestrato su **50.000 campioni** -- meno dell'1% dei dati disponibili.

Ecco perché: **la dimensione del set di addestramento influisce direttamente su quanto il modello fa overfitting sulla sua distribuzione di addestramento**.

Un modello addestrato su 7.3M di esempi apprende una distribuzione statistica molto specifica delle conversazioni. Diventa eccellente nel riprodurre quella distribuzione, ma diventa anche **rigido** -- ha meno flessibilità per adattarsi a nuovi pattern forniti al momento dell'inferenza.

Un modello addestrato su 50k esempi apprende il tono generale e il registro delle conversazioni Discord (informale, forma breve, abbreviazioni, minuscolo), ma mantiene abbastanza flessibilità per essere **guidato da esempi in-context**. Gli esempi few-shot non combattono contro una distribuzione appresa massiccia -- completano una distribuzione più leggera.

Questa è l'intuizione centrale: **dati di addestramento limitati rendono il few-shot priming più efficiente**.

---

## Il modello: dettagli tecnici

Il modello Luna Protocol è un **fine-tune QLoRA** di [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct):

| Parametro | Valore |
|-----------|-------|
| Modello base | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| Metodo | QLoRA (4-bit) |
| Rango LoRA | `r=16`, `lora_alpha=16` |
| Moduli target | `q/k/v/o_proj`, `gate/up/down_proj` |
| Parametri addestrabili | 18.464.768 / 1.562.179.072 (1,18%) |
| Dati di addestramento | ~50.000 esempi (sottoinsieme di Discord-Dialogues) |
| Filtro | 8-512 token per campione |
| Epoche | 2-3 |
| Hardware | Kaggle T4 |
| Framework | [Unsloth](https://github.com/unslothai/unsloth) |

Il dataset è un fork pre-processato di Discord-Dialogues, filtrato per contenere solo turni `user`/`assistant` puliti -- niente messaggi di sistema, niente metadati, niente comandi bot. Questo è importante per dopo.

### Quantizzazioni disponibili

| File | Quantizzazione | Dimensione | Note |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 MB | Notevolmente degradato -- non raccomandato |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 MB | Buon equilibrio dimensioni/qualità (raccomandato) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1,65 GB | Migliore fedeltà stilistica |

Il modello raccomandato è **Q4_K_M** -- sotto 1 GB, veloce e preserva bene lo stile conversazionale. Q2_K si degrada troppo su un modello così piccolo. Q8_0 ha la massima qualità ma usa il 68% di memoria in più.

---

## La svolta del few-shot priming

Ecco la parte che ha cambiato tutto.

La scheda del modello su HuggingFace ha un avviso:

> Con un prompt nudo e senza priming, questo modello tende a ripiegare sul tono predefinito da assistente di Qwen. Un breve few-shot prime fa una grande differenza.

Non è un bug -- è una conseguenza diretta di come sono stati strutturati i dati di addestramento.

### Perché i system prompt da soli non funzionano

I dati di addestramento di Discord-Dialogues contengono solo turni `user`/`assistant`. Non ci sono **esempi con ruolo system** nel set di addestramento. Il modello non è mai stato addestrato a seguire i system prompt come direttive stilistiche.

Quando gli dai un system prompt come "Ti chiami Luna, parla in modo informale", sente l'istruzione ma non ha un pattern appreso forte su come tradurla in output. Torna al default di Qwen: utile, strutturato, leggermente formale.

### Perché gli esempi few-shot funzionano

Quando inietti conversazioni di esempio nello stesso formato ChatML su cui il modello è stato addestrato (usando la struttura di turni `user`/`assistant`), qualcosa scatta. Il modello riconosce il pattern dai suoi dati di addestramento e allinea il suo output per corrispondergli.

Ecco come appare un few-shot prime nella pratica:

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

Questi esempi vengono iniettati dopo il system prompt e prima della conversazione reale. Il modello li vede come parte della cronologia della conversazione, non come istruzioni. Questa è una distinzione critica -- al modello non viene *detto* di essere informale, gli viene *mostrato* cosa significa informale.

### Prima e dopo

Senza few-shot priming (system prompt nudo):

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

Con few-shot priming (3 esempi):

```
User: yo whats good
Bot: nm just chillin, u
```

La differenza è netta. Il modello non produce solo parole diverse -- adotta l'intero registro: minuscolo, abbreviazioni, tono informale, risposte brevi. Si allinea allo stile degli esempi, non allo stile dei dati di addestramento di Qwen.

---

## Memoria e velocità: i numeri concreti

Il passaggio da Hermes-3-3B a Luna-Protocol-1.5B porta guadagni misurabili:

| Metrica | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | Miglioramento |
|--------|-------------------|----------------------|-------------|
| Utilizzo VRAM | ~3 GB | ~986 MB | **67% in meno** |
| Dimensione file modello | ~3.2 GB | ~986 MB | **69% più piccolo** |
| Generazione token | ~30 tok/s | ~60+ tok/s | **2x più veloce** |
| Avvio a freddo | ~8s | ~3s | **62% più veloce** |
| Finestra di contesto | 8192 | 8192 | Uguale |

### Perché il guadagno di velocità è reale

I modelli più piccoli non sono solo "meno lenti" -- sono fondamentalmente più veloci per l'inferenza. Con 1.5B parametri invece di 3B:

- **Meno moltiplicazioni di matrici** per token: i layer di attention, i layer FFN e la proiezione di output scalano linearmente con il numero di parametri
- **Migliore utilizzo della cache**: il modello più piccolo fa entrare più pesi nella cache L2/L3
- **Minore pressione sulla larghezza di banda della memoria**: meno byte da leggere dalla VRAM per token

Su una configurazione modesta solo CPU (2 core, nessuna GPU), il modello da 1.5B genera token a circa **2x la velocità** del modello da 3B. Questa è la differenza tra "sembra un bot" e "sembra una persona che scrive".

### La cache del prompt amplifica il vantaggio

Luna Protocol usa `llama-server` con la cache del prompt abilitata (`--cache-reuse 256`). Questo significa:

1. Il primo messaggio in una sessione paga il costo completo di elaborazione del prompt (system prompt + esempi few-shot + messaggio utente)
2. I messaggi successivi elaborano solo i token *nuovi* -- il prefisso memorizzato nella cache viene riutilizzato
3. Con 5 esempi few-shot (~50-150 token), il sovraccarico è trascurabile dopo la prima richiesta

Gli esempi few-shot sono effettivamente "gratuiti" dopo il primo messaggio in una sessione. Il modello riceve una guida stilistica a costo marginale zero.

---

## L'implementazione: come funziona nel codice

Il sistema few-shot in Luna Protocol è pulito e minimale. Tre file gestiscono tutto:

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

La configurazione è ricaricabile a caldo. Modifica gli esempi, salva e il bot adotta immediatamente il nuovo stile -- nessun riavvio necessario.

### 2. Formattazione e iniezione (`src/core/few-shot.ts`)

La funzione `formatFewShotExamples()` converte gli esempi YAML in oggetti messaggio ChatML:

```typescript
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

La funzione `injectFewShotIntoConversation()` li posiziona subito dopo il system prompt:

```typescript
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

Prima di ogni chiamata al LLM, gli esempi few-shot vengono iniettati se abilitati:

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

Il modello riceve: `[system_prompt] + [esempi_few_shot] + [cronologia_conversazione]`

---

## Mantenere lo stile Discord-Dialogues

Il dataset originale Discord-Dialogues ha una firma conversazionale molto specifica:

- **Messaggi brevi**: media di 32.8 token per turno
- **Registro informale**: abbreviazioni, minuscolo, nessuna punteggiatura
- **Scambio rapido**: brevi scambi invece di lunghi monologhi
- **Imperfezioni naturali**: errori di battitura, "lol", "fr", "ngl", "tbh"

Il modello Luna-Protocol preserva questo stile attraverso due meccanismi:

### 1. Il fine-tuning sposta la distribuzione di base

I 50k campioni di addestramento insegnano al modello l'*impronta statistica* delle conversazioni Discord. Impara che le risposte sono tipicamente brevi, in minuscolo e informali. Questo sposta l'output predefinito del modello lontano dalla modalità assistente di Qwen.

### 2. Il few-shot priming lo blocca

Gli esempi few-shot rinforzano esattamente i pattern appresi durante il fine-tuning. Agiscono come un'**ancora stilistica** -- anche se il modello deriva leggermente verso un tono formale durante una conversazione lunga, gli esempi nel contesto lo riportano indietro.

La combinazione è più potente di ogni singolo meccanismo:
- Fine-tuning senza few-shot: il modello è *generalmente* informale ma incoerente
- Few-shot senza fine-tuning: il modello cerca di seguire gli esempi ma continua a tornare in modalità assistente
- Fine-tuning + few-shot: il modello rimane **coerentemente** in personaggio

---

## La filosofia: modello più piccolo, prompting più intelligente

La saggezza convenzionale nel deployment dei LLM è "più grande è meglio". Più parametri, più dati di addestramento, più VRAM. Luna Protocol adotta l'approccio opposto:

- **1.5B invece di 3B**: metà parametri, metà memoria, doppia velocità
- **50k campioni invece di 7.3M**: meno dati di addestramento, più flessibilità per l'apprendimento in-context
- **Few-shot priming invece di system prompt**: mostra al modello cosa vuoi, non dirglielo e basta

Non è solo un'ottimizzazione tecnica -- è una filosofia di design. Un bot Discord non ha bisogno di essere un assistente generico. Deve dire "nm just chillin, u" in modo coerente, veloce, e senza mangiare l'intero budget di VRAM del server.

Il risultato: un bot che gira su un VPS da 5$/mese, genera token abbastanza veloce da sembrare digitazione in tempo reale, e mantiene una personalità coerente attraverso una combinazione di fine-tuning e few-shot priming che è maggiore della somma delle sue parti.

---

## Setup

### Scarica il modello

```bash
npm run download-model
# Scarica Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf
```

O manualmente da [HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues).

### Configurazione

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

### Esecuzione

```bash
npm run dev                    # sviluppo (ricarica a caldo)
npm run build && npm start     # produzione
./start.sh                     # PM2 (produzione con llama-server)
```

---

## Conclusione

I modelli Luna Protocol dimostrano che per l'AI conversazionale specifica per stile, **meno è meglio**. Un modello da 1.5B addestrato su 50k campioni accuratamente selezionati, con pochi esempi di priming, supera un modello da 3B addestrato su milioni di esempi -- a una frazione del costo di memoria e al doppio della velocità di generazione.

Il few-shot priming non è solo un optional per modelli piccoli. È il meccanismo che li rende praticabili per applicazioni conversazionali in tempo reale. Gli esempi non solo "aiutano" -- cambiano fondamentalmente il comportamento del modello, matchando il formato esatto su cui è stato addestrato.

Il codice è open source, il modello è su HuggingFace e il dataset è pubblico. Se vuoi costruire un bot conversazionale che sembri umano, la ricetta è: modello piccolo, fine-tuning limitato, forte few-shot priming.

| Risorsa | Link |
|----------|------|
| Repository GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Modello (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Primo articolo | [Luna Protocol: ho creato un bot Discord autonomo](/articles/en/luna-protocol-discord-bot) |
