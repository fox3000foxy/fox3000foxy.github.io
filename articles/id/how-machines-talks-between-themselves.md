---
title: "Bagaimana Mesin Saling Berbicara: Sebuah Tinjauan dari TCP hingga mTLS"
description: "Mengapa TCP, UDP, TLS, mTLS, HTTP, dan WebSocket bukanlah alternatif yang bersaing melainkan lapisan yang bertumpuk; sebuah tinjauan hierarkis komunikasi mesin-ke-mesin, dari transportasi mentah hingga otentikasi mutual."
date: 2026-07-16
tags: ["tcp", "udp", "tls", "mtls", "websocket", "http", "grpc", "jaringan", "arsitektur-terdistribusi", "protokol"]
authors: ["docteur-turboss"]
lang: "id"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "MLMyt5nM357eVwh+IqEkevrn38inNsITKpDcs7pODPhDzQFhoimx0C8IH5yv2b5GYlZpWMq53L5ZD40jOSGH3g=="
---
# Masalahnya: Terlalu Banyak Akronim, Kurang Hierarki

TCP, UDP, TLS, mTLS, WebSocket, HTTP, HTTPS, gRPC, QUIC; sebagian besar sumber yang membahasnya menyajikannya sebagai daftar datar opsi yang dapat dipertukarkan, "pilih sesuai kasus penggunaan". Pada kenyataannya mereka tidak berada pada bidang yang sama: beberapa adalah protokol transportasi, yang lain adalah lapisan keamanan yang membungkus transportasi, dan lainnya lagi adalah protokol aplikatif yang dibangun di atas dua lapisan pertama. Memahami hierarkinya berarti memahami mengapa kita tidak pernah "memilih" antara TCP dan TLS: kita memilih TCP, _lalu_ memutuskan apakah akan menempatkan TLS di atasnya.

Artikel ini membangun hierarki tersebut lapis demi lapis, dari transportasi mentah hingga otentikasi mutual, dengan setiap level: apa yang dijamin, apa yang tidak dijamin, dan kapan cukup puas dengan itu.

# Level 1: Transportasi (TCP vs UDP)

Semuanya dimulai di sini. TCP dan UDP adalah dua protokol utama pada lapisan **Transportasi (Layer 4)** model OSI. Peran mereka identik: mengangkut aliran data antara dua aplikasi yang berjalan di mesin yang berbeda. Namun, cara mereka melakukannya sangat berbeda.

Penting untuk dipahami bahwa IP (Internet Protocol), yang berada di lapisan jaringan (Layer 3), hanya mengirimkan paket dari satu host ke host lain. Ia tidak menjamin kedatangan, urutan, atau bahkan keunikan paket. Router hanya membuat keputusan routing independen untuk setiap paket.

Ketidakadaan jaminan inilah yang justru dikompensasi oleh TCP, sementara UDP secara sengaja memilih untuk tidak menambahkan apa pun agar tetap sangat ringan.

## TCP: Keandalan di atas segalanya

TCP (Transmission Control Protocol) adalah protokol **berorientasi koneksi** (_connection-oriented_). Sebelum satu byte data pun dipertukarkan, kedua mesin harus membangun koneksi logis.

Koneksi ini dibuat melalui **Three-Way Handshake** yang terkenal:

```

Client                           Server
SYN ---------------------------->
        <--------------------- SYN + ACK
ACK ----------------------------> 
Koneksi terbentuk
```

Setiap langkah memiliki tujuan yang spesifik:

*   SYN: klien mengumumkan bahwa ia ingin membuka koneksi dan memberikan nomor urut pertama (Initial Sequence Number - ISN).
    
*   SYN-ACK: server menerima koneksi, mengakui penerimaan SYN, dan memberikan nomor urutnya sendiri.
    
*   ACK: klien mengonfirmasi penerimaan informasi dari server.
    

Setelah titik ini, kedua mesin mengetahui status koneksi dan dapat mulai bertukar data.

### **Nomor Urut (Sequence Numbers)**

TCP tidak melihat data sebagai rangkaian paket, melainkan sebagai **aliran byte kontinu** (_byte stream_).

Setiap byte yang dikirim memiliki nomor urut.

Contoh:

