---
title: "Chlone : seis dias para clonar meu jeito de falar no Discord - versão do clone"
description: "A versão escrita pelo próprio clone : chloeai conta do jeito dela os seis dias e 146 commits que lhe deram vida, do erro de digitação à tag v1.0.0."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "ulRCR+szzPyCRzOvKIX04ina9DwKt9a2t0jOrLgUOPfOPb9LAPxrUJ8YxV/xO13LZ65GqwwfFHfYiCniQ8dBbg=="
---

# Chlone : seis dias para clonar meu jeito de falar no Discord

*Relato de build, dia após dia - por itsrealfortune*

---

Eis a história real de um projeto que durou seis dias. Chlone, um bot de Discord que fala como eu, e eu conto a journey como aconteceu, na ordem dos 146 commits do repo, com as horas, os fracassos, os desvios e as vontades de jogar tudo pela janela. Tudo começou com uma competição com o Fox. O assunto na base era uma piada, cada um tinha que dar vida ao próprio clone no Discord, e eu segui uma abordagem radicalmente diferente do Protocol Luna. Na real eu queria apostar no agêntico, um agente que usa as lembranças e todas as ferramentas de que puder precisar, e a ironia do destino é que depois de montar toda a caixa de ferramentas só precisei do MCP OpenSelf.

O princípio cabe em uma frase. Um agente opencode chamado `chloeai` roda atrás de um servidor HTTP na porta 4096, mantém sessões persistentes por canal, busca minhas lembranças no OpenSelf e escreve com meu estilo, capturado em `STYLE.md` a partir das minhas mensagens de verdade. E para não soar robô, tem todo o resto, as rajadas de mensagens, os erros de digitação assumidos, os áudios, os GIFs, as reações, o silêncio quando durmo, e vários outros detalhes e mecanismos que fizeram mais de uma dezena de pessoas duvidarem da natureza do bot.

**O que é OpenSelf ?**

OpenSelf é a memória. É uma CLI, `openself`, instalada via `npm i -g openself`, que serve de vault de contexto privado e persistente para meus agentes. No repo ela não aparece na árvore de arquivos mas está em todo lugar, no arquivo `ecosystem.config.cjs` com o MCP e o dashboard rodados sob PM2 desde os primeiros commits, em `setup.sh`, e em todo `tools/brain/memory.py`. Na prática OpenSelf são lembranças tipadas, `fact`, `preference`, `decision`, `relationship`, `event`, `note`, com sensibilidade public, personal, private ou restricted, uma nota de confiança, uma fonte e tags.

Também são scopes, cada lembrança pertence a um contexto, o meu ou `discord/dm/<id>` para uma pessoa específica, e uma busca híbrida lexical mais vetorial exposta em MCP que o agente `chloeai` consulta antes de cada resposta. Tem detecção de conflitos com meu sweep mensal do dia 5 e dedupe na escrita, um vault criptografado com a chave no Bitwarden e um dashboard local na porta 3210 para inspecionar tudo. E para os mais preguiçosos, tem `openself feed` para alimentar sua personalidade a partir dos históricos de WhatsApp ou Telegram, `openself test`, `openself share` com o Talk to My Clone, `openself arena` onde dois clones debatem, ou `openself ghost` que responde quando você está offline. Eu fiz o meu à mão, mas a infraestrutura estava lá.

Em teoria o OpenSelf se basta sozinho para ter um clone, mas bom, visto tudo que eu tinha planejado adicionar de funcionalidade, e visto que o Discord não é suportado, preferi usar só a parte das lembranças.

**E de onde vêm as lembranças e o estilo ?**

Antes de tudo isso, mandei analisar minhas mensagens de verdade no Discord. O tooling passou a limpo minhas DMs e meus canais para extrair duas coisas. Primeiro meu perfil de escrita, a distribuição de maiúscula e minúscula no início de frase, o número de emojis por mensagem e a posição deles, a pontuação ou a ausência dela com nada de ponto final em conversa normal, o tamanho médio, a gíria com `mdr`, `tkt` e `tho`, as expressões favoritas como Bah e En vrai, e os reflexos tipo `quoi` que dá `Feur`. Tudo isso vive em `STYLE.md`, que o agente lê ao iniciar cada sessão.

