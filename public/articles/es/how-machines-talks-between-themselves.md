---
title: "Cómo hablan las máquinas: un recorrido de TCP a mTLS"
description: "Por qué TCP, UDP, TLS, mTLS, HTTP y WebSocket no son alternativas competidoras sino capas apiladas; un recorrido jerárquico de la comunicación máquina a máquina, del transporte en bruto a la autenticación mutua."
date: 2026-07-16
tags: ["tcp", "udp", "tls", "mtls", "websocket", "http", "grpc", "réseau", "architecture-distribuée", "protocoles"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "oV2lmP2Ho2PScMkHdE6KXtlNyiFBBKSFzrrGskCbi8uCLPHQn3Hh+7pBP6bloIsUAxN+z2AdPSsYs+aGUX9WIw=="
---
# El problema: demasiadas siglas, poca jerarquía

TCP, UDP, TLS, mTLS, WebSocket, HTTP, HTTPS, gRPC, QUIC; la mayoría de los recursos que hablan de ellos los presentan como una lista plana de opciones intercambiables, "a elegir según el caso de uso". En realidad no están en el mismo plano: algunos son protocolos de transporte, otros capas de seguridad que se enrollan alrededor del transporte, otros aún protocolos aplicativos que se apoyan en los dos primeros. Entender la jerarquía es entender por qué nunca "eliges" entre TCP y TLS: eliges TCP, _y luego_ decides si pones TLS encima.

Este artículo reconstruye esa jerarquía capa por capa, del transporte en bruto hasta la autenticación mutua, con para cada nivel: lo que garantiza, lo que no garantiza, y cuándo conformarse con él.

# Nivel 1: el transporte (TCP contra UDP)

Todo empieza aquí. TCP y UDP son los dos principales protocolos de la capa **Transporte (Layer 4)** del modelo OSI. Su rol es idéntico: transportar un flujo de datos entre dos aplicaciones ejecutadas en máquinas distintas. Sin embargo, su forma de lograrlo es radicalmente distinta.

Es importante entender que IP (Internet Protocol), situado en la capa red (Layer 3), solo encamina paquetes de un anfitrión a otro. No garantiza ni su llegada, ni su orden, ni siquiera su unicidad. Los routers simplemente toman decisiones de ruteo independientes para cada paquete.

Es justo esa ausencia de garantías la que TCP viene a compensar, mientras UDP elige deliberadamente no añadir nada para seguir siendo extremadamente ligero.

## TCP: la fiabilidad ante todo

TCP (Transmission Control Protocol) es un protocolo **orientado a conexión** (_connection-oriented_). Antes de intercambiar el menor byte de datos, ambas máquinas tienen que establecer una conexión lógica.

Esa conexión se crea gracias al famoso **Three-Way Handshake**:

```

Client                           Serveur
SYN ---------------------------->
        <--------------------- SYN + ACK
ACK ---------------------------->
Connexion établie
```

Cada etapa tiene un objetivo preciso:

*   SYN: el cliente anuncia que desea abrir una conexión y aporta un primer número de secuencia (Initial Sequence Number - ISN).

*   SYN-ACK: el servidor acepta la conexión, acusa recibo del SYN y aporta a su vez su propio número de secuencia.

*   ACK: el cliente confirma la recepción de la información del servidor.


A partir de ese momento, ambas máquinas conocen el estado de la conexión y pueden empezar a intercambiar datos.

### **Los números de secuencia**

TCP no ve los datos como una sucesión de paquetes, sino como un **flujo continuo de bytes** (_byte stream_).

Cada byte enviado tiene un número de secuencia.

Ejemplo:

```
Message :

Bonjour

B = octet 0
o = octet 1
n = octet 2
...
```

Si un segmento con los bytes 1000 a 1499 se pierde durante el transporte, el receptor puede detectar exactamente qué falta.

El emisor retransmite solo esa porción.

Esa granularidad es una de las razones de la robustez de TCP.

### **Los acuses de recibo (ACK)**

Tras recibir los datos, el destinatario envía un **ACK (Acknowledgment)**.

Al contrario de lo que suele imaginarse, un ACK no significa:

> "Recibí ese paquete"

Más bien significa:

> "Recibí todos los bytes hasta el número X."

Por ejemplo:

```
Client envoie :

0 → 999

Serveur répond :

ACK = 1000
```

Eso significa:

> "Todo lo anterior al byte 1000 llegó bien."

Ese mecanismo permite acusar recibo de varios segmentos a la vez (_cumulative acknowledgments_), reduciendo así el número de paquetes de control.

### **Las retransmisiones**

Si un ACK nunca llega, TCP supone que el segmento se perdió.

Lo retransmite automáticamente.

El retardo de retransmisión (**Retransmission Timeout – RTO**) no es fijo.

TCP mide permanentemente el tiempo de ida y vuelta (**RTT**) gracias a los ACK recibidos y calcula dinámicamente el RTO para evitar retransmisiones inútiles.

Las implementaciones modernas también usan mecanismos como **Fast Retransmit**: cuando un emisor recibe varios ACK duplicados (generalmente tres), deduce que un segmento intermedio se perdió y lo reenvía de inmediato, sin esperar a que expire el temporizador.

### **Reordenación de los paquetes**

Internet no garantiza en absoluto que dos paquetes sigan el mismo camino.

Ejemplo:

```
Paquet 1
Paris
  ↓
Londres
  ↓
New York

Paquet 2
Paris
  ↓
Francfort
  ↓
Chicago
  ↓
New York
```

El segundo paquete puede llegar antes que el primero.

TCP almacena entonces temporalmente los segmentos recibidos **fuera de orden** en un búfer (_reassembly buffer_), y luego los reensambla antes de entregarlos a la aplicación.

Para la aplicación, todo parece llegar perfectamente en orden.

### Control de flujo

Una conexión no depende solo de la red.

El receptor también tiene una capacidad de memoria limitada.

Si recibe más rápido de lo que puede procesar los datos, sus búferes terminan saturándose.

TCP resuelve ese problema gracias a una **ventana deslizante (Sliding Window)**.

El receptor indica en cada ACK:

```
Window = 32768 octets
```

Eso significa:

> "Puedes enviarme hasta 32 KB adicionales."

Si esa ventana cae a cero:

```
Window = 0
```

El emisor suspende temporalmente las transmisiones hasta que el receptor anuncie una nueva ventana disponible.

Ese mecanismo constituye el **control de flujo (Flow Control)** e impide que un anfitrión rápido inunde un anfitrión más lento.

### Control de congestión

Aunque el receptor sea capaz de absorber los datos, la propia red puede saturarse.

Los routers disponen de colas (_queues_) limitadas.

Cuando se desbordan, los paquetes se descartan.

TCP interpreta las pérdidas como un signo de congestión y adapta automáticamente su caudal gracias a una **ventana de congestión (Congestion Window – cwnd)**.

Los algoritmos modernos (como **Reno**, **CUBIC** o **BBR**, según los sistemas operativos) ajustan esa ventana para encontrar un equilibrio entre caudal máximo y estabilidad de la red.

Las primeras versiones de TCP usaban principalmente dos mecanismos:

*   **Slow Start**: aumento exponencial del caudal hasta detectar una congestión.

*   **Congestion Avoidance**: crecimiento luego más prudente, generalmente lineal.


Esa adaptación permanente es una de las razones por las que TCP sigue rindiendo pese a las variaciones de calidad de la red.

### Cierre de conexión

Al contrario que UDP, una conexión TCP también tiene un cierre limpio.

Cada extremo cierra independientemente su flujo gracias a la bandera **FIN**.

Un cierre completo necesita generalmente cuatro intercambios:

```
FIN
ACK
FIN
ACK
```

Ese procedimiento garantiza que todos los datos en tránsito se entregaron bien antes de destruir la conexión.

## UDP: la simplicidad máxima

UDP (User Datagram Protocol) adopta la filosofía inversa.

Es **sin conexión (connectionless)**.

No existe:

*   ningún handshake;

*   ningún número de secuencia;

*   ningún acuse de recibo;

*   ninguna retransmisión;

*   ningún control de flujo;

*   ningún control de congestión.


Cada mensaje simplemente se encapsula en un **datagrama** independiente, se transmite a la red, y el emisor lo olvida.

```
Application → Datagramme UDP → IP → Internet
```

El protocolo no conserva ningún estado entre dos envíos.

Cada datagrama es totalmente independiente de los anteriores.

### La integridad de los datos

Aunque UDP no garantiza ni la entrega ni el orden, aun así protege la integridad de los datos gracias a un **checksum**.

Al recibir, el checksum se recalcula.

*   Si los valores coinciden, el datagrama se acepta.

*   Si no, se rechaza de inmediato.


UDP detecta por tanto los datos corruptos, pero nunca intenta recuperarlos.

### ¿Por qué UDP es tan rápido?

La cabecera UDP solo contiene **8 bytes**, contra un mínimo de **20 bytes** para TCP (sin contar las opciones como timestamps, SACK o Window Scaling).

Como no se mantiene ninguna conexión, el sistema operativo no tiene que seguir el estado de cada intercambio, lo que también reduce el consumo de memoria y el coste de procesamiento.

La aplicación recibe los datos casi en cuanto llegan, sin esperar eventuales retransmisiones.

## Cuándo perder un dato es preferible

La idea fundamental es simple:

> Una información vieja puede tener menos valor que una información perdida.

Tomemos una conversación VoIP.

Cada paquete transporta unos **20 ms** de voz.

Si un paquete se pierde, retransmitirlo a menudo tardaría más que esos 20 ms.

Cuando por fin llegara, la conversación ya habría avanzado.

La mayoría de las aplicaciones prefieren entonces enmascarar la pérdida (interpolación, silencio, corrección de error) en vez de esperar la retransmisión.

El mismo razonamiento se aplica:

*   a los juegos multijugador en tiempo real;

*   al streaming de vídeo;

*   a los flujos de telemetría;

*   a los sensores IoT;

*   a los datos de posición GPS.


Un valor reciente casi siempre es más útil que un valor viejo perfectamente fiable.

# Nivel 2: el cifrado, TLS

TLS (Transport Layer Security, sucesor de SSL) no reemplaza TCP, se añade encima. En concreto, TLS establece una conexión TCP normal, y luego negocia una sesión cifrada dentro: intercambio de certificados, acuerdo sobre un algoritmo de cifrado, derivación de claves de sesión. Todo lo que transita después va cifrado y autenticado.

Tres garantías distintas, a menudo confundidas:

*   **Confidencialidad**: nadie más que ambas partes puede leer el contenido.

*   **Integridad**: cualquier alteración de los datos en tránsito se detecta.

*   **Autenticación**: pero en el TLS clásico, en un solo sentido: el cliente verifica que el servidor es bien quien dice ser (vía su certificado, firmado por una autoridad de confianza), pero el servidor no verifica nada sobre la identidad del cliente. Es exactamente el modelo de HTTPS cuando visitas un sitio: el navegador autentica el sitio, el sitio no te autentica (la autenticación de usuario pasa por un mecanismo separado, cookie de sesión, token).


TLS 1.3 (la versión actual recomendada) redujo el handshake a una sola ida y vuelta en el caso común, contra dos para TLS 1.2, lo que reduce sensiblemente la latencia de conexión.

## Nivel 2bis: mTLS: la autenticación se vuelve mutua

mTLS (mutual TLS) es TLS con una restricción adicional: el servidor exige _también_ un certificado del cliente, y lo verifica. Ambas partes prueban su identidad vía un certificado firmado por una autoridad de confianza común.

Es el mecanismo natural para la comunicación servicio a servicio en una arquitectura distribuida: donde HTTPS clásico basta para que un navegador hable con un servidor público, mTLS responde a una pregunta distinta; _¿cómo sabe un servicio interno que habla bien con otro servicio interno autorizado, y no con un atacante que habría aterrizado en la red?_

```
Client                                          Serveur
  │──── ClientHello ─────────────────────────────▶│
  │◀─── ServerHello + certificat serveur ──────────│
  │──── vérifie le certificat serveur ─────────────│
  │──── envoie SON PROPRE certificat client ──────▶│
  │◀─── vérifie le certificat client ───────────────│
  │──── clés de session dérivées, canal chiffré ──▶│
```

La contrapartida de mTLS es operativa: hace falta una autoridad de certificación (CA) interna, un mecanismo de distribución de los certificados a cada servicio, y una estrategia de rotación/revocación. En un entorno monomáquina con pocos servicios, a veces es más complejidad que beneficio: mTLS se vuelve necesario a partir del momento en que el tráfico entre servicios atraviesa una red que no controlamos del todo (varios anfitriones, cloud multitenant), o en cuanto se quiere una política tipo _zero trust_, donde ningún servicio es implícitamente digno de confianza simplemente porque está "dentro" de la red.

# Nivel 3: los protocolos aplicativos sobre TCP+TLS

Una vez el transporte y el cifrado en su sitio, queda definir _cómo estructurar los intercambios_. Ese es el rol de los protocolos aplicativos.

## HTTP / HTTPS

HTTP es un protocolo petición-respuesta: el cliente abre una conexión (o reutiliza una, con el keep-alive), envía una petición, espera una respuesta, la conexión puede luego cerrarse o reutilizarse. HTTPS es simplemente HTTP sobre TLS: la S no cambia nada de la semántica del protocolo, solo el hecho de que el transporte va cifrado.

El modelo petición-respuesta tiene un límite estructural: el servidor nunca puede hablar primero. Solo puede responder a lo que el cliente pide. Para polling frecuente (comprobar "¿hay algo nuevo?" cada segundo), funciona pero desperdicia recursos: cada petición recrea overhead protocolar para, la mayoría de las veces, no tener nada nuevo que anunciar.

## WebSocket (WS / WSS)

WebSocket responde exactamente a ese límite. La conexión arranca como una petición HTTP clásica (con una cabecera `Upgrade: websocket`), pero una vez aceptado el apretón de manos, la conexión TCP subyacente ya no es un canal petición-respuesta HTTP: se vuelve un canal bidireccional full-duplex donde cliente y servidor pueden enviar mensajes en cualquier momento, sin tener que reemitir un ciclo petición-respuesta en cada intercambio.

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

WSS es simplemente WebSocket sobre TLS, exactamente como HTTPS es HTTP sobre TLS. Es el protocolo de elección para todo lo que necesita push de servidor en tiempo real: chat, notificaciones, flujos de trading, eventos de juego, sin querer gestionar uno mismo un protocolo binario sobre TCP desnudo.

## gRPC

Menos conocido fuera del mundo microservicios pero central en comunicación servicio a servicio: gRPC se apoya en HTTP/2 (o sea TCP + TLS opcional), serializa los mensajes en Protocol Buffers (binario, tipado, compacto, al contrario que el JSON texto de la mayoría de las API REST), y permite nativamente el streaming bidireccional gracias al multiplexado de HTTP/2 (varios flujos lógicos sobre una sola conexión TCP, sin el head-of-line blocking que tendrían varias peticiones HTTP/1.1 secuenciales).

## QUIC / HTTP3

QUIC cambia las reglas repartiendo de UDP en vez de TCP a nivel transporte, reimplementando encima las garantías de fiabilidad que TCP ofrecía nativamente, pero flujo por flujo en vez de globalmente, lo que elimina el head-of-line blocking a nivel transporte (un paquete perdido en un flujo ya no bloquea los demás flujos de la misma conexión). TLS 1.3 va integrado directamente en QUIC en vez de añadido encima, lo que reduce aún más la latencia de handshake. HTTP/3 es HTTP sobre QUIC.

# Vista de conjunto: dónde se sitúa cada protocolo

Capa Protocolos Rol Transporte TCP, UDP Hacer viajar bytes, fiable o no Transporte (nueva generación) QUIC UDP + fiabilidad por flujo + TLS integrado Seguridad TLS, mTLS Cifrado, integridad, autenticación (uni o mutua) Aplicación HTTP/HTTPS, WS/WSS, gRPC Estructurar los intercambios (petición-respuesta, bidireccional, RPC tipado)

Un ejemplo concreto para fijar las ideas: una arquitectura microservicios con un dashboard web y servicios internos podría razonablemente combinar HTTPS (dashboard ↔ API pública, autenticación unidireccional suficiente en el navegador), mTLS (servicio ↔ servicio en interno, autenticación mutua necesaria), y WSS (notificaciones en tiempo real empujadas hacia el dashboard): tres protocolos aplicativos distintos, todos construidos sobre el mismo zócalo TCP + TLS.

## Cómo elegir, en la práctica

Tres preguntas suelen bastar para decidir:

1.  **¿Necesito fiabilidad y orden, o la frescura del dato prima sobre su entrega garantizada?** → TCP si sí, UDP si no (o QUIC para tener ambas cosas a la vez vía un compromiso distinto).

2.  **¿El servidor debe poder iniciar mensajes, o el cliente siempre hace la primera petición?** → WebSocket/gRPC streaming si el servidor debe empujar, HTTP clásico si no.

3.  **¿Ambas partes deben probarse mutuamente su identidad, o solo una de las dos necesita verificarse?** → mTLS para servicio a servicio en entorno zero-trust, TLS simple para cliente público clásico.


La complejidad operativa aumenta con cada capa añadida, TCP desnudo no tiene ninguna infraestructura que gestionar, TLS pide certificados, mTLS pide una CA y una estrategia de rotación, gRPC pide una definición de esquema Protobuf compartida. El buen reflejo es no subir en complejidad más que cuando la capa de abajo muestra un límite concreto, no por anticipación.
