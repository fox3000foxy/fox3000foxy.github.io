---
title: "Os Bots do TF2 Não São Aleatórios: Eu Engenharia Reversa em Cada Configuração de Dificuldade"
description: "Visão, rastreamento de mira, ângulos de facada do Spy, lógica de headshot do Sniper, todos os bugs conhecidos -- a Valve nunca documentou nada disso. Então nós vasculhamos o código e transformamos tudo numa especificação completa."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - game-ai
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "1YmkPKMKNjWsvVcnKAZBOHwaYv6zNOUqnDr6yeY+mgufoLMLEhXln9IMuBdgLi2J2B4oVgLyEFp0MvlSTxEoYQ=="
---

## Introdução

![Bot Soldier do TF2 mirando com um lança-foguetes](assets/tf2-bot-ai-soldier-aim.png)

Todo jogador de TF2 já disse pelo menos uma vez: "esse bot está trapaceando." Ou o oposto: "por que esse bot Fácil está parado tomando foguetes." Ninguém realmente sabe o que "Fácil," "Normal," "Difícil" e "Expert" realmente *significam* internamente -- a Valve lançou quatro rótulos de dificuldade e exatamente zero documentação.

Então um grupo de nós (eu, awimii, Mush The Possum, com uma enorme parte do trabalho de base feita por sigsegv, que realmente mergulhou no código decompilado do jogo) montou um documento de pesquisa completo sobre o comportamento dos TFBots. Cada mecânica, cada bug conhecido, cada probabilidade fixada no código. Este artigo é o relatório completo, não a versão resumida. Pegue um Bonk, esse é longo.

---

## Capítulo I: O Básico

### Bot vs Puppet Bot

O TF2 tem duas coisas completamente diferentes que as pessoas chamam de "bots":

- **Bots de IA (TFBots)**: IA real, construída sobre a mesma estrutura PlayerBot/Infected que a Valve usou para a série *Left 4 Dead*. Eles escolhem uma classe aleatória, jogam pelo objetivo, funcionam sem `sv_cheats`, e ativam conquistas como um jogador real faria.
- **Puppet bots**: IA zero, não podem se mover ou agir sozinhos. Existem puramente para serem controlados manualmente -- um jogador pode forçá-los a seguir, mirar e atirar, usados principalmente para testes ou para fazer capturas de tela/vídeos cinematográficos. Gerá-los requer `sv_cheats 1`, o que também desabilita conquistas para a sessão.

Este artigo é inteiramente sobre o primeiro tipo.

### O que os bots de IA podem (mais ou menos) ser instruídos a fazer

TFBots não são diretamente controláveis, mas há uma pequena lista de coisas que você pode incentivá-los a fazer:

- Aponte sua mira para qualquer bot (amigo ou inimigo) e ele irá provocar você se você usar os comandos de voz certos.
- Um bot Médico amigo cura você se você usar o comando de voz "Médico!"
- Se um bot Médico está te curando e tem uma ÜberCharge pronta, dizer "Vai vai vai!" ou "Ative a carga!" faz com que ele ative a carga imediatamente.
- Um bot Médico com carga pronta vai ativá-la automaticamente no momento em que ele ou seu alvo de cura sofrer dano sério, sem necessidade de comando de voz.
- Bots realizam provocações em par (High Five) ou provocações em grupo (Conga) espontaneamente com companheiros de equipe próximos.

### Fazendo bots funcionarem em mapas não suportados

Bots dependem de uma malha de navegação para saber onde podem andar, e a maioria dos mapas da comunidade não vem com uma. Para forçar:

1. `sv_cheats 1`
2. `nav_generate` -- constrói a navmesh inicial, progresso mostrado no console
3. Aguarde o jogo terminar de gerar os caminhos
4. Opcionalmente, corrija dados de navegação ruins manualmente com `nav_edit 1`
5. Recarregue ou reinicie o servidor (pular isso desabilita conquistas)
6. `tf_bot_add <número>` para realmente gerar bots

**Aviso:** alterar a navmesh enquanto bots estão ativos no servidor pode travar o jogo. Uma vez que a malha existe, você não precisa regenerá-la para sessões futuras -- apenas adicione bots novamente com `tf_bot_add`.

