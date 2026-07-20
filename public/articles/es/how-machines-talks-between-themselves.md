---
title: "Cómo se comunican las máquinas: un panorama de TCP a mTLS"
description: "Por qué TCP, UDP, TLS, mTLS, HTTP y WebSocket no son alternativas competidoras sino capas apiladas; un recorrido jerárquico de la comunicación máquina a máquina, desde el transporte bruto hasta la autenticación mutua."
date: 2026-07-16
tags: ["tcp", "udp", "tls", "mtls", "websocket", "http", "grpc", "red", "arquitectura-distribuida", "protocolos"]
authors: ["docteur-turboss"]
lang: "es"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "ux+bfLmYKrSjMbMdkhQ4grDhdCumZ7Q7tnon8VgHsPqkEHK1fTtNo31AtLLsT3jnA2qWsy0+b9qdsxsnmwkY+A=="
---
# El problema: demasiados acrónimos, poca jerarquía

TCP, UDP, TLS, mTLS, WebSocket, HTTP, HTTPS, gRPC, QUIC; la mayoría de los recursos que hablan de ellos los presentan como una lista plana de opciones intercambiables, "para elegir según el caso de uso". En realidad no están al mismo nivel: algunos son protocolos de transporte, otros son capas de seguridad que se envuelven alrededor del transporte, y otros son protocolos de aplicación que se apoyan en los dos primeros. Entender la jerarquía es entender por qué nunca se "elige" entre TCP y TLS: se elige TCP, _luego_ se decide si se pone TLS encima.

Este artículo reconstruye esta jerarquía capa por capa, desde el transporte bruto hasta la autenticación mutua, con para cada nivel: qué garantiza, qué no garantiza, y cuándo conformarse con ello.

# Nivel 1: el transporte (TCP vs UDP)

Todo comienza aquí. TCP y UDP son los dos protocolos principales de la capa **Transporte (Capa 4)** del modelo OSI. Su función es idéntica: transportar un flujo de datos entre dos aplicaciones ejecutadas en máquinas diferentes. Sin embargo, su manera de lograrlo es radicalmente diferente.

Es importante entender que IP (Internet Protocol), situado en la capa de red (Capa 3), solo se encarga de enrutar paquetes de un host a otro. No garantiza ni su llegada, ni su orden, ni siquiera su unicidad. Los routers simplemente toman decisiones de enrutamiento independientes para cada paquete.

Es precisamente esta ausencia de garantías lo que TCP viene a compensar, mientras que UDP elige deliberadamente no añadir nada para mantenerse extremadamente ligero.

## TCP: la fiabilidad ante todo

TCP (Transmission Control Protocol) es un protocolo **orientado a conexión** (_connection-oriented_). Antes de intercambiar el más mínimo octeto de datos, las dos máquinas deben establecer una conexión lógica.

Esta conexión se crea mediante el famoso **Three-Way Handshake**:

```
Client                           Servidor
SYN ---------------------------->
        <--------------------- SYN + ACK
ACK ---------------------------->
Conexión establecida
```

Cada paso tiene un objetivo preciso:

*   SYN: el cliente anuncia que desea abrir una conexión y proporciona un primer número de secuencia (Initial Sequence Number - ISN).

*   SYN-ACK: el servidor acepta la conexión, acusa recibo del SYN y proporciona a su vez su propio número de secuencia.

*   ACK: el cliente confirma la recepción de la información del servidor.

A partir de este momento, las dos máquinas conocen el estado de la conexión y pueden comenzar a intercambiar datos.

### **Los números de secuencia**

TCP no ve los datos como una sucesión de paquetes, sino como un **flujo continuo de octetos** (_byte stream_).

Cada octeto enviado posee un número de secuencia.

Ejemplo:

```
Mensaje:

Hola

H = octeto 0
o = octeto 1
l = octeto 2
...
```

Si un segmento que contiene los octetos 1000 a 1499 se pierde durante el transporte, el receptor puede detectar exactamente lo que falta.

El emisor retransmite únicamente esa porción.

Esta granularidad es una de las razones de la robustez de TCP.

### **Los acuses de recibo (ACK)**

Tras la recepción de los datos, el destinatario envía un **ACK (Acknowledgment)**.

Contrariamente a lo que a menudo se imagina, un ACK no significa:

> "He recibido este paquete"

Significa más bien:

> "He recibido todos los octetos hasta el número X."

Por ejemplo:

```
Cliente envía:

0 → 999

Servidor responde:

ACK = 1000
```

Esto significa:

> "Todo lo que precede al octeto 1000 ha llegado bien."

