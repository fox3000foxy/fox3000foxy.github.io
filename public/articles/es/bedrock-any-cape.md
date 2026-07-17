---
title: "Como conseguir cualquier capa en Minecraft Bedrock"
description: "Un launcher de terceros, una version antigua del juego y un selector de capas que nunca aprendio a decir que no. Tutorial completo mas la explicacion probable de por que funciona."
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "k5HjzTgJPbPbDsO5FumFuA1CbCaNBR6n9hyaK3gKao6E6HoXAMXIfrcIKu0z0n2Et96GWTNyRlS/DRmbW4LTqA=="
---

# Como conseguir cualquier capa en Minecraft Bedrock

En Java existen un monton de formas retorcidas de acabar con una capa que no deberias tener (mira el articulo de `cape-mod`). En Bedrock el juego es distinto, la autenticacion es distinta, pero aun asi hay un metodo -- sin mods, sin tocar ni un solo paquete de red. Solo un launcher de terceros y una version del juego lo bastante vieja como para no tener la validacion que creemos que tiene.

Aqui te cuento como se hace, y luego vemos que esta pasando probablemente por dentro.

## Lo que necesitas

- Una cuenta Microsoft que ya tenga Minecraft Bedrock (la tuya vale)
- El launcher oficial de Minecraft instalado
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher), un launcher de terceros open source que te permite instalar y ejecutar cualquier version historica de Bedrock
- .NET 8.0 Desktop Runtime
- Modo desarrollador activado en Windows

## Paso 1 -- Instalar Bedrock al menos una vez con el launcher oficial

Antes de hacer nada mas, abre el launcher oficial de Minecraft, ve a la pestana **Minecraft: Bedrock Edition** y haz clic en **Instalar**. Bedrock tiene que haberse instalado y ejecutado al menos una vez por la via oficial antes de tocar BedrockLauncher.

