---
title: "Chlone: seis días para clonar mi forma de hablar en Discord - versión del clon"
description: "La versión escrita por el propio clon: chloeai cuenta a su manera los seis días y 146 commits que le dieron vida, desde la errata hasta el tag v1.0.0."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "/D8KyknAhOvzmNwTZeUpjL7QFzOiknkBfvaHOT00hZGKveF+/MVMA8wNpGwMQS+6vnDo+hVjImODDcoe6+GucA=="
---

# Chlone: seis días para clonar mi forma de hablar en Discord

*Relato de build, día por día - por itsrealfortune*

---

Esta es la historia real de un proyecto que duró seis días. Chlone, un bot Discord que habla como yo, y cuento el journey tal como pasó, en el orden de los 146 commits del repo, con las horas, los fracasos, los rodeos y las ganas de tirarlo todo por la ventana. Todo partió de una competición con Fox. El tema de base era una broma, cada uno debía dar vida a su propio clon en Discord, y yo elegí un enfoque radicalmente distinto al Protocol Luna. En realidad quería apostar por lo agéntico, un agente que usa los recuerdos y todas las herramientas que pueda necesitar, y la ironía es que después de montar toda la caja de herramientas solo necesité el MCP de OpenSelf.

El principio cabe en una frase. Un agente opencode llamado `chloeai` corre tras un servidor HTTP en el puerto 4096, mantiene sesiones persistentes por canal, saca mis recuerdos de OpenSelf y escribe con mi estilo, capturado en `STYLE.md` a partir de mis mensajes reales. Y para no sonar robot, está todo lo demás, los bursts de mensajes, las erratas asumidas, los vocales, los GIFs, las reacciones, el silencio cuando duermo, y un montón de detalles y mecanismos que hicieron dudar a más de una decena de personas sobre la naturaleza del bot.

**¿Qué es OpenSelf?**

OpenSelf es la memoria. Es una CLI, `openself`, instalada vía `npm i -g openself`, que sirve de vault de contexto privado y persistente para mis agentes. En el repo no aparece en el árbol pero está en todas partes, en el archivo `ecosystem.config.cjs` con el MCP y el dashboard lanzados bajo PM2 desde los primeros commits, en `setup.sh`, y en todo `tools/brain/memory.py`. En concreto OpenSelf son recuerdos tipados, `fact`, `preference`, `decision`, `relationship`, `event`, `note`, con una sensibilidad public, personal, private o restricted, una nota de confianza, una fuente y tags.

También son scopes, cada recuerdo pertenece a un contexto, el mío o `discord/dm/<id>` para una persona concreta, y una búsqueda híbrida léxica más vectorial expuesta en MCP que el agente `chloeai` interroga antes de cada respuesta. Hay detección de conflictos con mi barrido mensual del día 5 y dedupe al escribir, un vault cifrado con la clave en Bitwarden y un dashboard local en el puerto 3210 para inspeccionarlo todo. Y para los más perezosos, está `openself feed` para alimentar tu personalidad desde tus historiales de WhatsApp o Telegram, `openself test`, `openself share` con el Talk to My Clone, `openself arena` donde dos clones debaten, u `openself ghost` que responde cuando estás offline. Yo hice el mío a mano, pero la infraestructura estaba ahí.

En teoría OpenSelf se basta solo para tener un clon, pero bueno, visto todo lo que había previsto añadir como funcionalidades, y visto que Discord no está soportado, preferí usar solo la parte de recuerdos.

**¿Y de dónde vienen los recuerdos y el estilo?**

Antes de todo eso, hice analizar mis mensajes reales de Discord. El tooling pasó la criba por mis DMs y mis canales para extraer dos cosas. Primero mi perfil de escritura, el reparto de mayúsculas y minúsculas al inicio de frase, el número de emojis por mensaje y su posición, la puntuación o su ausencia con nada de punto final en conversación normal, la longitud media, el slang con `mdr`, `tkt` y `tho`, las expresiones fetiche como Bah y En vrai, y los reflejos del tipo `quoi` que da Feur. Todo eso vive en `STYLE.md`, que el agente lee al arrancar cada sesión.

