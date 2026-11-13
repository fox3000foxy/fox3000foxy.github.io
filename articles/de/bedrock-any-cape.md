---
title: "Wie man jede Cape auf Minecraft Bedrock bekommt"
description: "Ein Drittanbieter-Launcher, eine alte Spielversion und ein Cape-Selektor, der nie gelernt hat, Nein zu sagen. Komplettes Tutorial plus die wahrscheinliche Erklärung, warum es funktioniert."
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "6fQNMsqw999WP1w2Lt7dAawDAJAgWLeSzPKH8IegAUSaEy1giiQNdxrOK2/y/aJArJeen2H6DZ6CLZ3NH+9fFQ=="
---

# Wie man jede Cape auf Minecraft Bedrock bekommt

Auf Java gibt es viele verdrehte Wege, mit einer Cape dazustehen, die man nicht haben dürfte (siehe den Artikel über `cape-mod`). Auf Bedrock ist das Spiel anders, die Auth ist anders, aber es gibt trotzdem einen Weg, du brauchst nur einen Drittanbieter-Launcher und eine Spielversion, die alt genug ist, um die Validierung zu ignorieren, die man für selbstverständlich hält.

So geht es, und danach schauen wir, was wahrscheinlich unter der Haube passiert.

## Was du brauchst

- Ein Microsoft-Konto, das Minecraft Bedrock schon besitzt (deines tut es bestens)
- Den offiziellen Minecraft-Launcher installiert
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher), ein Open-Source-Drittanbieter-Launcher, der es erlaubt, jede historische Bedrock-Version zu installieren und zu starten
- .NET 8.0 Desktop Runtime
- Den Entwicklermodus auf Windows aktiviert

## Schritt 1, Bedrock mindestens einmal mit dem offiziellen Launcher installieren

Bevor du irgendetwas anderes tust, öffne den offiziellen Minecraft-Launcher, geh auf den Tab **Minecraft: Bedrock Edition** und klicke auf **Install**. Bedrock muss mindestens einmal auf offiziellem Weg installiert und gestartet worden sein, bevor du BedrockLauncher anfasst.