Malhas geradas automaticamente funcionam melhor em mapas de Control Point, King of the Hill, Payload e CTF. Em mapas Mannpower, os bots usam o estilo de jogo CTF por padrão, mas mal usam ganchos ou powerups. Se um mapa não tem objetivo que a IA do bot reconheça, mas tem uma entidade de sala de spawn, definir `tf_bot_offense_must_push_time 0` permite que os bots lutem de qualquer forma.

*(Fonte para esta seção: a página oficial de Bots da Wiki do TF2.)*

### Status atual, mapa por mapa

Graças à atualização Hatless, todas as classes funcionam corretamente agora, incluindo o historicamente problemático Spy. Os bots se comportam adequadamente na maioria dos mapas KOTH oficiais, alguns mapas Payload, Dustbowl/Gorge Attack-Defense e mapas CTF/Mann Manor -- embora nestes últimos dois você não possa gerá-los diretamente com `tf_bot_add`. Em mapas não suportados (através do processo nav_generate acima) eles funcionam, apenas visivelmente piores em imitar um jogador real.

Mapas PLR são uma causa perdida: bots não conseguem ultrapassar as barreiras em Hightower e ficam presos em cantos, e em todos os outros mapas PLR eles simplesmente... fazem uma festa de dança em vez de jogar. Isso pode ser corrigido eventualmente. Ou não.

### Comportamento geral dos bots

Uma miscelânea de coisas que todo bot faz independentemente da habilidade:

- Bots usam apenas equipamentos padrão (um plugin pode forçar armas não-padrão neles, mas bots vanilla nunca escolhem as suas próprias).
- Bots Fáceis mal usam sua arma secundária. Dificuldades mais altas trocam para a secundária no momento em que a principal fica sem munição, ou para compensar o alcance.
- Bots não conseguem fazer técnicas de movimento -- sem rocket jumps, sem realocação de construções.
- Após uma morte, um bot pode provocar, mesmo sob fogo -- exceto enquanto carrega a inteligência inimiga, e esta regra também se aplica no MvM.
- Bots Spies disfarçados (jogador ou IA) são ignorados corretamente por outros bots -- até tocarem um inimigo, sabotarem algo, atirarem ou ficarem invisíveis perto de um. Uma vez "descoberto", aquele bot/jogador específico é lembrado como Spy até que mude de disfarce enquanto permanece invisível, morra ou finja morte com o Dead Ringer.
- Bots Pyro usam Compression Blast liberalmente em qualquer coisa acima de Fácil.
- Bots Médicos priorizam curar todos acima de Snipers (e, em menor grau, Engineers), mesmo se você gritar "Médico!" como um deles.
- Bots Médicos gravitam em direção a Heavies, Soldiers, Demomen e Pyros -- especificamente se um *humano* está jogando essas classes. Sem humanos nesses papéis, sem atenção particular do Médico.
- Bots mantêm posição durante o tempo de preparação em mapas Attack/Defense e Payload -- exceto Engineers, Snipers e Spies, que se movem livremente (bots Demoman também podem pré-posicionar stickybombs).
- Bots Engineer nunca melhoram ou removem sabotagem de construções de outro Engineer amigo, a menos que essa construção esteja no caminho do seu alvo. Eles também às vezes simplesmente... não reparam sua própria torreta, mesmo quando é seguro fazer isso.
- Bots Spies que foram descobertos trocam para seu revólver e recuam em vez de forçar uma facada.
- Bots Demoman que localizaram uma sentry (geralmente morrendo para ela uma vez) podem perfeitamente arremessar stickybombs sobre ela de fora do alcance, fazendo curvas ao redor de paredes e tetos quando a geometria permite.
- Bots Sniper que não conseguem encontrar um alvo após mirar usam uma das falas de voz "Negativas".
- Médicos amigos curam um Spy disfarçado sem hesitação.

### Problemas/bugs conhecidos

O documento lista uma boa quantidade de peculiaridades antigas:

- Bots podem tentar andar ou atirar através de certos objetos estáticos.
- Qualquer vez que um jogador/bot se desmascara, se disfarça ou se revela, bots próximos "veem" e viram para reagir -- mesmo que o evento tenha ocorrido fora do campo de visão real deles. Não é baseado em som; é uma bypass na verificação de visão.
- Raramente, bots podem ficar fisicamente presos juntos ao usar um teleporter do Engineer.
- Comandos de voz de bots (ex. "Spy!", "Forward!") não aparecem como texto no chat como os dos jogadores.
- Um bot Médico curando ativamente alguém não desvia de fogo recebido nem pega kits de saúde, mesmo com HP criticamente baixo.
- Bots podem continuar se movendo enquanto realizam uma provocação em par, o que quebra o efeito pretendido do Festive Critical Strike.
- Bots Médicos recentemente danificados frequentemente se recusam a usar a Syringe Gun à distância, preferindo combate corpo a corpo (ou, em casos muito raros, tentando acertar você com o feixe da Medi Gun).
- Bots Médicos não compensam a queda da gravidade nos tiros da Syringe Gun -- provavelmente porque a arma não está marcada corretamente como não-hitscan no código da IA.
- Bots Spy podem ver e rastrear um Spy invisível (jogador ou IA) se esse Spy já tiver sido descoberto uma vez, independentemente do nível de habilidade do bot rastreador.
- Mesmo se um jogador-Spy se disfarçar como a classe do próprio time, esbarrar em um inimigo ainda o denuncia (bots nunca fazem isso consigo mesmos, já que bots nunca se disfarçam como seu próprio time).
- Bots respeitam o balanceamento automático de times -- se você está tentando acumular bots em um time, precisa de `mp_teams_unbalance_limit 0` primeiro.
- Bots Engineer podem simplesmente ignorar suas próprias construções até que sejam destruídas.
- Bots Heavy às vezes tentam atirar com a Minigun com munição criticamente baixa, principalmente abaixo da dificuldade Difícil.
- Bots Médicos do time perdedor ocasionalmente cometem suicídio durante a fase de Humilhação quando nenhum inimigo está por perto -- algo que um jogador humano não consegue replicar nem tentando.
- Definir sua pré-visualização de time na tela de carregamento para BLU faz com que os bots RED sejam renderizados visualmente como BLU para você.
- Bots com corpo a corpo equipado às vezes se recusam a trocar de arma mesmo depois de pegar munição.
- Pós-Jungle Inferno, bots gerados com parâmetros explícitos (ex. `tf_bot_add 5 pyro blue normal`) podem morrer instantaneamente na própria sala de spawn. Correção: `tf_bot_reevaluate_class_in_spawnroom 0` (precisa de `sv_cheats 1`).

### Nomes da IA

Os nomes dos bots são retirados de um grande conjunto de referências ao TF2, outros jogos da Valve e cultura de programação, em grande parte porque a comunidade continuava pedindo nomes específicos nos fóruns da Steam. Uma amostra da lista: *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF*, e dezenas de outros nessa linha.

Há também um lote de nomes encontrados em uma versão vazada do código-fonte que nunca foi lançada em produção, por razões não claras -- principalmente referências a *Last Dragon* e *The Fifth Element* como *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?*, e *I'm your huckleberry*.

Você pode substituir tudo isso você mesmo: `tf_bot_add heavyweapons blue "Blu Hoovy"` gera um Heavy BLU nomeado chamado "Blu Hoovy."

---

## Capítulo II: Os Bots Originais / TFBots -- Mergulho Profundo nos Níveis de Habilidade

A estrutura original de sigsegv ainda se mantém: é óbvio que bots Expert superam bots Fáceis, mas a Valve nunca explicou *o quanto* ou *por quê*. Então a única maneira de saber é ler o código. Aqui está toda mecânica que escala com a habilidade.

### Definindo a dificuldade

Fora do MvM, a dificuldade é controlada por um cvar:

| `tf_bot_difficulty` | Nível de habilidade |
| --- | --- |
| 0 | Fácil |
| 1 | Normal (padrão) |
| 2 | Difícil |
| 3 | Expert |

`tf_bot_add` também aceita um argumento de dificuldade diretamente (`easy`/`normal`/`hard`/`expert`).

### Popfiles do MvM

Em Mann vs. Machine, cada bloco de spawn de `TFBot` no popfile tem uma chave `Skill` opcional. Sem chave significa Fácil. Nas próprias missões da Valve: Giants são quase sempre Expert, Engineers e Spies são quase sempre Expert, e Snipers são geralmente Difícil (ocasionalmente Expert). Se você estiver usando `EventChangeAttributes` (adicionado na atualização Two Cities) para alterar dinamicamente bots durante uma onda com base em eventos do mapa, a habilidade do bot é uma das propriedades que você pode alterar em tempo real.

### Modo Endless do MvM

O modo Endless nunca foi lançado oficialmente, mas nele, os bots gastam seu dinheiro em melhorias como os jogadores fazem -- incluindo uma melhoria exclusiva de bot que aumenta seu nível de habilidade de IA durante a partida.