```
Pesan:

Halo

H = byte 0
a = byte 1
l = byte 2
o = byte 3
```

Jika sebuah segmen yang berisi byte 1000 hingga 1499 hilang selama pengiriman, penerima dapat mendeteksi dengan tepat apa yang hilang.

Pengirim hanya mentransmisikan ulang bagian tersebut.

Granularitas ini adalah salah satu alasan ketangguhan TCP.

### **Acknowledgments (ACK)**

Setelah menerima data, penerima mengirimkan **ACK (Acknowledgment)**.

Berlawanan dengan apa yang sering dibayangkan, sebuah ACK tidak berarti:

> "Saya telah menerima paket ini"

Melainkan berarti:

> "Saya telah menerima semua byte hingga nomor X."

Contoh:

```
Klien mengirim:

0 → 999

Server merespon:

ACK = 1000
```

Ini berarti:

> "Semua yang mendahului byte 1000 telah tiba dengan selamat."

Mekanisme ini memungkinkan pengakuan penerimaan beberapa segmen sekaligus (_cumulative acknowledgments_), sehingga mengurangi jumlah paket kontrol.

### **Retransmisi**

Jika sebuah ACK tidak pernah tiba, TCP menganggap segmen tersebut hilang.

Ia mentransmisikannya ulang secara otomatis.

Jeda retransmisi (**Retransmission Timeout – RTO**) tidak tetap.

TCP secara terus-menerus mengukur waktu perjalanan pulang-pergi (**RTT**) melalui ACK yang diterima dan menghitung RTO secara dinamis untuk menghindari retransmisi yang tidak perlu.

Implementasi modern juga menggunakan mekanisme seperti **Fast Retransmit**: ketika pengirim menerima beberapa ACK duplikat (biasanya tiga), ia menyimpulkan bahwa segmen di antaranya telah hilang dan segera mengirimkannya ulang, tanpa menunggu timer kedaluwarsa.

### **Pengurutan Ulang Paket**

Internet sama sekali tidak menjamin bahwa dua paket akan mengikuti jalur yang sama.

Contoh:

```
Paket 1
Paris
 ↓
London
 ↓
New York

Paket 2
Paris
 ↓
Frankfurt
 ↓
Chicago
 ↓
New York
```

Paket kedua bisa tiba sebelum paket pertama.

TCP kemudian menyimpan sementara segmen yang diterima **tidak berurutan** dalam buffer (_reassembly buffer_), lalu menyusunnya kembali sebelum menyerahkannya ke aplikasi.

Bagi aplikasi, semuanya tampak tiba dengan sempurna dan berurutan.

### Kontrol Aliran (Flow Control)

Koneksi tidak hanya bergantung pada jaringan.

Penerima juga memiliki kapasitas memori yang terbatas.

Jika ia menerima lebih cepat daripada kemampuannya memproses data, buffer-nya akan penuh.

TCP mengatasi masalah ini melalui **jendela geser (Sliding Window)**.

Penerima menunjukkan dalam setiap ACK:

```
Window = 32768 byte
```

Ini berarti:

> "Kamu dapat mengirimiku hingga 32 KB tambahan."

Jika jendela ini turun menjadi nol:

```
Window = 0
```

Pengirim menghentikan sementara transmisi hingga penerima mengumumkan jendela baru yang tersedia.

Mekanisme ini merupakan **Kontrol Aliran (Flow Control)** dan mencegah host yang cepat membanjiri host yang lebih lambat.

### Kontrol Kemacetan (Congestion Control)

Bahkan jika penerima mampu menyerap data, jaringan itu sendiri bisa menjadi jenuh.

Router memiliki antrian (_queues_) yang terbatas.

Ketika antrian meluap, paket-paket dibuang.

TCP menginterpretasikan kehilangan sebagai tanda kemacetan dan secara otomatis menyesuaikan laju pengirimannya melalui **jendela kemacetan (Congestion Window – cwnd)**.

Algoritme modern (seperti **Reno**, **CUBIC**, atau **BBR**, tergantung sistem operasi) menyesuaikan jendela ini untuk menemukan keseimbangan antara laju maksimum dan stabilitas jaringan.

