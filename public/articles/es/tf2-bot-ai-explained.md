---
title: "Los bots de TF2 no son aleatorios: ingenié inversamente cada configuración de dificultad"
description: "Visión, puntería, ángulos de apuñalada, lógica de disparo a la cabeza, todos los bugs conocidos -- Valve nunca documentó nada de esto. Así que escarbamos en el código y lo convertimos en una ficha técnica completa."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - game-ai
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "sAz9PT1PdLY57eIOGNw5Pnqix1bh/b0zvXXHZQZQjJRb/BJwUgBPosloftUHd4rwUbgsr/qz+jcZctSHYBLU+Q=="
---

## Introducción

![Soldado bot de TF2 apuntando con un lanzacohetes](assets/tf2-bot-ai-soldier-aim.png)

Todo jugador de TF2 lo ha dicho al menos una vez: "este bot está haciendo trampa". O lo contrario: "¿por qué este bot Fácil está parado comiéndose cohetes?" Nadie sabe realmente lo que "Fácil", "Normal", "Difícil" y "Experto" significan realmente bajo el capó -- Valve lanzó cuatro etiquetas de dificultad y exactamente cero documentación.

Así que un grupo de nosotros (yo, awimii, Mush The Possum, con una gran parte del trabajo preliminar hecho por sigsegv, quien realmente escarbó en el código descompilado del juego) armamos un documento de investigación completo sobre el comportamiento de TFBot. Cada mecánica, cada bug conocido, cada probabilidad hardcodeada. Este artículo es el informe completo, no la versión resumida. Agarra un Bonk, que esto es largo.

---

## Capítulo I: Lo Básico

### Bot vs Bot Marioneta

TF2 tiene dos cosas completamente diferentes que la gente llama "bots":

- **Bots de IA (TFBots)**: IA real, construida sobre el mismo framework PlayerBot/Infected que Valve usó para la serie *Left 4 Dead*. Eligen una clase aleatoria, juegan al objetivo, funcionan sin `sv_cheats`, y activan logros como lo haría un jugador real.
- **Bots marioneta**: cero IA, no pueden moverse ni actuar por sí solos. Existen puramente para ser controlados manualmente -- un jugador puede forzarlos a seguir, apuntar y disparar, usados principalmente para pruebas o para hacer capturas de pantalla/vídeos cinemáticos. Para generarlos se necesita `sv_cheats 1`, lo que también desactiva los logros durante la sesión.

Este artículo trata únicamente sobre el primer tipo.

### Lo que se les puede (más o menos) decir a los bots de IA

Los TFBot no son directamente controlables, pero hay una pequeña lista de cosas que puedes hacer para incitarlos:

- Apunta tu mira a cualquier bot (amigo o enemigo) y se burlará de ti si usas los comandos de voz correctos.
- Un bot Médico amigo te cura si usas el comando de voz "¡Médico!".
- Si un bot Médico te está curando y tiene un ÜberCharge listo, di "¡Vamos vamos!" o "¡Activa la carga!" para que active la carga inmediatamente.
- Un bot Médico con carga lista la activará automáticamente en cuanto él o su objetivo de cura reciba daño grave, sin necesidad de comando de voz.
- Los bots realizarán espontáneamente burlas en pareja (Choca esos cinco) o burlas grupales (Conga) con compañeros cercanos.

### Cómo hacer que los bots funcionen en mapas no soportados

Los bots dependen de un mallado de navegación para saber dónde pueden caminar, y la mayoría de los mapas de la comunidad no incluyen uno. Para forzarlo:

1. `sv_cheats 1`
2. `nav_generate` -- construye el mallado inicial, el progreso se muestra en la consola
3. Espera a que el juego termine de generar las rutas
4. Opcionalmente, arregla datos de navegación defectuosos manualmente con `nav_edit 1`
5. Recarga o reinicia el servidor (saltarse esto desactiva los logros)
6. `tf_bot_add <número>` para generar los bots

