---
title: "Como as máquinas se comunicam: um panorama do TCP ao mTLS"
description: "Por que TCP, UDP, TLS, mTLS, HTTP e WebSocket não são alternativas concorrentes, mas camadas empilhadas; um panorama hierárquico da comunicação máquina a máquina, do transporte bruto à autenticação mútua."
date: 2026-07-16
tags: ["tcp", "udp", "tls", "mtls", "websocket", "http", "grpc", "rede", "arquitetura-distribuída", "protocolos"]
authors: ["docteur-turboss"]
lang: "pt"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "RVM6X3NSxM493lmZc46lgA4q+W6bzPb1kYygQPOZ/T4b8CKML2d77+Rk7OEwbL4Gfkw+MpsnY7tRJhP48N1pZA=="
---
# O problema: muitas siglas, pouca hierarquia

TCP, UDP, TLS, mTLS, WebSocket, HTTP, HTTPS, gRPC, QUIC; a maioria dos recursos que falam sobre eles os apresentam como uma lista plana de opções intercambiáveis, "a escolher conforme o caso de uso". Na realidade, eles não estão no mesmo plano: alguns são protocolos de transporte, outros são camadas de segurança que se enrolam em torno do transporte, outros ainda são protocolos de aplicação que se apoiam nos dois primeiros. Compreender a hierarquia é compreender por que nunca se "escolhe" entre TCP e TLS: escolhe-se TCP, _depois_ decide-se se coloca TLS por cima.

Este artigo reconstrói essa hierarquia camada por camada, do transporte bruto até a autenticação mútua, com para cada nível: o que ele garante, o que não garante, e quando se contentar com ele.

# Nível 1: o transporte (TCP contra UDP)

Tudo começa aqui. TCP e UDP são os dois principais protocolos da camada **Transporte (Camada 4)** do modelo OSI. O papel deles é idêntico: transportar um fluxo de dados entre duas aplicações executadas em máquinas diferentes. No entanto, a maneira como fazem isso é radicalmente diferente.

É importante entender que o IP (Internet Protocol), situado na camada de rede (Camada 3), apenas encaminha pacotes de um host para outro. Ele não garante nem a chegada, nem a ordem, nem mesmo a unicidade deles. Os roteadores simplesmente tomam decisões de roteamento independentes para cada pacote.

É precisamente essa ausência de garantias que o TCP vem compensar, enquanto o UDP escolhe deliberadamente não adicionar nada para permanecer extremamente leve.

## TCP: a confiabilidade acima de tudo

TCP (Transmission Control Protocol) é um protocolo **orientado à conexão** (_connection-oriented_). Antes de trocar o menor byte de dados, as duas máquinas devem estabelecer uma conexão lógica.

Essa conexão é criada através do famoso **Three-Way Handshake**:

```

Cliente                          Servidor
SYN ---------------------------->
        <--------------------- SYN + ACK
ACK ----------------------------> 
Conexão estabelecida
```

Cada etapa possui um objetivo preciso:

*   SYN: o cliente anuncia que deseja abrir uma conexão e fornece um primeiro número de sequência (Initial Sequence Number - ISN).
    
*   SYN-ACK: o servidor aceita a conexão, confirma o recebimento do SYN e fornece por sua vez seu próprio número de sequência.
    
*   ACK: o cliente confirma o recebimento das informações do servidor.
    

A partir desse momento, as duas máquinas conhecem o estado da conexão e podem começar a trocar dados.

### **Os números de sequência**

O TCP não vê os dados como uma sucessão de pacotes, mas como um **fluxo contínuo de bytes** (_byte stream_).

Cada byte enviado possui um número de sequência.

Exemplo:

```
Mensagem:

Bonjour

B = byte 0
o = byte 1
n = byte 2
...
```

Se um segmento contendo os bytes 1000 a 1499 for perdido durante o transporte, o receptor pode detectar exatamente o que está faltando.

O emissor retransmite apenas essa parte.

Essa granularidade é uma das razões da robustez do TCP.

### **As confirmações de recebimento (ACK)**

Após o recebimento dos dados, o destinatário envia um **ACK (Acknowledgment)**.

Ao contrário do que se imagina frequentemente, um ACK não significa:

> "Recebi este pacote"

Ele significa sim:

> "Recebi todos os bytes até o número X."

Por exemplo:

```
Cliente envia:

0 → 999

Servidor responde:

ACK = 1000
```

Isso significa:

> "Tudo o que precede o byte 1000 chegou bem."

Esse mecanismo permite confirmar o recebimento de vários segmentos de uma só vez (_cumulative acknowledgments_), reduzindo assim o número de pacotes de controle.

