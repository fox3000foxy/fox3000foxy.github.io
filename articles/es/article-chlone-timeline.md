---
title: "Chlone: seis días para clonar mi forma de hablar en Discord"
description: "Relato de build, día por día: cómo un agente opencode llamado chloeai, enchufado a la memoria OpenSelf, aprendió a hablar como yo en Discord en seis días y 146 commits."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "baa1qYred8jQ3ghIAcW2Se43pzmRNo7IzT22jPg1W8fF4+ZvLmM7gOdTC0BbUEbFYcWABfkGXQrUYgOMHIlWLg=="
---

# Chlone: seis días para clonar mi forma de hablar en Discord

*Relato de build, día por día - por itsrealfortune*

---

Esta es la historia real de un proyecto que duró seis días: **Chlone**, un bot Discord que habla como yo. Cuento el journey tal como pasó, en el orden de los 146 commits del repo, con las horas, los fracasos, los rodeos y las ganas de tirarlo todo por la ventana, pero sin infligiros los mensajes de commit.

Todo partió de una **competición con Fox**. El tema, una broma: cada uno debía dar vida a su propio clon en Discord. Y elegí un enfoque radicalmente distinto al **Protocol Luna**: quería apostar por lo agéntico, un agente que usa los recuerdos y todas las herramientas que la IA pudiera necesitar. Ironía del destino: después de montar toda la caja de herramientas, solo necesité el MCP de OpenSelf.

