---
title: "Comment les machines se parlent : un tour d'horizon de TCP à mTLS"
description: "Pourquoi TCP, UDP, TLS, mTLS, HTTP et WebSocket ne sont pas des alternatives concurrentes mais des couches empilées; un tour d'horizon hiérarchique de la communication machine à machine, du transport brut à l'authentification mutuelle."
date: 2026-07-16
tags: ["tcp", "udp", "tls", "mtls", "websocket", "http", "grpc", "réseau", "architecture-distribuée", "protocoles"]
authors: ["docteur-turboss"]
lang: "fr"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "77p/xK4yHEJ20RihpLfLoJZi6KwHbhjHYrmDZLK3FInLWkhs+kywhuBSn4Zxpyx6gYxlbqBeEoTQYSdlfXCMrQ=="
---
# Le problème : trop de sigles, pas assez de hiérarchie

TCP, UDP, TLS, mTLS, WebSocket, HTTP, HTTPS, gRPC, QUIC; la plupart des ressources qui en parlent les présentent comme une liste plate d'options interchangeables, "à choisir selon le cas d'usage". En réalité ils ne sont pas sur le même plan : certains sont des protocoles de transport, d'autres des couches de sécurité qui s'enroulent autour du transport, d'autres encore des protocoles applicatifs qui s'appuient sur les deux premiers. Comprendre la hiérarchie, c'est comprendre pourquoi on ne "choisit" jamais entre TCP et TLS: on choisit TCP, _puis_ on décide si on met TLS par-dessus.

Cet article reconstruit cette hiérarchie couche par couche, du transport brut jusqu'à l'authentification mutuelle, avec pour chaque niveau : ce qu'il garantit, ce qu'il ne garantit pas, et quand s'en contenter.

# Niveau 1 : le transport (TCP contre UDP)

Tout commence ici. TCP et UDP sont les deux principaux protocoles de la couche **Transport (Layer 4)** du modèle OSI. Leur rôle est identique : transporter un flux de données entre deux applications exécutées sur des machines différentes. Pourtant, leur manière d'y parvenir est radicalement différente.

Il est important de comprendre qu'IP (Internet Protocol), situé à la couche réseau (Layer 3), ne fait qu'acheminer des paquets d'un hôte à un autre. Il ne garantit ni leur arrivée, ni leur ordre, ni même leur unicité. Les routeurs prennent simplement des décisions de routage indépendantes pour chaque paquet.

C'est précisément cette absence de garanties que TCP vient compenser, tandis qu'UDP choisit délibérément de ne rien ajouter afin de rester extrêmement léger.

## TCP : la fiabilité avant tout

TCP (Transmission Control Protocol) est un protocole **orienté connexion** (_connection-oriented_). Avant d'échanger le moindre octet de données, les deux machines doivent établir une connexion logique.

Cette connexion est créée grâce au célèbre **Three-Way Handshake** :

```

Client                           Serveur
SYN ---------------------------->
        <--------------------- SYN + ACK
ACK ----------------------------> 
Connexion établie
```

Chaque étape possède un objectif précis :

*   SYN : le client annonce qu'il souhaite ouvrir une connexion et fournit un premier numéro de séquence (Initial Sequence Number - ISN).
    
*   SYN-ACK : le serveur accepte la connexion, accuse réception du SYN et fournit à son tour son propre numéro de séquence.
    
*   ACK : le client confirme la réception des informations du serveur.
    

À partir de ce moment, les deux machines connaissent l'état de la connexion et peuvent commencer à échanger des données.

### **Les numéros de séquence**

TCP ne voit pas les données comme une succession de paquets, mais comme un **flux continu d'octets** (_byte stream_).

Chaque octet envoyé possède un numéro de séquence.

Exemple :

```
Message :

Bonjour

B = octet 0
o = octet 1
n = octet 2
...
```

Si un segment contenant les octets 1000 à 1499 est perdu pendant le transport, le récepteur peut détecter exactement ce qui manque.

L'émetteur retransmet uniquement cette portion.

Cette granularité est l'une des raisons de la robustesse de TCP.

### **Les accusés de réception (ACK)**

Après réception des données, le destinataire envoie un **ACK (Acknowledgment)**.

Contrairement à ce que l'on imagine souvent, un ACK ne signifie pas :

> "J'ai reçu ce paquet"

Il signifie plutôt :

> "J'ai reçu tous les octets jusqu'au numéro X."

Par exemple :

```
Client envoie :

0 → 999

Serveur répond :

ACK = 1000
```

Cela signifie :

> "Tout ce qui précède l'octet 1000 est bien arrivé."