### **As retransmissões**

Se um ACK nunca chega, o TCP assume que o segmento foi perdido.

Ele o retransmite automaticamente.

O tempo de retransmissão (**Retransmission Timeout – RTO**) não é fixo.

O TCP mede permanentemente o tempo de ida e volta (**RTT**) graças aos ACKs recebidos e calcula dinamicamente o RTO para evitar retransmissões desnecessárias.

As implementações modernas também utilizam mecanismos como **Fast Retransmit**: quando um emissor recebe vários ACKs duplicados (geralmente três), ele deduz que um segmento intermediário foi perdido e o reenvia imediatamente, sem esperar a expiração do temporizador.

### **Reorganização dos pacotes**

A Internet não garante absolutamente que dois pacotes sigam o mesmo caminho.

Exemplo:

```
Pacote 1
Paris
 ↓
Londres
 ↓
Nova York

Pacote 2
Paris
 ↓
Frankfurt
 ↓
Chicago
 ↓
Nova York
```

O segundo pacote pode chegar antes do primeiro.

O TCP então armazena temporariamente os segmentos recebidos **fora de ordem** em um buffer (_reassembly buffer_), e depois os remonta antes de entregá-los à aplicação.

Para a aplicação, tudo parece chegar perfeitamente em ordem.

### Controle de fluxo

Uma conexão não depende apenas da rede.

O receptor também possui uma capacidade de memória limitada.

Se ele receber mais rápido do que consegue processar os dados, seus buffers acabam saturando.

O TCP resolve esse problema através de uma **janela deslizante (Sliding Window)**.

O receptor indica em cada ACK:

```
Window = 32768 bytes
```

Isso significa:

> "Você pode me enviar até 32 KB adicionais."

Se essa janela cair para zero:

```
Window = 0
```

O emissor suspende temporariamente as transmissões até que o receptor anuncie uma nova janela disponível.

Esse mecanismo constitui o **controle de fluxo (Flow Control)** e impede que um host rápido inunde um host mais lento.

### Controle de congestionamento

Mesmo que o receptor seja capaz de absorver os dados, a própria rede pode ficar saturada.

Os roteadores dispõem de filas de espera (_queues_) limitadas.

Quando transbordam, os pacotes são descartados.

O TCP interpreta as perdas como um sinal de congestionamento e adapta automaticamente sua taxa de transmissão através de uma **janela de congestionamento (Congestion Window – cwnd)**.

Os algoritmos modernos (como **Reno**, **CUBIC** ou **BBR**, dependendo dos sistemas operacionais) ajustam essa janela para encontrar um equilíbrio entre taxa máxima e estabilidade da rede.

As primeiras versões do TCP utilizavam principalmente dois mecanismos:

*   **Slow Start**: aumento exponencial da taxa até detectar um congestionamento.
    
*   **Congestion Avoidance**: crescimento depois mais prudente, geralmente linear.
    

Essa adaptação permanente é uma das razões pelas quais o TCP permanece performático apesar das variações de qualidade da rede.

### Fechamento de conexão

Ao contrário do UDP, uma conexão TCP também possui um fechamento adequado.

Cada extremidade fecha independentemente seu fluxo através da flag **FIN**.

Um fechamento completo geralmente requer quatro trocas:

```
FIN
ACK
FIN
ACK
```

Esse procedimento garante que todos os dados em trânsito foram entregues antes da destruição da conexão.

## UDP: a simplicidade máxima

UDP (User Datagram Protocol) adota a filosofia inversa.

Ele é **sem conexão (connectionless)**.

Não existe:

*   nenhum handshake;
    
*   nenhum número de sequência;
    
*   nenhuma confirmação de recebimento;
    
*   nenhuma retransmissão;
    
*   nenhum controle de fluxo;
    
*   nenhum controle de congestionamento.
    

Cada mensagem é simplesmente encapsulada em um **datagrama** independente, transmitida à rede, e depois esquecida pelo emissor.

```
Aplicação → Datagrama UDP → IP → Internet
```

O protocolo não mantém nenhum estado entre dois envios.

Cada datagrama é totalmente independente dos anteriores.

### A integridade dos dados

Embora o UDP não garanta nem a entrega nem a ordem, ele ainda protege a integridade dos dados através de um **checksum**.

No recebimento, o checksum é recalculado.

*   Se os valores coincidirem, o datagrama é aceito.
    
*   Caso contrário, é imediatamente rejeitado.
    

O UDP detecta portanto os dados corrompidos, mas nunca tenta recuperá-los.

### Por que o UDP é tão rápido?

