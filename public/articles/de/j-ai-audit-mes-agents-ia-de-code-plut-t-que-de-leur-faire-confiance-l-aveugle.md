---
title: "Ich habe meine Code-Agenten geprüft, anstatt ihnen zu vertrauen, blind"
description: "Wie zwei Prüfungen, die zur Erstellung des vierten technischen Berichts meiner Handelsplattform durchgeführt wurden, mir zwei verschiedene Fehlentwicklungen enthüllten: einen Agenten, der vergisst, weil die Repo nicht mehr in seinem Kontextfenster steht, und einen Agent, der zehnmal so viel Code schreibt, wie nötig ist, weil nichts ihn zur Knappheit drängt."
date: 2026-09-15
tags: ["ai", "llm-agents", "code-review", "context-window", "trading", "typescript"]
authors: ["docteur-turboss"]
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "ppAnSZdeFWjO/ns+dKDAHNBDMhOJIoDwL2yQl5cgAC7FXBBGPcb9B4RcOp2zWo4YWEw89Jk46zwSlxiDQ3nU7Q=="
---
## 

Jede Ausgabe des technischen Berichts der Plattform zwingt mich, die gesamte Architektur wieder zu durchsuchen: Dienstleistungen, Agenten, Datenpipelines. Bei der Vorbereitung der 4. Ausgabe brach mir das Volumen der Repo in die Augen, während ich sah, wie sie allmählich gewachsen war, ohne jemals auf sie zu warten: die Repo, die ursprünglich in einigen Tausend Zeilen bestand, weniger als 10ko, erreicht jetzt 100MB. Die Plattform hatte kaum mehr Funktionalität. Ich hatte mich einfach auf Agenten des Typs Claude Chat verlassen, um Code zu implementieren und zu korrigieren, ohne genau zu rahmen, was ich sie fragte oder was um die Umgebung herum.

Der Bericht hat mich gezwungen, aus dem "Vorwärts"-Modus zu kommen, um in den "Was ist wirklich passiert" Modus zurückzukehren. Ich habe zwei separate Prüfungen über die Geschichte der Wiederholung durchgeführt. Beide zeigten auf die gleiche Ursache, aus zwei völlig unterschiedlichen Gründen.

## Audit Nr. 1: das Kontextfenster

Die erste Prüfung bestand darin, die von einem Bediensteten IA über mehrere Monate vorgenommenen Korrekturen wieder aufzunehmen und zu prüfen, ob sie mit dem Rest der Repo zu dem Zeitpunkt, zu dem sie durchgeführt wurden, vereinbar waren.

Das Motiv, das immer wieder kam: Der Agent korrigierte ein Problem lokal, in der Datei oder dem Modul, das er vor Augen hatte, ohne das Äquivalent an anderer Stelle in der Repo gesehen zu haben oder ohne sich daran zu erinnern. Ergebnis: die gleiche Schnittstelle, die in zwei Diensten etwas anders definiert wurde, eine Halbierung, die zum Zeitpunkt des Schnellen aus dem Kontextfenster herauskam, eine Nominierungsvereinbarung, die im Modul eingehalten und im folgenden ignoriert wurde. Nichts spektakuläres, aber auf Dutzenden von Sitzungen zusammengenommen, das erzeugt genau Redundanz und Smell-Code, die den Faden an das nächste Werkzeug verlieren, das wir ans Licht bringen. Ein Kreis, der sich selbst füttert: Je größer und fragmentiert, desto schwieriger wird es für einen Agenten, ihn in seiner Gesamtheit zu halten, destrotz werden die Korrekturen lokal und teilweise, des desto größer wird das Repo.

Das Problem ist nicht nur der Agent "Engen" oder erfindet; er beantwortet die Frage, die er über den Kontext gestellt hat. Das Problem besteht darin, dass ich in den meisten Fällen nie den Umfang der Frage im Vorfeld definiert habe. Ich fragte: "behebt diesen Typo, dieses Verhalten, diese Funktion," ohne mich zu fragen, ob dieser Fehler irgendwelche Entsprechungen in der repo hatte, die der Agent nicht sehen konnte.

## Audit Nr. 2: Wenn VerbIiegung zum Code wird

Die zweite Prüfung war mechanischer: Drehen du ein`git log –numstat`über die gesamte Geschichte, aggregieren hinzugefügte Zeilen und Zeichen hinzugefügt durch Commit und siehst du sich die Distribution.