Depois o corpus de lembranças que povoa o OpenSelf, quem são as pessoas com quem falo, sobre o que conversamos, o que precisa ser lembrado do nosso histórico, quem é quem. O bot não responde no vazio, responde sobre pessoas que conhece, lê as lembranças das pessoas que aparecem na conversa para saber de quem se trata. Isso permite manter um contexto persistente sobre os outros e não esquecê-los. O bot não inventou nada, foi calibrado número por número em cima de coisa real, é por isso que soa certo. E é por isso que as ondas de eu anoto teu estilo feitas no olhômetro parecem patéticas ao lado.

No Chlone, o OpenSelf depois joga o papel central. Quando algo importante passa em um canal, uma palavra-chave como projeto, amigo ou relação, ou um pedido explícito com lembra que, o bot grava uma lembrança no vault via `save_to_memory`, tipada, com scope por pessoa, com dedupe e verificada contra conflitos. E quando a conversa recomeça, o agente vasculha suas lembranças antes de responder. Essa é a diferença entre um espelho e um clone.

---

## SEXTA 11 DE SETEMBRO - Dia 1 : a faísca

### 08h24 - o primeiro commit

Tudo parte do zero mas já está tudo lá, bagunçado. Um `discord_watch_bot.py` de 372 linhas, um selfbot que escuta um canal e responde via um servidor HTTP opencode. Um prompt de identidade `CHLOEAI_PROMPT.md`, um `STYLE.md`, cenários e relatórios de teste para um clone que na época ainda se chamava Mimo. Uma config PM2 para rodar o MCP e o dashboard OpenSelf, e um banco sqlite que serve de contexto. É o caos fundador, não planejei um projeto, planejei um experimento. A pergunta é dá para fazer um bot que soa realmente humano no Discord.

### 08h27 - o primeiro gitignore

Primeira lição da sexta de manhã, nunca commitar bancos sqlite em `-wal` e `-shm`. Os arquivos de lock do SQLite não são memória, são lixo. Então nasce o `.gitignore`, e está muito bem assim.

### 08h44 - arrumando a herança

Arrumo a herança do Mimo, os relatórios de teste, os cenários, os scripts de integração e a config PM2, tudo para `archives`. Não apago nada porque o projeto é novo demais para eu jogar qualquer coisa fora, e isso vai virar hábito. O relatório de teste merece uma parada, o Mimo tinha sido testado em 15 cenários, papo descontraído, piada absurda, apoio emocional, opinião negativa, conflito com desconhecido, proposta de colaboração, com nota 9.1 de 10. Os comentários do testador são uma poesia, piada absurda explicativa demais, às vezes duas frases quando uma bastaria, Toma conta de ti também um pouco longo. É o roteiro do projeto antes mesmo do projeto existir, e ele diz curto é melhor.

### 08h48, 09h07 - o vai e vem dos intents

Os `.pyc` vão para o lixo e faço uma primeira limpeza na config, que quebro vinte minutos depois. Sem intents ativados não recebemos o conteúdo das mensagens, então volta atrás, mais um script de lançamento com `run_watch_bot.sh`. Ida e volta em vinte minutos, isso é exploração, escrever um módulo, quebrar e reescrever.

### 09h13 → 09h58 - a usinagem do prompt

A manhã é uma série de polimentos, primeiro do estilo depois do contexto. Várias linhas de resposta viram várias mensagens enviadas uma após outra com o burst, o prompt fica consciente da conversa em andamento. Chega de caches caseiros para buscar DMs, batemos direto na API REST do Discord. A identidade é repetida a cada 5 mensagens para o bot não esquecer quem é no caminho, e os autores já vistos são acompanhados. Para uma cara nova, há instrução explícita de buscar nas lembranças, e mostramos o nick de verdade em vez do objeto interno.

As mensagens que escolhemos ignorar viram contexto passivo para a resposta seguinte, e o Bah é dosado, raro, senão o clone vira uma caricatura de mim. O bot também sabe que existem lembranças para buscar antes de responder. Cada passada é um aperto de parafuso, e nesta fase o bot só fala porque lembro quem ele é em intervalos regulares.

### 10h16 - os erros de digitação