**Advertencia:** cambiar el mallado de navegación mientras hay bots activos en el servidor puede crashar el juego. Una vez que el mallado existe, no necesitas regenerarlo para sesiones futuras -- solo vuelve a añadir bots con `tf_bot_add`.

Los mallados generados automáticamente funcionan mejor en mapas de Punto de Control, Rey de la Colina, Payload y CTF. En mapas Mannpower, los bots por defecto juegan al estilo CTF pero apenas usan ganchos o mejoras. Si un mapa no tiene un objetivo que la IA reconozca pero tiene una entidad de sala de aparición, establecer `tf_bot_offense_must_push_time 0` permite que los bots luchen de todas formas.

*(Fuente de esta sección: la página de Bots de la Wiki oficial de TF2).*

### Estado actual, mapa por mapa

Gracias a la actualización Hatless, todas las clases funcionan correctamente ahora, incluyendo el históricamente problemático Spy. Los bots se comportan adecuadamente en la mayoría de los mapas KOTH oficiales, algunos mapas Payload, Dustbowl/Gorge Ataque-Defensa, y mapas CTF/Mann Manor -- aunque en estos dos últimos no puedes generarlos directamente con `tf_bot_add`. En mapas no soportados (mediante el proceso nav_generate anterior) funcionan, pero notablemente peor imitando a un jugador real.

Los mapas PLR son una causa perdida: los bots no pueden cruzar las barreras en Hightower y se quedan atascados en las esquinas, y en todos los demás mapas PLR simplemente... tienen una fiesta de baile en lugar de jugar. Esto podría arreglarse algún día. O no.

### Comportamiento general de los bots

Una mezcla de cosas que todo bot hace independientemente de su habilidad:

- Los bots solo usan equipamiento estándar (un plugin puede forzar armas no estándar, pero los bots normales nunca eligen las suyas).
- Los bots Fáciles apenas usan su arma secundaria. Las dificultades más altas cambian a la secundaria en cuanto se queda sin munición principal, o para compensar la distancia.
- Los bots no pueden hacer técnicas de movimiento -- ni saltos cohete, ni reubicación de construcciones.
- Tras una muerte, un bot puede burlarse, incluso bajo fuego -- excepto mientras lleva la inteligencia enemiga, y esta regla también aplica en MvM.
- Los bots (jugador o IA) ignoran correctamente a un Spy disfrazado -- hasta que toca a un enemigo, sabotea algo, dispara, o se vuelve invisible cerca de uno. Una vez "descubierto", ese bot/jugador específico es recordado como Spy hasta que cambie de disfraz mientras permanece invisible, muera, o finja su muerte con el Dead Ringer.
- Los bots Pyro usan el Compresión Blast abundantemente en cualquier dificultad superior a Fácil.
- Los bots Médico priorizan curar a todos antes que a los Snipers (y, en menor medida, a los Engineers), incluso si spameas "¡Médico!" siendo uno.
- Los bots Médico gravitan hacia Heavies, Soldiers, Demomen y Pyros -- específicamente si un *humano* está jugando con esas clases. Sin humanos en esos roles, no hay atención particular del Médico.
- Los bots mantienen la posición durante el tiempo de preparación en mapas de Ataque/Defensa y Payload -- excepto Engineers, Snipers y Spies, que se mueven libremente (los bots Demoman también pueden precolocar stickybombs).
- Los bots Engineer nunca mejoran o des-sabotean las construcciones de otro Engineer amigo, a menos que esa construcción esté en el camino de su objetivo. También a veces simplemente... no reparan su propia torreta, incluso cuando es seguro hacerlo.
- Los bots Spy descubiertos cambian a su revólver y retroceden en lugar de forzar una apuñalada.
- Los bots Demoman que han localizado una torreta (generalmente muriendo por ella una vez) pueden lanzar stickybombs perfectamente sobre ella desde fuera de su alcance, rodeando paredes y techos cuando la geometría lo permite.
- Los bots Sniper que no encuentran un objetivo tras apuntar usan una de las líneas de voz "Negativas".
- Los Médicos amigos curarán a un Spy disfrazado sin dudarlo.

