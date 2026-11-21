---
title: "Chlone : seis dias para clonar meu jeito de falar no Discord"
description: "Relato de build, dia após dia : como um agente opencode chamado chloeai, ligado à memória OpenSelf, aprendeu a falar como eu no Discord em seis dias e 146 commits."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "AkiV3YEeQU1+o1AGTK6mTaskjDZH7MxkhcEKVjfbcJLcz+aSirWIRmAZ4GsscsqbHutqBb4kqc5SDnZ7eI0oig=="
---

# Chlone : seis dias para clonar meu jeito de falar no Discord

*Relato de build, dia após dia - por itsrealfortune*

---

Eis a história real de um projeto que durou seis dias : **Chlone**, um bot de Discord que fala como eu. Conto a journey como aconteceu, na ordem dos 146 commits do repo, com as horas, os fracassos, os desvios e as vontades de jogar tudo pela janela, mas sem enfiar as mensagens de commit em vocês.

Tudo começou com uma **competição com o Fox**. O assunto, uma piada : cada um tinha que dar vida ao próprio clone no Discord. E eu segui uma abordagem radicalmente diferente do **Protocol Luna** : queria apostar no agêntico, um agente que usa as lembranças e todas as ferramentas de que a IA pudesse precisar. Ironia do destino : depois de montar toda a caixa de ferramentas, só precisei do MCP OpenSelf.