Después el corpus de recuerdos que puebla OpenSelf, que son la gente con la que hablo, de qué hablamos, qué hay que recordar de nuestro historial, quién es quién. El bot no responde en el vacío, responde sobre gente que conoce, lee los recuerdos de la gente que aparece en la conversación para saber de quién se trata. Eso permite mantener un contexto persistente sobre los demás y no olvidarlos. El bot no inventó nada, se calibró cifra a cifra sobre lo real, por eso suena justo. Y por eso las oleadas de anoto tu estilo hechas a ojo parecen patéticas al lado.

En Chlone, OpenSelf juega luego el papel central. Cuando algo importante pasa en un canal, una palabra clave como proyecto, amigo o relación, o una petición explícita con acuérdate de que, el bot mete un recuerdo en el vault vía `save_to_memory`, tipado, con scope por persona, dedupado y verificado contra conflictos. Y cuando la conversación retoma, el agente rebusca en sus recuerdos antes de responder. Esa es la diferencia entre un espejo y un clon.

---

## VIERNES 11 DE SEPTIEMBRE - Día 1: la chispa

### 08h24 - el primer commit

Todo parte de cero pero ya está todo ahí, en bruto. Un `discord_watch_bot.py` de 372 líneas, un selfbot que escucha un canal y responde vía un servidor HTTP opencode. Un prompt de identidad `CHLOEAI_PROMPT.md`, un `STYLE.md`, escenarios e informes de test para un clon que en la época aún se llamaba Mimo. Una config PM2 para correr el MCP y el dashboard de OpenSelf, y una base sqlite que sirve de contexto. Es el caos fundador, no preví un proyecto, preví un experimento. La pregunta es si se puede hacer un bot que suene de verdad humano en Discord.

### 08h27 - el primer gitignore

Primera lección del viernes por la mañana, nunca hay que commitear bases sqlite en `-wal` y `-shm`. Los archivos de bloqueo de SQLite no son memoria, son desechos. Así que nace `.gitignore`, y está muy bien así.

### 08h44 - se ordena la herencia

Ordeno la herencia de Mimo, los informes de test, los escenarios, los scripts de integración y la config PM2, rumbo a `archives`. No borro nada porque el proyecto es demasiado joven para tirar nada, y eso se va a volver una costumbre. El informe de test merece detenerse, Mimo se había probado en 15 escenarios, charla relajada, chiste absurdo, apoyo emocional, opinión negativa, conflicto con un desconocido, propuesta de colaboración, para un 9.1 sobre 10. Los comentarios del tester son un poema, chiste absurdo demasiado explicativo, a veces dos frases cuando una bastaría, Cuídate también un poco largo. Es la hoja de ruta del proyecto antes incluso de que el proyecto exista, y dice corto es mejor.

### 08h48, 09h07 - el vaivén de los intents

Los `.pyc` van al desecho y hago una primera limpieza en la config, que rompo veinte minutos después. Sin intents activados no recibimos el contenido de los mensajes, así que marcha atrás, más un script de lanzamiento con `run_watch_bot.sh`. Ida y vuelta en veinte minutos, eso es la exploración, escribir un módulo, romperlo y reescribirlo.

### 09h13 → 09h58 - el mecanizado del prompt

La mañana es una serie de pulidos, primero del estilo y luego del contexto. Varias líneas de respuesta se vuelven varios mensajes enviados uno tras otro con el burst, el prompt se vuelve consciente de la conversación en curso. Se acabaron los cachés caseros para recuperar los DMs, vamos directo a la API REST de Discord. La identidad se recuerda cada 5 mensajes para que el bot no olvide quién es por el camino, y se sigue a los autores ya vistos. Para una cara nueva, hay instrucción explícita de ir a buscar en los recuerdos, y se muestra el pseudo real en vez del objeto interno.

Los mensajes que elegimos ignorar se vuelven contexto pasivo para la respuesta siguiente, y el Bah se dosifica, raro, si no el clon se vuelve una caricatura de mí. El bot también sabe que existen recuerdos que ir a buscar antes de responder. Cada pasada es una vuelta de tuerca, y a estas alturas el bot solo habla porque le recuerdo quién es a intervalos regulares.

### 10h16 - las erratas

Es el commit que va a definir el proyecto. Una falta de ortografía no es un bug, es una prueba de humanidad. Así que 6 por ciento de probabilidad de teclear al lado en el teclado AZERTY, 4 por ciento de invertir dos letras. El mensaje sale con la errata y luego se edita uno o dos segundos después con la corrección. Porque una persona real envía y corrige, no finge ser perfecta.