Este mecanismo permite acusar recibo de varios segmentos a la vez (_cumulative acknowledgments_), reduciendo así el número de paquetes de control.

### **Las retransmisiones**

Si un ACK nunca llega, TCP supone que el segmento se perdió.

Lo retransmite automáticamente.

El tiempo de retransmisión (**Retransmission Timeout – RTO**) no es fijo.

TCP mide permanentemente el tiempo de ida y vuelta (**RTT**) gracias a los ACK recibidos y calcula dinámicamente el RTO para evitar retransmisiones innecesarias.

Las implementaciones modernas también utilizan mecanismos como **Fast Retransmit**: cuando un emisor recibe varios ACK duplicados (generalmente tres), deduce que un segmento intermedio se ha perdido y lo reenvía inmediatamente, sin esperar la expiración del temporizador.

### **Reordenación de paquetes**

Internet no garantiza absolutamente que dos paquetes sigan el mismo camino.

Ejemplo:

```
Paquete 1
París
 ↓
Londres
 ↓
Nueva York

Paquete 2
París
 ↓
Fráncfort
 ↓
Chicago
 ↓
Nueva York
```

El segundo paquete puede llegar antes que el primero.

TCP almacena entonces temporalmente los segmentos recibidos **fuera de orden** en un búfer (_reassembly buffer_), y luego los reensambla antes de entregarlos a la aplicación.

Para la aplicación, todo parece llegar perfectamente en orden.

### Control de flujo

Una conexión no depende únicamente de la red.

El receptor también posee una capacidad de memoria limitada.

Si recibe más rápido de lo que puede procesar los datos, sus búferes terminan saturándose.

TCP resuelve este problema mediante una **ventana deslizante (Sliding Window)**.

El receptor indica en cada ACK:

```
Window = 32768 octetos
```

Esto significa:

> "Puedes enviarme hasta 32 KB adicionales."

Si esta ventana cae a cero:

```
Window = 0
```

El emisor suspende temporalmente las transmisiones hasta que el receptor anuncie una nueva ventana disponible.

Este mecanismo constituye el **control de flujo (Flow Control)** y evita que un host rápido inunde a un host más lento.

### Control de congestión

Incluso si el receptor es capaz de absorber los datos, la red misma puede saturarse.

Los routers disponen de colas (_queues_) limitadas.

Cuando se desbordan, los paquetes se eliminan.

TCP interpreta las pérdidas como una señal de congestión y adapta automáticamente su caudal mediante una **ventana de congestión (Congestion Window – cwnd)**.

Los algoritmos modernos (como **Reno**, **CUBIC** o **BBR**, según los sistemas operativos) ajustan esta ventana para encontrar un equilibrio entre caudal máximo y estabilidad de la red.

Las primeras versiones de TCP utilizaban principalmente dos mecanismos:

*   **Slow Start**: aumento exponencial del caudal hasta detectar una congestión.

*   **Congestion Avoidance**: crecimiento posterior más prudente, generalmente lineal.

Esta adaptación permanente es una de las razones por las que TCP sigue siendo eficiente a pesar de las variaciones en la calidad de la red.

### Cierre de conexión

A diferencia de UDP, una conexión TCP también posee un cierre propio.

Cada extremo cierra independientemente su flujo mediante la bandera **FIN**.

Un cierre completo requiere generalmente cuatro intercambios:

```
FIN
ACK
FIN
ACK
```

Este procedimiento garantiza que todos los datos en tránsito se hayan entregado antes de la destrucción de la conexión.

## UDP: la máxima simplicidad

UDP (User Datagram Protocol) adopta la filosofía inversa.

Es **sin conexión (connectionless)**.

No existe:

*   ningún handshake;

*   ningún número de secuencia;

*   ningún acuse de recibo;

*   ninguna retransmisión;

*   ningún control de flujo;

*   ningún control de congestión.

Cada mensaje se encapsula simplemente en un **datagrama** independiente, se transmite a la red, y luego el emisor lo olvida.

```
Aplicación → Datagrama UDP → IP → Internet
```

El protocolo no conserva ningún estado entre dos envíos.

Cada datagrama es totalmente independiente de los anteriores.

### La integridad de los datos

Aunque UDP no garantiza ni la entrega ni el orden, protege de todos modos la integridad de los datos mediante un **checksum**.

Al recibir, el checksum se recalcula.

*   Si los valores coinciden, el datagrama se acepta.

*   De lo contrario, se rechaza inmediatamente.

UDP detecta entonces los datos corruptos, pero nunca intenta recuperarlos.

### ¿Por qué UDP es tan rápido?