Versi awal TCP terutama menggunakan dua mekanisme:

*   **Slow Start**: peningkatan laju secara eksponensial hingga kemacetan terdeteksi.
    
*   **Congestion Avoidance**: pertumbuhan yang lebih hati-hati setelahnya, biasanya linier.
    

Adaptasi yang berkelanjutan ini adalah salah satu alasan mengapa TCP tetap berkinerja baik meskipun terjadi variasi kualitas jaringan.

### Penutupan Koneksi

Tidak seperti UDP, koneksi TCP juga memiliki penutupan yang rapi.

Setiap ujung menutup alirannya secara independen melalui bendera **FIN**.

Penutupan lengkap biasanya memerlukan empat pertukaran:

```
FIN
ACK
FIN
ACK
```

Prosedur ini memastikan bahwa semua data yang masih dalam perjalanan telah terkirim dengan selamat sebelum koneksi dihancurkan.

## UDP: Kesederhanaan Maksimal

UDP (User Datagram Protocol) mengadopsi filosofi sebaliknya.

Ia **tanpa koneksi (connectionless)**.

Tidak ada:

*   handshake;
    
*   nomor urut;
    
*   acknowledgment;
    
*   retransmisi;
    
*   kontrol aliran;
    
*   kontrol kemacetan.
    

Setiap pesan hanya dibungkus dalam **datagram** independen, dikirim ke jaringan, lalu dilupakan oleh pengirim.

```
Aplikasi → Datagram UDP → IP → Internet
```

Protokol ini tidak menyimpan status apa pun antara dua pengiriman.

Setiap datagram sepenuhnya independen dari datagram sebelumnya.

### Integritas Data

Meskipun UDP tidak menjamin pengiriman maupun urutan, ia tetap melindungi integritas data melalui **checksum**.

Saat penerimaan, checksum dihitung ulang.

*   Jika nilainya cocok, datagram diterima.
    
*   Jika tidak, datagram segera ditolak.
    

UDP mendeteksi data yang rusak, tetapi tidak pernah mencoba memulihkannya.

### Mengapa UDP Begitu Cepat?

Header UDP hanya berisi **8 byte**, dibandingkan dengan minimal **20 byte** untuk TCP (tanpa menghitung opsi seperti timestamp, SACK, atau Window Scaling).

Karena tidak ada koneksi yang dipertahankan, sistem operasi tidak perlu melacak status setiap pertukaran, yang juga mengurangi konsumsi memori dan biaya pemrosesan.

Aplikasi menerima data hampir segera setelah tiba, tanpa menunggu kemungkinan retransmisi.

## Kapan Kehilangan Data Lebih Baik

Ide dasarnya sederhana:

> Informasi lama bisa memiliki nilai yang lebih rendah daripada informasi yang hilang.

Ambil contoh percakapan VoIP.

Setiap paket membawa sekitar **20 ms** suara.

Jika sebuah paket hilang, mentransmisikannya ulang seringkali membutuhkan waktu lebih lama dari 20 ms tersebut.

Ketika akhirnya tiba, percakapan sudah berlanjut.

Sebagian besar aplikasi lebih memilih untuk menyembunyikan kehilangan (interpolasi, silence, koreksi kesalahan) daripada menunggu retransmisi.

Pemikiran yang sama berlaku untuk:

*   game multipemain waktu nyata;
    
*   streaming video;
    
*   aliran telemetri;
    
*   sensor IoT;
    
*   data posisi GPS.
    

Nilai yang baru hampir selalu lebih berguna daripada nilai lama yang sempurna keandalannya.

# Level 2: Enkripsi, TLS

TLS (Transport Layer Security, penerus SSL) tidak menggantikan TCP, ia ditambahkan di atasnya. Secara konkret, TLS membangun koneksi TCP normal, lalu menegosiasikan sesi terenkripsi di dalamnya: pertukaran sertifikat, kesepakatan algoritme enkripsi, derivasi kunci sesi. Semua yang kemudian melewatinya terenkripsi dan terautentikasi.

Tiga jaminan berbeda, yang sering tertukar:

*   **Kerahasiaan (Confidentiality)**: tidak ada pihak lain selain kedua belah pihak yang dapat membaca isi.
    