### A entidade `bot_generator`

Uma entidade obscura, em grande parte não documentada, que se acredita ter sido usada no modo de treinamento e possivelmente no desenvolvimento inicial do MvM. Ela expõe uma entrada `SetDifficulty` para controlar o nível de habilidade. Além disso, a trilha se perde -- a Valve nunca a documentou e ninguém mapeou completamente seu comportamento.

### Cor do brilho dos olhos

Robôs do MvM têm uma partícula de brilho nos olhos que muda de cor com o nível de habilidade -- uma dica visual que ninguém fora da comunidade jamais explicou:

| Habilidade | Cor dos olhos | RGB |
| --- | --- | --- |
| Fácil/Normal | Azul | `#24b4ff` |
| Difícil/Expert | Amarelo | `#fff000` |

![Bot Heavy do TF2 em pose parada](assets/tf2-bot-ai-heavy-idle.png)

### Visão: tempo de reconhecimento

Um bot não reage no instante em que algo entra em seu campo de visão -- há um atraso fixado no código antes que o resto da IA possa sequer reconhecer a ameaça:

| Habilidade | Tempo mínimo de reconhecimento |
| --- | --- |
| Fácil | 1,00 s |
| Normal | 0,50 s |
| Difícil | 0,30 s |
| Expert | 0,20 s |

Isso é a maior parte do efeito "bots Fáceis parecem burros" em um único número -- um bot Fácil não mira pior depois que te nota, ele simplesmente leva cinco vezes mais tempo para notar que você existe.

### Mira: taxa de atualização

Bots não rastreiam você continuamente. Eles amostram sua posição e velocidade em um intervalo fixo e preveem uma linha reta a partir disso:

| Habilidade | Intervalo de recálculo | Taxa equivalente |
| --- | --- | --- |
| Fácil | 1,00 s | 1x/s |
| Normal | 0,25 s | 4x/s |
| Difícil | 0,10 s | 10x/s |
| Expert | 0,05 s | 20x/s |

**Exceção:** bots Spy são programados para a taxa de rastreamento Normal independentemente do seu nível de habilidade real -- um Spy Expert ainda mira como um bot Normal. Há também um vídeo de demonstração público comparando as taxas de rastreamento lado a lado se você quiser ver a diferença de 1x vs 20x em movimento.

### Mira: habilidade específica por arma

Bots não apontam apenas para o centro de massa -- eles têm lógica por arma, parte dela genuinamente bugada:

**Grenade Launcher & Sticky Launcher.** Todos os níveis de habilidade compensam o arco vertical, usando um valor fixo do cvar `tf_bot_ballistic_elevation_rate`. Como essa compensação só é acionada para o ID de arma base, variantes de projétil mais rápido (Loch-n-Load, qualquer coisa com modificador de velocidade de projétil) não recebem arcos corretamente ajustados. E como é indexado pelo ID de arma especificamente, o Loose Cannon -- um ID completamente diferente -- não recebe compensação de arco alguma.

**Huntsman.** Bots Fáceis não compensam a queda da flecha e nunca miram na cabeça. Bots de habilidade Normal compensam o arco, mas só miram na cabeça dentro de 150 HU. Bots Difícil/Expert sempre miram na cabeça.

**Lança-foguetes.** Acima de 150 HU, bots não-Fáceis miram em seus pés em vez do centro de massa, maximizando o dano de splash e as chances de knockback. Dentro de 150 HU eles mudam para headshots. Bots Fáceis sempre miram no centro de massa independentemente da distância. Isso também está travado por ID de arma: o Direct Hit e o Cow Mangler não herdam o comportamento. Faz sentido para o Direct Hit (sem Área de Efeito para explorar); não faz sentido nenhum para o Cow Mangler -- esta parte da IA antecede a existência da arma e simplesmente nunca foi revisitada.

**Fuzis de Sniper.** Fácil mira no corpo. Normal mira aproximadamente 33% do caminho do corpo para a cabeça. Difícil/Expert miram direto na cabeça. Importa menos no MvM, onde headshots de bots não recebem bônus de dano de qualquer forma.

### Audição: sensibilidade a disparos furtivos