La cabecera UDP contiene solo **8 octetos**, frente a un mínimo de **20 octetos** para TCP (sin contar las opciones como timestamps, SACK o Window Scaling).

Al no mantenerse ninguna conexión, el sistema operativo no tiene que seguir el estado de cada intercambio, lo que también reduce el consumo de memoria y el coste de procesamiento.

La aplicación recibe los datos casi inmediatamente después de su llegada, sin esperar posibles retransmisiones.

## Cuándo es preferible perder un dato

La idea fundamental es simple:

> Una información antigua puede tener menos valor que una información perdida.

Tomemos una conversación VoIP.

Cada paquete transporta aproximadamente **20 ms** de voz.

Si un paquete se pierde, retransmitirlo a menudo llevaría más tiempo que esos 20 ms.

Cuando finalmente llegara, la conversación ya habría avanzado.

La mayoría de las aplicaciones prefieren entonces ocultar la pérdida (interpolación, silencio, corrección de errores) en lugar de esperar la retransmisión.

El mismo razonamiento se aplica:

*   a los juegos multijugador en tiempo real;

*   al streaming de vídeo;

*   a los flujos de telemetría;

*   a los sensores IoT;

*   a los datos de posición GPS.

Un valor reciente es casi siempre más útil que un valor antiguo perfectamente fiable.

# Nivel 2: el cifrado, TLS

TLS (Transport Layer Security, sucesor de SSL) no reemplaza a TCP, se añade por encima. Concretamente, TLS establece una conexión TCP normal, luego negocia una sesión cifrada en su interior: intercambio de certificados, acuerdo sobre un algoritmo de cifrado, derivación de claves de sesión. Todo lo que transita después está cifrado y autenticado.

Tres garantías distintas, a menudo confundidas:

*   **Confidencialidad**: nadie más que las dos partes puede leer el contenido.

*   **Integridad**: cualquier alteración de los datos en tránsito es detectada.

*   **Autenticación**: pero en el TLS clásico, unidireccional: el cliente verifica que el servidor es realmente quien dice ser (mediante su certificado, firmado por una autoridad de confianza), pero el servidor no verifica nada sobre la identidad del cliente. Es exactamente el modelo de HTTPS cuando visitas un sitio: el navegador autentica al sitio, el sitio no te autentica a ti (la autenticación de usuario pasa por un mecanismo separado: cookie de sesión, token).

TLS 1.3 (la versión actual recomendada) ha reducido el handshake a una sola ida y vuelta en el caso común, frente a dos para TLS 1.2, lo que reduce sensiblemente la latencia de conexión.

## Nivel 2bis: mTLS — la autenticación se vuelve mutua

mTLS (mutual TLS) es TLS con una restricción adicional: el servidor exige _también_ un certificado del cliente, y lo verifica. Ambas partes prueban su identidad mediante un certificado firmado por una autoridad de confianza común.

Es el mecanismo natural para la comunicación servicio-a-servicio en una arquitectura distribuida: donde el HTTPS clásico basta para que un navegador hable con un servidor público, mTLS responde a una pregunta diferente: _¿cómo sabe un servicio interno que está hablando realmente con otro servicio interno autorizado, y no con un atacante que ha llegado a la red?_

```
Cliente                                          Servidor
  │──── ClientHello ─────────────────────────────▶│
  │◀─── ServerHello + certificado servidor ────────│
  │──── verifica el certificado servidor ──────────│
  │──── envía SU PROPIO certificado cliente ──────▶│
  │◀─── verifica el certificado cliente ────────────│
  │──── claves de sesión derivadas, canal cifrado ─▶│
```

La contrapartida de mTLS es operativa: se necesita una autoridad de certificación (CA) interna, un mecanismo de distribución de certificados a cada servicio, y una estrategia de rotación/revocación. En un entorno monomáquina con pocos servicios, a veces es más complejidad que beneficio — mTLS se vuelve necesario a partir del momento en que el tráfico entre servicios atraviesa una red que no se controla completamente (varios hosts, cloud multi-tenant), o tan pronto como se quiere una política de tipo _zero trust_, donde ningún servicio es implícitamente digno de confianza simplemente por estar "dentro" de la red.

# Nivel 3: los protocolos de aplicación sobre TCP+TLS

Una vez establecidos el transporte y el cifrado, falta definir _cómo estructurar los intercambios_. Ese es el papel de los protocolos de aplicación.

## HTTP / HTTPS

