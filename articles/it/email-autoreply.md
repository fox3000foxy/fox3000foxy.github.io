---
title: "Ho usato git come database per far girare un bot gratis su GitHub Actions"
description: "Come ho programmato un risponditore email IA che gira su GitHub Actions per 0€/mese: usando tag git come database e pre-compilato in un tag runtime."
date: 2026-05-29
tags:
  - automation
  - javascript
  - serverless
  - ai
  - git
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "HY+qLPJaVseTdjlmNbxCCyLZdicqffkNNsQBwFecKv5FrDwXvGIF+BbXRQH0yb7hbmzEKXK0AN1+VoJtbZbvUA=="
---

# Ho usato git come database per far girare un bot gratis su GitHub Actions

Ho un risponditore email automatico che gira 24/7.

Legge le mie mail, capisce di cosa parlano, e risponde da solo con un'IA. Si ricorda delle conversazioni precedenti. Ignora le newsletter e i `noreply@`. Inoltra a un umano quando è troppo caldo.

Costo mensile: **0€**.

Faccio a meno di server, VPS e database. Solo GitHub Actions e un hack matto: **usare git come database**.

Vedi dove voglio arrivare? No? Bene, tieniti forte, è scemo e geniale insieme.

---

## Il problema: GitHub Actions è stateless

GitHub Actions è gratis. Puoi lanciare un cron ogni 5 minuti, far girare il tuo codice, gratis.

Ma c'è un problema: è **stateless**.

Ogni run parte in una macchina vergine. Niente è salvato tra due esecuzioni. Il run prima? Dimenticato. Cancellato. Come se non fosse mai esistito.

Per un risponditore email, è un problema enorme. Tipo:

> "Qual è l'ultima mail che ho già trattato?"

Se il bot dimentica questo a ogni run, o ri-risponde alle stesse mail in ciclo (catastrofe), o perde delle mail.

Serve uno stato persistente. E normalmente, stato persistente = database. Ma un database è un server, e un server non è più gratis.

È lì che diventa interessante.

---

## La soluzione: tag git come database

Il tuo repo GitHub, è già storage persistente. Gratis. Versionato. Sempre lì.

Allora perché non salvarci lo stato?

L'idea: a ogni run, il bot legge l'ultimo UID email trattato da un **tag git**. Tratta le nuove mail. Poi ri-spinge il tag col nuovo UID.

```mermaid
sequenceDiagram
    participant GH as GitHub Actions
    participant GIT as Git Tags
    participant IMAP as Server IMAP

    Note over GH: Run #1
    GH->>GIT: legge tag "lastid"
    GIT-->>GH: vuoto (primo run)
    GH->>IMAP: fetch mail 1-50
    IMAP-->>GH: 50 mail
    GH->>GIT: push tag "lastid" = 50

    Note over GH: Run #2
    GH->>GIT: legge tag "lastid"
    GIT-->>GH: 50
    GH->>IMAP: fetch mail 51-73
    IMAP-->>GH: 23 mail
    GH->>GIT: push tag "lastid" = 73
```

Il tag git È il database. Un solo valore, ma è tutto ciò di cui abbiamo bisogno.

### Leggere lo stato

All'inizio del job, recuperiamo il valore dal tag:

```bash
git fetch origin --tags lastid || true
git show refs/tags/lastid:data/lastId > data/lastId || true
```

`git show refs/tags/lastid:data/lastId` vuol dire: "dammi il contenuto del file `data/lastId` com'era nel tag `lastid`".

Boom. Hai il tuo valore, senza database.

### Scrivere lo stato

Alla fine, ricreiamo il tag col nuovo valore:

```bash
git switch --orphan lastid-tmp   # branch vergine senza storico
git rm -rf .                      # svuotiamo tutto
mkdir -p data
printf "%s\n" "${LAST_ID_CONTENT}" > data/lastId

git add data/lastId
git commit -m "lastId snapshot"
git tag -f lastid                 # forza il tag su questo commit
git push --force ...origin lastid # push del tag
```

Creiamo un branch **orfano** (senza storico), mettiamo solo il file `lastId`, committiamo, tagghiamo, force push.

Perché orfano? Per non accumulare 10 000 commit di stato nello storico del repo. Ogni update schiaccia il precedente. Il tag punta sempre a UN solo commit che contiene UN solo valore.

È pulito. È gratis. È completamente storto e funziona.

---

## Il secondo hack: il runtime snapshot

C'è un altro problema con GitHub Actions: il `npm install`.

Se a ogni run (ogni 5 minuti) fai `npm install` + `npm run build`, sprechi 60-90 secondi ogni volta. Su un cron frequente, sono minuti di compute sprecati per niente.

