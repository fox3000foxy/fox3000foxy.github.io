---
title: "Los bots TF2 no son aleatorios: redescubrí cada parámetro de dificultad"
description: "Visión, puntería, ángulos de backstab, lógica de headshot, cada bug conocido: Valve nunca documentó nada. Así que escarbamos el código y lo convertimos en una ficha técnica completa."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - jeu-ia
  - ingenierie-inversee
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "TOvVivUl2ZD6xyOqSRXQKmk2tPEg4+XNgrLoqCxH0dE3CQOolp3V0aVYFtY1uSmLhT911tkLoT0ikFDkcUdZcQ=="
---

## Introducción

![Soldado bot TF2 apuntando con un lanzacohetes](assets/tf2-bot-ai-soldier-aim.png)

Cada jugador de TF2 lo dijo al menos una vez: «ese bot hace trampas.» O lo inverso: «¿por qué ese bot Fácil se queda plantado comiendo cohetes?» Nadie sabe de verdad qué significan «Fácil», «Normal», «Difícil» y «Experto» bajo el capó: Valve despachó cuatro etiquetas de dificultad y exactamente cero documentación.

Así que un grupo de nosotros (yo, awimii, Mush The Possum, con una enorme parte del trabajo base hecho por sigsegv, que de verdad escarbó el código descompilado del juego) reunió un documento de investigación completo sobre el comportamiento de los TFBot. Cada mecánica, cada bug conocido, cada probabilidad codificada en duro. Este artículo es el informe íntegro, no la versión condensada. Coged un Bonk, va a ser largo.

---

## Capítulo I: Las bases

### Bot vs Bot Marioneta

TF2 tiene dos cosas por completo distintas que la gente llama «bots»:

- **Bots IA (TFBots)**: verdadera IA, construida sobre el mismo framework PlayerBot/Infected que Valve usó para la serie *Left 4 Dead*. Eligen una clase aleatoria, juegan el objetivo, funcionan sin `sv_cheats` y disparan los logros como un verdadero jugador.
- **Bots Marioneta**: cero IA, incapaces de moverse o actuar por sí mismos. Solo existen para ser controlados manualmente: un jugador puede forzarlos a seguir, apuntar y disparar. Usados principalmente para tests o para hacer capturas de pantalla y vídeos cinemáticos. Hacerlos aparecer necesita `sv_cheats 1`, lo que también desactiva los logros para la sesión.

Este artículo trata por entero del primer tipo.

### Lo que (más o menos) se puede decir a los bots IA que hagan

Los TFBot no son directamente controlables, pero se les puede incitar a hacer ciertas cosas:

- Apunta a cualquier bot (aliado o enemigo) con tu crosshair y te hará una burla si usas los comandos de voz correctos.
- Un bot Medic aliado te cura si usas el comando de voz «¡Medic!»
- Si un bot Medic te cura y tiene una UberCharge lista, decir «¡Vamos vamos vamos!» o «¡Activa la carga!» hace que dispare la carga de inmediato.
- Un bot Medic con una carga lista la activa automáticamente en cuanto él mismo o su objetivo de cura sufre daños serios, sin comando de voz necesario.
- Los bots hacen espontáneamente burlas en dúo (High Five) o burlas de grupo (Conga) con compañeros cercanos.

### Hacer funcionar los bots en mapas no soportados

Los bots dependen de una malla de navegación para saber dónde tienen derecho a caminar, y la mayoría de los mapas comunitarios no aportan una. Para forzar:

1. `sv_cheats 1`
2. `nav_generate`: construye el navmesh inicial, progresión mostrada en la consola
3. Espera a que el juego termine de generar los caminos
4. Opcionalmente, corrige manualmente los malos datos de navegación con `nav_edit 1`
5. Recarga o reinicia el servidor (saltar este paso desactiva los logros)
6. `tf_bot_add <número>` para hacer aparecer los bots

**Advertencia:** modificar el navmesh mientras hay bots activos en el servidor puede colgar el juego. Una vez existe la malla, no necesitas regenerarla para las sesiones futuras: solo añade los bots con `tf_bot_add`.

Las mallas autogeneradas funcionan mejor en los mapas Punto de Control, King of the Hill, Payload y CTF. En los mapas Mannpower, los bots adoptan por defecto un comportamiento tipo CTF pero apenas usan los ganchos o los powerups. Si un mapa no tiene objetivo que la IA del bot reconozca pero tiene una entidad de sala de aparición, definir `tf_bot_offense_must_push_time 0` permite a los bots combatir igualmente.