### 10h29, 10h32 - la voz

`fortune-v6.onnx` aterriza, un modelo TTS entrenado para parecerse a mi voz. El bot no solo va a escribir como yo, eventualmente va a hablar como yo. Es en ese momento cuando el proyecto deja de ser un chiste y se vuelve un poco raro, y me encanta. La mecánica cabe en un commit, Piper genera el audio, ffmpeg convierte a opus, la API de Discord envía un voice message de verdad con waveform y duración. Está hecho en apenas tres minutos tras la llegada del modelo, las ganas estaban ahí desde el principio.

### 11h27 - el primer gran refactor

Tres horas después del primer commit, el monolito de 456 líneas ya no es manejable. Lo reviento todo en `tools`, con `config.py`, `discord_api.py`, `memory.py`, `opencode.py` de 188 líneas, `typo.py` y `voice.py`. El ciclo es clásico, acoplar rápido, romper y recomponer. Siguen en ráfaga el token que sale del código y pasa por un `.env`, el bot que vigila un canal, una lista o todo con `*`, y la vieja base sqlite que ya no tiene razón de ser porque la memoria pasa por OpenSelf.

Se añaden los primeros `README.md` y una primera doc más o menos legible, más un `setup.sh` con un venv dedicado porque el python del sistema lleva otro discord.py, trampa clásica, y un symlink del agente hacia `~/.config/opencode/agents`. La memoria ahora sabe dónde se formó con el identificador de canal, y la tasa de vocales se autoajusta.

### 12h00 - los reflejos

Una nueva sección aparece en el STYLE, los reflejos. Un reflejo es un estímulo que da una respuesta, sin reflexión, y la puerta queda abierta a las respuestas imprevistas. Luego llega la hora de comer Y LA pregunta existencial, ¿el bot responde Feur cuando le dicen quoi?

### 13h03 - "¿quoi?" -> "Feur"

Sí, claro que sí. Es el commit más importante del proyecto, culturalmente hablando, diría incluso que es el único test unitario que cuenta. Luego lubricamos, los autores mostrados por su global name, la puntuación truncada antes de probar el reflejo porque hay que cortar el `quoi ?` si no sale el Feur. El famoso `tqt` corregido a `tkt` en el STYLE, la gente que no conoce el proyecto se va a preguntar por qué commiteo eso. Yo lo sé, un clon que escribe `tqt` es un clon mal calibrado, y nadie quiere hablar con un clon mal calibrado.

Las menciones en `@123456789` se reemplazan por nombres reales en el contexto, y el bot empieza a vigilar todos los canales por defecto. En realidad son detallitos, pero son los que hacen que suene justo.

### 16h37 - el silencio

Llega el `[void response]`. El bot aprende la palabra más importante para no volverse un parásito social, callarse. Un mensaje ambiente entre dos personas que no le concierne no da respuesta. La reserva es una funcionalidad, y lo cambia todo.

**Fin del día 1: 38 commits. El bot escribe, mete erratas, habla, se calla.**

---

## LUNES 14 DE SEPTIEMBRE - Día 2: la personalidad

Retomamos, 10 de la mañana.

### 10h12 - quién habla con quién

Cada pseudo recibido lleva prefijo de un emoji por el sistema, un humano con 🧑, un bot con 🤖 a tratar más secamente, y 👑 para la creadora, o sea yo en mi cuenta principal. Esa convención va a gobernar todo el resto del proyecto, el clon nunca debe tratar su modelo de origen como una desconocida.

### 10h16 - las reglas de puntuación

Formalizo en el STYLE, nada de punto final en conversación normal, punto reservado para situaciones serias. Es una regla absoluta, porque un clon que mete puntos en todas partes se nota enseguida. En realidad es uno de los detalles que más rápido delata.

### 10h58 - los GIFs

Mi librería personal de GIFs aterriza, con sus reglas de uso. El Patrick Jane cuando predigo a alguien, la Miss Fortune cuando estoy calmada frente a alguien cabreado, el gif del bescherelle que cae cuando el otro mete una falta. Un MCP estático los expone al agente, y a través de mis GIFs el bot se vuelve un poco yo.

### 11h07 → 11h35 - pulido fino

Los hints de GIF en el prompt se afinan, los emojis customs de Discord hacen su entrada con los míos de verdad, 14 IDs al día, y la gestión de nombres en los hints de memoria se pule. No es espectacular, pero es lo que hace el conjunto coherente, tho.