*   **Integritas (Integrity)**: setiap perubahan pada data yang sedang dalam perjalanan terdeteksi.
    
*   **Otentikasi (Authentication)**: tetapi dalam TLS klasik, hanya satu arah: klien memverifikasi bahwa server benar-benar seperti yang diklaim (melalui sertifikatnya, yang ditandatangani oleh otoritas tepercaya), tetapi server tidak memverifikasi apa pun tentang identitas klien. Ini persis model HTTPS saat Anda mengunjungi situs: browser mengotentikasi situs, situs tidak mengotentikasi Anda (otentikasi pengguna dilakukan melalui mekanisme terpisah, cookie sesi, token).
    

TLS 1.3 (versi terkini yang direkomendasikan) telah mengurangi handshake menjadi satu kali perjalanan pulang-pergi dalam kasus biasa, dibandingkan dua kali untuk TLS 1.2, yang secara signifikan mengurangi latensi koneksi.

## Level 2bis: mTLS -- Otentikasi Menjadi Mutual

mTLS (mutual TLS) adalah TLS dengan satu batasan tambahan: server _juga_ memerlukan sertifikat dari klien, dan memverifikasinya. Kedua belah pihak membuktikan identitas mereka melalui sertifikat yang ditandatangani oleh otoritas tepercaya bersama.

Ini adalah mekanisme alami untuk komunikasi service-ke-service dalam arsitektur terdistribusi: di mana HTTPS klasik cukup untuk browser berbicara dengan server publik, mTLS menjawab pertanyaan yang berbeda; _bagaimana sebuah layanan internal tahu bahwa ia benar-benar berbicara dengan layanan internal lain yang berwenang, dan bukan dengan penyerang yang kebetulan berada di jaringan?_

```
Klien                                          Server
  │──── ClientHello ─────────────────────────────▶│
  │◀─── ServerHello + sertifikat server ──────────│
  │──── verifikasi sertifikat server ─────────────│
  │──── mengirim SERTIFIKAT KLIENNYA SENDIRI ────▶│
  │◀─── verifikasi sertifikat klien ──────────────│
  │──── kunci sesi diturunkan, saluran terenkripsi ▶
```

Konsekuensi dari mTLS bersifat operasional: diperlukan otoritas sertifikasi (CA) internal, mekanisme distribusi sertifikat ke setiap layanan, dan strategi rotasi/pencabutan. Dalam lingkungan satu mesin dengan sedikit layanan, ini terkadang lebih kompleks daripada manfaatnya -- mTLS menjadi diperlukan ketika lalu lintas antar-layanan melintasi jaringan yang tidak sepenuhnya kita kendalikan (beberapa host, cloud multi-tenant), atau ketika kita menginginkan kebijakan tipe _zero trust_, di mana tidak ada layanan yang secara implisit dapat dipercaya hanya karena berada "di dalam" jaringan.

# Level 3: Protokol Aplikatif di atas TCP+TLS

Setelah transportasi dan enkripsi terpasang, selanjutnya adalah mendefinisikan _bagaimana menstrukturkan pertukaran_. Inilah peran protokol aplikatif.

## HTTP / HTTPS

HTTP adalah protokol request-response: klien membuka koneksi (atau menggunakan kembali yang sudah ada, dengan keep-alive), mengirim permintaan, menunggu respons, koneksi kemudian dapat ditutup atau digunakan kembali. HTTPS hanyalah HTTP di atas TLS -- huruf S tidak mengubah semantik protokol, hanya fakta bahwa transportasinya dienkripsi.

Model request-response memiliki batasan struktural: server tidak pernah bisa berbicara terlebih dahulu. Server hanya dapat merespons apa yang diminta klien. Untuk polling yang sering (memeriksa "apa yang baru?" setiap detik), ini berfungsi tetapi memboroskan sumber daya -- setiap permintaan menciptakan overhead protokol hanya untuk, sebagian besar waktu, tidak ada hal baru yang perlu diumumkan.

## WebSocket (WS / WSS)