*(Fuente para esta sección: la página Bots del wiki oficial TF2.)*

### Estado actual, mapa por mapa

Gracias a la actualización Hatless, cada clase funciona correctamente ahora, incluido el Spy históricamente bugueado. Los bots se comportan correctamente en la mayoría de los mapas KOTH oficiales, ciertos mapas Payload, Dustbowl/Gorge Attack-Defense y los mapas CTF/Mann Manor. En esos dos últimos, no puedes hacerlos aparecer directamente con `tf_bot_add`. En los mapas no soportados (vía el proceso nav_generate de arriba), funcionan, pero son claramente menos buenos imitando un verdadero jugador.

Los mapas PLR son una causa perdida: los bots no pueden franquear las barreras en Hightower y se atascan en las esquinas, y en todos los demás mapas PLR solo hacen... una fiesta de baile en vez de jugar. Quizá se corrija algún día, quizá quede así.

### Comportamiento general de los bots

Un cajón de cosas que cada bot hace con independencia de su nivel:

- Los bots solo usan loadouts base (un plugin puede forzarles armas no estándar, pero los bots vanilla nunca eligen las suyas).
- Los bots Fáciles apenas usan su arma secundaria. Las dificultades superiores pasan al arma secundaria en cuanto el cargador principal está vacío, o para compensar la distancia.
- Los bots ignoran las técnicas de movimiento avanzadas: ningún rocket jump, ninguna recolocación de edificio.
- Tras un kill, un bot puede burlarse, incluso bajo fuego, salvo si lleva la inteligencia enemiga, y esa regla también se aplica en MvM.
- Los bots Spy disfrazados (jugador o IA) los ignoran correctamente los demás bots: hasta que tocan un enemigo, sabotean algo, disparan o se vuelven invisibles cerca de uno. Una vez «descubiertos», ese bot/jugador específico se memoriza como Spy hasta que cambia de disfraz manteniéndose invisible, muere o finge su muerte con el Dead Ringer.
- Los bots Pyro usan el Compression Blast liberalmente desde el nivel Normal.
- Los bots Medic priorizan las curas sobre todo el mundo salvo los Snipers (y, en menor medida, los Engineers), aunque spamees «¡Medic!» siendo uno.
- Los bots Medic gravitan hacia los Heavies, Soldiers, Demomen y Pyros: específicamente cuando un *humano* juega esas clases. Esa atención sigue la presencia de un humano en esos roles.
- Los bots quedan en posición durante el tiempo de preparación en los mapas Attack/Defense y Payload, salvo los Engineers, Snipers y Spies, que se mueven libremente (los bots Demoman también tienen autorizado precolocar bombas lapa).
- Los bots Engineer nunca mejoran ni desactivan las construcciones de otro Engineer aliado, a menos que esa construcción esté en el camino de su objetivo. A veces simplemente no reparan su propia torreta, aunque parezca evidente.
- Los bots Spy detectados pasan a su revólver y retroceden en vez de forzar una cuchillada.
- Los bots Demoman que localizaron una centinela (generalmente muriendo sobre ella una vez) pueden lanzar perfectamente bombas lapa sobre ella desde fuera de su alcance, en arco a través de muros y techos cuando la geometría lo permite.
- Los bots Sniper que no encuentran objetivo tras apuntar usan una de las líneas de voz «Negatives.»
- Los Medics aliados curan un Spy disfrazado sin vacilar.

### Problemas / bugs conocidos

El documento lista un buen número de rarezas de largo recorrido:

- Los bots pueden intentar caminar o disparar a través de ciertos props estáticos.
- Cada vez que un jugador/bot se desenmascara, se disfraza o se revela, los bots cercanos lo «ven» y se giran para reaccionar: aunque el evento ocurriera fuera de su campo de visión real. No se basa en el sonido; es un rodeo del test de visión.
- Raramente, los bots pueden quedar físicamente atascados juntos usando un teletransportador de Engineer.
- Los comandos de voz de los bots (ej. «¡Spy!», «¡Adelante!») no se muestran en texto en el chat como los de los jugadores.
- Un bot Medic curando activamente a alguien no esquivará los disparos entrantes ni cogerá kits de salud, incluso con PV críticos.
- Los bots pueden seguir moviéndose durante una burla en dúo, lo que rompe el efecto previsto del Festive Critical Strike.
- Los bots Medic recién heridos a menudo se niegan a usar el Syringe Gun a distancia, prefiriendo el cuerpo a cuerpo (o, en rarísimos casos, intentando tocarte con el propio rayo del Medi Gun).
- Los bots Medic no compensan la gravedad para los disparos del Syringe Gun: probablemente porque el arma no está correctamente marcada como no-hitscan en el código IA.
- Los bots Spy pueden ver y seguir un Spy invisible (jugador o IA) si ese Spy ya se descubrió una vez, con independencia del nivel de habilidad del bot que lo sigue.
- Aunque un jugador-Spy se disfrace de clase de su propio equipo, chocar un enemigo lo desenmascara igualmente (los bots nunca se hacen eso a sí mismos, porque los bots nunca se disfrazan de su propio equipo).
- Los bots respetan el balanceo automático de equipos: si intentas amontonar bots de un lado, primero tienes que usar `mp_teams_unbalance_limit 0`.
- Los bots Engineer pueden ignorar por completo sus propias construcciones hasta que se destruyen.
- Los bots Heavy a veces intentan disparar el Minigun estando sin munición, sobre todo por debajo del nivel Difícil.
- Los bots Medic del equipo perdedor se suicidan ocasionalmente durante la fase de Humillación cuando ningún enemigo está cerca: algo que un jugador humano no puede reproducir ni intentándolo.
- Poner tu vista previa de equipo en BLU en la pantalla de carga hace que los bots RED te parezcan visualmente renderizados en BLU.
- Los bots con un arma cuerpo a cuerpo fuera a veces se niegan a cambiar de arma incluso tras recoger munición.
- Tras Jungle Inferno, los bots aparecidos con parámetros explícitos (ej. `tf_bot_add 5 pyro azul normal`) pueden morir al instante en su propia sala de aparición. Correctivo: `tf_bot_reevaluate_class_in_spawnroom 0` (necesita `sv_cheats 1`).

### Nombres de las IA

Los nombres de los bots salen de un gran depósito de referencias a TF2, a otros juegos Valve y a la cultura de programación, en gran parte porque la comunidad no paraba de pedir específicos en los foros Steam. Una muestra de la lista: *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF*, y decenas de otros del mismo género.

También hay un lote de nombres encontrados en un build fuente filtrado que nunca se envió a producción, por razones poco claras: principalmente referencias a *Last Dragon* y *The Fifth Element* como *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?* e *I'm your huckleberry*.

Puedes reemplazar todo eso tú mismo: `tf_bot_add heavyweapons blue "Blu Hoovy"` hace aparecer un Heavy BLU llamado «Blu Hoovy.»

---

## Capítulo II: Los bots originales / TFBots: inmersión en los niveles de habilidad

El marco original de Sigsegv sigue en pie: es evidente que los bots Experto superan los bots Fácil, pero Valve nunca explicó *cuánto* ni *por qué*. Así que la única forma de saberlo es leer el código. Aquí cada mecánica que evoluciona con la habilidad.

### Ajustar la dificultad

Fuera del MvM, la dificultad la controla una cvar:

| `tf_bot_difficulty` | Nivel de dificultad |
| --- | --- |
| 0 | Fácil |
| 1 | Normal (por defecto) |
| 2 | Difícil |
| 3 | Experto |

`tf_bot_add` también acepta un argumento de dificultad directamente (`easy`/`normal`/`hard`/`expert`).

### Popfiles MvM

En Mann vs. Machine, cada bloque de spawn `TFBot` en el popfile tiene una clave `Skill` opcional. La ausencia de clave corresponde al nivel Fácil. En las misiones de Valve: los Gigantes son casi siempre Experto, los Engineers y los Spies son casi siempre Experto, y los Snipers son generalmente Difícil (ocasionalmente Experto). Si usas `EventChangeAttributes` (añadido en la actualización Two Cities) para modificar dinámicamente los bots en curso de oleada según eventos de mapa, la habilidad del bot es una de las propiedades que puedes cambiar al vuelo.

### Modo Endless MvM

El modo Endless nunca se envió oficialmente, pero dentro, los bots gastan su dinero en mejoras como los jugadores, incluida una mejora exclusiva de bots que aumenta su nivel de habilidad IA en curso de juego.

### La entidad `bot_generator`