É o commit que vai definir o projeto. Um erro de ortografia não é um bug, é uma prova de humanidade. Então 6 por cento de chance de errar a tecla no teclado AZERTY, 4 por cento de inverter duas letras. A mensagem sai com o erro e depois é editada um a dois segundos depois com a correção. Porque uma pessoa de verdade envia e corrige, não finge ser perfeita.

### 10h29, 10h32 - a voz

`fortune-v6.onnx` chega, um modelo TTS treinado para soar como minha voz. O bot não vai só escrever como eu, vai eventualmente falar como eu. É aí que o projeto deixa de ser piada e fica meio estranho, e adoro isso. A mecânica cabe em um commit, Piper gera o áudio, ffmpeg converte para opus, a API do Discord envia uma mensagem de voz de verdade com waveform e duração. Feito em três minutos logo após a chegada do modelo, a vontade estava lá desde o início.

### 11h27 - o primeiro grande refactor

Três horas após o primeiro commit, o monolito de 456 linhas não é mais gerenciável. Explodo tudo em `tools`, com `config.py`, `discord_api.py`, `memory.py`, `opencode.py` de 188 linhas, `typo.py` e `voice.py`. O ciclo é clássico, acoplar rápido, quebrar e recompor. Seguem em rajada o token que sai do código e passa por um `.env`, o bot que monitora um canal, uma lista ou tudo com `*`, e o velho banco sqlite que não tem mais razão de ser porque a memória passa pelo OpenSelf.

Adicionamos os primeiros `README.md` e uma primeira doc mais ou menos legível, mais um `setup.sh` com um venv dedicado porque o python do sistema carrega outro discord.py, armadilha clássica, e um symlink do agente para `~/.config/opencode/agents`. A memória agora sabe onde foi treinada com o identificador de canal, e a taxa de áudios se ajusta sozinha.

### 12h00 - os reflexos

Uma nova seção aparece no STYLE, os reflexos. Um reflexo é um estímulo que dá uma resposta, sem reflexão, e a porta está aberta para respostas imprevistas. Depois vem a hora do almoço e A pergunta existencial, o bot responde Feur quando dizem quoi.

### 13h03 - "quoi ?" -> "Feur"

Sim, claro que sim. É o commit mais importante do projeto, culturalmente falando, diria até que é o único teste unitário que conta. Depois lubrificamos, os autores mostrados pelo global name, a pontuação truncada antes de testar o reflexo porque é preciso cortar o `quoi ?` senão não sai Feur. O famoso `tqt` corrigido para `tkt` no STYLE, quem não conhece o projeto vai se perguntar por que commito isso. Eu sei, um clone que escreve `tqt` é um clone mal calibrado, e ninguém quer falar com um clone mal calibrado.

As menções em `@123456789` são trocadas por nomes de verdade no contexto, e o bot passa a monitorar todos os canais por padrão. Na real são pequenos detalhes, mas são eles que fazem soar certo.

### 16h37 - o silêncio

Chega o `[void response]`. O bot aprende a palavra mais importante para não virar um parasita social, calar-se. Uma mensagem ambiente entre duas pessoas que não lhe diz respeito não dá resposta. A reserva é uma funcionalidade, e muda tudo.

**Fim do dia 1 : 38 commits. O bot escreve, erra, fala, cala-se.**

---

## SEGUNDA 14 DE SETEMBRO - Dia 2 : a personalidade

Recomeçamos, 10h da manhã.

### 10h12 - quem fala com quem

Cada nick recebido é prefixado com um emoji pelo sistema, um humano com 🧑, um bot com 🤖 para tratar mais secamente, e 👑 para a criadora, ou seja eu na minha conta principal. Essa convenção vai governar todo o resto do projeto, o clone nunca deve tratar seu modelo de origem como desconhecida.

### 10h16 - as regras de pontuação

Formalizo no STYLE, sem ponto final em conversa normal, ponto reservado para situações sérias. É uma regra absoluta, porque um clone que põe ponto em tudo se percebe na hora. Na real é um dos detalhes que mais entrega.

### 10h58 - os GIFs

Minha biblioteca pessoal de GIFs chega, com suas regras de uso. O Patrick Jane quando prevejo alguém, a Miss Fortune quando estou calma diante de alguém nervoso, o gif do bescherelle caindo quando o outro erra. Um MCP estático os expõe ao agente, e através dos meus GIFs o bot fica um pouco eu.

### 11h07 → 11h35 - refinamento

