---
title: "Bagaimana mesin saling bicara : tur dari TCP hingga mTLS"
description: "Kenapa TCP, UDP, TLS, mTLS, HTTP dan WebSocket bukan alternatif yang bersaing melainkan lapisan bertumpuk; tur hierarkis komunikasi mesin ke mesin, dari transport mentah hingga autentikasi mutual."
date: 2026-07-16
tags: ["tcp", "udp", "tls", "mtls", "websocket", "http", "grpc", "réseau", "architecture-distribuée", "protocoles"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "+246dv7uK2kvpMP0oHi8nAkZR0+hSrIYmTWoXevDBNL4GEpQ26b79iSJzhLElCuUpqoMC2zzAGbOfb1Eywo5oA=="
---

# Masalahnya : terlalu banyak singkatan, tidak cukup hierarki

TCP, UDP, TLS, mTLS, WebSocket, HTTP, HTTPS, gRPC, QUIC; sebagian besar sumber yang membahasnya menyajikannya sebagai daftar datar opsi yang bisa dipertukarkan, "pilih sesuai kasus pemakaian". Kenyataannya mereka tidak berada di bidang yang sama : sebagian adalah protokol transport, sebagian lapisan keamanan yang membungkus transport, sebagian lagi protokol aplikatif yang bersandar pada dua yang pertama. Memahami hierarki berarti memahami kenapa kita tidak pernah "memilih" antara TCP dan TLS: kita memilih TCP, _lalu_ memutuskan apakah menaruh TLS di atasnya.

Artikel ini membangun ulang hierarki itu lapis per lapis, dari transport mentah hingga autentikasi mutual, dengan untuk tiap tingkat : apa yang dijaminnya, apa yang tidak dijaminnya, dan kapan cukup berhenti di sana.

# Tingkat 1 : transport (TCP lawan UDP)

Semuanya dimulai di sini. TCP dan UDP adalah dua protokol utama lapisan **Transport (Layer 4)** model OSI. Peran mereka identik : mengangkut aliran data antara dua aplikasi yang berjalan di mesin berbeda. Namun, cara mereka mencapainya sangat berbeda.

Penting dipahami bahwa IP (Internet Protocol), yang terletak di lapisan jaringan (Layer 3), hanya merutekan paket dari satu host ke host lain. Ia tidak menjamin tibanya, urutannya, bahkan keunikannya. Router hanya mengambil keputusan routing independen untuk tiap paket.

Tepat ketiadaan jaminan inilah yang dikompensasi TCP, sementara UDP sengaja memilih tidak menambah apa pun agar tetap sangat ringan.

## TCP : keandalan di atas segalanya

TCP (Transmission Control Protocol) adalah protokol **berorientasi koneksi** (_connection-oriented_). Sebelum mempertukarkan satu oktet data pun, kedua mesin harus membangun koneksi logis.

Koneksi ini dibuat berkat **Three-Way Handshake** yang terkenal :

```
Client                           Serveur
SYN ---------------------------->
        <--------------------- SYN + ACK
ACK ---------------------------->
Connexion établie
```

Setiap tahap punya tujuan tepat :

*   SYN : klien mengumumkan ingin membuka koneksi dan memberikan nomor urut pertama (Initial Sequence Number - ISN).

*   SYN-ACK : server menerima koneksi, mengakui penerimaan SYN dan memberikan pada gilirannya nomor urutnya sendiri.

*   ACK : klien mengonfirmasi penerimaan informasi server.


Sejak momen itu, kedua mesin mengenal keadaan koneksi dan bisa mulai bertukar data.

### **Nomor urut**

TCP tidak melihat data sebagai suksesi paket, melainkan sebagai **aliran oktet kontinu** (_byte stream_).

Setiap oktet yang dikirim punya nomor urut.

Contoh :

```
Pesan :

Bonjour

B = oktet 0
o = oktet 1
n = oktet 2
...
```

Kalau segmen berisi oktet 1000 hingga 1499 hilang selama transport, penerima bisa mendeteksi tepat apa yang kurang.

Pengirim mentransmisikan ulang hanya porsi itu.

Granularitas ini salah satu alasan ketangguhan TCP.

### **Acknowledgment (ACK)**

Setelah menerima data, penerima mengirim **ACK (Acknowledgment)**.

Berlawanan dengan yang sering dibayangkan, ACK bukan berarti :

> "Saya menerima paket ini"

Ia lebih berarti :

> "Saya menerima semua oktet hingga nomor X."

Misalnya :

```
Klien mengirim :

0 → 999

Server menjawab :

ACK = 1000
```

Ini berarti :

> "Semua yang sebelum oktet 1000 tiba dengan baik."

Mekanisme ini memungkinkan mengakui penerimaan beberapa segmen sekaligus (_cumulative acknowledgments_), sehingga mengurangi jumlah paket kontrol.

### **Retransmisi**

Kalau ACK tidak pernah tiba, TCP mengasumsikan segmen hilang.

Ia mentransmisikan ulang otomatis.

Penundaan retransmisi (**Retransmission Timeout – RTO**) tidak tetap.

TCP terus-menerus mengukur waktu pulang-pergi (**RTT**) berkat ACK yang diterima dan menghitung dinamis RTO agar menghindari retransmisi yang tidak perlu.

Implementasi modern juga memakai mekanisme seperti **Fast Retransmit** : ketika pengirim menerima beberapa ACK duplikat (umumnya tiga), ia menyimpulkan segmen antara telah hilang dan mengirimnya ulang segera, tanpa menunggu pewaktu kedaluwarsa.

### **Penataan ulang paket**

Internet sama sekali tidak menjamin dua paket mengikuti jalur yang sama.

Contoh :

```
Paket 1
Paris
  ↓
Londres
  ↓
New York

Paket 2
Paris
  ↓
Francfort
  ↓
Chicago
  ↓
New York
```

Paket kedua bisa tiba sebelum yang pertama.

TCP lalu menyimpan sementara segmen yang diterima **di luar urutan** dalam buffer (_reassembly buffer_), lalu merakitnya ulang sebelum menyerahkannya ke aplikasi.

Bagi aplikasi, semuanya tampak tiba sempurna berurutan.

### Kontrol aliran

Satu koneksi tidak hanya bergantung pada jaringan.

Penerima juga punya kapasitas memori terbatas.

Kalau ia menerima lebih cepat daripada bisa memproses data, buffernya akhirnya jenuh.

TCP menyelesaikan masalah ini berkat **jendela geser (Sliding Window)**.

Penerima menunjukkan di setiap ACK :

```
Window = 32768 oktet
```

Ini berarti :

> "Kamu bisa mengirimi saya hingga 32 Ko tambahan."

Kalau jendela ini jatuh ke nol :

```
Window = 0
```

Pengirim menangguhkan sementara transmisi hingga penerima mengumumkan jendela baru yang tersedia.

Mekanisme ini membentuk **kontrol aliran (Flow Control)** dan mencegah host cepat membanjiri host yang lebih lambat.

### Kontrol kongesti

Meski penerima mampu menyerap data, jaringan itu sendiri bisa jenuh.

Router punya antrean (_queues_) terbatas.

Ketika meluap, paket dibuang.

TCP menafsirkan kehilangan sebagai tanda kongesti dan otomatis menyesuaikan lajunya berkat **jendela kongesti (Congestion Window – cwnd)**.

Algoritma modern (seperti **Reno**, **CUBIC** atau **BBR**, tergantung sistem operasi) menyesuaikan jendela ini agar menemukan keseimbangan antara laju maks dan stabilitas jaringan.

Versi awal TCP terutama memakai dua mekanisme :

*   **Slow Start** : peningkatan eksponensial laju hingga mendeteksi kongesti.

*   **Congestion Avoidance** : pertumbuhan lalu lebih hati-hati, umumnya linear.


Adaptasi permanen ini salah satu alasan TCP tetap performan meski kualitas jaringan bervariasi.

### Penutupan koneksi

Berlawanan dengan UDP, koneksi TCP juga punya penutupan bersih.

Setiap ujung menutup independen alirannya berkat bendera **FIN**.

Penutupan lengkap umumnya membutuhkan empat pertukaran :

```
FIN
ACK
FIN
ACK
```

Prosedur ini menjamin semua data dalam transit telah terkirim baik sebelum koneksi dihancurkan.

## UDP : kesederhanaan maksimal

UDP (User Datagram Protocol) menganut filosofi kebalikannya.

Ia **tanpa koneksi (connectionless)**.

Tidak ada :

*   handshake apa pun ;

*   nomor urut apa pun ;

*   acknowledgment apa pun ;

*   retransmisi apa pun ;

*   kontrol aliran apa pun ;

*   kontrol kongesti apa pun.


Setiap pesan hanya dienkapsulasi dalam **datagram** independen, ditransmisikan ke jaringan, lalu dilupakan pengirim.

```
Aplikasi → Datagram UDP → IP → Internet
```

Protokol tidak menyimpan keadaan apa pun antara dua pengiriman.

Setiap datagram sepenuhnya independen dari sebelumnya.

### Integritas data

Meski UDP tidak menjamin pengiriman maupun urutan, ia tetap melindungi integritas data berkat **checksum**.

Saat penerimaan, checksum dihitung ulang.

*   Kalau nilainya cocok, datagram diterima.

*   Kalau tidak, ia langsung ditolak.


Jadi UDP mendeteksi data yang rusak, tapi tidak pernah mencoba memulihkannya.

### Kenapa UDP begitu cepat?

Header UDP hanya berisi **8 oktet**, lawan minimum **20 oktet** untuk TCP (belum termasuk opsi seperti timestamp, SACK atau Window Scaling).

Karena tidak ada koneksi yang dipelihara, sistem operasi tidak harus melacak keadaan tiap pertukaran, yang juga mengurangi konsumsi memori dan biaya pemrosesan.

Aplikasi menerima data hampir begitu tiba, tanpa menunggu kemungkinan retransmisi.

## Ketika kehilangan data lebih baik

Ide dasarnya sederhana :

> Informasi lama bisa kurang berharga daripada informasi yang hilang.

Ambil percakapan VoIP.

Setiap paket membawa sekitar **20 ms** suara.

Kalau satu paket hilang, mentransmisikannya ulang sering memakan waktu lebih lama dari 20 ms itu.

Ketika akhirnya tiba, percakapan sudah maju.

Sebagian besar aplikasi lebih memilih menutupi kehilangan (interpolasi, hening, koreksi error) daripada menunggu retransmisi.

Penalaran yang sama berlaku :

*   pada game multipemain waktu nyata ;

*   pada streaming video ;

*   pada aliran telemetri ;

*   pada sensor IoT ;

*   pada data posisi GPS.


Nilai terbaru hampir selalu lebih berguna daripada nilai lama yang sempurna andalnya.

# Tingkat 2 : enkripsi, TLS

TLS (Transport Layer Security, penerus SSL) tidak menggantikan TCP, ia ditambahkan di atasnya. Konkretnya, TLS membangun koneksi TCP normal, lalu menegosiasikan sesi terenkripsi di dalamnya : pertukaran sertifikat, kesepakatan algoritma enkripsi, derivasi kunci sesi. Semua yang transit kemudian terenkripsi dan terautentikasi.

Tiga jaminan berbeda, sering tertukar :

*   **Kerahasiaan** : tidak ada selain kedua pihak yang bisa membaca isinya.

*   **Integritas** : setiap perubahan data dalam transit terdeteksi.

*   **Autentikasi** : tapi dalam TLS klasik, satu arah : klien memverifikasi bahwa server memang seperti yang diklaimnya (lewat sertifikatnya, yang ditandatangani otoritas tepercaya), tapi server tidak memverifikasi apa pun soal identitas klien. Tepat inilah model HTTPS ketika kamu mengunjungi situs : peramban mengautentikasi situs, situs tidak mengautentikasimu (autentikasi pengguna lewat mekanisme terpisah, cookie sesi, token).


TLS 1.3 (versi terkini yang direkomendasikan) telah mengurangi handshake menjadi satu pulang-pergi dalam kasus umum, lawan dua untuk TLS 1.2, yang mengurangi latensi koneksi secara terasa.

## Tingkat 2bis : mTLS -- autentikasi menjadi mutual

mTLS (mutual TLS) adalah TLS dengan batasan tambahan : server menuntut _juga_ sertifikat dari klien, dan memverifikasinya. Kedua pihak membuktikan identitasnya lewat sertifikat yang ditandatangani otoritas tepercaya bersama.

Ini mekanisme alami untuk komunikasi layanan-ke-layanan dalam arsitektur terdistribusi : di mana HTTPS klasik cukup supaya peramban bicara ke server publik, mTLS menjawab pertanyaan berbeda; _bagaimana layanan internal tahu bahwa ia benar-benar bicara ke layanan internal lain yang diotorisasi, dan bukan ke penyerang yang mendarat di jaringan?_

```
Klien                                          Server
  │──── ClientHello ─────────────────────────────▶│
  │◀─── ServerHello + sertifikat server ──────────│
  │──── memverifikasi sertifikat server ─────────────│
  │──── mengirim sertifikat klien MILIKNYA ──────▶│
  │◀─── memverifikasi sertifikat klien ───────────────│
  │──── kunci sesi diderivasi, kanal terenkripsi ──▶│
```

Imbalan mTLS bersifat operasional : perlu otoritas sertifikasi (CA) internal, mekanisme distribusi sertifikat ke tiap layanan, dan strategi rotasi/pencabutan. Dalam lingkungan satu mesin dengan sedikit layanan, ini kadang lebih banyak kerumitan daripada manfaat -- mTLS menjadi perlu sejak trafik antar-layanan melintasi jaringan yang tidak sepenuhnya kita kendalikan (banyak host, cloud multi-tenant), atau begitu kita menginginkan kebijakan tipe _zero trust_, di mana tidak ada layanan yang secara implisit layak dipercaya hanya karena ia "di dalam" jaringan.

# Tingkat 3 : protokol aplikatif di atas TCP+TLS

Begitu transport dan enkripsi terpasang, tinggal mendefinisikan _bagaimana menstruktur pertukaran_. Itulah peran protokol aplikatif.

## HTTP / HTTPS

HTTP adalah protokol permintaan-respons : klien membuka koneksi (atau memakai ulang, dengan keep-alive), mengirim permintaan, menunggu respons, koneksi lalu bisa ditutup atau dipakai ulang. HTTPS hanyalah HTTP di atas TLS -- S tidak mengubah apa pun pada semantik protokol, hanya pada fakta bahwa transport terenkripsi.

Model permintaan-respons punya batas struktural : server tidak pernah bisa bicara duluan. Ia hanya bisa menjawab apa yang diminta klien. Untuk polling sering ("ada yang baru?" setiap detik), itu bisa tapi membuang sumber daya -- setiap permintaan menciptakan ulang overhead protokoler untuk, sebagian besar waktu, tidak mengumumkan hal baru apa pun.

## WebSocket (WS / WSS)

WebSocket menjawab tepat batas ini. Koneksi dimulai sebagai permintaan HTTP klasik (dengan header `Upgrade: websocket`), tapi begitu jabat tangan diterima, koneksi TCP di bawahnya bukan lagi kanal permintaan-respons HTTP -- ia menjadi kanal dua arah full-duplex di mana klien dan server bisa mengirim pesan kapan pun, tanpa harus menerbitkan ulang siklus permintaan-respons di setiap pertukaran.

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

WSS hanyalah WebSocket di atas TLS, persis seperti HTTPS adalah HTTP di atas TLS. Ini protokol pilihan untuk semua yang membutuhkan push server waktu nyata -- chat, notifikasi, aliran trading, event permainan -- tanpa ingin mengelola sendiri protokol biner di atas TCP telanjang.

## gRPC

Kurang dikenal di luar dunia microservice tapi sentral dalam komunikasi layanan-ke-layanan : gRPC bersandar pada HTTP/2 (jadi TCP + TLS opsional), menyerilakan pesan dalam Protocol Buffers (biner, bertipe, ringkas - berlawanan dengan JSON teks dari sebagian besar API REST), dan memungkinkan native streaming dua arah berkat multiplexing HTTP/2 (banyak aliran logis pada satu koneksi TCP, tanpa head-of-line blocking yang dimiliki banyak permintaan HTTP/1.1 sekuensial).

## QUIC / HTTP3

QUIC mengubah keadaan dengan berangkat dari UDP alih-alih TCP di tingkat transport, sambil mengimplementasikan ulang di atasnya jaminan keandalan yang ditawarkan TCP secara native - tapi per aliran alih-alih global, yang menghilangkan head-of-line blocking di tingkat transport (paket hilang pada satu aliran tidak lagi memblokir aliran lain dari koneksi yang sama). TLS 1.3 terintegrasi langsung dalam QUIC alih-alih ditambahkan di atasnya, yang makin mengurangi latensi handshake. HTTP/3 adalah HTTP di atas QUIC.

# Gambaran umum : di mana posisi tiap protokol

Lapisan Protokol Peran Transport TCP, UDP Membuat oktet berpergian, andal atau tidak Transport (generasi baru) QUIC UDP + keandalan per aliran + TLS terintegrasi Keamanan TLS, mTLS Enkripsi, integritas, autentikasi (satu arah atau mutual) Aplikasi HTTP/HTTPS, WS/WSS, gRPC Menstruktur pertukaran (permintaan-respons, dua arah, RPC bertipe)

Contoh konkret untuk memantapkan ide : arsitektur microservice dengan dashboard web dan layanan internal bisa secara wajar menggabungkan HTTPS (dashboard ↔ API publik, autentikasi satu arah cukup di sisi peramban), mTLS (layanan ↔ layanan secara internal, autentikasi mutual diperlukan), dan WSS (notifikasi waktu nyata didorong ke dashboard) -- tiga protokol aplikatif berbeda, semuanya dibangun di atas fondasi yang sama TCP + TLS.

## Cara memilih, dalam praktik

Tiga pertanyaan umumnya cukup untuk memutuskan :

1.  **Apakah saya butuh keandalan dan urutan, atau kesegaran data lebih utama daripada pengiriman terjamin?** → TCP kalau ya, UDP kalau tidak (atau QUIC untuk mendapatkan keduanya sekaligus lewat kompromi berbeda).

2.  **Haruskah server bisa memulai pesan, atau klien selalu yang meminta duluan?** → WebSocket/streaming gRPC kalau server harus mendorong, HTTP klasik kalau tidak.

3.  **Haruskah kedua pihak saling membuktikan identitas, atau hanya satu yang perlu diverifikasi?** → mTLS untuk layanan-ke-layanan di lingkungan zero-trust, TLS sederhana untuk klien publik klasik.


Kompleksitas operasional meningkat di setiap lapisan yang ditambahkan, TCP telanjang tidak punya infrastruktur yang dikelola, TLS membutuhkan sertifikat, mTLS membutuhkan CA dan strategi rotasi, gRPC membutuhkan definisi skema Protobuf bersama. Refleks yang benar adalah naik kompleksitas hanya ketika lapisan di bawahnya menunjukkan batas konkret, bukan karena antisipasi.