Una entidad oscura, ampliamente indocumentada, presuntamente usada en el modo entrenamiento y quizá en el desarrollo temprano del MvM. Expone una entrada `SetDifficulty` para controlar el nivel de habilidad. Más allá, la pista se enfría: Valve nunca la documentó y nadie cartografió por entero su comportamiento.

### Color del brillo ocular

Los robots MvM tienen una partícula de brillo ocular que cambia de color con el nivel de habilidad, un indicador visual que nadie fuera de la comunidad explicó jamás:

| Habilidad | Color de los ojos | RGB |
| --- | --- | --- |
| Fácil/Normal | Azul | `#24b4ff` |
| Difícil/Experto | Amarillo | `#fff000` |

![Heavy bot TF2 en posición de espera](assets/tf2-bot-ai-heavy-idle.png)

### Visión: tiempo de reconocimiento

Un bot no reacciona al instante cuando algo entra en su campo de visión: hay un retardo codificado en duro antes de que el resto de la IA siquiera tenga autorizado reconocer la amenaza:

| Habilidad | Tiempo de reconocimiento mínimo |
| --- | --- |
| Fácil | 1,00 s |
| Normal | 0,50 s |
| Difícil | 0,30 s |
| Experto | 0,20 s |

Es lo esencial del efecto «los bots Fáciles parecen tontos» en una sola cifra: un bot Fácil no apunta peor una vez que te notó, simplemente tarda cinco veces más en notar tu existencia.

### Puntería: tasa de seguimiento

Los bots no te rastrean en continuo. Muestrean tu posición y tu velocidad a un intervalo fijo y prevén una línea recta desde ahí:

| Habilidad | Intervalo de recálculo | Tasa equivalente |
| --- | --- | --- |
| Fácil | 1,00 s | 1x/s |
| Normal | 0,25 s | 4x/s |
| Difícil | 0,10 s | 10x/s |
| Experto | 0,05 s | 20x/s |

**Excepción:** los bots Spy están codificados en duro con la tasa de seguimiento Normal sea cual sea su nivel de habilidad real: un Spy Experto siempre apunta como un bot Normal. También existe un vídeo de demostración pública comparando las tasas de seguimiento lado a lado si quieres ver la brecha 1x vs 20x en movimiento.

### Puntería: habilidad específica de armas

Los bots no solo apuntan a tu centro de masa: tienen una lógica por arma, a veces realmente bugueada:

**Lanzagranadas y Lanzabombas lapa.** Todos los niveles dea habilidad compensan el arco vertical, usando un valor fijo de la cvar `tf_bot_ballistic_elevation_rate`. Como esa compensación solo se activa para el ID de arma base, las variantes de proyectiles más rápidos (Loch-n-Load, todo lo con un modificador de velocidad de proyectil) no tienen el arco correctamente ajustado. Y como va ligado por el ID de arma específicamente, el Loose Cannon (un ID distinto) no recibe ninguna compensación de arco.

**Huntsman.** Los bots Fáciles no compensan la caída de la flecha y nunca buscan headshots. Los bots de nivel Normal compensan el arco, pero solo apuntan la cabeza a menos de 150 HU. Los bots Difícil/Experto siempre apuntan la cabeza.

**Lanzacohetes.** Más allá de 150 HU, los bots no Fáciles apuntan a tus pies en vez del centro de masa, maximizando las probabilidades de daño de zona y de empuje. A menos de 150 HU, pasan a los headshots. Los bots Fáciles siempre apuntan el centro de masa sea cual sea la distancia. También va bloqueado por ID de arma: el Direct Hit y el Cow Mangler no heredan ese comportamiento. Lógico para el Direct Hit (sin zona de efecto que explotar); cero sentido para el Cow Mangler: esa parte de la IA es anterior a la existencia del arma y simplemente jamás se revisó.

**Fusiles de sniper.** Fácil apunta el cuerpo. Normal apunta a un 33% del cuerpo hacia la cabeza. Difícil/Experto apuntan directo la cabeza. Menos importante en MvM, donde los headshots de los bots no obtienen el bonus de daños de todos modos.

### Oído: sensibilidad a los disparos discretos

Cada disparo alerta los bots cercanos de la posición del tirador, incluso a través de los muros, hasta 3000 HU con 100% de probabilidad de notarse (`tf_bot_notice_gunfire_range`). Pero un subconjunto de armas están marcadas «discretas»: audibles solo en 500 HU (`tf_bot_notice_quiet_gunfire_range`), e incluso entonces con una probabilidad dependiente de la habilidad:

| Habilidad | Probabilidad de notar un disparo discreto |
| --- | --- |
| Fácil | 10% |
| Normal | 30% |
| Difícil | 60% |
| Experto | 90% |

Esa probabilidad se divide por dos si un disparo *ruidoso* se oyó en los 3 últimos segundos: los sonidos fuertes enmascaran los sonidos débiles.

La lista de los ID de armas discretas no se actualizó desde diciembre de 2010. Toda adición posterior usando un nuevo ID de arma se trata como ruidosa por defecto, da igual lo discretamente lógica que deba ser, salvo si reutiliza un ID más antiguo. En concreto:

| ID de arma | Cubre |
| --- | --- |
| `TF_WEAPON_KNIFE` | Todos los cuchillos de Spy |
| `TF_WEAPON_FISTS` | Puñetazos específicos del Heavy (su puñetazo multiclase es de hecho `TF_WEAPON_FIREAXE`) |
| `TF_WEAPON_PDA` | Presunto sin uso directo |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | PDA de construcción del Engineer |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | PDA de destrucción del Engineer |
| `TF_WEAPON_PDA_SPY` | Kit de disfraz del Spy |
| `TF_WEAPON_BUILDER` | Kit de herramientas de Spy/Engineer/Saboteador |
| `TF_WEAPON_MEDIGUN` | Todos los Medi Guns |
| `TF_WEAPON_DISPENSER` | Probablemente sin uso (los Dispensers son objetos, no armas) |
| `TF_WEAPON_INVIS` | Todos los relojes de invisibilidad de Spy |
| `TF_WEAPON_FLAREGUN` | Todas las pistolas de bengalas Pyro *salvo* el Manmelter |
| `TF_WEAPON_LUNCHBOX` | Sandwich, Dalokohs Bar, Buffalo Steak Sandvich, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (no Mad Milk: ID separado, no discreto) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mor, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

El ejemplo clásico de la lista que se pudre: el Manmelter recibió su propio ID (`TF_WEAPON_RAYGUN_REVENGE`), añadido después de que la lista de armas discretas quedara congelada, así que se trata como ruidoso, pese a ser una pistola de bengalas en todos los sentidos prácticos. El Scorch Shot, salido aún más tarde, reutiliza el ID base `TF_WEAPON_FLAREGUN` y por tanto sigue considerándose discreto. Insensato, pero es el código.

### Estrategia: priorización de amenazas

Cuando varios enemigos están visibles a la vez, los bots ponderan la distancia, si les disparan y, por encima de Fácil, si la amenaza principal está siendo curada:

| Habilidad | ¿Apunta al curandero en su lugar? |
| --- | --- |
| Fácil | No |
| Normal | 50% de probabilidad |
| Difícil | Sí |
| Experto | Sí |

Los enemigos a más de 500 HU normalmente se despriorizan como no inmediatos. Excepciones: los bots Difícil/Experto siempre tratan los Medics y Engineers distantes como amenazas inmediatas, y todo Sniper enemigo apuntando aproximadamente en tu dirección siempre se trata como inmediato sea cual sea la distancia y la habilidad.

| Habilidad | ¿Medics/Engineers distantes/Snipers apuntando = amenaza inmediata? |
| --- | --- |
| Fácil/Normal | No |
| Difícil/Experto | Sí |

Esa comprobación del Sniper tiene una historia sorprendente que siempre me gusta contar. El escrito original de Sigsegv suponía que el juego exigía que el producto escalar entre el vector de puntería del sniper y la posición relativa del bot fuera *exactamente cero*: una comparación tan precisa que casi nunca se dispararía en cálculo flotante, volviendo toda la función efectivamente código muerto. Una corrección publicada más tarde (crédito a una descompilación Hex-Rays más limpia) mostró que la comprobación real es `producto escalar > 0`: todo Sniper encarando desde directamente hacia ti hasta perpendicular a ti se considera amenaza inmediata; todo lo que va de perpendicular a dando la espalda no lo es. La mala lectura original venía de una mala descompilación de una comparación SSE de flotantes. Hacer reverse-engineering de un binario AAA sigue siendo un ejercicio aproximado.

### Movimiento: esquiva

Los bots Fáciles nunca esquivan, punto final. Los bots Normal y superiores esquivan a izquierda/derecha (33% izquierda, 33% derecha, 33% no hacer nada, ponderado contra los agujeros detectados) cuando sostienen un arma de combate, vieron un enemigo en los 3 últimos segundos y ese enemigo tiene línea de vista sobre ellos.

