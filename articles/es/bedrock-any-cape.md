---
title: "Cómo conseguir cualquier capa en Minecraft Bedrock"
description: "Un launcher de terceros, una versión vieja del juego, y un selector de capas que nunca aprendió a decir que no. Tutorial completo más la explicación probable de por qué funciona."
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "el7IIaJitW8V68qQGlF3qmKiM1c9xxhIrxuIU+K0CtE4UB6gPD8pN5yDUpduj40EP9JFtixL0sw/Nm/Z7Kul3A=="
---

# Cómo conseguir cualquier capa en Minecraft Bedrock

En Java hay un montón de formas retorcidas de acabar con una capa que no deberías tener (ver el artículo sobre `cape-mod`). En Bedrock el juego es distinto, la autenticación es distinta, pero aun así hay una forma: solo necesitas un launcher de terceros y una versión del juego lo bastante vieja como para ignorar la validación que creías adquirida.

Así se hace, y luego vemos qué pasa probablemente bajo el capó.

## Qué necesitas

- Una cuenta Microsoft que ya tenga Minecraft Bedrock (la tuya sirve perfectamente)
- El launcher oficial de Minecraft instalado
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher), un launcher de terceros open source que permite instalar y lanzar cualquier versión histórica de Bedrock
- .NET 8.0 Desktop Runtime
- El modo desarrollador activado en Windows

## Paso 1: instalar Bedrock al menos una vez con el launcher oficial

Antes de hacer nada más, abre el launcher oficial de Minecraft, ve a la pestaña **Minecraft: Bedrock Edition**, y haz clic en **Install**. Bedrock tiene que haberse instalado y lanzado al menos una vez por la vía oficial antes de tocar BedrockLauncher.