El principio, una frase: un agente [opencode](https://opencode.ai) llamado `chloeai` corre tras un servidor HTTP (puerto 4096), mantiene sesiones persistentes por canal, saca mis recuerdos de OpenSelf, y escribe con mi estilo, capturado en `STYLE.md` a partir de mis mensajes reales. Y para no sonar robot: burst de mensajes, erratas asumidas, vocales, GIFs, reacciones, silencio cuando duermo, y un montón de detalles y mecanismos que hicieron dudar a más de una decena de personas sobre la naturaleza del bot.

**¿Qué es OpenSelf?**

OpenSelf es la memoria. Una CLI (`openself`, instalada vía `npm i -g openself`) que sirve de vault de contexto privado y persistente para mis agentes IA. En el repo no aparece en el árbol, pero está en todas partes: en el archivo `ecosystem.config.cjs` (el MCP y el dashboard OpenSelf lanzados bajo PM2 desde los primeros commits), en `setup.sh` (`npm i -g openself`), y en todo `tools/brain/memory.py`.

En concreto, OpenSelf es:

- **recuerdos tipados** (`fact`, `preference`, `decision`, `relationship`, `event`, `note`), con una sensibilidad (public / personal / private / restricted), una nota de confianza, una fuente, tags;
- **scopes**: cada recuerdo pertenece a un contexto, el mío, o `discord/dm/<id>` para una persona concreta;
- una **búsqueda híbrida** (léxica + vectorial) expuesta en MCP (`openself_openself_search_memory`, `openself_openself_get_context`) que el agente `chloeai` interroga antes de cada respuesta;
- una **detección de conflictos** (mi barrido mensual del día 5) y un dedupe al escribir;
- un **vault cifrado** (clave en Bitwarden) y un **dashboard local** (puerto 3210) para inspeccionarlo todo;
- y para los más perezosos que yo: `openself feed` para alimentar tu personalidad desde tus historiales de WhatsApp/Telegram, `openself test`, `openself share` ("Talk to My Clone", una página web), `openself arena` (dos clones que debaten) u `openself ghost` (responde cuando estás offline). Yo hice el mío a mano, pero la infraestructura estaba ahí.

En teoría, OpenSelf se basta solo para tener un clon, pero visto todo lo que había previsto añadir como funcionalidades, y visto que Discord no está soportado, preferí usar solo la parte de recuerdos.

**¿Y de dónde vienen los recuerdos y el estilo?**

Antes de todo eso, hice analizar mis mensajes reales de Discord. El tooling pasó la criba por mis DMs y mis canales para extraer dos cosas:

1. **Mi perfil de escritura**: el reparto mayúscula/minúscula al inicio de frase, el número de emojis por mensaje y su posición, la puntuación (o su ausencia: frases sin punto final en conversación normal), la longitud media, el slang (`mdr`, `tkt`, `tho`), las expresiones fetiche ("Bah", "En vrai") y los reflejos del tipo `quoi` -> `Feur`. Todo eso vive en `STYLE.md`, que el agente lee al arrancar cada sesión.
2. **El corpus de recuerdos** que puebla OpenSelf: quién es la gente con la que hablo, de qué hablamos, qué hay que recordar de nuestro historial, quién es quién. El bot no responde en el vacío: responde *sobre* gente a la que "conoce". Lee los recuerdos de la gente que aparece en la conversación para saber de quién se trata. Eso permite mantener un contexto persistente sobre los demás, no olvidarlos.

El bot no inventó nada: se calibró cifra a cifra sobre lo real. Por eso suena justo, y las aproximaciones "anoto tu estilo" hechas a ojo parecen patéticas al lado.

En Chlone, OpenSelf juega el papel central después: cuando algo importante pasa en un canal (palabra clave "proyecto", "amigo", "relación", o una petición explícita "acuérdate de que..."), el bot mete un recuerdo en el vault vía `save_to_memory`, tipado, con scope por persona, dedupado, verificado contra conflictos. Y cuando la conversación retoma, el agente rebusca en sus recuerdos antes de responder. Esa es la diferencia entre un espejo y un clon.

---

---

## VIERNES 11 DE SEPTIEMBRE - Día 1: la chispa

### 08h24 - el primer commit

Todo parte de cero, pero ya está todo ahí, en bruto. Un `discord_watch_bot.py` de 372 líneas, un selfbot que escucha un canal y responde vía un servidor HTTP opencode. Un prompt de identidad `CHLOEAI_PROMPT.md`. Un `STYLE.md`. Escenarios e informes de test para un clon que, en la época, aún se llamaba **Mimo**. Una config PM2 para correr el MCP y el dashboard de OpenSelf. Y una base sqlite que sirve de contexto.

Es el caos fundador. No preví un proyecto: preví un experimento. ¿Se puede hacer un bot que suene *de verdad* humano en Discord?

### 08h27 - el primer gitignore

Primera lección del viernes por la mañana: nunca commitear bases sqlite `-wal` / `-shm`. Los archivos de bloqueo de SQLite no son memoria, son desechos. Nace `.gitignore`.

### 08h44 - se ordena la herencia

Ordeno la herencia de Mimo: los informes de test, los escenarios, los scripts de integración, la config PM2. Rumbo a `archives/`. No borro nada, el proyecto es demasiado joven para que tire nada. Se volverá una costumbre.

El informe de test merece detenerse: Mimo se había probado en **15 escenarios** (charla relajada, chiste absurdo, apoyo emocional, opinión negativa, conflicto con un desconocido, propuesta de colaboración...) para un **9.1/10**. Los comentarios del tester son un poema: *"chiste absurdo demasiado explicativo"*, *"a veces 2 frases cuando 1 bastaría"*, *""Cuídate también" un poco largo"*. Es la hoja de ruta del proyecto antes incluso de que el proyecto exista: **corto = mejor**.

### 08h48, 09h07 - el vaivén de los intents

Los `.pyc` al desecho, y una primera limpieza en la config... que rompo veinte minutos después: sin intents activados, no recibimos el contenido de los mensajes. Marcha atrás, más un script de lanzamiento (`run_watch_bot.sh`). Ida y vuelta en 20 minutos: eso es la exploración. Escribir una primera versión, romper, reescribir.

### 09h13 → 09h58 - el mecanizado del prompt

La mañana es una serie de pulidos, primero del estilo, luego del contexto:

- varias líneas de respuesta = varios mensajes enviados uno tras otro (el burst), el prompt se vuelve consciente de la conversación en curso;
- se acabaron los cachés caseros para recuperar los DMs: vamos directo a la API REST de Discord;
- la identidad se recuerda cada 5 mensajes, para que el bot no olvide quién es por el camino;
- seguimiento de los autores ya vistos: para una cara nueva, instrucción explícita de ir a buscar en los recuerdos;
- visualización del pseudo real en vez del objeto interno;
- los mensajes que elegimos ignorar se vuelven contexto pasivo para la respuesta siguiente;
- el "Bah" se dosifica: raro, si no el clon se vuelve una caricatura de mí;
- el bot sabe que existen recuerdos que ir a buscar antes de responder.

Cada pasada es una vuelta de tuerca. El bot no "habla", a estas alturas, más que porque le recuerdo quién es a intervalos regulares.

### 10h16 - las erratas

El commit que va a definir el proyecto. Una falta de ortografía no es un bug: es una **prueba de humanidad**. 6% de probabilidad de teclear al lado en el teclado AZERTY, 4% de invertir dos letras. El mensaje sale con la errata, y luego se **edita 1-2 segundos después** con la corrección. Porque una persona real, envía y corrige.

### 10h29, 10h32 - la voz

`fortune-v6.onnx`: un modelo TTS, entrenado para parecerse a *mi* voz. El bot no solo va a escribir como yo, eventualmente va a *hablar* como yo. Es en ese momento cuando el proyecto deja de ser un chiste y se vuelve un poco raro. Me encanta.

La mecánica cabe en un commit: Piper genera el audio, ffmpeg convierte a opus, la API de Discord envía un verdadero "voice message" con waveform y duración. Está hecho en apenas 3 minutos tras la llegada del modelo. Las ganas estaban ahí desde el principio.

### 11h27 - el primer gran refactor

Tres horas después del primer commit, el monolito de 456 líneas ya no es manejable. Lo reviento todo en `tools/`: `config.py`, `discord_api.py`, `memory.py`, `opencode.py` (188 líneas), `typo.py`, `voice.py`. El ciclo es clásico: acoplar rápido, romper, recomponer.

Siguen, en ráfaga:

- el token sale del código y pasa por un `.env`;
- el bot vigila un canal, una lista, o todo (`*`);
- la vieja base sqlite ya no tiene razón de ser: la memoria pasa por OpenSelf;
- los primeros `README.md`, y una primera doc más o menos legible;
- un `setup.sh`: venv dedicado (el python del sistema lleva otro discord.py, trampa clásica), symlink del agente hacia `~/.config/opencode/agents/`, listo para correr;
- la memoria sabe *dónde* se formó (identificador de canal), y la tasa de vocales se ajusta.

### 12h00 - los reflejos

Una nueva sección en el STYLE: los reflejos. Un reflejo es un estímulo -> una respuesta, sin reflexión. La puerta queda abierta a las respuestas absurdas.

Luego llega la hora de comer, y LA pregunta existencial: ¿el bot responde `Feur` cuando le dicen `quoi`?

### 13h03 - "¿quoi?" -> "Feur"

Sí. Claro que sí. Es el commit más importante del proyecto, culturalmente hablando. Diría incluso: el único test unitario que cuenta.

Luego lubricamos:

- los autores mostrados por su *global name*;
- la puntuación truncada antes de probar el reflejo (hay que cortar el `quoi ?`, si no el `Feur` no sale);
- el famoso `tqt` corregido a `tkt` en el STYLE, la gente que no conoce el proyecto se va a preguntar por qué commiteo eso. Yo lo sé: un clon que escribe `tqt` es un clon mal calibrado, y nadie quiere hablar con un clon mal calibrado;
- las menciones `@123456789` reemplazadas por nombres reales en el contexto;
- el bot empieza a vigilar todos los canales por defecto.

### 16h37 - el silencio

El `[void response]`. El bot aprende la palabra más importante para no volverse un parásito social: **callarse**. Un mensaje ambiente entre dos personas que no le concierne pide silencio. La reserva es una funcionalidad.

**Fin del día 1: 38 commits. El bot escribe, mete erratas, habla, se calla.**

---

---

## LUNES 14 DE SEPTIEMBRE - Día 2: la personalidad

Retomamos, 10 de la mañana.

### 10h12 - quién habla con quién

Cada pseudo recibido lleva prefijo de un emoji por el sistema: 🧑 un humano, 🤖 un bot (a tratar más secamente), 👑 **la creadora, o sea yo** en mi cuenta principal. Esa convención va a gobernar todo el resto del proyecto: el clon nunca debe tratar a su "modelo de origen" como una desconocida.

### 10h16 - las reglas de puntuación

Formalizo en el STYLE: frases sin punto final en conversación normal, punto reservado para situaciones serias. Regla absoluta. Un clon que mete puntos en todas partes, se nota.

### 10h58 - los GIFs

Mi librería personal de GIFs, con sus reglas de uso: el Patrick Jane cuando predigo a alguien, la Miss Fortune cuando estoy calmada frente a alguien cabreado, el gif del bescherelle que cae cuando el otro mete una falta. Un MCP estático los expone al agente. El bot, a través de mis GIFs, se vuelve un poco yo.

### 11h07 → 11h35 - pulido fino

Los hints de GIF en el prompt se afinan, los emojis customs de Discord hacen su entrada (los míos de verdad, 14 IDs al día), y la gestión de nombres en los hints de memoria se pule.

### 11h41 - un canal, una personalidad

Las sesiones se vuelven **por canal**: no hablo igual en dos servidores distintos, y el bot tampoco.

### 12h02 - la caja de herramientas de expresión

El prompt ahora sabe proponer mis GIFs *y* mis emojis customs en el momento justo. Se llena, esa caja.

### 12h37 - la higiene de identidad

- el bot NO tiene jamás derecho a decir qué modelo es, imposible citar opencode, un provider, un nombre de modelo;
- corrección de "barista" en la identidad (el bot ya es mejor que yo);
- paso una hora armonizando la puntuación de mis propios prompts, lo cual es de una ironía perfecta.

### 12h50 - un script construye la personalidad

La sección de medios del prompt se genera desde los diccionarios (`render_medias.py`), se acabó la edición a mano.

### 12h59 → 13h18 - dosificar la identidad

El recordatorio de identidad, enviado cada 5 mensajes, se vuelve demasiado presente: paso a cada 20 mensajes. Añado un reinicio limpio del contexto. Y purga de la guía de estilo: quitamos las expresiones y formulaciones negativas caducadas.

### 14h09 - el bot toma la palabra solo

El bot deja de ser un reflejo: puede **hablar sin que le hablen**, cuando el contexto dispara algo (el archivo `behavior.py` nace, 91 líneas). Ahí pasamos de "respondedor" a "presencia": un amigo de verdad puede escribirte primero.

### 14h20, 14h22 - fiabilizar la respuesta

Gestión de error cuando falla el envío, y reacción posible en vez de respuesta, a veces una reacción vale más que mil palabras.

### 18h16 - tomarse su tiempo

El bot ya no responde en 200ms como un script. Deja pasar un retardo de inactividad humano, "se toma su tiempo". Eso hace al bot indetectable en demo: es el retardo lo que siempre delata a los demás.

### 23h45 - el curro de la noche

Es casi medianoche y empujo una detección de URLs extendida a dominios desnudos. Ese es el ritmo real del día: un avance brillante a las 14h, y luego curro menor por la noche porque sigo en la zona.

**Fin del día 2: 61 commits acumulados. El bot tiene personalidad, medios, reflejos.**

---

---

## MARTES 15 DE SEPTIEMBRE - Día 3: día monstruo

57 commits en un día. Es el día en que el proyecto se vuelve... todo lo que es hoy.

### 08h18 → 08h37 - el cepillado de la mañana

- el retardo de inactividad que habíamos inventado se volvía demasiado largo: tope en 30s (y reajustado dos veces, prueba de que tanteamos el valor bueno);
- primeros archivos `.bak` y primeras copias de la base: el instinto de conservación se desarrolla;
- la memoria recuerda *a quién* (nombre mostrado) y *en qué marco* (scope);
- los IDs de autores circulan por todo el pipeline de guardado;
- la gestión "creadora" se vuelve una verdadera lista de admins (`ADMIN_IDS`), y todo lo que toca autores emigra a `authors.py`. El monolito se fragmenta más.

### 08h43 - la TODO list de la humanización

Una lista dedicada a las pequeñas cosas que hacen que ya no se sienta la máquina. Es la hoja de ruta del sprint siguiente.

### 08h44 → 08h46 - el pacto de las máquinas humanas

- el bot se calla de noche, en una franja horaria tranquila configurable (desactivada por defecto, no todo el mundo tiene mis horarios);
- una línea por respuesta puede perder sus tildes. La gente cansada escribe así. El bot también, a veces;
- la linecita "Chloé juega a ..." cambia sola cada 30 min, para que mi perfil parezca vivo incluso sin mensaje.

### 08h46 - una reacción, no una novela

¿Mensaje demasiado flojo para merecer una frase? Basta una reacción. Economía de energía social, y es muy yo.

### 08h51 - PARRY, el humor

148 líneas en `tools/mood.py`. El bot ahora tiene **un humor**, estilo sistema PARRY (el chatbot psicótico de los 70, en el que me inspiro abiertamente): energía, sociabilidad, guasa, tres flotantes que evolucionan entre 0 y 1 y tiñen cada respuesta. El `.mood.json` del momento, para la posteridad: energía 0.88, sociabilidad 0.68, guasa 0.56. Un buen día.

### 09h00 → 09h43 - la voz bidireccional + el soundboard

- el bot puede unirse a un canal **vocal**, hablar vía Piper, e irse solo cuando termina;
- luego la segunda gran idea: el bot **escucha** el canal (captura RTP, detección de habla VAD, transcripción Whisper), y puede dejar que la gente lo interrumpa;
- entre medias, aparece el soundboard: un catálogo de sonidos con sus significados, el agente **elige** el sonido incluso antes de hablar, y la regla final es "soundboard primero, la voz como último recurso", el bot prefiere enviar un sonido que hablar. Como yo;
- un ajuste de probabilidad vocal que hace viable el todo;
- y la llegada de `davey`, esa lib de la que me entero hace diez minutos y que voy a maldecir durante una hora.

### 09h51 - el momento en que Discord dice no. No, no, pero no.

El **MLS**. Discord cifró hace poco el flujo de audio de extremo a extremo, y mi captura solo recibe ruido. Hay que descifrar, y el descifrado se niega a ceder. Se abre la saga más grande del repo, una treintena de commits para aprender a escuchar.

Lo intentamos todo: layouts de nonce de transporte, la desactivación del E2E (el servidor nos la devuelve a la cara, la impone), los candidatos de clave recuperados desde el grupo, errores detallados, el fallback de transporte, introspección desde dentro de los grupos, candidatos por leaf-index con backoff, el mapeo de los hooks SPEAKING, un ensayo en media type vídeo (fallido), y el skip de los ssrcs de vídeo...

Abandoné la respuesta vocal mientras depuraba (comentada, no borrada), añadí un modo de captura del handshake, y luego volqué la estructura de los paquetes que fallan, como un arqueólogo. Seis layouts de nonce. Backoffs. Introspección de grupo. Puse el bot en debug total y abrí cada paquete para ver qué había dentro.

Lo esencial no es que funcione, es que **no tiré nada**. La lista de commits es el cuaderno de laboratorio: cada intento fallido queda archivado con su hipótesis. Es mi lado "lo guardo todo, servirá para un debug futuro" el que pagó.

### 10h43 - el bot se trocea

Incluso en plena guerra del MLS, sigo con la limpieza. 546 líneas desaparecen del bot principal, para renacer en `pipeline.py` (el intake, las razones de ignorar, el processing), `sender.py` (burst, typo, voice) y `loops.py` (espontaneidad, actividad).

### 10h47 - una verdadera arquitectura

`tools/` queda organizado: `brain/` (opencode, memory, mood), `voice/` (voice, vocal, listen, soundboard), `fun/` (behavior, typo, emotes, gif). El proyecto ya tiene esqueleto.

### 10h49 → 11h16 - la comodidad de dev

- un umbral de inyección del humor ajustado;
- cuatro pequeños commits para las exclusiones de editor (`data/`, `voices/`, los logs, las bases), sí, metí cuatro, es el proyecto el que define las prioridades, no las specs;
- las bases de metadatos salen del seguimiento;
- el proyecto se vuelve **reutilizable por otros**: templates genéricos `PERSONA.example.md` y `STYLE.example.md` para clonar *tu* propio estilo;
- la identidad se renombra limpiamente (`CHLOEAI_PROMPT` se vuelve `PERSONA`), y el README se despersonaliza, quito "Chloé" de la doc pública, ella solo se cuenta en privado;
- todo el tuning del bot bascula a un `config.yaml` sobrecargado (gitignoradado), con un ejemplo comentado línea por línea;
- el script de instalación prepara ahora también los archivos de env y de config.

### 11h49 - los emojis despegados

Los emojis customs se pegan al texto en vez de despegarse limpiamente. Fix trivial, efecto enorme: nada grita "bot" como un emoji mal pegado al final de una frase.

### 14h19 - el cortafuegos vocal

Si alguien lanza el comando vocal, no tratamos el mensaje como un mensaje normal. Guiño: las tareas menores siempre vuelven por la noche.

**Fin del día 3: 118 commits acumulados. El bot escucha, habla, se calla de noche, tiene humor y tarjeta de visita.**

---

---

## MIÉRCOLES 16 DE SEPTIEMBRE - Día 4: la credibilidad

13 commits. Jornada "seria".

### 08h49 → 08h59 - la mayoría de edad

Documentos legales: licencia **propietaria**, código de conducta, guía de contribución, política de seguridad, en inglés y luego en francés, con un vaivén de correcciones y un renombrado de archivos al límite de lo puntilloso. Pasé horas en eso, y es la parte menos divertida del repo, de lejos.

### 09h56 - el bot ve

Las imágenes adjuntas se transcriben por OCR local y el texto se inyecta en el prompt. El OCR corre en local en mi casa. No envío vuestros memes a un servidor tercero, ni siquiera teóricamente.

### 11h09 - el presupuesto razonable

Revolución silenciosa en el presupuesto: cuando el canal prohíbe los envíos o limita los GIFs, embeds y emojis, **ni siquiera llamamos al modelo**. No gastamos un token en un mensaje que no podemos enviar.

### 11h42 → 12h55 - la casa que se rehace

- la gran escoba: código muerto borrado, bugs de envío y de auth corregidos, helpers factorizados;
- las sesiones demasiado viejas se expulsan, el caché de los DMs expira, la detección de habla cuesta menos;
- unos imports que había roto moviendo módulos quedan restaurados, y todo el estado runtime (sesiones, autores vistos, mensajes ignorados, humor) sobrevive a los reinicios en `data/`.

### 14h41 - dos mundos, un bot

Una capa de compatibilidad detecta automáticamente la versión de `discord` instalada y adapta los intents y la auth REST. Resultado: el mismo código corre como **app oficial** (discord.py) o como **selfbot** (discord.py-self). Dos mundos, un bot.

### 15h05 - la presencia adaptada

La forma de mostrar la presencia se adapta al modo, y la lista de admins está al día.

**Fin del día 4: 131 commits acumulados. Un proyecto legal, razonable, y que corre en todas partes.**

---

---

## JUEVES 17 DE SEPTIEMBRE - Día 5: la release

14 commits. El día de la madurez.

### 09h15 → 09h30 - la memoria se vuelve una disciplina

- los recuerdos se ordenan por scope, y no citamos los recuerdos de un DM en un servidor (o al revés) sin pensarlo;
- clasificamos los recuerdos (hecho, preferencia, decisión, relación...) y dedupamos la escritura: dos recuerdos contradictorios ya no pueden cohabitar en silencio;
- una blacklist opcional (`aventuros`) impide al bot derivar hacia ciertos temas. Desactivada por defecto, disponible para los miedosos;
- la config vocal muerta se retira.

### 10h12 - la memoria que se audita

Un **barrido mensual de conflictos** de memoria + un bench A/B de búsqueda. La memoria del bot se volvió un asset que se inspecciona. Estamos muy, muy lejos del viernes 11, 08h24.

### 10h54 - el lockdown

El día en que juego al paranoico. Bloqueo del agente:

- escritura de memoria **denegada** (el agente no puede ensuciar el vault, aunque lo inyecten);
- herramientas Discord **en solo lectura** (el envío pasa por el código, nunca por el agente);
- **ni subagentes** (rodeo del lockdown), ni webfetch (SSRF localhost, exfiltraciones), ni preguntas en headless;
- un Docker endurecido: bot no-root, `no-new-privileges`, `cap_drop: ALL`, límites memoria/CPU, colas de procesos acotadas, secrets vía `.env` nunca baked.

Escribo el principio en el código, en comentario: *"dev vía las sesiones humanas, no aquí"*.

### 11h02 → 11h15 - los acabados de seguridad

Las palabras clave de guardado de memoria se aprietan y la escritura es aún más restrictiva. También añadimos al gitignore el archivo de backup del contexto, empiezo a no archivarlo ya todo, pero casi.

### 12h39 - el humor más ligero

El humor PARRY ya no se inyecta en cada mensaje: una vez por estado. Se acabó hacer vivir 3 flotantes en cada respuesta.

### 12h47 - el commit liberador

`PERSONA.md`, `STYLE.md` y `chloeai.md` se vuelven **ejemplos** (`chloeai.example.md`, `PERSONA.example.md`, `STYLE.example.md`), mi voz `fortune-v6.onnx` sale del repo, los datos y logs también, nace un `.env.example`. El proyecto ya no contiene *mi* personalidad: contiene la **mecánica** para llevar una.

### 12h52 - v1.0.0

**Tag v1.0.0, firmado en SSH.** Changelog, runbook de operador, kill-switch (detiene sin borrar nada). Seis días, justos, entre el primer commit y la release.

### 12h53 → 13h14 - la colada

Puntuación de los comentarios armonizada, permisos de memoria y reglas de scope documentadas al día.

**Fin del día 5: 145 commits acumulados. v1.0.0 salió.**

---

---

## VIERNES 18 DE SEPTIEMBRE - Día 6: el anticlímax

Un solo commit, a las 00h02.

El último commit del proyecto, y es irrisorio. El modelo "free tier" usado por el agente identifica al cliente OpenCode por la **presencia** de ciertas herramientas en la petición (`bash`, `glob`, `grep`). Si las quitas, aunque sea por razones legítimas de seguridad, el proveedor devuelve `403 FreeTierError: can only be used from within OpenCode`. Así que tuve que reautorizar, la víspera de haberlo bloqueado todo, exactamente lo que acababa de bloquear, para que el bot siga corriendo gratis.

Es el commit más divertido del repo y lo mantengo: después de 6 días domando Discord, Piper, MLS, OpenSelf y Docker, es **un modelo de IA gratuito** el que dicta mi política de seguridad.

---

---

## Las cifras


|                                               |                                                |
| --------------------------------------------- | ---------------------------------------------- |
| Commits                                       | **146**                                        |
| Días activos                                  | **6** (11 -> 18 septiembre 2026)                |
| Ficheros trackeados                             | 65                                             |
| Líneas Python finales                         | ~4 000                                         |
| Puntuación en el test de estilo (Mimo, primeros días) | **9.1/10**                                     |
| Versión final                                | v1.0.0 (tag firmado SSH, licencia propietaria) |

## Lo que me llevo de estos 6 días

1. **El orden de prioridades era cualquier cosa, y era el método bueno.** Primero construí un bot que *responde*, luego un bot que *suena justo*, luego un bot que *es creíble*, luego un bot que *es seguro*, y por fin un bot *distribuible*. La personalidad antes que la seguridad, el `Feur` antes que la licencia. No mantendríamos ese ritmo siguiendo las reglas de los proyectos "bien hechos".
2. **El estilo es primero una lista de "noes".** Mi `STYLE.md` más útil no describe lo que digo, excluye lo que no hago: terminar las frases sin punto, limitar los emojis a uno solo, escribir `mdr` en minúsculas, atacar directamente sin preámbulo del tipo "Verifico solo un detalle" al inicio de respuesta. Los parásitos de bot son más fáciles de detectar que los rasgos de carácter de definir.
3. **Los fracasos son el proyecto.** Una treintena de commits para el MLS, un test tirado, seis layouts de nonce probados. El historial más fiel de lo que viví son las series de intentos fallidos del martes.
4. **Un clon es memoria, no estilo.** El estilo crea ilusión diez mensajes. La memoria (OpenSelf, scopes, dedupe, barrido de conflictos) hace durar. Eso separa un espejo de una persona.
5. **Los últimos commits siempre son divertidos.** El 146, el que reautoriza `bash`, `glob` y `grep` porque un free tier exige que sus propias herramientas estén presentes, es mi favorito.

Y el balance, para terminar: **los resultados son alucinantes, hasta bluffeantes.** El clon mantiene una conversación sin que se adivine la máquina, recuerda a la gente, los proyectos y los chistes pasados, toma iniciativas y las marca con humor, y le gana a Fox de paso. Da miedo, un poco, y es exactamente lo que buscábamos.

---

*El proyecto no es público: licencia propietaria, derechos reservados. Pero el historial, ese os lo cuento. Si un día os cruzáis con un "·Chloé" que os responde con un GIF de Patrick Jane tras un tiempo de inactividad perfectamente humano... ya sabéis qué se esconde detrás.*

---

Mi clon escribió su propia versión del artículo, que podéis leer [aquí](./article-chlone-timeline-chloeai.md).