Cada tiro alerta bots próximos sobre a posição do atirador, mesmo através de paredes, até 3000 HU com 100% de chance de notar (`tf_bot_notice_gunfire_range`). Mas um subconjunto de armas é marcado como "furtivo" -- audível apenas dentro de 500 HU (`tf_bot_notice_quiet_gunfire_range`), e mesmo assim com uma chance dependente da habilidade:

| Habilidade | Chance de notar um tiro furtivo |
| --- | --- |
| Fácil | 10% |
| Normal | 30% |
| Difícil | 60% |
| Expert | 90% |

Essa probabilidade é reduzida pela metade se um tiro *alto* foi ouvido nos últimos 3 segundos -- sons altos mascaram sons baixos.

A lista de IDs de armas furtivas não é atualizada desde dezembro de 2010. Qualquer coisa adicionada após essa data usando um ID de arma novo é tratada como alta por padrão, não importa o quão silenciosa logicamente deveria ser, a menos que por acaso tenha reutilizado um ID mais antigo. Concretamente:

| ID da Arma | Abrange |
| --- | --- |
| `TF_WEAPON_KNIFE` | Todas as facas do Spy |
| `TF_WEAPON_FISTS` | Socos específicos do Heavy (soco multiclasses dele é na verdade `TF_WEAPON_FIREAXE`) |
| `TF_WEAPON_PDA` | Acredita-se não usado diretamente |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | PDA de Construção do Engineer |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | PDA de Destruição do Engineer |
| `TF_WEAPON_PDA_SPY` | Kit de disfarce do Spy |
| `TF_WEAPON_BUILDER` | Kit de Engineer/Sapper do Spy |
| `TF_WEAPON_MEDIGUN` | Todas as Medi Guns |
| `TF_WEAPON_DISPENSER` | Provavelmente não usado (Dispensers são objetos, não armas) |
| `TF_WEAPON_INVIS` | Todos os relógios de invisibilidade do Spy |
| `TF_WEAPON_FLAREGUN` | Todas as flare guns do Pyro *exceto* o Manmelter |
| `TF_WEAPON_LUNCHBOX` | Sanduíche, Barra Dalokohs, Buffalo Steak Sandvich, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (não Mad Milk -- ID separado, não furtivo) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mòr, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

O exemplo clássico da lista apodrecendo: o Manmelter ganhou seu próprio ID (`TF_WEAPON_RAYGUN_REVENGE`), adicionado depois que a lista furtiva foi congelada -- então é tratado como alto, apesar de ser uma flare gun em todo sentido prático. O Scorch Shot, lançado ainda depois, reutiliza o ID base `TF_WEAPON_FLAREGUN` e portanto ainda é considerado furtivo. Sem sentido, mas é o código.

### Estratégia: priorização de ameaças

Quando múltiplos inimigos estão visíveis ao mesmo tempo, os bots ponderam distância, se estão sendo alvejados e -- acima de Fácil -- se a ameaça principal está sendo curada:

| Habilidade | Mira no curador? |
| --- | --- |
| Fácil | Não |
| Normal | 50% de chance |
| Difícil | Sim |
| Expert | Sim |

Inimigos além de 500 HU são normalmente despriorizados como não imediatos. Exceções: bots Difícil/Expert sempre tratam Médicos e Engineers distantes como ameaças imediatas, e qualquer Sniper inimigo mirando aproximadamente na sua direção é sempre tratado como imediato independentemente da distância e habilidade.

| Habilidade | Médicos/Engineers/Snipers mirando distantes = ameaça imediata? |
| --- | --- |
| Fácil/Normal | Não |
| Difícil/Expert | Sim |

Essa verificação do Sniper tem uma história genuinamente engraçada. O artigo original de sigsegv assumiu que o jogo exigia que o produto escalar entre o vetor de mira do sniper e a posição relativa do bot fosse *exatamente zero* -- uma comparação tão precisa que quase nunca seria acionada em matemática de ponto flutuante, tornando todo o recurso efetivamente código morto. Uma correção emitida mais tarde (crédito a uma decompilação Hex-Rays mais limpa) mostrou que a verificação real é `produto escalar > 0`: qualquer Sniper virado de diretamente para você até perpendicular a você conta como ameaça imediata; qualquer coisa de perpendicular até virado de costas não conta. A leitura original errada veio de uma má decompilação de uma comparação SSE de floats -- fazer engenharia reversa de um binário AAA não é uma ciência exata.

### Movimento: desvio