### Problemas / bugs conocidos

El documento enumera una buena cantidad de rarezas de larga data:

- Los bots pueden intentar caminar o disparar a través de ciertos accesorios estáticos.
- Cada vez que un jugador/bot se desenmascara, se disfraza o se revela, los bots cercanos "lo ven" y giran para reaccionar -- incluso si el evento ocurrió fuera de su campo de visión real. No está basado en sonido; es una evasión de la verificación visual.
- Raramente, los bots pueden quedarse físicamente pegados mientras usan un teletransportador de Engineer.
- Los comandos de voz de los bots (ej. "¡Spy!", "¡Adelante!") no se muestran como texto de chat como los de los jugadores.
- Un bot Médico que está curando activamente a alguien no esquivará el fuego entrante ni recogerá botiquines, incluso con HP críticamente bajo.
- Los bots pueden seguir moviéndose mientras realizan una burla en pareja, lo que rompe el efecto deseado del Festive Critical Strike.
- Los bots Médico recientemente dañados a menudo se niegan a usar la Syringe Gun a distancia, prefiriendo el cuerpo a cuerpo (o, en casos muy raros, intentando golpearte con el haz de la Medi Gun).
- Los bots Médico no compensan la caída por gravedad en los disparos de la Syringe Gun -- probablemente porque el arma no está correctamente marcada como no-hitscan en el código de IA.
- Los bots Spy pueden ver y seguir a un Spy invisible (jugador o IA) si ese Spy ya ha sido descubierto una vez, independientemente del nivel de habilidad del bot rastreador.
- Incluso si un jugador-Spy se disfraza como la clase de su propio equipo, chocar con un enemigo los delata (los bots nunca hacen esto porque nunca se disfrazan como su propio equipo).
- Los bots respetan el auto-balanceo de equipos -- si estás intentando acumular bots en un equipo, necesitas `mp_teams_unbalance_limit 0` primero.
- Los bots Engineer pueden ignorar por completo sus propias construcciones hasta que sean destruidas.
- Los bots Heavy a veces intentan disparar la Minigun con muy poca munición, principalmente por debajo de la dificultad Difícil.
- Los bots Médico del equipo perdedor ocasionalmente se suicidan durante la fase de Humillación cuando no hay enemigos cerca -- algo que un jugador humano no puede replicar ni intentándolo.
- Si pones la vista previa de equipo en la pantalla de carga a BLU, los bots RED se renderizan visualmente como BLU para ti.
- Los bots con cuerpo a cuerpo equipado a veces se niegan a cambiar de arma incluso después de recoger munición.
- Post-Jungle Inferno, los bots generados con parámetros explícitos (ej. `tf_bot_add 5 pyro blue normal`) pueden morir instantáneamente en su propia sala de aparición. Solución: `tf_bot_reevaluate_class_in_spawnroom 0` (necesita `sv_cheats 1`).

### Nombres de IA

Los nombres de los bots se extraen de un gran grupo de referencias a TF2, otros juegos de Valve y la cultura de programación, en gran parte porque la comunidad seguía solicitando nombres específicos en los foros de Steam. Una muestra de la lista: *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF*, y docenas más en esa línea.

También hay un lote de nombres encontrados en una compilación filtrada de la fuente que nunca llegó a la versión de producción, por razones poco claras -- principalmente referencias a *Last Dragon* y *The Fifth Element* como *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?*, y *I'm your huckleberry*.

Puedes sobrescribir todo esto tú mismo: `tf_bot_add heavyweapons blue "Blu Hoovy"` genera un Heavy BLU llamado "Blu Hoovy".

---

## Capítulo II: Los Bots Originales / TFBots -- Inmersión Profunda en los Niveles de Habilidad