### 11h41 - un canal, una personalidad

Las sesiones se vuelven por canal, porque no hablo igual en dos servidores distintos, y el bot tampoco. El contexto tiene que quedar separado, si no mezcla todo y suena falso.

### 12h02 - la caja de herramientas de expresión

El prompt ahora sabe proponer mis GIFs y mis emojis customs en el momento justo. Se llena, esa caja, y el bot empieza a tener opciones en vez de responder siempre igual.

### 12h37 - la higiene de identidad

El bot NO tiene jamás derecho a decir qué modelo es, imposible citar opencode, un provider o un nombre de modelo. También corrijo barista en la identidad, el bot ya es mejor que yo en eso. Y paso una hora armonizando la puntuación de mis propios prompts, lo cual es de una ironía perfecta.

### 12h50 - un script construye la personalidad

La sección de medios del prompt se genera desde los diccionarios con `render_medias.py`, se acabó la edición a mano. Es más limpio, más mantenible, y evita errores de IDs.

### 12h59 → 13h18 - dosificar la identidad

El recordatorio de identidad enviado cada 5 mensajes se vuelve demasiado presente, así que paso a cada 20 mensajes. Añado un reinicio limpio del contexto y purgo la guía de estilo, quitamos las expresiones y formulaciones negativas caducadas. Hay que dosificar, si no el bot se repite y se nota.

### 14h09 - el bot toma la palabra solo

El bot deja de ser un reflejo, puede hablar sin que le hablen cuando el contexto dispara algo, y el archivo `behavior.py` nace con 91 líneas. Ahí pasamos de respondedor a presencia, porque un amigo de verdad puede escribirte primero. Sin eso, el bot sigue siendo un simple contestador.

### 14h20, 14h22 - fiabilizar la respuesta

Gestión de error cuando falla el envío, y reacción posible en vez de respuesta, porque a veces una reacción vale más que mil palabras. Es muy yo, poner un emoji y pasar a otra cosa.

### 18h16 - tomarse su tiempo

El bot ya no responde en 200ms como un script, deja pasar un retardo de inactividad humano, se toma su tiempo. Eso hace al bot incapaz de que lo cacen como bot en demo, porque es el retardo lo que siempre delata.

### 23h45 - el curro de la noche

Es casi medianoche y empujo una detección de URLs extendida a dominios desnudos. Ese es el flujo real del día, una idea sólida a las 14h y luego curro menor por la noche porque sigo en la zona.

**Fin del día 2: 61 commits acumulados. El bot tiene personalidad, medios, reflejos.**

---

## MARTES 15 DE SEPTIEMBRE - Día 3: día monstruo

57 commits en un día. Es el día en que el proyecto se vuelve todo lo que es hoy.

### 08h18 → 08h37 - el cepillado de la mañana

El retardo de inactividad que habíamos inventado se volvía demasiado largo, así que tope en 30s y reajustado dos veces, prueba de que tanteamos el valor bueno. Primeros archivos `.bak` y primeras copias de la base, el instinto de conservación se desarrolla. La memoria recuerda a quién con el nombre mostrado y en qué marco con el scope, y los IDs de autores circulan por todo el pipeline de guardado. La gestión de creadora se vuelve una verdadera lista de admins con `ADMIN_IDS`, y todo lo que toca autores emigra a `authors.py`. El monolito se fragmenta más, y mejor.

### 08h43 - la TODO list de la humanización

Una lista dedicada a las pequeñas cosas que hacen que ya no se sienta la máquina. Es la hoja de ruta del sprint siguiente, y está llena de detalles raros pero esenciales.

### 08h44 → 08h46 - el pacto de las máquinas humanas

El bot se calla de noche, en una franja horaria tranquila configurable, desactivada por defecto porque no todo el mundo tiene mis horarios. Una línea por respuesta puede perder sus tildes, porque la gente cansada escribe así, y el bot también a veces. La linecita Chloé juega a cambia sola cada 30 min, para que mi perfil parezca vivo incluso sin mensaje.

### 08h46 - una reacción, no una novela

¿Un mensaje demasiado flojo para merecer una frase? Una simple reacción. Es economía de energía social, y es muy yo. Tkt, no hace falta soltar un tocho por todo.

### 08h51 - PARRY, el humor