![Bedrock Edition aus dem offiziellen Launcher installieren](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## Schritt 2, BedrockLauncher herunterladen

Ab auf die GitHub-Releases-Seite des Projekts. Nimm das Zip der letzten Version, die in den **Assets** gelistet ist.

![GitHub-Releases-Seite von BedrockLauncher](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## Schritt 3, das Archiv extrahieren

Sobald das Zip heruntergeladen ist, extrahiere es in deinen `Downloads`-Ordner (oder irgendwohin, solange du den Ordner danach wiederfindest).

![Extraktion des BedrockLauncher-Archivs](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## Schritt 4, die Executable starten

Geh in den extrahierten Ordner und starte `BedrockLauncher.exe`.

![BedrockLauncher.exe starten](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## Schritt 5, .NET Desktop Runtime installieren und Entwicklermodus aktivieren

Beim ersten Start wird Windows sehr wahrscheinlich das **.NET 8.0 Desktop Runtime** verlangen, installiere es. Du musst auch den **Entwicklermodus** in `Einstellungen > System > Für Entwickler` aktivieren, weil BedrockLauncher das Spiel als loses Paket installiert (rohe Dateien, kein echtes signiertes Store-Paket), und Windows verweigert diese Art Installation ohne diesen Modus.

![.NET-Runtime installieren und Entwicklermodus aktivieren](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## Schritt 6, eine neue Installation erstellen

Starte BedrockLauncher neu, melde dich mit deinem Microsoft-Konto an, geh in den Tab **Installations** und klicke dann auf **New installation**.

![Neue Installation in BedrockLauncher erstellen](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## Schritt 7, eine alte Version wählen

Gib der Installation einen Namen, wähle dann in der Versionsliste eine **alte** Version, typischerweise eine `1.16.x`-Version oder älter. Klicke auf **Create**.

![Alte Version auswählen, hier 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## Schritt 8, die Installation starten

Klicke auf **Play**. Das Extrahieren der Dateien kann je nach Rechner bis zu zehn Minuten dauern, der Launcher wird eingefroren wirken ("Not Responding"), das ist normal, lass ihn laufen.

![Extraktion läuft, der Launcher scheint nicht mehr zu reagieren](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## Schritt 9, die Cape wählen

Sobald das Spiel gestartet ist, melde dich mit deinem Konto an, erstelle einen neuen Charakter und geh in den Skin-Editor, Tab **Capes**. Dort findest du die komplette Liste aller Capes, die es in Minecraft gibt, einschließlich derer, die du nie hattest (Promo-Event-Capes, vergangene Festivals, Mob Vote usw.). Wähle die, die du willst.

**Fass den Rest des Skin-Aussehens in diesem Stadium nicht an**, lass nur die Cape.

![Cape im Charakter-Editor auswählen](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## Schritt 10, die offizielle Version neu installieren

Geh zurück in den offiziellen Launcher, Tab **Installation**, und klicke auf **Uninstall** bei der Haupt-Bedrock-Installation, installiere sie dann neu (oder mach **Check for Updates**). Starte Minecraft Bedrock diesmal aus dem offiziellen Launcher.

![Deinstallation und Neuinstallation aus dem offiziellen Launcher](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

Und da ist sie, deine Cape, auf der offiziellen Version, auf deinem echten Profil.

## Was wahrscheinlich passiert

Ich habe meine Hände nicht in den geschlossenen Bedrock-Quellcode gesteckt (im Gegensatz zu Java, das dekompilierbar ist), also ist das Folgende eine **wahrscheinliche** Erklärung, keine absolute Gewissheit. Aber das beobachtete Verhalten passt ziemlich gut zur folgenden Hypothese.

### Der Cape-Selektor war nie eine Zugriffskontrolle

Auf Bedrock zeigt der Cape-Auswahlbildschirm wahrscheinlich **die komplette Liste der Capes, die es im Spiel gibt**, nicht nur die, die dein Konto besitzt. Auf aktuellen Clients graut oder versteckt ein Anwendungsfilter (clientseitig oder über einen Netzwerkaufruf an einen Xbox/Microsoft-Entitlement-Service) die Capes aus, die du nicht besitzt.

Der springende Punkt ist, dass dieser Filter wahrscheinlich **nachträglich** hinzugefügt wurde, auf einer hinreichend aktuellen Spielversion. Eine Version wie 1.16.x ist älter als dieser Filter oder nutzt einen anderen (oder fehlenden) Verifizierungsmechanismus: Alles in der Liste wird auswählbar, Entitlement oder nicht.

### Wo genau ist die Cape gespeichert?

Das ist der Teil, der erklärt, warum es die Neuinstallation überlebt. Die Skin/Cape-Wahl auf Bedrock ist nicht nur eine wegwerfbare lokale Datei, sie wird wahrscheinlich auf das Xbox-Live-Profil synchronisiert, das mit deinem Microsoft-Konto verknüpft ist (dasselbe System, das deinen Skin auf den anderen Bedrock-Plattformen verwaltet, Mobile, Konsole usw.). Wenn du in dem alten Client eine Cape auswählst, schickt dieser die Auswahl sehr wahrscheinlich an den Profildienst, exakt wie es ein aktueller Client mit einer legitimen Cape täte, weil es aus Clientsicht keinen Unterschied zwischen einer Cape "von dir" und einer "gewählten" Cape gibt. Der Profildienst vertraut dabei dem Client: Er speichert die Auswahl, ohne erneut zu validieren, ob das Entitlement wirklich dahintersteht, zumindest nicht zum Schreibzeitpunkt.

Ergebnis: Wenn du das aktuelle offizielle Spiel neu startest, holt es deinen aktuellen Skin/Cape vom Profildienst, und der Dienst gibt treu zurück, was gespeichert wurde, nicht-legitime Cape eingeschlossen. Der Entitlement-Check, falls es ihn gibt, passiert wahrscheinlich nur zum Zeitpunkt der **Auswahl** in der UI (daher der Filter auf aktuellen Clients) und lässt die **Anzeige** dessen durch, was schon auf dem Profil gespeichert ist.

### Die Parallele zu Java

Es ist dieselbe Familie logischer Lücke wie beim `cape-mod` auf Java: Ein Service vertraut Daten, ohne ihren Ursprung bei jedem Schritt erneut zu prüfen. Auf Java ist es eine gültige, aber auf das falsche Profil replayte RSA-Signatur. Auf Bedrock ist es wahrscheinlich eine Cape-Auswahl, die von einem alten Client akzeptiert wurde, der nie den richtigen Filter hatte, und dann ohne Re-Verifizierung in den persistenten Kontostand propagiert wurde. In beiden Fällen ist das Problem nicht der Eintrittspunkt (der Java-Mod, der alte Bedrock-Client), sondern dass die Schicht, die das Entitlement nachgelagert erneut validieren sollte, es nicht tut, oder nur einmal, an der falschen Stelle.

## Warum es immer noch funktioniert

Zwei mögliche Erklärungen, die sich nicht ausschließen:

1. **Mojang betrachtet das wahrscheinlich nicht als prioritär.** Es braucht einen Drittanbieter-Launcher, eine mehrstufige Manipulation, und das Ergebnis ist rein kosmetisch, kein Gameplay-Vorteil, keine kompromittierten Daten anderer.
2. **Es korrekt zu patchen würde erfordern, die Entitlements bei jedem Lesen des Profils erneut zu validieren**, nicht nur bei der Auswahl, was einen zusätzlichen Netzwerkaufruf bei jeder Skin-Anzeige bedeuten würde, für ein Problem, das nur die Ästhetik betrifft.

## Fazit

Dieses Tutorial passt in zehn Screenshots, aber es illustriert ein Prinzip, das man überall in der Softwaresicherheit wiederfindet: Sobald ein historisches System (eine alte Client-Version, eine Legacy-API, ein nie aktualisierter Service) noch in einen geteilten Zustand schreiben kann, schützt die Zugriffskontrolle der Gegenwart nur das, was durch die Gegenwart geht. Alles, was noch mit der alten API reden kann, umgeht den neueren Filter, der Filter funktioniert auf aktuellen Versionen, wurde aber nie auf die Version angewendet, die ihm vorausging.

---

**Ressourcen**

- **BedrockLauncher**: [github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **Verwandter Artikel**: Cape Mod, das Java-Äquivalent per RSA-Signaturinjektion

**3 Kernpunkte**

1. Der Cape-Selektor einer alten Bedrock-Version zeigt wahrscheinlich die komplette Liste der Capes des Spiels, ohne Entitlement-Filter.
2. Die Auswahl wird dann wie jede legitime Cape auf dein Xbox-Live-Profil synchronisiert, der Profildienst vertraut dem Client.
3. Der Entitlement-Check, falls es ihn gibt, passiert bei der Auswahl in der aktuellen UI, nicht beim Lesen dessen, was schon auf dem Konto gespeichert ist.