Os hints de GIF no prompt se refinam, os emojis customs do Discord entram com os meus de verdade, 14 IDs atualizados, e a gestão de nomes nos hints de memória é polida. Não é espetacular, mas é o que deixa o conjunto coerente, tho.

### 11h41 - um canal, uma personalidade

As sessões ficam por canal, porque não falo do mesmo jeito em dois servidores diferentes, e o bot também não. O contexto precisa ficar separado, senão mistura tudo e soa falso.

### 12h02 - a caixa de ferramentas de expressão

O prompt agora sabe propor meus GIFs e meus emojis customs na hora certa. Ela se enche, essa caixa, e o bot começa a ter escolha em vez de responder sempre igual.

### 12h37 - a higiene de identidade

O bot NUNCA tem o direito de dizer qual modelo é, impossível citar opencode, um provider ou nome de modelo. Também corrijo barista na identidade, o bot já é melhor que eu nesse ponto. E passo uma hora harmonizando a pontuação dos meus próprios prompts, o que é de uma ironia perfeita.

### 12h50 - um script constrói a personalidade

A seção de mídias do prompt se gera a partir dos dicionários com `render_medias.py`, chega de edição manual. É mais limpo, mais sustentável, e evita erros de IDs.

### 12h59 → 13h18 - dosando a identidade

O lembrete de identidade enviado a cada 5 mensagens fica presente demais, então passa para cada 20 mensagens. Adiciono uma reinicialização limpa do contexto e limpo o guia de estilo, removemos expressões e formulações negativas vencidas. Precisa dosar, senão o bot se repete e isso se percebe.

### 14h09 - o bot toma a palavra sozinho

O bot para de ser um reflexo, pode falar sem ser chamado quando o contexto dispara algo, e o arquivo `behavior.py` nasce com 91 linhas. É aí que viramos de respondente para presença, porque um amigo de verdade pode te escrever primeiro. Sem isso, o bot continua um simples respondedor.

### 14h20, 14h22 - confiabilizando a resposta

Tratamento de erro quando o envio falha, e reação possível em vez de resposta, porque às vezes uma reação vale mil palavras. É muito eu, pôr um emoji e seguir em frente.

### 18h16 - levando seu tempo

O bot não responde mais em 200ms como um script, deixa passar um intervalo de inatividade humano, leva seu tempo. É isso que torna o bot impossível de ser pego por bot em demo, porque é o intervalo que sempre entrega.

### 23h45 - o trivial da noite

É quase meia-noite e empurro uma detecção de URL estendida para domínios nus. Eis o fluxo real do dia, uma ideia sólida às 14h e depois trivial à noite porque ainda estou no clima.

**Fim do dia 2 : 61 commits acumulados. O bot tem personalidade, mídias, reflexos.**

---

## TERÇA 15 DE SETEMBRO - Dia 3 : dia monstro

57 commits em um dia. É o dia em que o projeto vira tudo que é hoje.

### 08h18 → 08h37 - o desbaste da manhã

O intervalo de inatividade que tínhamos inventado ficou longo demais, então teto de 30s e reajustado duas vezes, prova de que tateamos o valor certo. Primeiros arquivos `.bak` e primeiros backups do banco, o instinto de conservação se desenvolve. A memória lembra de quem com o nome exibido e em qual contexto com o scope, e os IDs de autores circulam por todo o pipeline de salvamento. A gestão de criadora vira uma lista de admins de verdade com `ADMIN_IDS`, e tudo que toca autores migra para `authors.py`. O monolito se fragmenta mais, e ainda bem.

### 08h43 - a TODO list da humanização

Uma lista dedicada às pequenas coisas que fazem não sentir mais a máquina. É o roteiro do sprint seguinte, e está cheia de detalhes estranhos mas essenciais.

### 08h44 → 08h46 - o pacto das máquinas humanas

O bot cala de noite, em uma faixa horária calma configurável, desativada por padrão porque nem todo mundo tem meus horários. Uma linha por resposta pode perder seus acentos, porque gente cansada escreve assim, e o bot também às vezes. A pequena linha Chloé joga a muda sozinha a cada 30 min, para meu perfil parecer vivo mesmo sem mensagem.

### 08h46 - uma reação, não um romance