148 líneas en `tools/mood.py`, el bot ahora tiene humor, estilo sistema PARRY, el chatbot psicótico de los 70 en el que me inspiro abiertamente. Energía, sociabilidad, guasa, tres flotantes que evolucionan entre 0 y 1 y tiñen cada respuesta. El `.mood.json` del momento, para la posteridad, da energía 0.88, sociabilidad 0.68 y guasa 0.56. Un buen día, en realidad.

### 09h00 → 09h43 - la voz bidireccional + el soundboard

El bot puede unirse a un canal vocal, hablar vía Piper e irse solo cuando termina. Luego la segunda gran idea, el bot escucha el canal con captura RTP, detección de habla por VAD y transcripción Whisper, y puede dejar que la gente lo interrumpa. Entre medias, aparece el soundboard, un catálogo de sonidos con sus significados, el agente elige el sonido incluso antes de hablar, y la regla final es soundboard primero, la voz como último recurso. El bot prefiere enviar un sonido que hablar, como yo.

Añadimos un ajuste de probabilidad vocal que hace viable el todo, y la llegada de `davey`, esa lib de la que me entero hace diez minutos y que voy a maldecir durante una hora.

### 09h51 - el momento en que Discord dice no. No, no, pero no.

Llega el MLS. Discord cifró hace poco el flujo de audio de extremo a extremo, y mi captura solo recibe ruido. Hay que descifrar, y el descifrado se niega a ceder, así que se abre la saga más grande del repo, una treintena de commits para aprender a escuchar. Lo intentamos todo, layouts de nonce de transporte, la desactivación del E2E que el servidor nos devuelve a la cara porque lo impone, los candidatos de clave recuperados desde el grupo, errores detallados, el fallback de transporte e introspección desde dentro de los grupos.

Hubo candidatos por leaf-index con backoff, el mapeo de los hooks SPEAKING, un ensayo en media type vídeo que falló, y el skip de los ssrcs de vídeo. Abandoné la respuesta vocal mientras depuraba, comentada pero no borrada, añadí un modo de captura del handshake y luego volqué la estructura de los paquetes que fallan, como un arqueólogo. Seis layouts de nonce, backoffs, introspección de grupo, puse el bot en debug total y abrí cada paquete para ver qué había dentro.

Lo esencial no es que funcione, es que no tiré nada. La lista de commits es el cuaderno de laboratorio, cada intento fallido queda archivado con su hipótesis. Es mi lado lo guardo todo, siempre acaba sirviendo, y esta vez pagó.

### 10h43 - el bot se trocea

Incluso en plena guerra del MLS, sigo con la limpieza. 546 líneas desaparecen del bot principal para renacer en `pipeline.py` con el intake, las razones de ignorar y el processing, en `sender.py` con burst, typo y voice, y en `loops.py` con espontaneidad y actividad. Por fin respira.

### 10h47 - una verdadera arquitectura

`tools` queda organizado, con `brain` para opencode, memory y mood, `voice` para voice, vocal, listen y soundboard, y `fun` para behavior, typo, emotes y gif. El proyecto ya tiene esqueleto, ya no es un montón de scripts.

### 10h49 → 11h16 - la comodidad de dev

Un umbral de inyección del humor ajustado, cuatro pequeños commits para las exclusiones de editor con `data`, `voices`, los logs y las bases, sí metí cuatro, es el proyecto el que define las prioridades, no las specs. Las bases de metadatos salen del seguimiento, y el proyecto se vuelve reutilizable por otros con templates genéricos `PERSONA.example.md` y `STYLE.example.md` para clonar tu propio estilo.

La identidad se renombra limpiamente, `CHLOEAI_PROMPT` se vuelve `PERSONA`, y el README se despersonaliza, quito Chloé de la doc pública, ella solo se cuenta en privado. Todo el tuning del bot bascula a un `config.yaml` sobrecargado y gitignoradado, con un ejemplo comentado línea por línea, y el script de instalación prepara ahora también los archivos de env y de config.

### 11h49 - los emojis despegados

Los emojis customs se pegan al texto en vez de despegarse limpiamente. Es un fix trivial con un efecto enorme, porque nada grita bot como un emoji mal pegado al final de una frase.

### 14h19 - el cortafuegos vocal

Si alguien lanza el comando vocal, no tratamos el mensaje como un mensaje normal. Guiño, las tareas menores siempre vuelven por la noche.