Soluzione: pre-compilare il codice UNA volta, e salvarlo in un tag git anche lui.

Il workflow di build (che gira quando spingi su `master`) fa questo:

```bash
# compila il codice
bun install
bun run build

# salva dist/ + node_modules/ in un tag "runtime"
git checkout --orphan temp-runtime
git rm -rf .
cp -r "$TMPDIR"/* .
git add dist node_modules package.json bun.lock data
git commit -m "runtime build"
git tag -f runtime
git push --force ...origin runtime
```

Il tag `runtime` contiene il codice compilato E i `node_modules`. Tutto pronto a girare.

E il cron, lui, fa checkout diretto di questo tag:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime    # il codice pre-build, non il sorgente
    fetch-depth: 1

# niente npm install, niente build!
- name: Process emails
  run: node dist/index.js --action
```

Il cron parte istantaneo ed esegue solo `node dist/index.js`, senza install né build.

Tipo, hai due tag che fanno due lavori:
- `runtime` = il codice pronto a girare (aggiornato quando spingi codice)
- `lastid` = lo stato persistente (aggiornato a ogni run)

È elegante come uno sporco.

---

## Il bot in sé: risponditore IA

Bene, l'hack git è figo, ma il bot fa cosa esattamente?

Legge le tue mail via IMAP, le capisce con un'IA (Groq + Llama 3.3 70B), e risponde automaticamente.

Architettura in servizi puliti con injection di dipendenze (InversifyJS):

```
App
├── ImapService      → legge le mail (IMAP)
├── SmtpService      → invia le risposte (SMTP)
├── ParserService    → parsa il contenuto delle mail
├── ReplyService     → genera la risposta IA
├── SummaryService   → memoria di conversazione
├── AccountsService  → gestisce più account email
└── ConfigService    → config / env var
```

### Due modalità di funzionamento

Il bot può girare in due modi:

**Modalità listener** (tempo reale): connessione IMAP permanente con reconnect esponenziale. Per un VPS.

```typescript
// nuovo messaggio via listener IMAP
this.imapService.on("exists", async (data) => {
  console.log(`[MAIL] Nuovo messaggio! Totale: ${data.count}`);
  // tratta il nuovo messaggio subito
});
```

**Modalità action** (batch): tratta le nuove mail dal `lastId`, poi si chiude. Per il cron GitHub Actions.

```bash
node dist/index.js --action
```

La modalità `--action` è quella che usa l'hack git. Legge `lastId`, tratta ciò che è nuovo, scrive il nuovo `lastId`, fine.

### NON rispondere ai robot

Se il tuo bot risponde a TUTTE le mail, risponderà alle newsletter, alle notifiche, ai `noreply@`. Catastrofe. Peggio: se due bot si rispondono l'un l'altro, hai un ciclo infinito di mail. L'incubo.

Quindi filtraggio aggressivo:

```typescript
// pattern di mittenti automatici da ignorare
export function isAutomatedSender(address) {
  const automatedPatterns = [
    "noreply", "no-reply", "donotreply",
    "mailer-daemon", "postmaster", "bounce",
    "newsletter", "notification", "marketing",
    "billing", "receipt", "promo", ...
  ];
  const local = address.split("@")[0].toLowerCase();
  return automatedPatterns.some(p => local.includes(p));
}
```

E anche rilevamento via header email:

```typescript
// newsletter e mass-mailing via header
export function isAutomatedByHeaders(headers) {
  return (
    ["bulk", "list", "junk"].includes(headers.precedence) ||
    headers["auto-submitted"] !== "no" ||
    headers["list-unsubscribe"] !== "" ||   // le newsletter hanno questo
    /mailchimp|sendgrid|mailgun|brevo/i.test(headers["x-mailer"])
  );
}
```

`List-Unsubscribe` negli header? È una newsletter. `Precedence: bulk`? Del mass-mailing. `X-Mailer: Mailchimp`? Hai capito il genere. Ignoriamo.

È come un buttafuori di discoteca: i robot non passano.

### I trigger magici

L'IA può decidere di non rispondere affatto, o di passare la mano a un umano. Come? Con trigger speciali nella sua risposta.

Il prompt di sistema le dice:

> Se è una mail automatica/newsletter: rispondi `<no_reply>`
> Se è troppo importante/sensibile (legale, finanziario...): rispondi `<manual_reply_required>`
> Altrimenti: scrivi una vera risposta

E il codice legge questo:

```typescript
// l'IA può rifiutare o passare a un umano
const aiReply = completion.choices[0].message.content.trim();
const manualTrigger = aiReply.includes(MANUAL_REPLY_TRIGGER);
const noReply = aiReply.includes(NO_REPLY_TRIGGER);