Ce mécanisme permet d'accuser réception de plusieurs segments à la fois (_cumulative acknowledgments_), réduisant ainsi le nombre de paquets de contrôle.

### **Les retransmissions**

Si un ACK n'arrive jamais, TCP suppose que le segment est perdu.

Il le retransmet automatiquement.

Le délai de retransmission (**Retransmission Timeout – RTO**) n'est pas fixe.

TCP mesure en permanence le temps aller-retour (**RTT**) grâce aux ACK reçus et calcule dynamiquement le RTO afin d'éviter des retransmissions inutiles.

Les implémentations modernes utilisent également des mécanismes comme **Fast Retransmit** : lorsqu'un émetteur reçoit plusieurs ACK dupliqués (généralement trois), il déduit qu'un segment intermédiaire a été perdu et le renvoie immédiatement, sans attendre l'expiration du temporisateur.

### **Réorganisation des paquets**

Internet ne garantit absolument pas que deux paquets suivent le même chemin.

Exemple :

```
Paquet 1
Paris
 ↓
Londres
 ↓
New York

Paquet 2
Paris
 ↓
Francfort
 ↓
Chicago
 ↓
New York
```

Le deuxième paquet peut arriver avant le premier.

TCP stocke alors temporairement les segments reçus **hors ordre** dans un tampon (_reassembly buffer_), puis les réassemble avant de les livrer à l'application.

Pour l'application, tout semble arriver parfaitement dans l'ordre.

### Contrôle de flux

Une connexion ne dépend pas uniquement du réseau.

Le récepteur possède également une capacité mémoire limitée.

S'il reçoit plus vite qu'il ne peut traiter les données, ses buffers finissent par saturer.

TCP résout ce problème grâce à une **fenêtre glissante (Sliding Window)**.

Le récepteur indique dans chaque ACK :

```
Window = 32768 octets
```

Cela signifie :

> "Tu peux m'envoyer jusqu'à 32 Ko supplémentaires."

Si cette fenêtre tombe à zéro :

```
Window = 0
```

L'émetteur suspend temporairement les transmissions jusqu'à ce que le récepteur annonce une nouvelle fenêtre disponible.

Ce mécanisme constitue le **contrôle de flux (Flow Control)** et empêche qu'un hôte rapide n'inonde un hôte plus lent.

### Contrôle de congestion

Même si le récepteur est capable d'absorber les données, le réseau lui-même peut devenir saturé.

Les routeurs disposent de files d'attente (_queues_) limitées.

Lorsqu'elles débordent, les paquets sont supprimés.

TCP interprète les pertes comme un signe de congestion et adapte automatiquement son débit grâce à une **fenêtre de congestion (Congestion Window – cwnd)**.