![Instalar Bedrock Edition desde el launcher oficial](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## Paso 2: descargar BedrockLauncher

Ve a la página de releases de GitHub del proyecto. Coge el zip de la última versión listada en los **Assets**.

![Página de releases de GitHub de BedrockLauncher](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## Paso 3: extraer el archivo

Una vez descargado el zip, extráelo en tu carpeta `Downloads` (o donde sea, mientras encuentres la carpeta después).

![Extracción del archivo BedrockLauncher](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## Paso 4: lanzar el ejecutable

Ve a la carpeta extraída y lanza `BedrockLauncher.exe`.

![Lanzamiento de BedrockLauncher.exe](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## Paso 5: instalar .NET Desktop Runtime y activar el modo desarrollador

En el primer lanzamiento, Windows muy probablemente te pida el **.NET 8.0 Desktop Runtime**: instálalo. También hay que activar el **modo desarrollador** en `Configuración > Sistema > Para desarrolladores`, porque BedrockLauncher instala el juego como un paquete loose (archivos en bruto, no un paquete firmado de verdad de la Store), y Windows rechaza ese tipo de instalación sin ese modo.

![Instalación del runtime .NET y activación del modo desarrollador](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## Paso 6: crear una nueva instalación

Vuelve a lanzar BedrockLauncher, inicia sesión con tu cuenta Microsoft, ve a la pestaña **Installations**, y haz clic en **New installation**.

![Creación de una nueva instalación en BedrockLauncher](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## Paso 7: elegir una versión vieja

Dale un nombre a la instalación, y en la lista de versiones elige una versión **vieja**: típicamente una versión `1.16.x` o anterior. Haz clic en **Create**.

![Selección de una versión antigua, aquí 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## Paso 8: lanzar la instalación

Haz clic en **Play**. La extracción de archivos puede tardar hasta diez minutos según la máquina: el launcher parecerá congelado ("Not Responding"), es normal, déjalo correr.

![Extracción en curso, el launcher parece no responder](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## Paso 9: elegir la capa

Una vez lanzado el juego, inicia sesión con tu cuenta, crea un personaje nuevo y ve al editor de skins, pestaña **Capes**. Ahí encontrarás la lista completa de todas las capas que existen en Minecraft, incluidas las que nunca tuviste (capas de eventos promo, de festivales pasados, de Mob Vote, etc). Elige la que quieras.

**No toques el resto de la apariencia del skin en este punto**, deja solo la capa.

![Selección de una capa en el editor de personaje](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## Paso 10: reinstalar la versión oficial

Vuelve al launcher oficial, pestaña **Installation**, y haz clic en **Uninstall** en la instalación principal de Bedrock, luego reinstálala (o haz **Check for Updates**). Vuelve a lanzar Minecraft Bedrock desde el launcher oficial esta vez.

![Desinstalación y reinstalación desde el launcher oficial](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

Y listo: tu capa está ahí, en la versión oficial, en tu perfil de verdad.

## Qué pasa probablemente

No metí las manos en el código fuente cerrado de Bedrock (al contrario que Java, que es descompilable), así que lo que sigue es una explicación **probable**, no una certeza absoluta. Pero el comportamiento observado encaja bastante bien con la hipótesis siguiente.

### El selector de capas nunca fue un control de acceso

En Bedrock, la pantalla de selección de capas muestra verosímilmente **la lista completa de las capas que existen en el juego**, no solo las que posee tu cuenta. En los clientes recientes, un filtro aplicativo (en el cliente o vía una llamada de red a un servicio de entitlements de Xbox/Microsoft) atenúa u oculta las capas que no posees.

El punto clave es que ese filtro probablemente se añadió **a posteriori**, en una versión del juego lo bastante reciente. Una versión como la 1.16.x es anterior a ese filtro, o usa un mecanismo de verificación distinto (o inexistente): todo lo que está en la lista se vuelve seleccionable, haya entitlement o no.

### Dónde se guarda la capa, exactamente

Esta es la parte que explica por qué sobrevive a la reinstalación. La elección de skin/capa en Bedrock no es solo un archivo local desechable: probablemente se sincroniza en el perfil de Xbox Live asociado a tu cuenta Microsoft (el mismo sistema que gestiona tu skin en las demás plataformas Bedrock: móvil, consola, etc.). Cuando seleccionas una capa en el cliente viejo, este muy probablemente envía esa selección al servicio de perfil, exactamente como lo haría un cliente actualizado con una capa legítima, porque desde el punto de vista del cliente no hay ninguna diferencia entre una capa "tuya" y una capa "elegida". El servicio de perfil, por su parte, confía en el cliente en ese punto: registra la selección sin revalidar si el entitlement existe de verdad detrás, al menos no en el momento de escribir.

Resultado: cuando vuelves a lanzar el juego oficial actualizado, este va a buscar tu skin/capa actual en el servicio de perfil, y el servicio devuelve fielmente lo registrado, capa no legítima incluida. El check de entitlement, si existe, se hace probablemente solo en el momento de la **selección** en la UI (de ahí el filtro en los clientes recientes), y deja pasar la **visualización** de lo ya registrado en el perfil.

### El paralelismo con Java

Es la misma familia de fallo lógico que la del `cape-mod` en Java: un servicio confía en un dato sin revalidar su origen en cada etapa. En Java, es una firma RSA válida pero repetida en el perfil equivocado. En Bedrock, es verosímilmente una selección de capa aceptada por un cliente viejo que nunca tuvo el filtro correcto, y luego propagada sin revalidación hacia el estado persistente de la cuenta. En ambos casos, el problema no es el punto de entrada (el mod Java, el cliente viejo de Bedrock): es que la capa que debería revalidar el entitlement más abajo no lo hace, o lo hace una sola vez, en el sitio equivocado.

## Por qué sigue funcionando

Dos explicaciones posibles, no incompatibles entre sí:

1. **Mojang probablemente no lo considera prioritario.** Hace falta un launcher de terceros, una manipulación en varios pasos, y el resultado es puramente cosmético: ninguna ventaja de gameplay, ningún dato ajeno comprometido.
2. **Parchearlo bien exigiría revalidar los entitlements en cada lectura del perfil**, no solo en la selección: lo que significa una llamada de red adicional en cada visualización de skin, para un problema que solo afecta a la estética.

## Conclusión

Este tutorial cabe en diez capturas de pantalla, pero ilustra un principio que se repite en todas partes en seguridad de software: en cuanto un sistema histórico (una versión vieja de cliente, una API legacy, un servicio jamás actualizado) aún puede escribir en un estado compartido, el control de acceso del presente solo protege lo que pasa por el presente. Todo lo que aún pueda hablar con la API antigua sortea el filtro más reciente: el filtro funciona en las versiones recientes, pero nunca se aplicó a la versión que lo precedió.

---

**Recursos**

- **BedrockLauncher**: [github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **Artículo relacionado**: Cape Mod, el equivalente en Java por inyección de firma RSA

**3 puntos clave**

1. El selector de capas de una versión vieja de Bedrock muestra probablemente la lista completa de capas del juego, sin filtro de entitlement.
2. La selección se sincroniza luego en tu perfil de Xbox Live como cualquier capa legítima: el servicio de perfil confía en el cliente.
3. El check de entitlement, si existe, se hace en la selección en la UI reciente, no en la lectura de lo ya registrado en la cuenta.