No esquivarán *si* se aplica uno de estos casos: atributo `DisableDodge` definido, comportamiento actual dice darse prisa, actualmente invulnerable (cualquier uber), en plena burla/provocación, juega Engineer, invisible o disfrazado de Spy, apuntando como Sniper o girando como Heavy, o tensando el Huntsman.

### Movimiento: evitar empujar enemigos

Por encima de Normal, los bots intentan específicamente no entrar en los enemigos al desplazarse:

| Habilidad | ¿Evita empujar enemigos? |
| --- | --- |
| Fácil | No |
| Normal | No |
| Difícil | Sí |
| Experto | Sí |

En la práctica, eso solo importa para los bots Spy: evitar una colisión incómoda con un jugador enemigo es justo el tipo de cosa que compromete un disfraz.

### Pyro: maestría del airblast

El airblast sirve para dos cosas: reflejar los proyectiles (PvP y MvM) y empujar enemigos cerca de los bordes (solo PvP). Que el bot pulse o no el gatillo ante una oportunidad válida es un cara o cruz basado en la habilidad:

| Habilidad | Probabilidad de disparar el airblast |
| --- | --- |
| Fácil | 0% |
| Normal | 50% |
| Difícil | 90% |
| Experto | 100% |

Los bots Pyro Fáciles literalmente no pueden hacer airblast: el sorteo está codificado en duro para no acertar nunca, no solo «raramente.»

### Spy: eficacia del disfraz

Dos ejes distintos evolucionan con la habilidad. Elección del *disfraz*:

| Habilidad | Método de disfraz |
| --- | --- |
| Fácil/Normal | Clase aleatoria, ignorando lo que el equipo enemigo juega de verdad |
| Difícil/Experto | Elige un verdadero jugador enemigo y copia su clase exacta |

*Comportamiento* disfrazado:

| Habilidad | Comportamiento disfrazado/invisible |
| --- | --- |
| Fácil/Normal | Fija los jugadores enemigos cuando los ve (sospechoso) |
| Difícil/Experto | Evita deliberadamente el contacto visual (más convincente) |

### Spy: agresividad del backstab

A largo alcance (hasta 300 HU, `tf_bot_spy_knife_range`), un bot Spy solo se mete en un backstab si puede ver la víctima y la espalda de la víctima está al menos parcialmente girada. La habilidad determina cuánto puede descentrarse ese ángulo de espalda:

| Habilidad | Tolerancia de ángulo |
| --- | --- |
| Fácil | Intenta aunque le mires directo a la cara |
| Normal | ±45° de tu espalda |
| Difícil | ±78° de tu espalda |
| Experto | ±90° de tu espalda (arco trasero completo de 180°) |

Los bots Spy Fáciles son funcionalmente suicidas: intentarán una cuchillada contra alguien que los mira a los ojos. **Excepción:** en Mann vs. Machine, cada bot Spy queda forzado a la restricción de ángulo Normal sea cual sea su nivel de habilidad real.

### Tácticas: selección de armas

Esa lógica solo concierne los niveles por encima de Fácil, con un interés reducido en MvM porque los bots ahí suelen tener restricciones de armas estrictas:

- **Scout**: pasa al arma secundaria cuando el cargador del primario está vacío.
- **Soldier**: pasa al arma secundaria cuando el cargador está vacío *y* el objetivo está a menos de 500 HU.
- **Sniper**: pasa al arma secundaria para los objetivos a menos de 750 HU.
- **Pyro**: pasa al arma secundaria para los objetivos a más de 750 HU, salvo si ese objetivo es un Soldier o un Demoman.

### Tácticas: recarga a cubierto

Lógica ausente del MvM. Si el comportamiento actual del bot no le dice batirse en retirada, su cargador principal está vacío y queda vulnerable sin uber, los bots de nivel superior se retiran temporalmente a cubierto para recargar en vez de hacer clic en un arma vacía frente a ti:

| Habilidad | ¿Se retira para recargar? |
| --- | --- |
| Fácil | No |
| Normal | No |
| Difícil | Sí |
| Experto | Sí |

### Modo CP: vagabundeo del defensor

Lógica ausente del MvM. Defendiendo un punto de control, los bots de nivel superior son más susceptibles de dejar el punto para cazar kills («search and destroy»), pero solo con un tiempo decente restante en `tf_bot_defense_must_defend_time`:

| Habilidad | Probabilidad de vagar |
| --- | --- |
| Fácil | 10% |
| Normal | 50% |
| Difícil | 75% |
| Experto | 90% |

### Modo CP: bloqueo de captura

Lógica ausente del MvM. Los bots defensores contestando un intento de captura enemiga:

| Habilidad | ¿Intentará bloquear la captura? |
| --- | --- |
| Fácil | No |
| Normal | 50% de probabilidad |
| Difícil | Sí |
| Experto | Sí |

---

## El cuadro resumen completo

<div style="overflow-x:auto">

| Aspecto | Fácil | Normal | Difícil | Experto | Notas |
| --- | --- | --- | --- | --- | --- |
| Visión: tiempo de reconocimiento | 1,00s | 0,50s | 0,30s | 0,20s | |
| Puntería: tasa de seguimiento | 1x/s | 4x/s | 10x/s | 20x/s | Los Spies siempre usan Normal |
| Compensación de arco granada/bomba lapa | Sí | Sí | Sí | Sí | Loose Cannon exento |
| Compensación vertical Huntsman | No | Sí | Sí | Sí | |
| Headshots Huntsman | No | <150 HU | Sí | Sí | |
| Disparo a los pies Lanzacohetes | No | Sí | Sí | Sí | Direct Hit y Cow Mangler exentos |
| Punto de puntería Fusil de sniper | Cuerpo | ~33% hacia cabeza | Cabeza | Cabeza | |
| Probabilidad de notar disparos discretos | 10% | 30% | 60% | 90% | Dividida por 2 si enmascarada por disparos ruidosos |
| Apunta al curandero | No | 50% | Sí | Sí | |
| Medic/Engineer/Sniper distante = amenaza | No | No | Sí | Sí | |
| Esquiva | No | Sí | Sí | Sí | Larga lista de excepciones |
| Evita empujar enemigos | No | No | Sí | Sí | Sobre todo importante para Spy |
| Probabilidad de disparar el airblast | 0% | 50% | 90% | 100% | |
| Elección de clase del disfraz Spy | Aleatoria | Aleatoria | Corresponde a un verdadero enemigo | Corresponde a un verdadero enemigo | |
| Contacto visual Spy disfrazado | Fija (evidente) | Fija | Evita (convincente) | Evita | |
| Ángulo de backstab Spy | ~0° | ±45° | ±78° | ±90° | MvM fuerza Normal |
| Lógica de selección de armas | No | Sí | Sí | Sí | Menos pertinente en MvM |
| Recarga a cubierto | No | No | Sí | Sí | No en MvM |
| Vagabundeo defensor CP | 10% | 50% | 75% | 90% | No en MvM |
| Bloqueo de captura CP | No | 50% | Sí | Sí | No en MvM |

</div>

---

## Conclusión

![Heavy bot TF2 apuntando con un minigun](assets/tf2-bot-ai-heavy-aim.png)

Todo eso refleja un sistema deliberado de Valve: puntuaciones y probabilidades por entero deterministas, simplemente jamás documentados oficialmente. Aquí los puntos que retengo tras esa inmersión:

1. **La «habilidad» es un conjunto de cursores independientes**, no un multiplicador global. El tiempo de reacción, la cadencia de puntería y cada comportamiento táctico evolucionan por separado, y algunos (tasa de seguimiento Spy, ángulo de backstab MvM) tienen machaques codificados en duro sea cual sea el nivel.
2. **Una parte está realmente bugueada, no solo vieja.** La lista de armas discretas congelada desde 2010, el Cow Mangler sin lógica de disparo a los pies sin ninguna buena razón, la comprobación del producto escalar del Sniper que tardó años en descompilarse correctamente: el código IA de Valve tiene cicatrices como cualquier base de código de 17 años.
3. **Puedes usar todo eso.** Sabe que un bot Sniper no te hará headshot en Normal, que un Pyro Fácil literalmente no puede reflejar tu cohete, que un Spy Fácil intentará acuchillarte de frente. No es suerte. Es una ficha técnica.

Un inmenso gracias a sigsegv por la inmersión en el código original que hizo posible la mayor parte de eso, al wiki TF2 por la documentación base sobre los comandos de bots y el soporte de los mapas, y a todos los de la comunidad que siguen escarbando una IA de bot vieja de 17 años para entender justo por qué hace lo que hace.