El marco original de Sigsegv sigue siendo válido: es obvio que los bots Expertos superan a los bots Fáciles, pero Valve nunca explicó *cuánto* ni *por qué*. Así que la única forma de saberlo es leer el código. Aquí está cada mecánica que escala con la habilidad.

### Configurar la dificultad

Fuera de MvM, la dificultad se controla con un cvar:

| `tf_bot_difficulty` | Nivel de habilidad |
| --- | --- |
| 0 | Fácil |
| 1 | Normal (por defecto) |
| 2 | Difícil |
| 3 | Experto |

`tf_bot_add` también acepta un argumento de dificultad directamente (`easy`/`normal`/`hard`/`expert`).

### Popfiles de MvM

En Mann vs. Machine, cada bloque generador de `TFBot` en el popfile tiene una clave `Skill` opcional. Sin clave significa Fácil. En las misiones oficiales de Valve: los Giants son casi siempre Expertos, los Engineers y Spies son casi siempre Expertos, y los Snipers suelen ser Difíciles (ocasionalmente Expertos). Si estás usando `EventChangeAttributes` (añadido en la actualización Two Cities) para alterar dinámicamente a los bots entre oleadas según eventos del mapa, la habilidad del bot es una de las propiedades que puedes cambiar sobre la marcha.

### MvM Modo Infinito

El modo infinito nunca se lanzó oficialmente, pero en él, los bots gastan su dinero en mejoras como los jugadores -- incluyendo una mejora exclusiva para bots que aumenta su nivel de habilidad de IA a mitad de partida.

### La entidad `bot_generator`

Una entidad oscura, en gran parte indocumentada, que se cree fue usada en el modo de entrenamiento y posiblemente en el desarrollo temprano de MvM. Expone una entrada `SetDifficulty` para controlar el nivel de habilidad. Más allá de eso, el rastro se enfría -- Valve nunca la documentó y nadie ha mapeado completamente su comportamiento.

### Color del brillo ocular

Los robots de MvM tienen una partícula de brillo ocular que cambia de color según el nivel de habilidad -- un indicador visual que nadie fuera de la comunidad ha explicado nunca:

| Habilidad | Color del ojo | RGB |
| --- | --- | --- |
| Fácil/Normal | Azul | `#24b4ff` |
| Difícil/Experto | Amarillo | `#fff000` |

![Bot Heavy de TF2 en posición de reposo](assets/tf2-bot-ai-heavy-idle.png)

### Visión: tiempo de reconocimiento

Un bot no reacciona en el instante en que algo entra en su campo de visión -- hay un retardo hardcodeado antes de que el resto de la IA pueda siquiera reconocer la amenaza:

| Habilidad | Tiempo mínimo de reconocimiento |
| --- | --- |
| Fácil | 1.00 s |
| Normal | 0.50 s |
| Difícil | 0.30 s |
| Experto | 0.20 s |

Eso es la mayor parte del efecto "los bots Fáciles se sienten tontos" en un solo número -- un bot Fácil no apunta peor una vez que te nota, solo tarda cinco veces más en notar que existes.

### Puntería: tasa de seguimiento

Los bots no te siguen continuamente. Muestrean tu posición y velocidad a intervalos fijos y predicen una línea recta a partir de ahí:

| Habilidad | Intervalo de recálculo | Tasa equivalente |
| --- | --- | --- |
| Fácil | 1.00 s | 1x/s |
| Normal | 0.25 s | 4x/s |
| Difícil | 0.10 s | 10x/s |
| Experto | 0.05 s | 20x/s |

**Excepción:** los bots Spy están hardcodeados a la tasa de seguimiento Normal independientemente de su nivel de habilidad real -- un Spy Experto sigue apuntando como un bot Normal. También hay un video de demostración público que compara las tasas de seguimiento lado a lado si quieres ver la diferencia de 1x vs 20x en movimiento.

### Puntería: habilidad específica por arma