O cabeçalho UDP contém apenas **8 bytes**, contra um mínimo de **20 bytes** para o TCP (sem contar as opções como timestamps, SACK ou Window Scaling).

Nenhuma conexão sendo mantida, o sistema operacional não precisa acompanhar o estado de cada troca, o que também reduz o consumo de memória e o custo de processamento.

A aplicação recebe os dados quase que imediatamente após sua chegada, sem esperar por eventuais retransmissões.

## Quando perder um dado é preferível

A ideia fundamental é simples:

> Uma informação antiga pode ter menos valor do que uma informação perdida.

Vamos pegar uma conversa VoIP.

Cada pacote transporta aproximadamente **20 ms** de voz.

Se um pacote for perdido, retransmiti-lo levaria muitas vezes mais tempo do que esses 20 ms.

Quando finalmente chegasse, a conversa já teria avançado.

A maioria das aplicações prefere então mascarar a perda (interpolação, silêncio, correção de erro) a esperar a retransmissão.

O mesmo raciocínio se aplica:

*   a jogos multijogador em tempo real;
    
*   ao streaming de vídeo;
    
*   a fluxos de telemetria;
    
*   a sensores IoT;
    
*   a dados de posição GPS.
    

Um valor recente é quase sempre mais útil do que um valor antigo perfeitamente confiável.

# Nível 2: a criptografia, TLS

TLS (Transport Layer Security, sucessor do SSL) não substitui o TCP, ele se adiciona por cima. Concretamente, o TLS estabelece uma conexão TCP normal, depois negocia uma sessão criptografada em seu interior: troca de certificados, acordo sobre um algoritmo de criptografia, derivação de chaves de sessão. Tudo o que transita depois é criptografado e autenticado.

Três garantias distintas, frequentemente confundidas:

*   **Confidencialidade**: ninguém além das duas partes pode ler o conteúdo.
    
*   **Integridade**: qualquer alteração dos dados em trânsito é detectada.
    
*   **Autenticação**: mas no TLS clássico, unidirecional: o cliente verifica se o servidor é realmente quem ele diz ser (através de seu certificado, assinado por uma autoridade de confiança), mas o servidor não verifica nada sobre a identidade do cliente. É exatamente o modelo do HTTPS quando você visita um site: o navegador autentica o site, o site não autentica você (a autenticação do usuário passa por um mecanismo separado, cookie de sessão, token).
    

TLS 1.3 (a versão atual recomendada) reduziu o handshake a uma única ida e volta no caso comum, contra duas para TLS 1.2, o que reduz sensivelmente a latência de conexão.

## Nível 2bis: mTLS -- a autenticação torna-se mútua

mTLS (mutual TLS) é TLS com uma restrição adicional: o servidor exige _também_ um certificado do cliente, e o verifica. As duas partes provam sua identidade através de um certificado assinado por uma autoridade de confiança comum.

Esse é o mecanismo natural para a comunicação serviço-a-serviço em uma arquitetura distribuída: enquanto o HTTPS clássico basta para que um navegador fale com um servidor público, o mTLS responde a uma pergunta diferente: _como um serviço interno sabe que está realmente falando com outro serviço interno autorizado, e não com um atacante que teria chegado à rede?_

```
Cliente                                          Servidor
  │──── ClientHello ─────────────────────────────▶│
  │◀─── ServerHello + certificado do servidor ─────│
  │──── verifica o certificado do servidor ────────│
  │──── envia SEU PRÓPRIO certificado de cliente ─▶│
  │◀─── verifica o certificado do cliente ─────────│
  │──── chaves de sessão derivadas, canal cifrado ▶│
```

A contrapartida do mTLS é operacional: é necessária uma autoridade de certificação (CA) interna, um mecanismo de distribuição dos certificados para cada serviço, e uma estratégia de rotação/revogação. Em um ambiente de máquina única com poucos serviços, às vezes é mais complexidade do que benefício -- o mTLS se torna necessário a partir do momento em que o tráfego entre serviços atravessa uma rede que não controlamos completamente (vários hosts, cloud multi-tenant), ou assim que se deseja uma política do tipo _zero trust_, onde nenhum serviço é implicitamente digno de confiança simplesmente por estar "dentro" da rede.

# Nível 3: os protocolos de aplicação sobre TCP+TLS

Uma vez o transporte e a criptografia em vigor, resta definir _como estruturar as trocas_. Esse é o papel dos protocolos de aplicação.

## HTTP / HTTPS