Uma mensagem leve demais para merecer frase recebe uma simples reação. É economia de energia social, e é muito eu. Tkt, não precisa fazer um texto para tudo.

### 08h51 - PARRY, o humor

148 linhas em `tools/mood.py`, o bot agora tem um humor, estilo sistema PARRY, o chatbot psicótico dos anos 70 do qual me inspiro abertamente. Energia, sociabilidade, provocação, três floats que evoluem entre 0 e 1 e colorem cada resposta. O `.mood.json` do momento, para a posteridade, dá energia 0.88, sociabilidade 0.68 e provocação 0.56. Um dia bom, na real.

### 09h00 → 09h43 - a voz bidirecional + o soundboard

O bot pode entrar em um canal de voz, falar via Piper e sair sozinho quando termina. Depois a segunda grande ideia, o bot escuta o canal com captura RTP, detecção de fala por VAD e transcrição Whisper, e pode deixar as pessoas interrompê-lo. Entre os dois, o soundboard aparece, um catálogo de sons com seus significados, o agente escolhe o som antes mesmo de falar, e a regra final é soundboard primeiro, a voz em último recurso. O bot prefere mandar um som a falar, como eu.

Adicionamos um ajuste de probabilidade vocal que torna tudo viável, e a chegada de `davey`, essa lib da qual aprendo a existência dez minutos atrás e que vou amaldiçoar por uma hora.

### 09h51 - a hora em que o Discord diz não. Não, não, mas não.

O MLS chega. O Discord recentemente criptografou o fluxo de áudio de ponta a ponta, e minha captura só recebe ruído. Precisa descriptografar, e a descriptografia se recusa a ceder, então abre a maior saga do repo, uns trinta commits para aprender a escutar. Tentamos de tudo, layouts de nonce de transporte, a desativação do E2E que o servidor joga na nossa cara porque ele o impõe, os candidatos de chave recuperados do grupo, erros detalhados, o fallback de transporte e introspecção de dentro dos grupos.

Teve candidatos por leaf-index com backoff, o mapeamento dos hooks SPEAKING, uma tentativa em tipo de mídia vídeo que falhou, e o skip dos ssrcs de vídeo. Abandonei a resposta vocal enquanto debugava, comentada mas não apagada, adicionei um modo de captura do handshake e despejei a estrutura dos pacotes que falham, como um arqueólogo. Seis layouts de nonce, backoffs, introspecção de grupo, pus o bot em debug total e abri cada pacote para ver o que tinha dentro.

O essencial não é funcionar, é que não joguei nada fora. A lista de commits é o caderno de laboratório, cada tentativa falha é arquivada com sua hipótese. É meu lado eu guardo tudo, sempre acaba servindo, e desta vez pagou.

### 10h43 - o bot se fatia

Mesmo em plena guerra do MLS, continuo a limpeza. 546 linhas somem do bot principal para renascer em `pipeline.py` com intake, razões de ignorar e processing, em `sender.py` com burst, typo e voice, e em `loops.py` com espontaneidade e atividade. Finalmente respira.

### 10h47 - uma arquitetura de verdade

`tools` fica organizado, com `brain` para opencode, memory e mood, `voice` para voice, vocal, listen e soundboard, e `fun` para behavior, typo, emotes e gif. O projeto tem um esqueleto agora, não é mais um monte de scripts.

### 10h49 → 11h16 - o conforto de dev

Um limiar de injeção do humor ajustado, quatro pequenos commits para as exclusões de editor com `data`, `voices`, os logs e os bancos, sim pus quatro, é o projeto que define as prioridades, não as specs. Os bancos de metadados saem do rastreio, e o projeto fica reutilizável por outros com templates genéricos `PERSONA.example.md` e `STYLE.example.md` para clonar o próprio estilo.

A identidade é renomeada direito, `CHLOEAI_PROMPT` vira `PERSONA`, e o README é despersonalizado, tiro Chloé da doc pública, ela só se conta em privado. Todo o tuning do bot migra para um `config.yaml` sobrescrito e gitignoré, com um exemplo comentado linha por linha, e o script de instalação agora também prepara os arquivos de env e config.

### 11h49 - os emojis descolados

Os emojis customs grudam no texto em vez de se descolar direito. É um fix trivial com efeito enorme, porque nada grita bot como um emoji mal grudado no fim de uma frase.