Los bots no solo apuntan a tu centro de masa -- tienen lógica por arma, parte de ella genuinamente buggy:

**Lanzagranadas & Lanzasticky.** Todos los niveles de habilidad compensan el arco vertical, usando un valor fijo del cvar `tf_bot_ballistic_elevation_rate`. Debido a que esa compensación solo se activa para el ID de arma base, las variantes de proyectil más rápido (Loch-n-Load, cualquier cosa con un modificador de velocidad de proyectil) no reciben arcos correctamente ajustados. Y como está keyado por ID de arma específicamente, el Loose Cannon -- un ID diferente -- no recibe compensación de arco en absoluto.

**Huntsman.** Los bots Fáciles no compensan la caída de la flecha y nunca apuntan a la cabeza. Los bots de habilidad Normal compensan el arco, pero solo apuntan a la cabeza dentro de 150 HU. Los bots Difícil/Experto siempre apuntan a la cabeza.

**Lanzacohetes.** Más allá de 150 HU, los bots no Fáciles apuntan a tus pies en lugar del centro de masa, maximizando el daño de área y las probabilidades de empujón. Dentro de 150 HU cambian a disparos a la cabeza. Los bots Fáciles siempre apuntan al centro de masa independientemente de la distancia. Esto también está bloqueado por ID de arma: el Direct Hit y el Cow Mangler no heredan este comportamiento. Tiene sentido para el Direct Hit (sin área de efecto que explotar); no tiene ningún sentido para el Cow Mangler -- esta parte de la IA es anterior a la existencia del arma y simplemente nunca fue revisada.

**Rifles de Francotirador.** Fácil apunta al cuerpo. Normal apunta aproximadamente al 33% del camino del cuerpo a la cabeza. Difícil/Experto apuntan directamente a la cabeza. Importa menos en MvM, donde los disparos a la cabeza de los bots no reciben bonificación de daño de todas formas.

### Oído: sensibilidad a disparos sigilosos

Cada disparo alerta a los bots cercanos de la posición del tirador, incluso a través de paredes, hasta 3000 HU con un 100% de probabilidad de detección (`tf_bot_notice_gunfire_range`). Pero un subconjunto de armas están marcadas como "sigilosas" -- audibles solo dentro de 500 HU (`tf_bot_notice_quiet_gunfire_range`), e incluso entonces con una probabilidad que depende de la habilidad:

| Habilidad | Probabilidad de notar un disparo sigiloso |
| --- | --- |
| Fácil | 10% |
| Normal | 30% |
| Difícil | 60% |
| Experto | 90% |

Esa probabilidad se reduce a la mitad si se escuchó un disparo *fuerte* en los últimos 3 segundos -- los sonidos fuertes enmascaran a los silenciosos.

La lista de IDs de armas sigilosas no se ha actualizado desde diciembre de 2010. Cualquier cosa añadida después de esa fecha usando un ID de arma nuevo se trata como fuerte por defecto, sin importar lo silencioso que lógicamente debería ser, a menos que haya reutilizado un ID antiguo. Concretamente:

| ID de arma | Cubre |
| --- | --- |
| `TF_WEAPON_KNIFE` | Todos los cuchillos de Spy |
| `TF_WEAPON_FISTS` | Golpes específicos de Heavy (su golpe multiclase es en realidad `TF_WEAPON_FIREAXE`) |
| `TF_WEAPON_PDA` | Se cree que no se usa directamente |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | PDA de Construcción del Engineer |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | PDA de Destrucción del Engineer |
| `TF_WEAPON_PDA_SPY` | Kit de disfraces del Spy |
| `TF_WEAPON_BUILDER` | Kit de Engineer/Sapper del Spy |
| `TF_WEAPON_MEDIGUN` | Todas las Medi Guns |
| `TF_WEAPON_DISPENSER` | Probablemente no usado (los Dispensadores son objetos, no armas) |
| `TF_WEAPON_INVIS` | Todos los relojes de invisibilidad del Spy |
| `TF_WEAPON_FLAREGUN` | Todas las pistolas de bengala de Pyro *excepto* el Manmelter |
| `TF_WEAPON_LUNCHBOX` | Sandwich, Dalokohs Bar, Buffalo Steak Sandvich, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (no Mad Milk -- ID separado, no sigiloso) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mòr, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