if (noReply) {
  console.log("[MAIL] L'IA ha deciso di ignorare. Skip.");
  return;
}

if (manualTrigger) {
  console.log("[MAIL] Troppo caldo, inoltro a un umano.");
  await this.smtpService.sendManualForward(...);
  return;
}

// altrimenti inviamo la risposta IA
await this.smtpService.sendReply(...);
```

Tipo l'IA ha il diritto di dire "no qui non tocco, chiama un vero umano". È saggezza.

---

## La memoria di conversazione

Un dettaglio che cambia tutto: il bot **si ricorda** delle conversazioni.

Quando risponde a qualcuno, salva un riassunto dello scambio. La prossima volta che questa persona scrive, il riassunto è reiniettato nel prompt.

Storage: un file JSON per contatto.

```
data/customers/
├── moi%40gmail.com/
│   ├── alice%40example.com.json
│   └── bob%40client.fr.json
```

E il riassunto è generato dall'IA stessa, che fonde il vecchio riassunto col nuovo messaggio:

```typescript
// fonde il vecchio riassunto col nuovo messaggio
const completion = await groq.chat.completions.create({
  model: "llama-3.3-70b-versatile",
  messages: [
    { role: "system", content: "Sei un assistente di memoria. Fondi il vecchio riassunto col nuovo messaggio senza perdere info." },
    { role: "user", content: `Riassunto esistente:\n${existing}\n\nNuovo messaggio:\n${incomingContent}` }
  ],
  temperature: 0.0,  // deterministico, niente creatività
  max_tokens: 800,
});
```

Quindi il bot costruisce una memoria compressa nel tempo. Un riassunto che cresce in modo intelligente basta, senza salvare tutte le mail.

E questi file JSON? Beh... sono salvati in git anche loro, nel tag runtime. Git ovunque.

---

## Il punto furbo con la lunghezza del prompt

Piccolo dettaglio tecnico che mi ha fatto sorridere.

I modelli hanno un limite di token. Se la tua mail + il riassunto + il prompt persona superano, l'API restituisce un errore.

Il codice gestisce questo con una **troncatura a cascata** + retry:

```typescript
try {
  // primo tentativo con i limiti normali
  completion = await groq.chat.completions.create({...});
} catch (error) {
  if (!this.isLengthError(error)) throw error;

  // era un errore di lunghezza: riproviamo con limiti più stretti
  ({ systemContent, userContent } = this.buildPromptPayload({
    ...,
    limits: {
      systemPromptChars: 2200,  // invece di 3000
      summaryChars: 1800,       // invece di 4000
      personaChars: 900,        // invece di 1500
      userContentChars: 2200,   // invece di 8000
    },
  }));
  completion = await groq.chat.completions.create({...});  // retry
}
```

Se non passa, tagliamo più corto e riproviamo. Semplice, efficace, niente crash.

---

## Bene, e in concreto, come gira?

Il flusso completo di un run di cron:

```
1. GitHub Actions si attiva (cron ogni 5 min)
2. Checkout del tag "runtime" (codice pre-build)
3. git show refs/tags/lastid → recupera l'ultimo UID trattato
4. node dist/index.js --action
   ├── connessione IMAP
   ├── fetch delle mail da lastId+1
   ├── per ogni mail:
   │   ├── parsa il contenuto
   │   ├── filtra i robot (skip se automatico)
   │   ├── matcha l'account destinatario
   │   ├── recupera la memoria di conversazione
   │   ├── genera la risposta IA (Groq)
   │   ├── <no_reply>? skip
   │   ├── <manual_reply_required>? inoltro umano
   │   ├── altrimenti: invia la risposta (SMTP)
   │   └── aggiorna la memoria di conversazione
   └── scrive il nuovo lastId
5. git push --force tag "lastid" col nuovo valore
```

E ricomincia tra 5 minuti. Per sempre. Gratis.

---

**I 3 punti da ricordare:**

1. **Git = database gratis**: un tag orfano può salvare il tuo stato persistente tra due run stateless. `git show refs/tags/X:file` per leggere, force-push per scrivere. Risparmi un DB completo.

2. **Pre-compila in un tag runtime**: invece di `npm install` a ogni run del cron, salva il codice compilato + node_modules in un tag git. Il cron parte istantaneo.

3. **Un bot IA deve saper tacere**: i trigger `<no_reply>` e `<manual_reply_required>` lasciano l'IA decidere di non rispondere o di passare la mano. Più il filtraggio anti-robot. Altrimenti crei un ciclo di mail infinito.

Cron serverless con stato persistente, IA, memoria, il tutto a 0€/mese. È completamente rotto e adoro questo montaggio.