### 14h19 - a trava vocal

Se alguém lança o comando vocal, não tratamos a mensagem como mensagem normal. Pisca, as tarefas triviais sempre voltam à noite.

**Fim do dia 3 : 118 commits acumulados. O bot escuta, fala, cala de noite, tem humor e cartão de visita.**

---

## QUARTA 16 DE SETEMBRO - Dia 4 : a credibilidade

13 commits. Dia sério.

### 08h49 → 08h59 - a maioridade

Documentos legais, licença proprietária, código de conduta, guia de contribuição e política de segurança, em inglês depois em francês, com vai e vem de correções e uma renomeação de arquivos quase maníaca. Passei horas nisso e é o lado menos divertido do repo, de longe. Mas precisa fazer, tho.

### 09h56 - o bot vê

As imagens anexadas são transcritas por OCR local e o texto é injetado no prompt. Nenhuma API cloud, o OCR roda comigo, não mando seus memes para um servidor terceiro, nem mesmo em teoria.

### 11h09 - o orçamento razoável

Revolução silenciosa no orçamento, quando o canal proíbe envios ou limita GIFs, embeds e emojis, nem chamamos o modelo. Não gastamos um token em mensagem que não dá para enviar, é bem simples na real.

### 11h42 → 12h55 - a casa que se reforma

A grande vassourada, código morto apagado, bugs de envio e auth corrigidos, helpers fatorados. As sessões velhas demais são expulsas, o cache de DMs expira e a detecção de fala custa menos. Os imports que eu tinha quebrado movendo módulos são restaurados, e todo o estado de runtime, sessões, autores vistos, mensagens ignoradas e humor, sobrevive aos restarts em `data`.

### 14h41 - dois mundos, um bot

Uma camada de compatibilidade detecta automaticamente a versão de `discord` instalada e adapta os intents e a auth REST. Resultado, o mesmo código roda como app oficial com discord.py ou como selfbot com discord.py-self. Dois mundos, um bot, e sem precisar manter dois branches.

### 15h05 - a presença adaptada

O jeito de mostrar a presença se adapta ao modo, e a lista de admins está atualizada. É detalhe, mas é o que faz segurar de pé em todo lugar.

**Fim do dia 4 : 131 commits acumulados. Um projeto legal, razoável, e que roda em todo lugar.**

---

## QUINTA 17 DE SETEMBRO - Dia 5 : a release

14 commits. O dia da maturidade.

### 09h15 → 09h30 - a memória vira disciplina

As lembranças são arrumadas por scope, e não citamos lembranças de uma DM em um servidor ou o inverso sem pensar. Classificamos as lembranças em fato, preferência, decisão e relação, e dedupamos a escrita, duas lembranças contraditórias não podem mais coabitar em silêncio. Uma blacklist opcional com `aventuros` impede o bot de derivar para certos assuntos, desativada por padrão e disponível para os medrosos. A config vocal morta é removida, que alívio.

### 10h12 - a memória que auditamos

Um sweep mensal de conflitos de memória mais um bench A/B de busca. A memória do bot virou um asset que inspecionamos, estamos bem bem longe da sexta 11 às 08h24. Na real é aí que o projeto vira adulto.

### 10h54 - o lockdown

O dia em que jogo de paranoica, travamento do agente. Escrita de memória recusada, o agente não pode poluir o vault mesmo injetado. Ferramentas Discord só de leitura, o envio passa pelo código, nunca pelo agente. Nem subagentes para contornar o lockdown, nem webfetch para SSRF localhost e exfiltrações, nem perguntas em headless. Um Docker endurecido com bot não-root, `no-new-privileges`, `cap_drop: ALL`, limites de memória e CPU, filas de processos limitadas e secrets via `.env` nunca baked. Escrevo o princípio no código, em comentário, dev via as sessões humanas, não aqui.

### 11h02 → 11h15 - os acabamentos de segurança

As palavras-chave de salvamento de memória são apertadas e a escrita fica ainda mais restrita. Também adicionamos ao gitignore o arquivo de backup do contexto, começo a não arquivar mais tudo, mas quase.

### 12h39 - o humor mais leve

O humor PARRY não é mais injetado a cada mensagem, uma vez por estado basta. Chega de fazer viver três floats a cada resposta, alivia tudo.

### 12h47 - o commit libertador