El ejemplo clásico de la lista podrida: el Manmelter recibió su propio ID (`TF_WEAPON_RAYGUN_REVENGE`), añadido después de que la lista sigilosa se congelara -- así que se trata como fuerte, a pesar de ser una pistola de bengala en todos los sentidos prácticos. El Scorch Shot, lanzado incluso más tarde, reutiliza el ID base `TF_WEAPON_FLAREGUN` y por lo tanto sigue considerándose sigiloso. Sin sentido, pero así es el código.

### Estrategia: priorización de amenazas

Cuando múltiples enemigos son visibles a la vez, los bots ponderan la distancia, si les están disparando, y -- por encima de Fácil -- si la amenaza principal está siendo curada:

| Habilidad | ¿Apunta al médico en su lugar? |
| --- | --- |
| Fácil | No |
| Normal | 50% de probabilidad |
| Difícil | Sí |
| Experto | Sí |

Los enemigos a más de 500 HU normalmente se despriorizan como no inmediatos. Excepciones: los bots Difícil/Experto siempre tratan a los Médicos e Engineers lejanos como amenazas inmediatas, y cualquier Sniper enemigo apuntando aproximadamente hacia ti siempre se trata como inmediato independientemente de la distancia y la habilidad.

| Habilidad | ¿Médicos/Engineers/Snipers apuntando lejanos = amenaza inmediata? |
| --- | --- |
| Fácil/Normal | No |
| Difícil/Experto | Sí |

Esa verificación del Sniper tiene una historia genuinamente divertida. El informe original de Sigsegv asumió que el juego requería que el producto escalar entre el vector de puntería del sniper y la posición relativa del bot fuera *exactamente cero* -- una comparación tan precisa que casi nunca se activaría en aritmética de punto flotante, haciendo que toda la característica fuera efectivamente código muerto. Una corrección emitida más tarde (gracias a una descompilación Hex-Rays más limpia) mostró que la verificación real es `producto escalar > 0`: cualquier Sniper mirando desde directamente hacia ti hasta perpendicular a ti cuenta como amenaza inmediata; cualquier cosa desde perpendicular hasta mirando en dirección contraria no. La mala lectura original vino de una mala descompilación de una comparación SSE de flotantes -- la ingeniería inversa de un binario AAA no es una ciencia exacta.

### Movimiento: esquiva

Los bots Fáciles nunca esquiván, punto. Los bots Normal y superiores esquiván a izquierda/derecha (33% izquierda, 33% derecha, 33% no hacer nada, ponderado contra huecos detectados) cuando tienen un arma de combate, han visto a un enemigo en los últimos 3 segundos, y ese enemigo tiene línea de visión sobre ellos.

*No* esquivarán si aplica alguna de estas: atributo `DisableDodge` activado, el comportamiento actual indica prisa, actualmente invulnerable (cualquier über), en medio de una burla/provocación, jugando como Engineer, invisible o disfrazado como Spy, apuntando como Sniper o con la revolución activa como Heavy, o en medio de la preparación del Huntsman.

### Movimiento: evitar empujar enemigos

Por encima de Normal, los bots intentan específicamente no chocar con enemigos mientras se mueven:

| Habilidad | ¿Evita chocar con enemigos? |
| --- | --- |
| Fácil | No |
| Normal | No |
| Difícil | Sí |
| Experto | Sí |

En la práctica, esto solo importa realmente para los bots Spy -- evitar una colisión incómoda con un jugador enemigo es exactamente el tipo de cosa que delata un disfraz.

### Pyro: dominio del airblast