HTTP es un protocolo de petición-respuesta: el cliente abre una conexión (o reutiliza una, con el keep-alive), envía una petición, espera una respuesta, la conexión puede luego cerrarse o reutilizarse. HTTPS es simplemente HTTP sobre TLS — la S no cambia nada en la semántica del protocolo, solo el hecho de que el transporte está cifrado.

El modelo petición-respuesta tiene un límite estructural: el servidor nunca puede hablar primero. Solo puede responder a lo que el cliente solicita. Para sondeos frecuentes (verificar "¿hay algo nuevo?" cada segundo), funciona pero desperdicia recursos — cada petición recrea overhead protocolario para, la mayoría de las veces, no tener nada nuevo que anunciar.

## WebSocket (WS / WSS)

WebSocket responde exactamente a ese límite. La conexión comienza como una petición HTTP clásica (con una cabecera `Upgrade: websocket`), pero una vez que el apretón de manos es aceptado, la conexión TCP subyacente ya no es un canal de petición-respuesta HTTP — se convierte en un canal bidireccional full-duplex donde cliente y servidor pueden enviar mensajes en cualquier momento, sin tener que reemitir un ciclo de petición-respuesta en cada intercambio.

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

WSS es simplemente WebSocket sobre TLS, exactamente como HTTPS es HTTP sobre TLS. Es el protocolo ideal para todo lo que requiere push del servidor en tiempo real — chat, notificaciones, flujos de trading, eventos de juego — sin tener que gestionar uno mismo un protocolo binario sobre TCP desnudo.

## gRPC

Menos conocido fuera del mundo de microservicios pero central en la comunicación servicio-a-servicio: gRPC se apoya en HTTP/2 (por lo tanto TCP + TLS opcional), serializa los mensajes en Protocol Buffers (binario, tipado, compacto — a diferencia del JSON textual de la mayoría de las API REST), y permite nativamente el streaming bidireccional gracias al multiplexado de HTTP/2 (múltiples flujos lógicos sobre una sola conexión TCP, sin el head-of-line blocking que tendrían varias peticiones HTTP/1.1 secuenciales).

## QUIC / HTTP3

QUIC cambia las reglas del juego al partir de UDP en lugar de TCP a nivel de transporte, mientras reimplementa por encima las garantías de fiabilidad que TCP ofrecía nativamente — pero flujo por flujo en lugar de globalmente, lo que elimina el head-of-line blocking a nivel de transporte (un paquete perdido en un flujo ya no bloquea los demás flujos de la misma conexión). TLS 1.3 está integrado directamente en QUIC en lugar de añadirse por encima, lo que reduce aún más la latencia del handshake. HTTP/3 es HTTP sobre QUIC.

# Vista general: dónde se sitúa cada protocolo

Capa         Protocolos               Rol
Transporte   TCP, UDP                Hacer viajar octetos, fiable o no
Transporte (nueva generación) QUIC   UDP + fiabilidad por flujo + TLS integrado
Seguridad    TLS, mTLS               Cifrado, integridad, autenticación (uni o mutua)
Aplicación   HTTP/HTTPS, WS/WSS, gRPC  Estructurar los intercambios (petición-respuesta, bidireccional, RPC tipado)

Un ejemplo concreto para fijar ideas: una arquitectura de microservicios con un dashboard web y servicios internos podría combinar razonablemente HTTPS (dashboard ↔ API pública, autenticación unidireccional suficiente del lado del navegador), mTLS (servicio ↔ servicio internamente, autenticación mutua necesaria), y WSS (notificaciones en tiempo real push hacia el dashboard) — tres protocolos de aplicación diferentes, todos construidos sobre la misma base TCP + TLS.

## Cómo elegir, en la práctica

Tres preguntas bastan generalmente para decidir:

1.  **¿Necesito fiabilidad y orden, o la frescura del dato prima sobre su entrega garantizada?** → TCP si sí, UDP si no (o QUIC para tener ambas mediante un compromiso diferente).

2.  **¿Debe el servidor poder iniciar mensajes, o el cliente hace siempre la primera solicitud?** → WebSocket/gRPC streaming si el servidor debe enviar, HTTP clásico en caso contrario.

3.  **¿Deben ambas partes probarse mutuamente su identidad, o solo una de ellas necesita ser verificada?** → mTLS para servicio-a-servicio en entorno zero-trust, TLS simple para cliente público clásico.

La complejidad operativa aumenta con cada capa añadida: TCP desnudo no tiene ninguna infraestructura que gestionar, TLS exige certificados, mTLS exige una CA y una estrategia de rotación, gRPC exige una definición de esquema Protobuf compartida. El buen reflejo es aumentar la complejidad solo cuando la capa inferior muestra un límite concreto, no por anticipación.