Les algorithmes modernes (comme **Reno**, **CUBIC** ou **BBR**, selon les systèmes d'exploitation) ajustent cette fenêtre afin de trouver un équilibre entre débit maximal et stabilité du réseau.

Les premières versions de TCP utilisaient principalement deux mécanismes :

*   **Slow Start** : augmentation exponentielle du débit jusqu'à détecter une congestion.
    
*   **Congestion Avoidance** : croissance ensuite plus prudente, généralement linéaire.
    

Cette adaptation permanente est l'une des raisons pour lesquelles TCP reste performant malgré les variations de qualité du réseau.

### Fermeture de connexion

Contrairement à UDP, une connexion TCP possède également une fermeture propre.

Chaque extrémité ferme indépendamment son flux grâce au drapeau **FIN**.

Une fermeture complète nécessite généralement quatre échanges :

```
FIN
ACK
FIN
ACK
```

Cette procédure garantit que toutes les données en transit ont bien été livrées avant la destruction de la connexion.

## UDP : la simplicité maximale

UDP (User Datagram Protocol) adopte la philosophie inverse.

Il est **sans connexion (connectionless)**.

Il n'existe :

*   aucun handshake ;
    
*   aucun numéro de séquence ;
    
*   aucun accusé de réception ;
    
*   aucune retransmission ;
    
*   aucun contrôle de flux ;
    
*   aucun contrôle de congestion.
    

Chaque message est simplement encapsulé dans un **datagramme** indépendant, transmis au réseau, puis oublié par l'émetteur.

```
Application → Datagramme UDP → IP → Internet
```

Le protocole ne conserve aucun état entre deux envois.

Chaque datagramme est totalement indépendant des précédents.

### L'intégrité des données

Bien qu'UDP ne garantisse ni la livraison ni l'ordre, il protège tout de même l'intégrité des données grâce à un **checksum**.

À la réception, le checksum est recalculé.

*   Si les valeurs correspondent, le datagramme est accepté.
    
*   Sinon, il est immédiatement rejeté.
    

UDP détecte donc les données corrompues, mais ne tente jamais de les récupérer.

### Pourquoi UDP est-il si rapide ?

L'en-tête UDP ne contient que **8 octets**, contre un minimum de **20 octets** pour TCP (sans compter les options comme les timestamps, SACK ou Window Scaling).

Aucune connexion n'étant maintenue, le système d'exploitation n'a pas à suivre l'état de chaque échange, ce qui réduit également la consommation mémoire et le coût de traitement.

L'application reçoit les données quasiment dès leur arrivée, sans attendre d'éventuelles retransmissions.

## Quand perdre une donnée est préférable

L'idée fondamentale est simple :

> Une information ancienne peut avoir moins de valeur qu'une information perdue.

Prenons une conversation VoIP.

Chaque paquet transporte environ **20 ms** de voix.

Si un paquet est perdu, le retransmettre prendrait souvent plus de temps que ces 20 ms.

Lorsqu'il arriverait enfin, la conversation aurait déjà avancé.

La plupart des applications préfèrent alors masquer la perte (interpolation, silence, correction d'erreur) plutôt que d'attendre la retransmission.

Le même raisonnement s'applique :

*   aux jeux multijoueurs temps réel ;
    
*   au streaming vidéo ;
    
*   aux flux de télémétrie ;
    
*   aux capteurs IoT ;
    
*   aux données de position GPS.
    

Une valeur récente est presque toujours plus utile qu'une valeur ancienne parfaitement fiable.

# Niveau 2 : le chiffrement, TLS

TLS (Transport Layer Security, successeur de SSL) ne remplace pas TCP, il s'ajoute par-dessus. Concrètement, TLS établit une connexion TCP normale, puis négocie une session chiffrée à l'intérieur : échange de certificats, accord sur un algorithme de chiffrement, dérivation de clés de session. Tout ce qui transite ensuite est chiffré et authentifié.

Trois garanties distinctes, souvent confondues :

*   **Confidentialité** : personne d'autre que les deux parties ne peut lire le contenu.
    
*   **Intégrité** : toute altération des données en transit est détectée.
    
*   **Authentification** : mais dans le TLS classique, à sens unique : le client vérifie que le serveur est bien celui qu'il prétend être (via son certificat, signé par une autorité de confiance), mais le serveur ne vérifie rien sur l'identité du client. C'est exactement le modèle de HTTPS quand vous visitez un site : le navigateur authentifie le site, le site ne vous authentifie pas (l'authentification utilisateur passe par un mécanisme séparé, cookie de session, token).
    

TLS 1.3 (la version actuelle recommandée) a réduit le handshake à un seul aller-retour dans le cas courant, contre deux pour TLS 1.2, ce qui réduit sensiblement la latence de connexion.

## Niveau 2bis : mTLS — l'authentification devient mutuelle

mTLS (mutual TLS) est TLS avec une contrainte supplémentaire : le serveur exige _aussi_ un certificat du client, et le vérifie. Les deux parties prouvent leur identité via un certificat signé par une autorité de confiance commune.

C'est le mécanisme naturel pour la communication service-à-service dans une architecture distribuée : là où HTTPS classique suffit pour qu'un navigateur parle à un serveur public, mTLS répond à une question différente; _comment un service interne sait-il qu'il parle bien à un autre service interne autorisé, et pas à un attaquant qui aurait atterri sur le réseau ?_

```
Client                                          Serveur
  │──── ClientHello ─────────────────────────────▶│
  │◀─── ServerHello + certificat serveur ──────────│
  │──── vérifie le certificat serveur ─────────────│
  │──── envoie SON PROPRE certificat client ──────▶│
  │◀─── vérifie le certificat client ───────────────│
  │──── clés de session dérivées, canal chiffré ──▶│
```

La contrepartie de mTLS est opérationnelle : il faut une autorité de certification (CA) interne, un mécanisme de distribution des certificats à chaque service, et une stratégie de rotation/révocation. Dans un environnement mono-machine avec peu de services, c'est parfois plus de complexité que de bénéfice — mTLS devient nécessaire à partir du moment où le trafic inter-services traverse un réseau qu'on ne contrôle pas entièrement (plusieurs hôtes, cloud multi-tenant), ou dès qu'on veut une politique de type _zero trust_, où aucun service n'est implicitement digne de confiance simplement parce qu'il est "à l'intérieur" du réseau.

# Niveau 3 : les protocoles applicatifs au-dessus de TCP+TLS

Une fois le transport et le chiffrement en place, reste à définir _comment structurer les échanges_. C'est le rôle des protocoles applicatifs.

## HTTP / HTTPS

HTTP est un protocole requête-réponse : le client ouvre une connexion (ou en réutilise une, avec le keep-alive), envoie une requête, attend une réponse, la connexion peut ensuite se refermer ou être réutilisée. HTTPS, c'est simplement HTTP sur TLS — le S ne change rien à la sémantique du protocole, uniquement au fait que le transport est chiffré.

Le modèle requête-réponse a une limite structurelle : le serveur ne peut jamais parler en premier. Il ne peut que répondre à ce que le client demande. Pour du polling fréquent (vérifier "y a-t-il du nouveau ?" toutes les secondes), ça marche mais gaspille des ressources — chaque requête recrée du overhead protocolaire pour, la plupart du temps, ne rien avoir de nouveau à annoncer.

## WebSocket (WS / WSS)

WebSocket répond exactement à cette limite. La connexion démarre comme une requête HTTP classique (avec un header `Upgrade: websocket`), mais une fois la poignée de main acceptée, la connexion TCP sous-jacente n'est plus un canal requête-réponse HTTP — elle devient un canal bidirectionnel full-duplex où client et serveur peuvent envoyer des messages à tout moment, sans avoir à réémettre un cycle requête-réponse à chaque échange.

```
GET /chat HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13

HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

WSS est simplement WebSocket sur TLS, exactement comme HTTPS est HTTP sur TLS. C'est le protocole de choix pour tout ce qui nécessite du push serveur en temps réel — chat, notifications, flux de trading, événements de jeu — sans vouloir gérer soi-même un protocole binaire par-dessus TCP nu.

## gRPC

Moins connu hors du monde microservices mais central en communication service-à-service : gRPC s'appuie sur HTTP/2 (donc TCP + TLS optionnel), sérialise les messages en Protocol Buffers (binaire, typé, compact - contrairement au JSON texte de la plupart des API REST), et permet nativement le streaming bidirectionnel grâce au multiplexage de HTTP/2 (plusieurs flux logiques sur une seule connexion TCP, sans le head-of-line blocking qu'aurait plusieurs requêtes HTTP/1.1 séquentielles).

## QUIC / HTTP3

QUIC change la donne en repartant d'UDP plutôt que de TCP au niveau transport, tout en réimplémentant par-dessus les garanties de fiabilité que TCP offrait nativement - mais flux par flux plutôt que globalement, ce qui élimine le head-of-line blocking au niveau transport (un paquet perdu sur un flux ne bloque plus les autres flux de la même connexion). TLS 1.3 est intégré directement dans QUIC plutôt qu'ajouté par-dessus, ce qui réduit encore la latence de handshake. HTTP/3 est HTTP par-dessus QUIC.

# Vue d'ensemble : où se situe chaque protocole

Couche Protocoles Rôle Transport TCP, UDP Faire voyager des octets, fiable ou non Transport (nouvelle génération) QUIC UDP + fiabilité par flux + TLS intégré Sécurité TLS, mTLS Chiffrement, intégrité, authentification (uni ou mutuelle) Application HTTP/HTTPS, WS/WSS, gRPC Structurer les échanges (requête-réponse, bidirectionnel, RPC typé)

Un exemple concret pour fixer les idées : une architecture microservices avec un dashboard web et des services internes pourrait raisonnablement combiner HTTPS (dashboard ↔ API publique, authentification uni-directionnelle suffisante côté navigateur), mTLS (service ↔ service en interne, authentification mutuelle nécessaire), et WSS (notifications temps réel poussées vers le dashboard) — trois protocoles applicatifs différents, tous construits sur le même socle TCP + TLS.

## Comment choisir, en pratique

Trois questions suffisent généralement à trancher :

1.  **Ai-je besoin de fiabilité et d'ordre, ou la fraîcheur de la donnée prime-t-elle sur sa livraison garantie ?** → TCP si oui, UDP si non (ou QUIC pour avoir les deux à la fois via un compromis différent).
    
2.  **Le serveur doit-il pouvoir initier des messages, ou le client fait-il toujours la première demande ?** → WebSocket/gRPC streaming si le serveur doit pousser, HTTP classique sinon.
    
3.  **Les deux parties doivent-elles se prouver mutuellement leur identité, ou seule une des deux a besoin d'être vérifiée ?** → mTLS pour du service-à-service en environnement zero-trust, TLS simple pour du client public classique.
    

La complexité opérationnelle augmente à chaque couche ajoutée, TCP nu n'a aucune infrastructure à gérer, TLS demande des certificats, mTLS demande une CA et une stratégie de rotation, gRPC demande une définition de schéma Protobuf partagée. Le bon réflexe est de ne monter en complexité que quand la couche du dessous montre une limite concrète, pas par anticipation.