Die 30 größten Zeilenkommits allein machten einen weitgehend unverhältnismäßigen Anteil des gesamten Volumens der Repo aus. Systematisch waren dieselben Commits auch als die größten in hinzugefügten Zeichen. Das war vorhersehbar, außer dass das Verhältnis Zeichen/Linien dieser Commiten nicht nur mit der Anzahl der Zeilen verknüpft war: Die Linien selbst waren rauer, mit mehr redundanten Erläuterungen mit dem Namen der Funktionen, mehr duplizierte Fehlerverwaltungsblöcke statt faktorisiert, mehr Doktrinen, die dreimal dasselbe umformulierten.

Dies ist die direkte Folge eines bekannten Verhaltens, wenn man mit einem LLM in Chat interagiert: ohne ausdrückliche Anweisung zur Kontur neigt er dazu, viel zu sprechen, zu rechtfertigen, zu kommentieren, neu zu formulieren. Im Gespräch kostet es Ausgabetoken. In der Code-Generation wird dieserselbe Reflex in Zeilen übersetzt, die in der repo unbegrenzt bleiben, Commit nach Commit, ohne dass man sie wirklich wiedergibt, solange der Code funktioniert.

## Was die beiden Audtis, nebeneinander gestellt, zeigten

Für den ersten Bericht: Die dienststellenübergreifende Kohärenz leidet unter einem zu kleinen Kontextfenster, um die gesamte Revision zu halten, was zu lokalen Korrekturen, Redundanzen und unterschiedlichen Vereinbarungen führt.

Für den zweiten:`git log –numstat`zeigt eine Standardverbosität eines nicht boxierten LLM an, was unverhältnismäßige Zeilen und Zeichen und einen wenig faktorisierten Code verursacht.

Beide zusammen zeigen Redundanz und Lautstärke: Dies gibt eine zu große Wiederholung, um einen zukünftigen Agenten in den Kopf zu bekommen, was das erste Problem, das durch die erste Prüfung aufgedeckt wurde, noch verschlimmert.

Diese letzte Zeile machte mir die größte Sorge, wenn ich den Bericht schrieb: Beide Probleme sind miteinander verbunden, sie ernähren sich voneinander. Je mehr grün, desto schneller wächst der repo; je größer der Repo, des desto weniger kann ein Agent ihn im Kontext halten; je weniger er ihn im Zusammenhang halten kann, destrotz sind seine Korrekturen lokal und redundant; je mehr redend sie sind, destosses wird größer. Eine negative Rückkopplungsschleife, die vollständig durch den Einsatz von Agenten ohne Kadrierung verursacht wird.

## Warum ist es nicht ein pünktlicher Fehler eines bestimmten Werkzeugs

Nichts in dieser Diagnose ist spezifisch für ein bestimmtes Modell oder Produkt. Ein Chat-Agent, egal, was es ist, wirkt auf das, was man ihm in seinem Fenster im Moment T zu sehen gibt, und erzeugt standardmäßig die umfassendste und am besten gerechtfertigte Antwort. Es ist genau das erwartete Verhalten eines Chatassistenten, und genau das zu vermeiden, was für ein Werkzeug, das in einem Produktionsrepo geschrieben wird. Das Problem ist das Fehlen einer Verkleidung zwischen Werkzeug und Repo: Umfang der zu betrachtenden Dateien, erwartetes Ausgabeformat, Budget von Linien oder Verbosität, Verpflichtung, genau zu erwähnen, was bereits existiert, bevor etwas Neues geschrieben wird,.

## Was ich seither geändert habe

Der logische Reflex wäre gewesen, das, was geschrieben wurde, drastisch zu reduzieren. Persönlich habe ich mich entschieden, etwas anderes zu tun. Die Prüfungen haben mir etwas anderes gereicht: den Code zu scannen, um die Smells zu erkennen, und mich damit genau zu definieren, wo die wahren Probleme liegen. Die dienstübergreifenden Inkonsistenzen, die Redundanzen, die Orte, an denen der Draht verloren gegangen ist, anstatt zu erraten. Das Schriftvolumen bleibt deutlich dasselbe: grün oder nicht, es ist nützlich, wenn er richtig verwendet wird. Der Hebel war genau zu wissen, wo man zu suchen, um das zu korrigieren, was nicht passte, anstatt den Agenten zu verhindern, zu schreiben.

## Nächste Schritte

Die Aufteilung der Repo in kleinere und besser abgegrenzte Einheiten sowie Produktionsschutzsysteme für die Ausführung und Dokumentation. Das Problem, das sich wiederum stellt, ist eine Frage der Architektur: wie man die Dienste, Komponenten und Dokumentationen, die nach ihrer Trennung dennoch ihre Entscheidungen koordinieren müssen, richtig analysieren, kritisieren und kommunizieren lässt, ohne wieder auf denselben Monolith wie zuvor zurückzukommen.