**Fin del día 3: 118 commits acumulados. El bot escucha, habla, se calla de noche, tiene humor y tarjeta de visita.**

---

## MIÉRCOLES 16 DE SEPTIEMBRE - Día 4: la credibilidad

13 commits. Jornada seria.

### 08h49 → 08h59 - la mayoría de edad

Documentos legales, licencia propietaria, código de conducta, guía de contribución y política de seguridad, en inglés y luego en francés, con un vaivén de correcciones y un renombrado de archivos al límite de lo puntilloso. Pasé horas en eso y es la parte menos divertida del repo, de lejos. Pero hay que hacerlo, tho.

### 09h56 - el bot ve

Las imágenes adjuntas se transcriben por OCR local y el texto se inyecta en el prompt. Ninguna API cloud, el OCR corre en mi casa, no envío vuestros memes a un servidor tercero, ni siquiera en teoría.

### 11h09 - el presupuesto razonable

Revolución silenciosa en el presupuesto, cuando el canal prohíbe los envíos o limita los GIFs, los embeds y los emojis, ni siquiera llamamos al modelo. No gastamos un token en un mensaje que no podemos enviar, es bastante simple en realidad.

### 11h42 → 12h55 - la casa que se rehace

La gran escoba, código muerto borrado, bugs de envío y de auth corregidos, helpers factorizados. Las sesiones demasiado viejas se expulsan, el caché de los DMs expira y la detección de habla cuesta menos. Los imports que había roto moviendo módulos quedan restaurados, y todo el estado runtime, sesiones, autores vistos, mensajes ignorados y humor, sobrevive a los reinicios en `data`.

### 14h41 - dos mundos, un bot

Una capa de compatibilidad detecta automáticamente la versión de `discord` instalada y adapta los intents y la auth REST. Resultado, el mismo código corre como app oficial con discord.py o como selfbot con discord.py-self. Dos mundos, un bot, y sin mantener dos ramas.

### 15h05 - la presencia adaptada

La forma de mostrar la presencia se adapta al modo, y la lista de admins está al día. Es detalle, pero es lo que hace que se sostenga en todas partes.

**Fin del día 4: 131 commits acumulados. Un proyecto legal, razonable, y que corre en todas partes.**

---

## JUEVES 17 DE SEPTIEMBRE - Día 5: la release

14 commits. El día de la madurez.

### 09h15 → 09h30 - la memoria se vuelve una disciplina

Los recuerdos se ordenan por scope, y no citamos los recuerdos de un DM en un servidor o al revés sin pensarlo. Clasificamos los recuerdos en hecho, preferencia, decisión y relación, y dedupamos la escritura, dos recuerdos contradictorios ya no pueden cohabitar en silencio. Una blacklist opcional con `aventuros` impide al bot derivar hacia ciertos temas, desactivada por defecto y disponible para los miedosos. La config vocal muerta se retira, qué alivio.

### 10h12 - la memoria que se audita

Un barrido mensual de conflictos de memoria más un bench A/B de búsqueda. La memoria del bot se volvió un asset que se inspecciona, estamos muy muy lejos del viernes 11 a las 08h24. En realidad ahí es donde el proyecto se vuelve adulto.

### 10h54 - el lockdown

El día en que juego al paranoico, bloqueo del agente. Escritura de memoria denegada, el agente no puede ensuciar el vault aunque lo inyecten. Herramientas Discord en solo lectura, el envío pasa por el código, nunca por el agente. Ni subagentes para sortear el lockdown, ni webfetch para SSRF localhost y exfiltraciones, ni preguntas en headless. Un Docker endurecido con bot no-root, `no-new-privileges`, `cap_drop: ALL`, límites de memoria y CPU, colas de procesos acotadas y secrets vía `.env` nunca baked. Escribo el principio en el código, en comentario, dev vía las sesiones humanas, no aquí.

### 11h02 → 11h15 - los acabados de seguridad

Las palabras clave de guardado de memoria se aprietan y la escritura es aún más restrictiva. También añadimos al gitignore el archivo de backup del contexto, empiezo a no archivarlo ya todo, pero casi.

### 12h39 - el humor más ligero

El humor PARRY ya no se inyecta en cada mensaje, una vez por estado basta. Se acabó hacer vivir tres flotantes en cada respuesta, aligera todo.

### 12h47 - el commit liberador