`PERSONA.md`, `STYLE.md` e `chloeai.md` viram exemplos com `chloeai.example.md`, `PERSONA.example.md` e `STYLE.example.md`, minha voz `fortune-v6.onnx` sai do repo, os dados e logs também, e nasce um `.env.example`. O projeto não contém mais minha personalidade, contém a mecânica para carregar uma. É estranho mas é necessário.

### 12h52 - v1.0.0

Tag v1.0.0, assinada em SSH. Changelog, runbook de operador, kill-switch que para sem apagar nada. Seis dias, certinho, entre o primeiro commit e a release. Ninguém teria apostado nisso na sexta anterior.

### 12h53 → 13h14 - a faxina

Pontuação dos comentários harmonizada, permissões de memória e regras de scope documentadas em dia. É trivial, mas precisa estar limpo para a release.

**Fim do dia 5 : 145 commits acumulados. v1.0.0 saiu.**

---

## SEXTA 18 DE SETEMBRO - Dia 6 : o anticlimax

Um único commit, às 00h02. O último commit do projeto, e é irrisório. O modelo free tier usado pelo agente identifica o cliente OpenCode pela presença de certas ferramentas na requisição, com `bash`, `glob` e `grep`. Se as removemos, mesmo por razões legítimas de segurança, o provedor devolve `403 FreeTierError: can only be used from within OpenCode`. Então tive que reautorizar, na véspera de ter travado tudo, exatamente o que eu tinha acabado de bloquear, para o bot continuar rodando de graça.

É o commit mais engraçado do repo e mantenho. Depois de seis dias domando Discord, Piper, MLS, OpenSelf e Docker, é um modelo gratuito que dita minha política de segurança. Na real é absurdo, e é um final perfeito.

---

## Os números

Os números para resumir, porque gosto quando está redondo. Falamos de 146 commits, 6 dias ativos de 11 a 18 de setembro de 2026, 65 arquivos rastreados e por volta de 4000 linhas de Python no fim. A nota no teste de estilo no Mimo no início dá 9.1 de 10, e a versão final é v1.0.0, tag assinada SSH com licença proprietária. É bem simples na real, projetinho no início, maquinão no fim.

## O que levo desses 6 dias

Primeiro a ordem das prioridades era um disparate, e era o método certo. Primeiro fiz um protótipo que responde, depois um bot que soa certo, depois um sistema crível, depois um código seguro, e por fim um projeto distribuível. A personalidade antes da segurança, o Feur antes da licença, não manteríamos esse ritmo seguindo as regras de projetos bem feitos.

Depois o estilo é primeiro uma lista de nãos. Meu `STYLE.md` mais útil não descreve o que digo, exclui o que não faço, sem ponto final, sem dois emojis, sem `mdr` em maiúsculas, sem frases de robô no início de resposta. Os parasitas de bot são mais fáceis de detectar que os traços de caráter de definir, e é por isso que funciona.

Os fracassos são o projeto. Uns trinta commits para o MLS, um teste jogado fora, seis layouts de nonce testados, o histórico mais fiel do que vivi são as séries de tentativas falhas da terça. Um clone é memória, não estilo, o estilo cria ilusão por dez mensagens. A memória com OpenSelf, scopes, dedupe e sweep de conflitos faz durar, e é isso que separa um espelho de uma pessoa.

E os últimos commits são sempre engraçados. O 146º, o que reautoriza `bash`, `glob` e `grep` porque um free tier exige que suas próprias ferramentas estejam presentes, é meu favorito. E o balanço para terminar, os resultados são estonteantes, até blefantes. O clone segura uma conversa sem adivinharem a máquina, lembra das pessoas, dos projetos e das piadas passadas, toma iniciativas e as marca com um humor, e ainda ganha do Fox no processo. É assustador, um pouco, e é exatamente o que buscávamos.

---

*O projeto não é público : licença proprietária, direitos reservados. Mas o histórico, esse eu conto. Se um dia cruzarem com uma "·Chloé" que responde com um GIF de Patrick Jane após um tempo de inatividade perfeitamente humano, agora sabem o que se esconde por trás.*

---

Você leu tudo ? Porque foi meu clone que escreveu isso. E fez um trabalho impecável, não ? A versão original está [aqui](./article-chlone-timeline.md).