HTTP é um protocolo requisição-resposta: o cliente abre uma conexão (ou reutiliza uma, com o keep-alive), envia uma requisição, aguarda uma resposta, a conexão pode então se fechar ou ser reutilizada. HTTPS é simplesmente HTTP sobre TLS -- o S não muda nada na semântica do protocolo, apenas no fato de que o transporte é criptografado.

O modelo requisição-resposta tem um limite estrutural: o servidor nunca pode falar primeiro. Ele só pode responder ao que o cliente pergunta. Para polling frequente (verificar "há novidades?" a cada segundo), funciona mas desperdiça recursos -- cada requisição recria uma sobrecarga protocolar para, na maioria das vezes, não ter nada de novo a anunciar.

## WebSocket (WS / WSS)

WebSocket responde exatamente a esse limite. A conexão começa como uma requisição HTTP clássica (com um cabeçalho `Upgrade: websocket`), mas uma vez que o handshake é aceito, a conexão TCP subjacente não é mais um canal requisição-resposta HTTP -- ela se torna um canal bidirecional full-duplex onde cliente e servidor podem enviar mensagens a qualquer momento, sem ter que reemitir um ciclo requisição-resposta a cada troca.

```
GET /chat HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13

HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

WSS é simplesmente WebSocket sobre TLS, exatamente como HTTPS é HTTP sobre TLS. É o protocolo de escolha para tudo que necessita de push do servidor em tempo real -- chat, notificações, fluxo de trading, eventos de jogo -- sem querer gerenciar você mesmo um protocolo binário sobre TCP puro.

## gRPC

Menos conhecido fora do mundo dos microsserviços mas central na comunicação serviço-a-serviço: o gRPC se apoia em HTTP/2 (portanto TCP + TLS opcional), serializa as mensagens em Protocol Buffers (binário, tipado, compacto -- ao contrário do JSON texto da maioria das APIs REST), e permite nativamente o streaming bidirecional graças ao multiplexação do HTTP/2 (vários fluxos lógicos em uma única conexão TCP, sem o head-of-line blocking que várias requisições HTTP/1.1 sequenciais teriam).

## QUIC / HTTP3

QUIC muda o jogo ao partir do UDP em vez do TCP no nível do transporte, enquanto reimplementa por cima as garantias de confiabilidade que o TCP oferecia nativamente -- mas fluxo por fluxo em vez de globalmente, o que elimina o head-of-line blocking no nível do transporte (um pacote perdido em um fluxo não bloqueia mais os outros fluxos da mesma conexão). TLS 1.3 é integrado diretamente no QUIC em vez de adicionado por cima, o que reduz ainda mais a latência do handshake. HTTP/3 é HTTP sobre QUIC.

# Visão geral: onde se situa cada protocolo

Camada Protocolos Papel Transporte TCP, UDP Fazer os bytes viajarem, confiável ou não Transporte (nova geração) QUIC UDP + confiabilidade por fluxo + TLS integrado Segurança TLS, mTLS Criptografia, integridade, autenticação (uni ou mútua) Aplicação HTTP/HTTPS, WS/WSS, gRPC Estruturar as trocas (requisição-resposta, bidirecional, RPC tipado)

Um exemplo concreto para fixar as ideias: uma arquitetura de microsserviços com um dashboard web e serviços internos poderia razoavelmente combinar HTTPS (dashboard ↔ API pública, autenticação unidirecional suficiente no lado do navegador), mTLS (serviço ↔ serviço internamente, autenticação mútua necessária), e WSS (notificações em tempo real empurradas para o dashboard) -- três protocolos de aplicação diferentes, todos construídos sobre a mesma base TCP + TLS.

## Como escolher, na prática

Três perguntas geralmente bastam para decidir:

1.  **Preciso de confiabilidade e ordem, ou a atualidade do dado é mais importante que sua entrega garantida?** → TCP se sim, UDP se não (ou QUIC para ter ambos através de um compromisso diferente).
    
2.  **O servidor precisa poder iniciar mensagens, ou o cliente faz sempre a primeira solicitação?** → WebSocket/streaming gRPC se o servidor precisa empurrar, HTTP clássico caso contrário.
    
3.  **As duas partes precisam provar mutuamente sua identidade, ou apenas uma das duas precisa ser verificada?** → mTLS para serviço-a-serviço em ambiente zero-trust, TLS simples para cliente público clássico.
    

A complexidade operacional aumenta a cada camada adicionada: TCP puro não tem nenhuma infraestrutura para gerenciar, TLS exige certificados, mTLS exige uma CA e uma estratégia de rotação, gRPC exige uma definição de esquema Protobuf compartilhada. O bom reflexo é só aumentar a complexidade quando a camada inferior mostra um limite concreto, não por antecipação.