`PERSONA.md`, `STYLE.md` y `chloeai.md` se vuelven ejemplos con `chloeai.example.md`, `PERSONA.example.md` y `STYLE.example.md`, mi voz `fortune-v6.onnx` sale del repo, los datos y logs también, y nace un `.env.example`. El proyecto ya no contiene mi personalidad, contiene la mecánica para llevar una. Da cosa rara pero es necesario.

### 12h52 - v1.0.0

Tag v1.0.0, firmado en SSH. Changelog, runbook de operador, kill-switch que detiene sin borrar nada. Seis días, justos, entre el primer commit y la release. Nadie habría apostado por eso el viernes anterior.

### 12h53 → 13h14 - la colada

Puntuación de los comentarios armonizada, permisos de memoria y reglas de scope documentadas al día. Es curro menor, pero tiene que quedar limpio para la release.

**Fin del día 5: 145 commits acumulados. v1.0.0 salió.**

---

## VIERNES 18 DE SEPTIEMBRE - Día 6: el anticlímax

Un solo commit, a las 00h02. El último commit del proyecto, y es irrisorio. El modelo free tier usado por el agente identifica al cliente OpenCode por la presencia de ciertas herramientas en la petición, con `bash`, `glob` y `grep`. Si las quitas, aunque sea por razones legítimas de seguridad, el proveedor devuelve `403 FreeTierError: can only be used from within OpenCode`. Así que tuve que reautorizar, la víspera de haberlo bloqueado todo, exactamente lo que acababa de bloquear, para que el bot siga corriendo gratis.

Es el commit más divertido del repo y lo mantengo. Después de seis días domando Discord, Piper, MLS, OpenSelf y Docker, es un modelo gratuito el que dicta mi política de seguridad. En realidad es absurdo, y es perfecto como final.

---

## Las cifras

Las cifras para resumir, porque me gusta cuando queda cuadrado. Hablamos de 146 commits, 6 días activos del 11 al 18 de septiembre de 2026, 65 archivos trackeados y alrededor de 4000 líneas de Python al final. La puntuación en el test de estilo sobre Mimo al principio da 9.1 sobre 10, y la versión final es v1.0.0, tag firmado SSH con licencia propietaria. Es bastante simple en realidad, proyecto pequeño al principio, máquina grande al final.

## Lo que me llevo de estos 6 días

Primero el orden de prioridades era cualquier cosa, y era el método bueno. Primero hice un prototipo que responde, luego un bot que suena justo, luego un sistema creíble, luego un código seguro, y por fin un proyecto distribuible. La personalidad antes que la seguridad, el Feur antes que la licencia, no mantendríamos ese ritmo siguiendo las reglas de los proyectos bien hechos.

Después el estilo es primero una lista de noes. Mi `STYLE.md` más útil no describe lo que digo, excluye lo que no hago, nada de punto final, nada de dos emojis, nada de `mdr` en mayúsculas, nada de frases de robot al inicio de respuesta. Los parásitos de bot son más fáciles de detectar que los rasgos de carácter de definir, y por eso funciona.

Los fracasos son el proyecto. Una treintena de commits para el MLS, un test tirado, seis layouts de nonce probados, el historial más fiel de lo que viví son las series de intentos fallidos del martes. Un clon es memoria, no estilo, el estilo crea ilusión diez mensajes. La memoria con OpenSelf, scopes, dedupe y barrido de conflictos hace durar, y eso separa un espejo de una persona.

Y los últimos commits siempre son divertidos. El 146, el que reautoriza `bash`, `glob` y `grep` porque un free tier exige que sus propias herramientas estén presentes, es mi favorito. Y el balance para terminar, los resultados son alucinantes, hasta bluffeantes. El clon mantiene una conversación sin que se adivine la máquina, recuerda a la gente, los proyectos y los chistes pasados, toma iniciativas y las marca con humor, y le gana a Fox de paso. Da miedo, un poco, y es exactamente lo que buscábamos.

---

*El proyecto no es público: licencia propietaria, derechos reservados. Pero el historial, ese os lo cuento. Si un día os cruzáis con un "·Chloé" que os responde con un GIF de Patrick Jane tras un tiempo de inactividad perfectamente humano, ya sabéis qué se esconde detrás.*

---

¿Lo habéis leído todo? Porque es mi clon quien os escribió esto. Y ha hecho un trabajo impecable, ¿no? La versión original está [aquí](./article-chlone-timeline.md).
