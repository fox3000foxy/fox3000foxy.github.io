---
title: "Ich habe meine Code-KI-Agenten auditiert, statt ihnen blind zu vertrauen"
description: "Wie zwei Audits, die ich für den 4. technischen Bericht meiner Trading-Plattform durchgeführt habe, mir zwei unterschiedliche Fehlentwicklungen offenbart haben: ein Agent, der vergisst, weil das Repo nicht mehr in sein Kontextfenster passt, und ein Agent, der zehnmal mehr Code schreibt als nötig, weil nichts ihn zur Kürze drängt."
date: 2026-09-15
tags: ["ai", "llm-agents", "code-review", "context-window", "trading", "typescript"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "FEXfYRiCCdpPlmfKkosLXmmfat6P2HWGRqT9uUYcLlqhmCjofpstBrnoDKo40bPrW3aPrnoVYGyeGEGOkfDMvw=="
---

## Das Symptom vor der Diagnose

Jede Ausgabe des technischen Berichts der Plattform zwingt mich, die gesamte Architektur erneut zu durchlaufen: Services, Agenten, Datenpipelines. Als ich die 4. Ausgabe vorbereitete, sprang mir das Volumen des Repos endlich ins Auge, obwohl ich es allmählich hatte wachsen sehen, ohne je innezuhalten: Das Repo, das ursprünglich in wenige tausend Zeilen passte, weniger als 10ko, erreicht mittlerweile 100Mo. Die Plattform hatte kaum mehr Funktionen. Ich hatte mich einfach auf Agenten vom Typ Claude Chat verlassen, um Code zu implementieren und zu korrigieren, ohne genau einzugrenzen, was ich sie fragte, noch auf welchem Perimeter.

Das Schreiben des Berichts zwang mich, aus dem Modus "es geht voran" zurück in den Modus "was ist wirklich passiert" zu wechseln. Ich habe zwei getrennte Audits über die Historie des Repos gemacht. Beide zeigten auf dieselbe Ursache, aus zwei völlig unterschiedlichen Gründen.

## Audit Nr. 1: das Kontextfenster, das lügt

Das erste Audit bestand darin, Service für Service die Korrekturen durchzugehen, die ein KI-Agent über mehrere Monate gemacht hatte, und zu prüfen, ob sie mit dem Rest des Repos zum Zeitpunkt ihrer Anwendung konsistent waren.

Das Muster, das immer wiederkehrte: Der Agent korrigierte ein Problem lokal, in der Datei oder dem Modul, das er vor Augen hatte, ohne das Gegenstück anderswo im Repo gesehen zu haben oder sich daran zu erinnern. Ergebnis: dieselbe Schnittstelle leicht unterschiedlich in zwei Services neu definiert, eine Umbenennung halb angewendet, weil das zweite Vorkommen zum Zeitpunkt des Prompts außerhalb des Kontextfensters lag, eine Namenskonvention in einem Modul respektiert und im nächsten ignoriert. Nichts Spektakuläres isoliert betrachtet, aber kumuliert über Dutzende Sessions produziert das genau die Redundanz und die Code Smells, die das nächste Tool, das man darauf loslässt, den Faden verlieren lassen. Ein sich selbst verstärkender Kreis: Je mehr das Repo wächst und fragmentiert, desto schwieriger wird es für einen Agenten, es in seiner Gesamtheit im Kopf zu behalten, desto lokaler und partieller werden die Korrekturen, desto mehr wächst das Repo.

Das Problem ist nicht, dass der Agent "lügt" oder erfindet; er antwortet korrekt auf die gestellte Frage über den Kontext, den man ihm gegeben hat. Das Problem ist, dass ich meistens nie den Perimeter der Frage im Voraus definiert hatte. Ich fragte "korrigiere diesen Tippfehler, dieses Verhalten, diese Funktion", ohne mich zu fragen, ob dieser Bug Gegenstücke anderswo im Repo hatte, die der Agent nicht sehen konnte.

## Audit Nr. 2: wenn Verbosität zu Code wird

Das zweite Audit war mechanischer: Ein `git log --numstat` über die gesamte Historie laufen lassen, hinzugefügte Zeilen und hinzugefügte Zeichen pro Commit aggregieren und die Verteilung anschauen.

Die 30 größten Commits nach hinzugefügten Zeilen stellten allein einen weitgehend überproportionalen Anteil des Gesamtvolumens des Repos dar. Systematisch stachen dieselben Commits auch als größte nach hinzugefügten Zeichen hervor. Das war vorhersehbar, nur dass das Zeichen/Zeilen-Verhältnis dieser Commits nicht nur mit der Zeilenzahl zusammenhing: Die Zeilen selbst waren wortreicher, mit mehr erklärenden Kommentaren, die mit den Funktionsnamen redundant waren, mehr duplizierten Fehlerbehandlungsblöcken statt faktorisiertem Code, mehr Docstrings, die dreimal dasselbe umformulierten.

Das ist die direkte Folge eines bekannten Verhaltens bei der Interaktion mit einem LLM im Chat: Ohne explizite Anweisung zur Kürze neigt es dazu, viel zu reden, zu begründen, zu kommentieren, umzuformulieren. In einer Unterhaltung kostet das Ausgabe-Tokens. Bei der Codegenerierung übersetzt sich derselbe Reflex in Zeilen, die unbegrenzt im Repo bleiben, Commit für Commit, ohne dass man sie wirklich noch einmal liest, solange der Code funktioniert.

## Was beide Audits nebeneinander gezeigt haben

Für den ersten Bericht: Die dienstübergreifende Konsistenz leidet unter einem Kontextfenster, das zu klein ist, um das ganze Repo zu halten, was zu lokalen Korrekturen, Redundanzen und abweichenden Konventionen führt.

Für den zweiten: `git log --numstat` zeigt eine Standard-Verbosität eines nicht eingegrenzten LLM, was überproportional hinzugefügte Zeilen und Zeichen und wenig faktorisierten Code verursacht.

Beide zusammen zeigen auf Redundanz und Volumen: Das ergibt ein Repo, das zu groß ist, als dass ein künftiger Agent es im Kopf behalten könnte, was wiederum das erste Problem verschärft, das das erste Audit aufgezeigt hat.

Es ist diese letzte Zeile, die mich beim Schreiben des Berichts am meisten beunruhigt hat: Die beiden Probleme hängen zusammen, sie füttern einander. Je wortreicher der generierte Code, desto schneller wächst das Repo; je mehr es wächst, desto weniger kann ein Agent es im Kontext halten; je weniger er es im Kontext halten kann, desto lokaler und redundanter sind seine Korrekturen; je redundanter sie sind, desto mehr Volumen kommt hinzu. Eine negative Rückkopplungsschleife, vollständig verursacht durch eine Nutzung von Agenten ohne Einhegung.

## Warum das kein punktueller Bug eines bestimmten Tools ist

Nichts in dieser Diagnose ist spezifisch für ein bestimmtes Modell oder Produkt. Ein Chat-artiger Agent, welcher auch immer, operiert auf dem, was man ihm zum Zeitpunkt T in seinem Fenster zeigt, und generiert standardmäßig die vollständigste und begründetste Antwort. Das ist genau das erwartete Verhalten eines Gesprächsassistenten, und genau das, was man für ein Tool vermeiden muss, das in ein Produktions-Repo schreibt. Das Problem kommt vom fehlenden Rahmen zwischen Tool und Repo: zu berücksichtigender Datei-Perimeter, erwartetes Ausgabeformat, Zeilen- oder Verbositätsbudget, Pflicht, genau zu zitieren, was schon existiert, bevor man etwas Neues schreibt.

## Was ich seitdem geändert habe

Der logische Reflex wäre gewesen, das Geschriebene drastisch zu reduzieren. Persönlich habe ich beschlossen, anders vorzugehen. Die Audits dienten mir zu etwas anderem: Den Code zu scannen, um Code Smells aufzuspüren, und sie zu nutzen, um genau einzugrenzen, wo die echten Probleme lagen. Die dienstübergreifenden Inkonsistenzen, die Redundanzen, die Stellen, wo der Faden verloren war, statt zu raten. Das Volumen des geschriebenen Codes bleibt weitgehend gleich: Wortreich oder nicht, er bleibt nützlich, wenn er gut genutzt wird. Der Hebel war zu wissen, wo genau man hinschauen muss, um zu korrigieren, was nicht passte, statt den Agenten am Schreiben zu hindern.

## Nächste Schritte

Die Aufteilung des Repos in kleinere, besser abgegrenzte Einheiten. Sowie Produktions-Leitplanken für Ausführung und Dokumentation. Das Problem, das sich wiederum stellt, ist eine Architekturfrage: Wie man die Services, Komponenten und Dokumentation, die einmal getrennt koordiniert ihre Entscheidungen treffen müssen, sauber analysiert, kritisiert und kommunizieren lässt, ohne zum selben Monolithen wie zuvor zurückzukehren.