![Instalar Bedrock Edition desde el launcher oficial](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## Paso 2 -- Descargar BedrockLauncher

Ve a la pagina de releases de GitHub del proyecto. Descarga el zip de la ultima version que aparece en **Assets**.

![Pagina de releases de GitHub de BedrockLauncher](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## Paso 3 -- Extraer el archivo

Una vez descargado el zip, extraelo en tu carpeta `Downloads` (o donde quieras, mientras luego sepas encontrarlo).

![Extrayendo el archivo de BedrockLauncher](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## Paso 4 -- Ejecutar el ejecutable

Entra en la carpeta extraida y ejecuta `BedrockLauncher.exe`.

![Ejecutando BedrockLauncher.exe](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## Paso 5 -- Instalar .NET Desktop Runtime y activar el modo desarrollador

En el primer arranque, Windows probablemente te pedira el **.NET 8.0 Desktop Runtime** -- instalalo. Tambien necesitas activar el **modo desarrollador** en `Configuracion > Sistema > Para desarrolladores`, porque BedrockLauncher instala el juego como un paquete suelto (archivos crudos, no un paquete firmado de la Store), y Windows rechaza este tipo de instalacion sin ese modo.

![Instalando .NET Runtime y activando el modo desarrollador](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## Paso 6 -- Crear una nueva instalacion

Vuelve a abrir BedrockLauncher, inicia sesion con tu cuenta Microsoft, ve a la pestana **Installations** y haz clic en **New installation**.

![Creando una nueva instalacion en BedrockLauncher](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## Paso 7 -- Elegir una version antigua

Dale un nombre a la instalacion y en la lista de versiones elige una version **antigua** -- tipicamente `1.16.x` o anterior. Haz clic en **Create**.

![Seleccionando una version antigua, aqui 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## Paso 8 -- Lanzar la instalacion

Haz clic en **Play**. La extraccion de archivos puede tardar hasta diez minutos dependiendo del ordenador -- el launcher parecera congelado ("No responde"), es normal, dejalo funcionar.

![Extraccion en curso, el launcher parece no responder](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## Paso 9 -- Elegir la capa

Cuando el juego arranque, inicia sesion con tu cuenta, crea un personaje nuevo y ve al editor de skin, pestana **Capas**. Ahi encontraras la lista completa de todas las capas que existen en el juego -- incluidas las que nunca has tenido (capas de eventos promocionales, festivales pasados, Mob Vote, etc.). Elige la que quieras.

**No toques el resto de la apariencia del skin en esta fase**, deja solo la capa.

![Seleccionando una capa en el editor de personaje](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## Paso 10 -- Reinstalar la version oficial

Vuelve al launcher oficial, pestana **Instalacion**, y haz clic en **Desinstalar** en la instalacion principal de Bedrock, luego reinstalala (o dale a **Buscar actualizaciones**). Lanza Minecraft Bedrock esta vez desde el launcher oficial.

![Desinstalando y reinstalando desde el launcher oficial](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

Y ya esta -- tu capa esta ahi, en la version oficial, en tu perfil real.

## Que esta pasando probablemente

No he metido las manos en el codigo cerrado de Bedrock (a diferencia de Java que es descompilable), asi que lo que sigue es una explicacion **probable**, no una certeza absoluta. Pero el comportamiento observado encaja bastante bien con la siguiente hipotesis.

### El selector de capas nunca fue un control de acceso

En Bedrock, la pantalla de seleccion de capas muestra probablemente **la lista completa de capas que existen en el juego**, no solo las que tu cuenta posee. En los clientes recientes, un filtro aplicativo (en el lado del cliente o via una llamada de red a un servicio de entitlements de Xbox/Microsoft) pone en gris u oculta las capas que no posees.

El punto clave es que este filtro probablemente se anadio **a posteriori**, en una version del juego lo suficientemente reciente. Una version como 1.16.x es anterior a este filtro, o usa un mecanismo de verificacion diferente (o inexistente): todo lo que esta en la lista se vuelve seleccionable, con entitlement o sin el.

### Donde se almacena exactamente la capa?

Esta es la parte que explica por que sobrevive a la reinstalacion. La eleccion de skin/capa en Bedrock no es solo un archivo local desechable -- probablemente se sincroniza con el perfil de Xbox Live asociado a tu cuenta Microsoft (el mismo sistema que gestiona tu skin en otras plataformas Bedrock -- movil, consola, etc.). Cuando seleccionas una capa en el cliente antiguo, este envia muy probablemente esa seleccion al servicio de perfil, exactamente igual que lo haria un cliente actualizado con una capa legitima -- porque desde el punto de vista del cliente, no hay ninguna diferencia entre una capa "tuya" y una capa "elegida". El servicio de perfil, por su parte, confia en el cliente en este punto: registra la seleccion sin revalidar si el entitlement realmente existe detras, al menos no en el momento de la escritura.

Resultado: cuando vuelves a lanzar el juego oficial actualizado, este busca tu skin/capa actual en el servicio de perfil -- y el servicio devuelve fielmente lo que se guardo, capa no legitima incluida. El chequeo de entitlement, si existe, probablemente ocurre en el momento de la **seleccion** en la UI (de ahi el filtro en los clientes recientes), no en el momento de la **visualizacion** de lo que ya esta guardado en el perfil.

### El paralelo con Java

Es la misma familia de fallo logico que el `cape-mod` en Java: un servicio confia en unos datos sin volver a verificar su origen en cada paso. En Java, es una firma RSA valida replayeda sobre el perfil equivocado. En Bedrock, es probablemente una seleccion de capa aceptada por un cliente antiguo que nunca tuvo el filtro correcto, y luego propagada sin revalidacion al estado persistente de la cuenta. En ambos casos, el problema no es el punto de entrada (el mod de Java, el cliente antiguo de Bedrock) -- sino que la capa que deberia revalidar el entitlement aguas abajo no lo hace, o solo lo hace una vez, en el sitio equivocado.

## Por que sigue funcionando

Dos explicaciones posibles, no excluyentes entre si:

1. **Mojang probablemente no lo considera prioritario.** Hace falta un launcher de terceros, un proceso en varios pasos, y el resultado es puramente cosmetico -- sin ventaja de juego, sin datos de terceros comprometidos.
2. **Parchear esto correctamente requeriria revalidar los entitlements en cada lectura del perfil**, no solo en la seleccion -- lo que supone una llamada de red adicional en cada visualizacion de skin, para un problema que solo afecta a la estetica.

## Conclusion

Este tutorial cabe en diez capturas de pantalla, pero ilustra un principio que se encuentra por todas partes en la seguridad del software: en cuanto un sistema legacy (una version antigua de cliente, una API legacy, un servicio nunca actualizado) puede seguir escribiendo en un estado compartido, el control de acceso actual solo protege lo que pasa por el presente. Todo lo que aun pueda hablar con la API antigua sortea el filtro mas reciente -- no porque el filtro este roto, sino porque nunca se aplico a la version que lo precedio.

---

**Recursos**

- **BedrockLauncher** : [github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **Articulo relacionado** : Cape Mod, el equivalente en Java por inyeccion de firma RSA

**3 puntos clave**

1. El selector de capas de una version antigua de Bedrock muestra probablemente la lista completa de todas las capas del juego, sin filtro de entitlement.
2. La seleccion se sincroniza luego con tu perfil de Xbox Live como cualquier capa legitima -- el servicio de perfil confia en el cliente.
3. El chequeo de entitlement, si existe, ocurre en la seleccion en la UI reciente -- no en la lectura de lo que ya esta guardado en la cuenta.
