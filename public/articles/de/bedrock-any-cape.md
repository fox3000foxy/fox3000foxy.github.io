---
title: "Wie man jeden Umhang in Minecraft Bedrock bekommt"
description: "Ein Drittanbieter-Launcher, eine alte Spielversion und ein Umhang-Auswaehler, der nie gelernt hat Nein zu sagen. Komplettes Tutorial plus die wahrscheinliche Erklaerung, warum es funktioniert."
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "e2C5/pcdLxKRjV8ZhFL1vk1wmZYglU2gCWHo2KGFF2bLW5RhrFSsKwWJkZWHdHBEZceqcDDimFiB/4P6ZGSmYw=="
---

# Wie man jeden Umhang in Minecraft Bedrock bekommt

Auf Java gibt es jede Menge krumme Wege, einen Umhang zu bekommen, den man nicht haben sollte (siehe den `cape-mod`-Artikel). Auf Bedrock ist das Spiel anders, die Authentifizierung ist anders, aber es gibt trotzdem einen Weg -- kein Mod noetig, keine Manipulation von Netzwerkpaketen. Nur ein Drittanbieter-Launcher und eine Version des Spiels, die alt genug ist, um die erwartete Validierung noch nicht zu haben.

Hier die Anleitung, und danach schauen wir uns an, was wahrscheinlich unter der Haube passiert.

## Was du brauchst

- Ein Microsoft-Konto, das Minecraft Bedrock bereits besitzt (deins reicht)
- Den offiziellen Minecraft-Launcher installiert
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher), ein quelloffener Drittanbieter-Launcher, mit dem du jede historische Version von Bedrock installieren und starten kannst
- .NET 8.0 Desktop Runtime
- Entwicklermodus unter Windows aktiviert

## Schritt 1 -- Bedrock mindestens einmal mit dem offiziellen Launcher installieren

Bevor du irgendetwas anderes tust, oeffne den offiziellen Minecraft-Launcher, geh zum Reiter **Minecraft: Bedrock Edition** und klick auf **Installieren**. Bedrock muss mindestens einmal ueber den offiziellen Weg installiert und gestartet worden sein, bevor du BedrockLauncher anfasst.