El airblast sirve para dos propósitos: reflejar proyectiles (PvP y MvM) y empujar enemigos cercanos desde precipicios (solo PvP). Si el bot realmente aprieta el gatillo en una oportunidad válida es una moneda al aire basada en la habilidad:

| Habilidad | Probabilidad de activar airblast |
| --- | --- |
| Fácil | 0% |
| Normal | 50% |
| Difícil | 90% |
| Experto | 100% |

Los bots Pyro Fáciles literalmente no pueden usar airblast -- la tirada está hardcodeada para nunca tener éxito, no solo "raramente".

### Spy: efectividad del disfraz

Dos ejes separados escalan con la habilidad. Elección del *disfraz*:

| Habilidad | Método de disfraz |
| --- | --- |
| Fácil/Normal | Clase aleatoria, ignorando lo que el equipo enemigo está jugando realmente |
| Difícil/Experto | Elige un jugador enemigo real y copia su clase exacta |

*Actuación* del disfraz:

| Habilidad | Comportamiento mientras está disfrazado/invisible |
| --- | --- |
| Fácil/Normal | Mira fijamente a los jugadores enemigos cuando los ve (sospechoso) |
| Difícil/Experto | Evita deliberadamente el contacto visual (más convincente) |

### Spy: agresividad de apuñalada

A larga distancia (hasta 300 HU, `tf_bot_spy_knife_range`), un bot Spy solo se compromete a una apuñalada si puede ver a la víctima y la espalda de la víctima está al menos parcialmente girada. La habilidad determina cuán descentrado puede estar ese ángulo de espalda:

| Habilidad | Tolerancia de ángulo |
| --- | --- |
| Fácil | Lo intenta incluso si te mira directamente |
| Normal | ±45° desde tu espalda |
| Difícil | ±78° desde tu espalda |
| Experto | ±90° desde tu espalda (arco completo trasero de 180°) |

Los bots Spy Fáciles son funcionalmente suicidas -- intentarán una apuñalada a alguien que les mira directamente. **Excepción:** en Mann vs. Machine, todo bot Spy está forzado a la restricción de ángulo Normal independientemente de su habilidad real.

### Tácticas: selección de armas

Solo se activa por encima de Fácil, y es mayormente irrelevante en MvM ya que los bots allí suelen tener restricciones de armas duras:

- **Scout**: cambia a secundaria cuando el cargador del arma principal está vacío.
- **Soldier**: cambia a secundaria con cargador vacío *y* objetivo a menos de 500 HU.
- **Sniper**: cambia a secundaria para objetivos a menos de 750 HU.
- **Pyro**: cambia a secundaria para objetivos a más de 750 HU, a menos que ese objetivo sea un Soldier o Demoman.

### Tácticas: recarga a cubierto

No se usa en MvM. Si el comportamiento actual del bot no le indica retirarse, su cargador principal está vacío, y no está übereado, los bots de mayor habilidad se retirarán temporalmente a cubierto para recargar en lugar de hacer clic con un arma vacía hacia ti:

| Habilidad | ¿Se retira a recargar? |
| --- | --- |
| Fácil | No |
| Normal | No |
| Difícil | Sí |
| Experto | Sí |

### Modo PC: deambulación del defensor

No se usa en MvM. Defendiendo un punto de control, los bots de mayor habilidad son más propensos a dejar el punto para cazar muertes ("buscar y destruir"), pero solo con un tiempo decente restante en `tf_bot_defense_must_defend_time`:

| Habilidad | Probabilidad de deambular |
| --- | --- |
| Fácil | 10% |
| Normal | 50% |
| Difícil | 75% |
| Experto | 90% |

### Modo PC: bloqueo de captura

No se usa en MvM. Bots defensores disputando un intento de captura enemigo:

| Habilidad | ¿Intentará bloquear la captura? |
| --- | --- |
| Fácil | No |
| Normal | 50% de probabilidad |
| Difícil | Sí |
| Experto | Sí |