WebSocket menjawab tepat batasan ini. Koneksi dimulai sebagai permintaan HTTP biasa (dengan header `Upgrade: websocket`), tetapi setelah jabat tangan diterima, koneksi TCP yang mendasarinya bukan lagi saluran request-response HTTP -- ia menjadi saluran dua arah full-duplex di mana klien dan server dapat mengirim pesan kapan saja, tanpa harus mengulangi siklus request-response setiap kali bertukar.

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

WSS hanyalah WebSocket di atas TLS, persis seperti HTTPS adalah HTTP di atas TLS. Ini adalah protokol pilihan untuk segala hal yang memerlukan push server waktu nyata -- chat, notifikasi, aliran trading, peristiwa game -- tanpa perlu mengelola sendiri protokol biner di atas TCP telanjang.

## gRPC

Kurang dikenal di luar dunia microservice tetapi sentral dalam komunikasi service-ke-service: gRPC dibangun di atas HTTP/2 (jadi TCP + TLS opsional), men-serialisasi pesan dalam Protocol Buffers (biner, bertipe, ringkas -- berbeda dengan JSON teks dari kebanyakan API REST), dan secara native mendukung streaming dua arah berkat multipleksing HTTP/2 (beberapa aliran logis pada satu koneksi TCP, tanpa head-of-line blocking yang akan terjadi pada beberapa permintaan HTTP/1.1 berurutan).

## QUIC / HTTP3

QUIC mengubah keadaan dengan kembali menggunakan UDP daripada TCP di level transportasi, sambil mengimplementasikan ulang di atasnya jaminan keandalan yang ditawarkan TCP secara native -- tetapi aliran per aliran, bukan secara global, yang menghilangkan head-of-line blocking di level transportasi (satu paket hilang pada satu aliran tidak lagi memblokir aliran lain pada koneksi yang sama). TLS 1.3 terintegrasi langsung ke dalam QUIC, bukan ditambahkan di atasnya, yang semakin mengurangi latensi handshake. HTTP/3 adalah HTTP di atas QUIC.

# Gambaran Umum: Di Mana Setiap Protokol Berada

Lapisan Protokol Peran Transportasi TCP, UDP Membawa byte, andal atau tidak Transportasi (generasi baru) QUIC UDP + keandalan per aliran + TLS terintegrasi Keamanan TLS, mTLS Enkripsi, integritas, otentikasi (satu arah atau mutual) Aplikasi HTTP/HTTPS, WS/WSS, gRPC Menstrukturkan pertukaran (request-response, dua arah, RPC bertipe)

Contoh konkret untuk memperjelas: arsitektur microservice dengan dashboard web dan layanan internal dapat secara wajar menggabungkan HTTPS (dashboard ↔ API publik, otentikasi satu arah cukup di sisi browser), mTLS (service ↔ service secara internal, otentikasi mutual diperlukan), dan WSS (notifikasi waktu nyata yang didorong ke dashboard) -- tiga protokol aplikatif yang berbeda, semuanya dibangun di atas fondasi TCP + TLS yang sama.

## Cara Memilih, dalam Praktik

Tiga pertanyaan biasanya sudah cukup untuk memutuskan:

1.  **Apakah saya membutuhkan keandalan dan urutan, atau kesegaran data lebih penting daripada pengiriman yang terjamin?** → TCP jika ya, UDP jika tidak (atau QUIC untuk mendapatkan keduanya melalui kompromi yang berbeda).
    
2.  **Apakah server harus dapat memulai pengiriman pesan, atau apakah klien selalu yang mengajukan permintaan pertama?** → WebSocket/gRPC streaming jika server harus mendorong, HTTP biasa jika tidak.
    
3.  **Apakah kedua belah pihak harus saling membuktikan identitas, atau hanya satu yang perlu diverifikasi?** → mTLS untuk service-ke-service di lingkungan zero-trust, TLS biasa untuk klien publik standar.
    

Kompleksitas operasional bertambah setiap kali lapisan ditambahkan: TCP telanjang tidak memiliki infrastruktur yang perlu dikelola, TLS memerlukan sertifikat, mTLS memerlukan CA dan strategi rotasi, gRPC memerlukan definisi skema Protobuf bersama. Refleks yang baik adalah hanya meningkatkan kompleksitas ketika lapisan di bawahnya menunjukkan batasan konkret, bukan karena antisipasi.