![Bedrock Edition ueber den offiziellen Launcher installieren](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## Schritt 2 -- BedrockLauncher herunterladen

Geh auf die GitHub-Releases-Seite des Projekts. Schnapp dir das Zip der neuesten Version aus den **Assets**.

![BedrockLauncher GitHub-Releases-Seite](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## Schritt 3 -- Archiv entpacken

Nach dem Download entpackst du das Zip in deinen `Downloads`-Ordner (oder irgendwohin, wo du es wiederfindest).

![BedrockLauncher-Archiv entpacken](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## Schritt 4 -- Ausfuehrbare Datei starten

Geh in den entpackten Ordner und starte `BedrockLauncher.exe`.

![BedrockLauncher.exe starten](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## Schritt 5 -- .NET Desktop Runtime installieren und Entwicklermodus aktivieren

Beim ersten Start wird Windows sehr wahrscheinlich die **.NET 8.0 Desktop Runtime** verlangen -- installier sie. Du musst ausserdem den **Entwicklermodus** unter `Einstellungen > System > Fuer Entwickler` aktivieren, weil BedrockLauncher das Spiel als loses Paket installiert (Rohdateien, kein echtes signiertes Store-Paket), und Windows diese Art von Installation ohne diesen Modus verweigert.

![.NET Runtime installieren und Entwicklermodus aktivieren](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## Schritt 6 -- Neue Installation erstellen

Starte BedrockLauncher erneut, melde dich mit deinem Microsoft-Konto an, geh zum Tab **Installations** und klick auf **New installation**.

![Neue Installation in BedrockLauncher erstellen](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## Schritt 7 -- Alte Version auswaehlen

Gib der Installation einen Namen und waehl in der Versionsliste eine **alte** Version -- typischerweise `1.16.x` oder aelter. Klick auf **Create**.

![Alte Version auswaehlen, hier 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## Schritt 8 -- Installation starten

Klick auf **Play**. Die Dateiextraktion kann je nach Rechner bis zu zehn Minuten dauern -- der Launcher wird einfrieren ("Keine Rueckmeldung"), das ist normal, lass ihn laufen.

![Extraktion laeuft, Launcher scheint nicht zu antworten](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## Schritt 9 -- Umhang auswaehlen

Sobald das Spiel startet, melde dich mit deinem Konto an, erstelle einen neuen Charakter und geh in den Skin-Editor zum Reiter **Umhaenge**. Dort findest du die komplette Liste aller Umhaenge, die es im Spiel gibt -- einschliesslich derer, die du nie hattest (Promo-Event-Umhaenge, vergangene Festivals, Mob-Vote-Umhaenge, etc.). Waehl aus, was du willst.

**Ruehr in diesem Stadium nichts anderes am Skin-Aussehen an**, lass nur den Umhang.

![Umhang im Charakter-Editor auswaehlen](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## Schritt 10 -- Offizielle Version neu installieren

Geh zurueck zum offiziellen Launcher, Tab **Installation**, und klick auf **Deinstallieren** bei der Haupt-Bedrock-Installation, dann installier sie neu (oder klick auf **Nach Updates suchen**). Starte Minecraft Bedrock dieses Mal ueber den offiziellen Launcher.

![Deinstallation und Neuinstallation ueber den offiziellen Launcher](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

Und das war's -- dein Umhang ist da, auf der offiziellen Version, auf deinem echten Profil.

## Was wahrscheinlich passiert

Ich hab nicht im Closed-Source-Code von Bedrock gewuehlt (anders als Java, das dekompilierbar ist), also ist das Folgende eine **wahrscheinliche** Erklaerung, keine absolute Gewissheit. Aber das beobachtete Verhalten passt ziemlich gut zur folgenden Hypothese.

### Der Umhang-Selektor war nie eine Zugriffskontrolle

Auf Bedrock zeigt der Umhang-Auswahlbildschirm hoechstwahrscheinlich **die vollstaendige Liste aller Umhaenge, die im Spiel existieren**, nicht nur die, die dein Konto besitzt. Auf neueren Clients blendet ein Applikationsfilter (clientseitig oder ueber einen Netzwerkaufruf an einen Xbox/Microsoft-Entitlement-Dienst) Umhaenge aus, die du nicht besitzt, oder graut sie aus.

Der entscheidende Punkt ist, dass dieser Filter wahrscheinlich **nachtraeglich** hinzugefuegt wurde, in einer ausreichend neuen Version des Spiels. Eine Version wie 1.16.x ist aelter als dieser Filter oder nutzt einen anderen (oder gar keinen) Verifikationsmechanismus: alles in der Liste wird auswaehlbar, Entitlement hin oder her.

### Wo genau wird der Umhang gespeichert?

Das ist der Teil, der erklaert, warum die Neuinstallation ueberlebt wird. Die Skin-/Umhang-Wahl auf Bedrock ist nicht einfach eine lokale Wegwerfdatei -- sie wird wahrscheinlich mit dem Xbox-Live-Profil synchronisiert, das mit deinem Microsoft-Konto verknuepft ist (dasselbe System, das deinen Skin auf anderen Bedrock-Plattformen verwaltet -- Mobil, Konsole, etc.). Wenn du im alten Client einen Umhang auswaehlst, sendet er diese Auswahl sehr wahrscheinlich an den Profildienst, genauso wie ein aktueller Client es mit einem legitimen Umhang tun wuerde -- denn aus Sicht des Clients gibt es keinen Unterschied zwischen einem Umhang, der "dir gehoert", und einem "ausgewaehlten" Umhang. Der Profildienst seinerseits vertraut dem Client in diesem Punkt: er speichert die Auswahl, ohne nochmal zu pruefen, ob das Entitlement tatsaechlich dahintersteht, zumindest nicht zum Zeitpunkt des Schreibens.

Ergebnis: wenn du das aktuelle offizielle Spiel neu startest, holt es deinen aktuellen Skin/Umhang vom Profildienst -- und der Dienst gibt treu zurueck, was gespeichert wurde, nicht-legitimer Umhang inklusive. Der Entitlement-Check, falls es ihn gibt, passiert wahrscheinlich zum Zeitpunkt der **Auswahl** in der UI (daher der Filter auf neueren Clients), nicht zum Zeitpunkt der **Anzeige** dessen, was bereits im Profil gespeichert ist.

### Die Parallele zu Java

Es ist dieselbe Familie von Logikfehlern wie beim `cape-mod` auf Java: ein Dienst vertraut Daten, ohne deren Herkunft in jedem Schritt neu zu pruefen. Auf Java ist es eine gueltige RSA-Signatur, die auf das falsche Profil wiedergegeben wird. Auf Bedrock ist es wahrscheinlich eine Umhang-Auswahl, die von einem alten Client akzeptiert wird, der nie den richtigen Filter hatte, und dann ohne erneute Validierung in den persistenten Zustand des Kontos uebernommen wird. In beiden Faellen liegt das Problem nicht am Einstiegspunkt (der Java-Mod, der alte Bedrock-Client) -- sondern daran, dass die Schicht, die das Entitlement nachgelagert erneut validieren sollte, es nicht tut, oder nur einmal, an der falschen Stelle.

## Warum es immer noch funktioniert

Zwei moegliche Erklaerungen, die sich nicht ausschliessen:

1. **Mojang betrachtet das wahrscheinlich nicht als Prioritaet.** Es braucht einen Drittanbieter-Launcher, einen mehrstufigen Prozess, und das Ergebnis ist rein kosmetisch -- kein Gameplay-Vorteil, keine kompromittierten Daten anderer.
2. **Das richtig zu patchen wuerde erfordern, Entitlements bei jedem Profil-Lesezugriff erneut zu validieren**, nicht nur bei der Auswahl -- das bedeutet einen zusaetzlichen Netzwerkaufruf bei jeder Skin-Anzeige, fuer ein Problem, das nur die Optik betrifft.

## Fazit

Dieses Tutorial passt in zehn Screenshots, aber es illustriert ein Prinzip, das man ueberall in der Software-Sicherheit findet: sobald ein Legacy-System (eine alte Client-Version, eine Legacy-API, ein nie aktualisierter Dienst) noch in einen gemeinsam genutzten Zustand schreiben kann, schuetzt die heutige Zugriffskontrolle nur das, was durch die Gegenwart geht. Alles, was noch mit der alten API sprechen kann, umgeht den neueren Filter -- nicht weil der Filter kaputt ist, sondern weil er nie auf die Version davor angewandt wurde.

---

**Ressourcen**

- **BedrockLauncher** : [github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **Verwandter Artikel** : Cape Mod, das Java-Aequivalent per RSA-Signatur-Injektion

**3 Kernpunkte**

1. Der Umhang-Selektor einer alten Bedrock-Version zeigt wahrscheinlich die vollstaendige Liste aller Spielumhaenge, ohne Entitlement-Filter.
2. Die Auswahl wird dann wie jeder legitime Umhang auf dein Xbox-Live-Profil synchronisiert -- der Profildienst vertraut dem Client.
3. Der Entitlement-Check, falls es ihn gibt, passiert bei der Auswahl in der aktuellen UI -- nicht beim Lesen dessen, was bereits im Konto gespeichert ist.