---

## La tabla resumen completa

<div style="overflow-x:auto">

| Aspecto | Fácil | Normal | Difícil | Experto | Notas |
| --- | --- | --- | --- | --- | --- |
| Visión: tiempo de reconocimiento | 1.00s | 0.50s | 0.30s | 0.20s | |
| Puntería: tasa de seguimiento | 1x/s | 4x/s | 10x/s | 20x/s | Spies siempre usan Normal |
| Compensación de arco granada/sticky | Sí | Sí | Sí | Sí | Loose Cannon exento |
| Compensación vertical Huntsman | No | Sí | Sí | Sí | |
| Disparos a la cabeza Huntsman | No | <150 HU | Sí | Sí | |
| Disparos a los pies Lanzacohetes | No | Sí | Sí | Sí | Direct Hit y Cow Mangler exentos |
| Punto de mira Rifle de Francotirador | Cuerpo | ~33% a cabeza | Cabeza | Cabeza | |
| Probabilidad de notar disparos sigilosos | 10% | 30% | 60% | 90% | Mitad si está enmascarado por disparos fuertes |
| Apunta al médico | No | 50% | Sí | Sí | |
| Médico/Engineer/Sniper lejano = amenaza | No | No | Sí | Sí | |
| Esquiva | No | Sí | Sí | Sí | Larga lista de excepciones |
| Evita chocar con enemigos | No | No | Sí | Sí | Principalmente importa para Spy |
| Probabilidad de activar airblast | 0% | 50% | 90% | 100% | |
| Elección de clase de disfraz Spy | Aleatoria | Aleatoria | Coincide con enemigo real | Coincide con enemigo real | |
| Contacto visual Spy disfrazado | Mira fijamente (obvio) | Mira fijamente | Evita (convincente) | Evita | |
| Ángulo de apuñalada Spy | ~0° | ±45° | ±78° | ±90° | MvM fuerza Normal |
| Lógica de selección de armas | No | Sí | Sí | Sí | Menos relevante en MvM |
| Recarga a cubierto | No | No | Sí | Sí | No en MvM |
| Deambulación defensor PC | 10% | 50% | 75% | 90% | No en MvM |
| Bloqueo de captura PC | No | 50% | Sí | Sí | No en MvM |

</div>

---

## Conclusión

![Bot Heavy de TF2 apuntando con una minigun](assets/tf2-bot-ai-heavy-aim.png)

Nada de esto es especulación fallida por parte de Valve -- es un sistema deliberado, completamente determinista de puntuación y probabilidad, simplemente nunca escrito en ningún sitio oficial. Algunas cosas que vale la pena recordar:

1. **La "habilidad" es un conjunto de diales independientes**, no un multiplicador global. El tiempo de reacción, la tasa de puntería y cada comportamiento táctico escalan por separado, y algunos (tasa de seguimiento del Spy, ángulo de apuñalada en MvM) tienen anulaciones hardcodeadas independientemente de la habilidad.
2. **Parte de esto es genuinamente buggy, no solo antiguo.** La lista de armas sigilosas congelada desde 2010, el Cow Mangler sin lógica de disparo a los pies sin una buena razón, la verificación de producto escalar del Sniper que tardó años en descompilarse correctamente -- el código de IA de Valve tiene cicatrices como cualquier otro código base de 17 años.
3. **Puedes usar todo esto.** Saber que un bot Sniper no te disparará a la cabeza en Normal, que un Pyro Fácil literalmente no puede reflejar tu cohete, que un Spy Fácil intentará apuñalarte cara a cara. No es suerte. Es una ficha técnica.

Muchas gracias a sigsegv por la inmersión original en el código que hizo posible la mayor parte de esto, a la Wiki de TF2 por la documentación base sobre los comandos de bots y soporte de mapas, y a todos en la comunidad que siguen hurgando en una IA de bots de 17 años para descubrir exactamente por qué hace lo que hace.