Bots Fáceis nunca desviam, ponto final. Bots Normal e acima desviam para esquerda/direita (33% esquerda, 33% direita, 33% não faz nada, ponderado contra lacunas detectadas) quando estão segurando uma arma de combate, viram um inimigo nos últimos 3 segundos, e esse inimigo tem linha de visão para eles.

Eles *não* desviam se alguma destas se aplicar: atributo `DisableDodge` definido, comportamento atual diz para se apressar, atualmente invulnerável (qualquer über), no meio de provocação/provocação, jogando de Engineer, invisível ou disfarçado de Spy, mirando como Sniper ou com a minigun girada como Heavy, ou no meio de puxar o Huntsman.

### Movimento: evitar empurrar inimigos

Acima de Normal, bots especificamente tentam não esbarrar em inimigos enquanto se movem:

| Habilidade | Evita esbarrar em inimigos? |
| --- | --- |
| Fácil | Não |
| Normal | Não |
| Difícil | Sim |
| Expert | Sim |

Na prática, isso só importa realmente para bots Spy -- evitar uma colisão estranha com um jogador inimigo é exatamente o tipo de coisa que estraga um disfarce.

### Pyro: maestria do airblast

O airblast serve a dois propósitos: refletir projéteis (PvP e MvM) e empurrar inimigos próximos de bordas (apenas PvP). Se o bot realmente aperta o gatilho em uma oportunidade válida é um cara ou coroa baseado em habilidade:

| Habilidade | Chance de acionar airblast |
| --- | --- |
| Fácil | 0% |
| Normal | 50% |
| Difícil | 90% |
| Expert | 100% |

Bots Pyro Fáceis literalmente não podem usar airblast -- a rolagem é programada para nunca ter sucesso, não apenas "raramente."

### Spy: eficácia do disfarce

Dois eixos separados escalam com a habilidade. Escolha do *disfarce*:

| Habilidade | Método de disfarce |
| --- | --- |
| Fácil/Normal | Classe aleatória, ignorando o que o time inimigo está realmente jogando |
| Difícil/Expert | Escolhe um jogador inimigo real e copia a classe exata dele |

*Atuação* do disfarce:

| Habilidade | Comportamento enquanto disfarçado/invisível |
| --- | --- |
| Fácil/Normal | Encara jogadores inimigos quando os vê (suspeito) |
| Difícil/Expert | Deliberadamente evita contato visual (mais convincente) |

### Spy: agressividade de facada

À longa distância (até 300 HU, `tf_bot_spy_knife_range`), um bot Spy só comete uma facada se puder ver a vítima e as costas da vítima estiverem pelo menos parcialmente viradas. A habilidade determina o quão fora do centro esse ângulo das costas pode estar:

| Habilidade | Tolerância de ângulo |
| --- | --- |
| Fácil | Tenta mesmo com você virado diretamente para ele |
| Normal | ±45° das suas costas |
| Difícil | ±78° das suas costas |
| Expert | ±90° das suas costas (arco traseiro completo de 180°) |

Bots Spy Fáceis são funcionalmente suicidas -- eles tentam uma facada em alguém olhando diretamente para eles. **Exceção:** em Mann vs. Machine, todo bot Spy é forçado à restrição de ângulo Normal independentemente da habilidade real.

### Táticas: seleção de armas

Só entra em ação acima de Fácil, e é praticamente irrelevante no MvM já que bots lá geralmente têm restrições de armas severas:

- **Scout**: troca para a secundária quando o pente da principal está vazio.
- **Soldier**: troca para a secundária com pente vazio *e* alvo mais próximo que 500 HU.
- **Sniper**: troca para a secundária para alvos mais próximos que 750 HU.
- **Pyro**: troca para a secundária para alvos mais distantes que 750 HU, a menos que o alvo seja um Soldier ou Demoman.

### Táticas: recarga coberta

Não usado no MvM. Se o comportamento atual do bot não está mandando ele recuar, seu pente principal está vazio e ele não está uberado, bots de habilidade mais alta recuam temporariamente para se proteger para recarregar em vez de clicar com uma arma vazia em você:

| Habilidade | Recua para recarregar? |
| --- | --- |
| Fácil | Não |
| Normal | Não |
| Difícil | Sim |
| Expert | Sim |

### Modo CP: vagueação do defensor

Não usado no MvM. Defendendo um ponto de controle, bots de habilidade mais alta são mais propensos a sair do ponto para caçar mortes ("search and destroy"), mas apenas com uma quantidade decente de tempo restante em `tf_bot_defense_must_defend_time`:

| Habilidade | Chance de vaguear |
| --- | --- |
| Fácil | 10% |
| Normal | 50% |
| Difícil | 75% |
| Expert | 90% |

### Modo CP: bloqueio de captura

Não usado no MvM. Bots defendendo contestando uma tentativa de captura inimiga:

| Habilidade | Tentará bloquear a captura? |
| --- | --- |
| Fácil | Não |
| Normal | 50% de chance |
| Difícil | Sim |
| Expert | Sim |

---

## A tabela resumo completa

<div style="overflow-x:auto">

| Aspecto | Fácil | Normal | Difícil | Expert | Notas |
| --- | --- | --- | --- | --- | --- |
| Visão: tempo de reconhecimento | 1,00s | 0,50s | 0,30s | 0,20s | |
| Mira: taxa de atualização | 1x/s | 4x/s | 10x/s | 20x/s | Spies sempre usam Normal |
| Compensação de arco granada/sticky | Sim | Sim | Sim | Sim | Loose Cannon isento |
| Compensação vertical Huntsman | Não | Sim | Sim | Sim | |
| Headshots Huntsman | Não | <150 HU | Sim | Sim | |
| Tiros nos pés Lança-foguetes | Não | Sim | Sim | Sim | Direct Hit & Cow Mangler isentos |
| Ponto de mira Fuzil de Sniper | Corpo | ~33% para cabeça | Cabeça | Cabeça | |
| Chance de notar tiros furtivos | 10% | 30% | 60% | 90% | Reduzida à metade se mascarado por tiros altos |
| Mira no curador | Não | 50% | Sim | Sim | |
| Médico/Engineer/Sniper distante = ameaça | Não | Não | Sim | Sim | |
| Desvio | Não | Sim | Sim | Sim | Longa lista de exceções |
| Evita esbarrar em inimigos | Não | Não | Sim | Sim | Importa principalmente para Spy |
| Chance de acionar airblast | 0% | 50% | 90% | 100% | |
| Escolha de classe do disfarce Spy | Aleatório | Aleatório | Combina inimigo real | Combina inimigo real | |
| Contato visual Spy enquanto disfarçado | Encara (óbvio) | Encara | Evita (convincente) | Evita | |
| Ângulo de facada Spy | ~0° | ±45° | ±78° | ±90° | MvM força Normal |
| Lógica de seleção de armas | Não | Sim | Sim | Sim | Menos relevante no MvM |
| Recarga coberta | Não | Não | Sim | Sim | Não no MvM |
| Vagueação do defensor CP | 10% | 50% | 75% | 90% | Não no MvM |
| Bloqueio de captura CP | Não | 50% | Sim | Sim | Não no MvM |

</div>

---

## Conclusão

![Bot Heavy do TF2 mirando com uma minigun](assets/tf2-bot-ai-heavy-aim.png)

Nada disso é um palpite errado da Valve -- é um sistema de pontuação e probabilidade deliberado e totalmente determinístico, apenas nunca escrito em lugar oficial nenhum. Algumas coisas que valem lembrar:

1. **"Habilidade" é um conjunto de controles independentes**, não um multiplicador global único. Tempo de reação, taxa de mira e cada comportamento tático escalam separadamente, e alguns (taxa de rastreamento do Spy, ângulo de facada no MvM) têm substituições fixadas no código independentemente da habilidade.
2. **Parte disso é genuinamente bugado, não apenas antigo.** A lista de armas furtivas congelada desde 2010, o Cow Mangler sem a lógica de tiro nos pés sem motivo algum, a verificação de produto escalar do Sniper que levou anos para ser decompilada corretamente -- o código de IA da Valve tem cicatrizes como qualquer outra base de código de 17 anos.
3. **Você pode usar tudo isso.** Saber que um bot Sniper não vai acertar um headshot em você no Normal, que um Pyro Fácil literalmente não pode refletir seu foguete de volta, que um Spy Fácil vai tentar te esfaquear cara a cara. Não é sorte. É uma ficha técnica.

Muito obrigado a sigsegv pelo mergulho no código original que tornou a maior parte disso possível, à Wiki do TF2 pela documentação básica sobre comandos de bot e suporte a mapas, e a todos na comunidade que ainda estão cutucando uma IA de bot de 17 anos para descobrir exatamente por que ela faz o que faz.