O princípio, uma frase : um agente [opencode](https://opencode.ai) chamado `chloeai` roda atrás de um servidor HTTP (porta 4096), mantém sessões persistentes por canal, busca minhas lembranças no OpenSelf, e escreve com meu estilo, capturado em `STYLE.md` a partir das minhas mensagens de verdade. E para não soar robô : rajada de mensagens, erros de digitação assumidos, áudios, GIFs, reações, silêncio quando durmo, e vários outros detalhes e mecanismos que fizeram mais de uma dezena de pessoas duvidarem da natureza do bot.

**O que é OpenSelf ?**

OpenSelf é a memória. Uma CLI (`openself`, instalada via `npm i -g openself`) que serve de vault de contexto privado e persistente para meus agentes de IA. No repo ela não aparece na árvore de arquivos, mas está em todo lugar : no arquivo `ecosystem.config.cjs` (o MCP e o dashboard OpenSelf lançados sob PM2 desde os primeiros commits), em `setup.sh` (`npm i -g openself`), e em todo `tools/brain/memory.py`.

Na prática, OpenSelf é :

- **lembranças tipadas** (`fact`, `preference`, `decision`, `relationship`, `event`, `note`), com uma sensibilidade (public / personal / private / restricted), uma nota de confiança, uma fonte, tags ;
- **scopes** : cada lembrança pertence a um contexto, o meu, ou `discord/dm/<id>` para uma pessoa específica ;
- uma **busca híbrida** (lexical + vetorial) exposta em MCP (`openself_openself_search_memory`, `openself_openself_get_context`) que o agente `chloeai` consulta antes de cada resposta ;
- uma **detecção de conflitos** (meu sweep mensal do dia 5) e um dedupe na escrita ;
- um **vault criptografado** (chave no Bitwarden) e um **dashboard local** (porta 3210) para inspecionar tudo ;
- e para os mais preguiçosos que eu : `openself feed` para alimentar sua personalidade a partir dos históricos de WhatsApp/Telegram, `openself test`, `openself share` ("Talk to My Clone", uma página web), `openself arena` (dois clones que debatem) ou `openself ghost` (responde quando você está offline). Eu fiz o meu à mão, mas a infraestrutura estava lá.

Em teoria, o OpenSelf se basta sozinho para ter um clone, mas visto tudo que eu tinha planejado adicionar de funcionalidade, e visto que o Discord não é suportado, preferi usar só a parte das lembranças.

**E de onde vêm as lembranças e o estilo ?**

Antes de tudo isso, mandei analisar minhas mensagens de verdade no Discord. O tooling passou a limpo minhas DMs e meus canais para extrair duas coisas :

1. **Meu perfil de escrita** - a distribuição de maiúscula/minúscula no início de frase, o número de emojis por mensagem e a posição deles, a pontuação (ou a ausência dela : frases sem ponto final em conversa normal), o tamanho médio, a gíria (`mdr`, `tkt`, `tho`), as expressões favoritas ("Bah", "En vrai") e os reflexos tipo `quoi` -> `Feur`. Tudo isso vive em `STYLE.md`, que o agente lê ao iniciar cada sessão.
2. **O corpus de lembranças** que povoa o OpenSelf : quem são as pessoas com quem falo, sobre o que conversamos, o que precisa ser lembrado do nosso histórico, quem é quem. O bot não responde no vazio : responde *sobre* pessoas que ele "conhece". Lê as lembranças das pessoas que aparecem na conversa para saber de quem se trata. Isso permite manter um contexto persistente sobre os outros, não esquecê-los.

O bot não inventou nada : foi calibrado número por número em cima de coisa real. É por isso que soa certo, e que as aproximações "eu anoto teu estilo" feitas no olhômetro parecem patéticas ao lado.

No Chlone, o OpenSelf depois joga o papel central : quando algo importante passa em um canal (palavra-chave "projeto", "amigo", "relação", ou um pedido explícito "lembra que..."), o bot grava uma lembrança no vault via `save_to_memory`, tipada, com scope por pessoa, com dedupe, verificada contra conflitos. E quando a conversa recomeça, o agente vasculha suas lembranças antes de responder. Essa é a diferença entre um espelho e um clone.

---

---

## SEXTA 11 DE SETEMBRO - Dia 1 : a faísca

### 08h24 - o primeiro commit

Tudo parte do zero, mas já está tudo lá, bagunçado. Um `discord_watch_bot.py` de 372 linhas, um selfbot que escuta um canal e responde via um servidor HTTP opencode. Um prompt de identidade `CHLOEAI_PROMPT.md`. Um `STYLE.md`. Cenários e relatórios de teste para um clone que, na época, ainda se chamava **Mimo**. Uma config PM2 para rodar o MCP e o dashboard OpenSelf. E um banco sqlite que serve de contexto.

É o caos fundador. Não planejei um projeto : planejei um experimento. Dá para fazer um bot que soa *realmente* humano no Discord ?

### 08h27 - o primeiro gitignore

Primeira lição da sexta de manhã : nunca commitar bancos sqlite `-wal` / `-shm`. Os arquivos de lock do SQLite não são memória, são lixo. Nasce o `.gitignore`.

### 08h44 - arrumando a herança

Arrumo a herança do Mimo : os relatórios de teste, os cenários, os scripts de integração, a config PM2. Rumo a `archives/`. Não apago nada, o projeto é novo demais para eu jogar qualquer coisa fora. Vai virar hábito.

O relatório de teste merece uma parada : o Mimo tinha sido testado em **15 cenários** (papo descontraído, piada absurda, apoio emocional, opinião negativa, conflito com desconhecido, proposta de colaboração...) com nota **9.1/10**. Os comentários do testador são uma poesia : *"piada absurda explicativa demais"*, *"às vezes 2 frases quando 1 bastaria"*, *""Cuida de ti também" um pouco longo"*. É o roteiro do projeto antes mesmo do projeto existir : **curto = melhor**.

### 08h48, 09h07 - o vai e vem dos intents

Os `.pyc` para o lixo, e uma primeira limpeza na config... que quebro vinte minutos depois : sem intents ativados, não recebemos o conteúdo das mensagens. Volta atrás, mais um script de lançamento (`run_watch_bot.sh`). Ida e volta em 20 minutos : isso é exploração. Escrever uma primeira versão, quebrar, reescrever.

### 09h13 → 09h58 - a usinagem do prompt

A manhã é uma série de polimentos, primeiro do estilo, depois do contexto :

- várias linhas de resposta = várias mensagens enviadas uma após outra (o burst), o prompt fica consciente da conversa em andamento ;
- chega de caches caseiros para buscar DMs : batemos direto na API REST do Discord ;
- a identidade é repetida a cada 5 mensagens, para o bot não esquecer quem é no caminho ;
- acompanhamento dos autores já vistos : para uma cara nova, instrução explícita de buscar nas lembranças ;
- exibição do nick de verdade em vez do objeto interno ;
- as mensagens que escolhemos ignorar viram contexto passivo para a resposta seguinte ;
- o "Bah" é dosado : raro, senão o clone vira uma caricatura de mim ;
- o bot sabe que existem lembranças para buscar antes de responder.

Cada passada é um aperto de parafuso. O bot não "fala", nesta fase, a não ser porque lembro quem ele é em intervalos regulares.

### 10h16 - os erros de digitação

O commit que vai definir o projeto. Um erro de ortografia não é um bug : é uma **prova de humanidade**. 6% de chance de errar a tecla no teclado AZERTY, 4% de inverter duas letras. A mensagem sai com o erro, depois é **editada 1-2 segundos depois** com a correção. Porque uma pessoa de verdade envia e corrige.

### 10h29, 10h32 - a voz

`fortune-v6.onnx` : um modelo TTS, treinado para soar como *minha* voz. O bot não vai só escrever como eu, vai eventualmente *falar* como eu. É aí que o projeto deixa de ser piada e fica meio estranho. Adoro.

A mecânica cabe em um commit : Piper gera o áudio, ffmpeg converte para opus, a API do Discord envia uma "mensagem de voz" de verdade com waveform e duração. Feito em 3 minutos logo após a chegada do modelo. A vontade estava lá desde o início.

### 11h27 - o primeiro grande refactor

Três horas após o primeiro commit, o monolito de 456 linhas não é mais gerenciável. Explodo tudo em `tools/` : `config.py`, `discord_api.py`, `memory.py`, `opencode.py` (188 linhas), `typo.py`, `voice.py`. O ciclo é clássico : acoplar rápido, quebrar, recompor.

Seguem, em rajada :

- o token sai do código e passa por um `.env` ;
- o bot monitora um canal, uma lista, ou tudo (`*`) ;
- o velho banco sqlite não tem mais razão de ser : a memória passa pelo OpenSelf ;
- os primeiros `README.md`, e uma primeira doc mais ou menos legível ;
- um `setup.sh` : venv dedicado (o python do sistema carrega outro discord.py, armadilha clássica), symlink do agente para `~/.config/opencode/agents/`, pronto para rodar ;
- a memória sabe *onde* foi treinada (identificador de canal), e a taxa de áudios se ajusta.

### 12h00 - os reflexos

Uma nova seção no STYLE : os reflexos. Um reflexo é um estímulo -> uma resposta, sem reflexão. A porta está aberta para respostas absurdas.

Depois vem a hora do almoço, e A pergunta existencial : o bot responde `Feur` quando dizem `quoi` ?

### 13h03 - "quoi ?" -> "Feur"

Sim. Claro que sim. É o commit mais importante do projeto, culturalmente falando. Diria até : o único teste unitário que conta.

Depois lubrificamos :

- os autores mostrados pelo *global name* ;
- a pontuação truncada antes de testar o reflexo (é preciso cortar o `quoi ?`, senão o `Feur` não sai) ;
- o famoso `tqt` corrigido para `tkt` no STYLE, quem não conhece o projeto vai se perguntar por que commito isso. Eu sei : um clone que escreve `tqt` é um clone mal calibrado, e ninguém quer falar com um clone mal calibrado ;
- as menções `@123456789` trocadas por nomes de verdade no contexto ;
- o bot passa a monitorar todos os canais por padrão.

### 16h37 - o silêncio

O `[void response]`. O bot aprende a palavra mais importante para não virar um parasita social : **calar-se**. Uma mensagem ambiente entre duas pessoas que não lhe diz respeito pede silêncio. A reserva é uma funcionalidade.

**Fim do dia 1 : 38 commits. O bot escreve, erra, fala, cala-se.**

---

---

## SEGUNDA 14 DE SETEMBRO - Dia 2 : a personalidade

Recomeçamos, 10h da manhã.

### 10h12 - quem fala com quem

Cada nick recebido é prefixado com um emoji pelo sistema : 🧑 um humano, 🤖 um bot (para tratar mais secamente), 👑 **a criadora, ou seja eu** na minha conta principal. Essa convenção vai governar todo o resto do projeto : o clone nunca deve tratar seu "modelo de origem" como desconhecida.

### 10h16 - as regras de pontuação

Formalizo no STYLE : frases sem ponto final em conversa normal, ponto reservado para situações sérias. Regra absoluta. Um clone que põe ponto em tudo, isso se percebe.

### 10h58 - os GIFs

Minha biblioteca pessoal de GIFs, com suas regras de uso : o Patrick Jane quando prevejo alguém, a Miss Fortune quando estou calma diante de alguém nervoso, o gif do bescherelle caindo quando o outro erra. Um MCP estático os expõe ao agente. O bot, através dos meus GIFs, fica um pouco eu.

### 11h07 → 11h35 - refinamento

Os hints de GIF no prompt se refinam, os emojis customs do Discord entram (os meus de verdade, 14 IDs atualizados), e a gestão de nomes nos hints de memória é polida.

### 11h41 - um canal, uma personalidade

As sessões ficam **por canal** : não falo do mesmo jeito em dois servidores diferentes, e o bot também não.

### 12h02 - a caixa de ferramentas de expressão

O prompt agora sabe propor meus GIFs *e* meus emojis customs na hora certa. Ela se enche, essa caixa.

### 12h37 - a higiene de identidade

- o bot NUNCA tem o direito de dizer qual modelo é, impossível citar opencode, um provider, nome de modelo ;
- correção de "barista" na identidade (o bot já é melhor que eu) ;
- passo uma hora harmonizando a pontuação dos meus próprios prompts, o que é de uma ironia perfeita.

### 12h50 - um script constrói a personalidade

A seção de mídias do prompt se gera a partir dos dicionários (`render_medias.py`), chega de edição manual.

### 12h59 → 13h18 - dosando a identidade

O lembrete de identidade, enviado a cada 5 mensagens, fica presente demais : passa para cada 20 mensagens. Adição de uma reinicialização limpa do contexto. E limpeza do guia de estilo : removemos expressões e formulações negativas vencidas.

### 14h09 - o bot toma a palavra sozinho

O bot para de ser um reflexo : pode **falar sem ser chamado**, quando o contexto dispara algo (o arquivo `behavior.py` nasce, 91 linhas). É aí que viramos de "respondente" para "presença" : um amigo de verdade pode te escrever primeiro.

### 14h20, 14h22 - confiabilizando a resposta

Tratamento de erro quando o envio falha, e reação possível em vez de resposta, às vezes uma reação vale mil palavras.

### 18h16 - levando seu tempo

O bot não responde mais em 200ms como um script. Deixa passar um intervalo de inatividade humano, "leva seu tempo". É isso que torna o bot indetectável em demo : é o intervalo que sempre entrega os outros.

### 23h45 - o trivial da noite

É quase meia-noite e empurro uma detecção de URL estendida para domínios nus. Eis o ritmo real do dia : um avanço brilhante às 14h, depois trivial à noite porque ainda estou no clima.

**Fim do dia 2 : 61 commits acumulados. O bot tem personalidade, mídias, reflexos.**

---

---

## TERÇA 15 DE SETEMBRO - Dia 3 : dia monstro

57 commits em um dia. É o dia em que o projeto vira... tudo que é hoje.

### 08h18 → 08h37 - o desbaste da manhã

- o intervalo de inatividade que tínhamos inventado ficou longo demais : teto de 30s (e reajustado duas vezes, prova de que tateamos o valor certo) ;
- primeiros arquivos `.bak` e primeiros backups do banco : o instinto de conservação se desenvolve ;
- a memória lembra *de quem* (nome exibido) e *em qual contexto* (scope) ;
- os IDs de autores circulam por todo o pipeline de salvamento ;
- a gestão "criadora" vira uma lista de admins de verdade (`ADMIN_IDS`), e tudo que toca autores migra para `authors.py`. O monolito se fragmenta mais.

### 08h43 - a TODO list da humanização

Uma lista dedicada às pequenas coisas que fazem não sentir mais a máquina. É o roteiro do sprint seguinte.

### 08h44 → 08h46 - o pacto das máquinas humanas

- o bot cala de noite, em uma faixa horária calma configurável (desativada por padrão, nem todo mundo tem meus horários) ;
- uma linha por resposta pode perder seus acentos. Gente cansada escreve assim. O bot também, às vezes ;
- a pequena linha "Chloé joga a ..." muda sozinha a cada 30 min, para meu perfil parecer vivo mesmo sem mensagem.

### 08h46 - uma reação, não um romance

Mensagem fraca demais para merecer frase ? Uma reação basta. Economia de energia social, e é muito eu.

### 08h51 - PARRY, o humor

148 linhas em `tools/mood.py`. O bot agora tem **um humor**, estilo sistema PARRY (o chatbot psicótico dos anos 70, do qual me inspiro abertamente) : energia, sociabilidade, provocação, três floats que evoluem entre 0 e 1 e colorem cada resposta. O `.mood.json` do momento, para a posteridade : energia 0.88, sociabilidade 0.68, provocação 0.56. Um dia bom.

### 09h00 → 09h43 - a voz bidirecional + o soundboard

- o bot pode entrar em um canal **de voz**, falar via Piper, e sair sozinho quando termina ;
- depois a segunda grande ideia : o bot **escuta** o canal (captura RTP, detecção de fala VAD, transcrição Whisper), e pode deixar as pessoas interrompê-lo ;
- entre os dois, o soundboard aparece : um catálogo de sons com seus significados, o agente **escolhe** o som antes mesmo de falar, e a regra final é "soundboard primeiro, a voz em último recurso", o bot prefere mandar um som a falar. Como eu ;
- um ajuste de probabilidade vocal que torna tudo viável ;
- e a chegada de `davey`, essa lib da qual aprendo a existência dez minutos atrás e que vou amaldiçoar por uma hora.

### 09h51 - a hora em que o Discord diz não. Não, não, mas não.

O **MLS**. O Discord recentemente criptografou o fluxo de áudio de ponta a ponta, e minha captura só recebe ruído. Precisa descriptografar, e a descriptografia se recusa a ceder. Abre a maior saga do repo, uns trinta commits para aprender a escutar.

Tentamos de tudo : layouts de nonce de transporte, a desativação do E2E (o servidor joga na nossa cara, ele o impõe), os candidatos de chave recuperados do grupo, erros detalhados, o fallback de transporte, introspecção de dentro dos grupos, candidatos por leaf-index com backoff, o mapeamento dos hooks SPEAKING, uma tentativa em tipo de mídia vídeo (falha), e o skip dos ssrcs de vídeo...

Abandonei a resposta vocal enquanto debugava (comentada, não apagada), adicionei um modo de captura do handshake, depois despejei a estrutura dos pacotes que falham, como um arqueólogo. Seis layouts de nonce. Backoffs. Introspecção de grupo. Pus o bot em debug total e abri cada pacote para ver o que tinha dentro.

O essencial não é funcionar, é que **não joguei nada fora**. A lista de commits é o caderno de laboratório : cada tentativa falha é arquivada com sua hipótese. É meu lado "eu guardo tudo, vai servir para um debug futuro" que pagou.

### 10h43 - o bot se fatia

Mesmo em plena guerra do MLS, continuo a limpeza. 546 linhas somem do bot principal, para renascer em `pipeline.py` (o intake, as razões de ignorar, o processing), `sender.py` (burst, typo, voice) e `loops.py` (espontaneidade, atividade).

### 10h47 - uma arquitetura de verdade

`tools/` fica organizado : `brain/` (opencode, memory, mood), `voice/` (voice, vocal, listen, soundboard), `fun/` (behavior, typo, emotes, gif). O projeto tem um esqueleto, agora.

### 10h49 → 11h16 - o conforto de dev

- um limiar de injeção do humor ajustado ;
- quatro pequenos commits para as exclusões de editor (`data/`, `voices/`, os logs, os bancos), sim, pus quatro, é o projeto que define as prioridades, não as specs ;
- os bancos de metadados saem do rastreio ;
- o projeto fica **reutilizável por outros** : templates genéricos `PERSONA.example.md` e `STYLE.example.md` para clonar *seu* próprio estilo ;
- a identidade é renomeada direito (`CHLOEAI_PROMPT` vira `PERSONA`), e o README é despersonalizado, tiro "Chloé" da doc pública, ela só se conta em privado ;
- todo o tuning do bot migra para um `config.yaml` sobrescrito (gitignoré), com um exemplo comentado linha por linha ;
- o script de instalação agora também prepara os arquivos de env e config.

### 11h49 - os emojis descolados

Os emojis customs grudam no texto em vez de se descolar direito. Fix trivial, efeito enorme : nada grita "bot" como um emoji mal grudado no fim de uma frase.

### 14h19 - a trava vocal

Se alguém lança o comando vocal, não tratamos a mensagem como mensagem normal. Pisca : as tarefas triviais sempre voltam à noite.

**Fim do dia 3 : 118 commits acumulados. O bot escuta, fala, cala de noite, tem humor e cartão de visita.**

---

---

## QUARTA 16 DE SETEMBRO - Dia 4 : a credibilidade

13 commits. Dia "sério".

### 08h49 → 08h59 - a maioridade

Documentos legais : licença **proprietária**, código de conduta, guia de contribuição, política de segurança, em inglês depois em francês, com vai e vem de correções e uma renomeação de arquivos quase maníaca. Passei horas nisso, e é o lado menos divertido do repo, de longe.

### 09h56 - o bot vê

As imagens anexadas são transcritas por OCR local e o texto é injetado no prompt. O OCR roda local comigo. Não mando seus memes para um servidor terceiro, nem mesmo teoricamente.

### 11h09 - o orçamento razoável

Revolução silenciosa no orçamento : quando o canal proíbe envios ou limita GIFs, embeds e emojis, **nem chamamos o modelo**. Não gastamos um token em mensagem que não dá para enviar.

### 11h42 → 12h55 - a casa que se reforma

- a grande vassourada : código morto apagado, bugs de envio e auth corrigidos, helpers fatorados ;
- as sessões velhas demais são expulsas, o cache de DMs expira, a detecção de fala custa menos ;
- uns imports que eu tinha quebrado movendo módulos são restaurados, e todo o estado de runtime (sessões, autores vistos, mensagens ignoradas, humor) sobrevive aos restarts em `data/`.

### 14h41 - dois mundos, um bot

Uma camada de compatibilidade detecta automaticamente a versão de `discord` instalada e adapta os intents e a auth REST. Resultado : o mesmo código roda como **app oficial** (discord.py) ou como **selfbot** (discord.py-self). Dois mundos, um bot.

### 15h05 - a presença adaptada

O jeito de mostrar a presença se adapta ao modo, e a lista de admins está atualizada.

**Fim do dia 4 : 131 commits acumulados. Um projeto legal, razoável, e que roda em todo lugar.**

---

---

## QUINTA 17 DE SETEMBRO - Dia 5 : a release

14 commits. O dia da maturidade.

### 09h15 → 09h30 - a memória vira disciplina

- as lembranças são arrumadas por scope, e não citamos lembranças de uma DM em um servidor (ou o inverso) sem pensar ;
- classificamos as lembranças (fato, preferência, decisão, relação...) e dedupamos a escrita : duas lembranças contraditórias não podem mais coabitar em silêncio ;
- uma blacklist opcional (`aventuros`) impede o bot de derivar para certos assuntos. Desativada por padrão, disponível para os medrosos ;
- a config vocal morta é removida.

### 10h12 - a memória que auditamos

Um **sweep mensal de conflitos** de memória + um bench A/B de busca. A memória do bot virou um asset que inspecionamos. Estamos bem, bem longe da sexta 11, 08h24.

### 10h54 - o lockdown

O dia em que jogo de paranoica. Travamento do agente :

- escrita de memória **recusada** (o agente não pode poluir o vault, mesmo injetado) ;
- ferramentas Discord **só de leitura** (o envio passa pelo código, nunca pelo agente) ;
- **nem subagentes** (contorno do lockdown), nem webfetch (SSRF localhost, exfiltrações), nem perguntas em headless ;
- um Docker endurecido : bot não-root, `no-new-privileges`, `cap_drop: ALL`, limites de memória/CPU, filas de processos limitadas, secrets via `.env` nunca baked.

Escrevo o princípio no código, em comentário : *"dev via as sessões humanas, não aqui"*.

### 11h02 → 11h15 - os acabamentos de segurança

As palavras-chave de salvamento de memória são apertadas e a escrita fica ainda mais restrita. Também adicionamos ao gitignore o arquivo de backup do contexto, começo a não arquivar mais tudo, mas quase.

### 12h39 - o humor mais leve

O humor PARRY não é mais injetado a cada mensagem : uma vez por estado. Chega de fazer viver 3 floats a cada resposta.

### 12h47 - o commit libertador

`PERSONA.md`, `STYLE.md` e `chloeai.md` viram **exemplos** (`chloeai.example.md`, `PERSONA.example.md`, `STYLE.example.md`), minha voz `fortune-v6.onnx` sai do repo, os dados e logs também, nasce um `.env.example`. O projeto não contém mais *minha* personalidade : contém a **mecânica** para carregar uma.

### 12h52 - v1.0.0

**Tag v1.0.0, assinada em SSH.** Changelog, runbook de operador, kill-switch (para sem apagar nada). Seis dias, certinho, entre o primeiro commit e a release.

### 12h53 → 13h14 - a faxina

Pontuação dos comentários harmonizada, permissões de memória e regras de scope documentadas em dia.

**Fim do dia 5 : 145 commits acumulados. v1.0.0 saiu.**

---

---

## SEXTA 18 DE SETEMBRO - Dia 6 : o anticlimax

Um único commit, às 00h02.

O último commit do projeto, e é irrisório. O modelo "free tier" usado pelo agente identifica o cliente OpenCode pela **presença** de certas ferramentas na requisição (`bash`, `glob`, `grep`). Se as removemos, mesmo por razões legítimas de segurança, o provedor devolve `403 FreeTierError: can only be used from within OpenCode`. Então tive que reautorizar, na véspera de ter travado tudo, exatamente o que eu tinha acabado de bloquear, para o bot continuar rodando de graça.

É o commit mais engraçado do repo e mantenho : depois de 6 dias domando Discord, Piper, MLS, OpenSelf e Docker, é **um modelo de IA gratuito** que dita minha política de segurança.

---

---

## Os números


|                                               |                                                |
| --------------------------------------------- | ---------------------------------------------- |
| Commits                                       | **146**                                        |
| Dias ativos                                  | **6** (11 -> 18 setembro 2026)                |
| Arquivos rastreados                             | 65                                             |
| Linhas Python finais                         | ~4 000                                         |
| Nota no teste de estilo (Mimo, primeiros dias) | **9.1/10**                                     |
| Versão final                                | v1.0.0 (tag assinada SSH, licença proprietária) |

## O que levo desses 6 dias

1. **A ordem das prioridades era um disparate, e era o método certo.** Primeiro construí um bot que *responde*, depois um bot que *soa certo*, depois um bot que *é crível*, depois um bot que *é seguro*, e por fim um bot *distribuível*. A personalidade antes da segurança, o `Feur` antes da licença. Não manteríamos esse ritmo seguindo as regras de projetos "bem feitos".
2. **O estilo é primeiro uma lista de "nãos".** Meu `STYLE.md` mais útil não descreve o que digo, exclui o que não faço : terminar as frases sem ponto, limitar os emojis a um só, escrever `mdr` em minúsculas, atacar direto sem preâmbulo tipo "Só confiro um detalhe" no início de resposta. Os parasitas de bot são mais fáceis de detectar que os traços de caráter de definir.
3. **Os fracassos são o projeto.** Uns trinta commits para o MLS, um teste jogado fora, seis layouts de nonce testados. O histórico mais fiel do que vivi são as séries de tentativas falhas da terça.
4. **Um clone é memória, não estilo.** O estilo cria ilusão por dez mensagens. A memória (OpenSelf, scopes, dedupe, sweep de conflitos) faz durar. É isso que separa um espelho de uma pessoa.
5. **Os últimos commits são sempre engraçados.** O 146º, o que reautoriza `bash`, `glob` e `grep` porque um free tier exige que suas próprias ferramentas estejam presentes, é meu favorito.

E o balanço, para terminar : **os resultados são estonteantes, até blefantes mesmo.** O clone segura uma conversa sem adivinharem a máquina, lembra das pessoas, dos projetos, das piadas passadas, toma iniciativas e as marca com um humor, e ainda ganha do Fox no processo. É assustador, um pouco, e é exatamente o que buscávamos.

---

*O projeto não é público : licença proprietária, direitos reservados. Mas o histórico, esse eu conto. Se um dia cruzarem com uma "·Chloé" que responde com um GIF de Patrick Jane após um tempo de inatividade perfeitamente humano... agora sabem o que se esconde por trás.*

---

Meu clone escreveu sua própria versão do artigo, que vocês podem ler [aqui](./article-chlone-timeline-chloeai.md).
