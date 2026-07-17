---
title: "Cape Mod : cara mencuri cape Jeb_ dengan injeksi tanda tangan RSA"
description: "Mod Fabric yang mengeksploitasi celah logika dalam sistem kepercayaan Minecraft: tanda tangan RSA Mojang yang valid tetapi diputar ulang pada akun yang salah. Penjelasan kode, implikasi keamanan, dan pelajaran kriptografi."
date: 2026-07-11
authors:
  - fox3000foxy
tags:
  - minecraft
  - fabric
  - java
  - security
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "B5G6SS7Pyjb33kyw5tbdEEZegbDHVJQ9pCVjpxcVYNXxZQfllfZ/6unThDjiZHlNhtb61V3uCFWCtRU+CeO74A=="
---

# Cape Mod : cara mencuri cape Jeb_ dengan injeksi tanda tangan RSA

![alt text](assets/xbox-profile.png)
Bagaimana jika cukup dengan tanda tangan RSA yang valid -- tetapi untuk **akun yang salah** -- untuk membuat teman-temanmu percaya bahwa kamu memakai cape resmi Mojang? Selamat datang di `cape-mod`, sebuah eksploitasi Fabric yang menunjukkan bagaimana Minecraft mempercayai tanda tangan tanpa memverifikasi bahwa profil yang dimilikinya benar-benar milikmu.

## Konteks : bagaimana Minecraft mengelola skin dan cape

Di Java Edition, ada pertanyaan yang jarang kita tanyakan : **siapa yang bertanggung jawab untuk menampilkan skin dan cape pemain -- klien atau server?**

Jawabannya bernuansa :

| Komponen | Siapa yang mengirim? | Siapa yang mengunduh? |
|---|---|---|
| **Tekstur Skin** | Server mengirim URL yang ditandatangani | Klien mengunduh dari `textures.minecraft.net` |
| **Tekstur Cape** | Server mengirim URL yang ditandatangani | Klien mengunduh dari `textures.minecraft.net` |
| **Properti `textures`** | Server mengirim `GameProfile` dari auth Mojang | Klien memverifikasi tanda tangan RSA |

Poin kuncinya : semuanya terkandung dalam properti bernama `textures` dari `GameProfile`. Properti ini berisi :
- Payload JSON dalam base64 dengan URL tekstur
- **Tanda tangan RSA** yang dibuat dengan kunci privat Mojang

## Tembok tanda tangan RSA

Setiap properti `textures` terlihat seperti ini jika didekode :

```json
{
  "timestamp": 1783666316269,
  "profileId": "d90b68bc81724329a047f1186dcd4336",
  "profileName": "akronman1",
  "signatureRequired": true,
  "textures": {
    "SKIN": {
      "url": "http://textures.minecraft.net/texture/3e6defcb7de5a0e05c75525c6cd46e4b9b416b92e0cf4baa1e0a9e212a887f3f7"
    },
    "CAPE": {
      "url": "http://textures.minecraft.net/texture/70efffaf86fe5bc089608d3cb297d3e276b9eb7a8f9f2fe6659c23a2d8b18edf"
    }
  }
}
```

Klien memverifikasi tanda tangan RSA terhadap **kunci publik yang tertanam di dalam jar** (`yggdrasil_session_pubkey.der`) :

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

Untuk pemain jarak jauh (bukan lokal), klien hanya menerima skin yang **ditandai sebagai `secure`** -- yaitu dengan tanda tangan yang valid :

```java
// SkinManager.createLookup() -- disederhanakan
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← pemain jarak jauh harus aman
    .orElse(defaultSkin);
```

Pemeriksaan ini mencegah spoofing secara teori. Tapi di sinilah segalanya menjadi menarik.

## Celahnya : replay tanda tangan

Klien memverifikasi bahwa tanda tangan RSA **valid**. Tapi klien **tidak pernah** memeriksa apakah `profileId` yang terkandung dalam JSON cocok dengan UUID asli pemain.

Dengan kata lain : properti `textures` yang diambil dari **akun Mojang yang sudah ada** (misalnya milik seorang pegawai Mojang) dapat diputar ulang ke pemain lain mana pun. Tanda tangannya tetap valid -- tanda tangan itu benar-benar dibuat oleh Mojang -- hanya saja berasal dari akun lain.

### Bagaimana cara mengekstrak tanda tangan asli?

Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) memiliki cape Mojang Studios. Dari server sesi Mojang :

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

Respon :

```json
{
  "id": "853c80ef-3c37-49fd-aa49-938b674adae6",
  "name": "jeb_",
  "properties": [
    {
      "name": "textures",
      "value": "ewogICJ0aW1lc3RhbXAiIDogMTc4MzYxOTcyNjAxMSwKICAicHJvZmlsZUlkIiA6ICI4NTNjODBl...",
      "signature": "RgIPF4d/iTDWJV..."
    }
  ]
}
```

`signature` dari kolom `value` ini diproduksi oleh Mojang. Itu adalah RSA-2048 SHA-1. Tanda tangan itu **benar-benar** valid, bahkan jika kamu memutarnya pada UUID lain -- karena tanda tangan Jeb_ tetaplah tanda tangan Jeb_, dan klien tidak pernah memeriksa bahwa itu **seharusnya** milikmu.

## Kode : bagaimana mod ini bekerja

Mod `cape-mod` sangat kecil -- 65 baris Java. Berikut intinya :

```java
@Mixin(Player.class)
public class ServerPlayerMixin {
    private static final String TEXTURES_VALUE =
        "ewogICJ0aW1lc3RhbXAiIDogMTc4MzY2NjMxNjI2OSwKICAicHJvZmlsZUlkIiA6ICJkOTBi...";
    
    private static final String TEXTURES_SIGNATURE =
        "oxoAfZRLVNSfXYFMNbDKZ9XxrTHmz/k2yxzOxksXY3f6aDhY3gCyFCCtDreEWI7fpG9...";

    @Inject(method = "getGameProfile()Lcom/mojang/authlib/GameProfile;", 
            at = @At("RETURN"), cancellable = true)
    private void injectCape(CallbackInfoReturnable<GameProfile> cir) {
        Player self = (Player) (Object) this;
        if (!(self instanceof ServerPlayer serverPlayer)) return;
        MinecraftServer server = ((ServerPlayerAccessor) serverPlayer).getServer();
        if (!(server instanceof IntegratedServer)) return;

        GameProfile host = server.getSingleplayerProfile();
        GameProfile original = cir.getReturnValue();
        if (host == null || !host.name().equals(original.name())) return;

        // Ganti properti textures dengan milik Jeb_
        ImmutableMultimap.Builder<String, Property> b = ImmutableMultimap.builder();
        for (Property p : original.properties().values()) {
            if (!p.name().equals("textures")) {
                b.put(p.name(), p);
            }
        }
        b.put("textures", new Property("textures", TEXTURES_VALUE, TEXTURES_SIGNATURE));
        cir.setReturnValue(new GameProfile(original.id(), original.name(), 
                                           new PropertyMap(b.build())));
    }
}
```

**Langkah-langkah** :
1. **Mixin** pada `Player.getGameProfile()` -- titik di mana profil pemain dikembalikan
2. Memeriksa apakah ini server lokal (Integrated Server)
3. Memeriksa apakah ini host (dunia LAN)
4. **Mengganti** properti `textures` dengan milik Jeb_ (di-hardcode)
5. Mengembalikan `GameProfile` baru dengan tekstur yang diinjeksi

`GameProfile` tersebut **direkayasa** : itu adalah profil yang dibangun secara artifisial, yang tidak sesuai dengan pemain asli. Properti `textures` **diputar ulang** dari Jeb_ -- tanda tangan RSA-nya asli tetapi diterapkan pada profil yang salah. Paket jaringan itu sendiri sah : server mengirim `ClientboundPlayerInfoUpdatePacket` secara normal dengan profil yang dimodifikasi ini. Profillah yang direkayasa, bukan paketnya.

Ketika teman-teman host bergabung melalui LAN, mereka menerima `ClientboundPlayerInfoUpdatePacket` dengan profil yang dimodifikasi. Klien :
1. Mendekode payload base64
2. Memverifikasi tanda tangan RSA → ✅ valid (itu benar-benar milik Jeb_)
3. Menandai skin sebagai `secure=true` (karena tanda tangan valid)
4. Melewati filter `!isRemote || ps.secure()` → ✅ lolos
5. **Mengunduh dan menampilkan cape Jeb_**

## Hasil dalam game : cape di skinmu

Berikut hasilnya di dalam game. Pertama, tampak depan dengan cape Jeb_ yang ditampilkan pada host :

![Cape Mod -- Cape Jeb_ ditampilkan pada host](/images/cape-mod/cape-01-jeb-cape.png)

Terlihat jelas motif merah/putih dari cape resmi Mojang Studios. Tidak ada perbedaan dengan Jeb_ asli yang memiliki cape-nya sendiri -- klien mengunduh tekstur yang persis sama dari `textures.minecraft.net`.

Dan dalam tampilan imersif, di sesi permainan sungguhan :

![Cape Mod -- tampilan dalam game dengan cape terlihat](/images/cape-mod/cape-02-lava-cape.png)

Cape melambai di belakang pemain, bergerak mengikuti gerakan. Sempurna tidak bisa dibedakan dari skin asli dengan cape resmi.

Sudut lain, di dunia dengan lava dan medan :

![Cape Mod -- cape di lingkungan alami](/images/cape-mod/cape-03-local-game.png)

Dan satu tampilan jarak dekat dari gameplay nyata, di mana cape terlihat dalam aksi :

![Cape Mod -- cape dalam gameplay klasik Minecraft](/images/cape-mod/cape-04-real-gameplay.png)

Bagi seseorang yang bergabung ke LAN tanpa tahu bahwa host memiliki mod, sama sekali tidak ada cara untuk membedakan ini dari cape Mojang asli. Itulah tepatnya intinya : **tanda tangan itu valid**, klien tidak punya alasan untuk meragukannya.

## Mengapa ini celah (dan mengapa ini bukan)

Ironisnya : eksploitasi ini berhasil **tepat karena tanda tangan itu valid**. Tidak ada bypass kriptografi di sini -- lebih buruk lagi, ini adalah **celah logika** dalam model kepercayaan.

| Pemeriksaan | Hasil |
|---|---|
| **Validitas tanda tangan RSA** | ✅ Valid (ditandatangani oleh Mojang untuk Jeb_) |
| **Apakah `profileId` dalam payload cocok dengan UUID host?** | ❌ Tidak (UUID Jeb_ ≠ UUID host) |
| **Apakah klien memeriksa kecocokan ini?** | ❌ **Tidak. Hanya tanda tangan RSA yang diperiksa.** |

Minecraft mempercayai **tanda tangan**, bukan identitas orang yang membawanya. Selama tanda tangan berasal dari Mojang, klien menerimanya. Ini seperti menunjukkan paspor palsu yang ditandatangani oleh pemerintah -- stempelnya sah, meskipun paspor itu bukan milikmu.

## Implikasi keamanan

### Jangkauan terbatas pada LAN

Mod ini hanya berfungsi pada server terintegrasi (LAN). Penyerang harus :
- Memasang mod Fabric
- Menjadi host dunia LAN
- Teman-temannya terhubung tanpa mod (vanilla)

### Tapi kemungkinannya meluas

Secara teori, dengan teknik yang sama, seseorang bisa :
- **Menyuntikkan data bertanda tangan lainnya** : kepala, enchantment ilegal, komponen chat berbahaya
- **Menggabungkan dengan tunnel LAN** (NGROK, playit.gg, Radmin VPN) untuk memengaruhi pemain di internet
- **Memperluas ke properti profil lain** yang bergantung pada tanda tangan

### Mengapa Mojang mungkin tidak akan memperbaikinya

Tidak ada "kerentanan" dalam arti sebenarnya -- tanda tangan itu valid. Memperbaiki ini akan mengharuskan Mojang mengubah model autentikasi secara menyeluruh, yang rumit. Untuk saat ini, ini adalah edge case : pemain LAN dianggap saling percaya.

## Perangkap filosofis

Cape Mod adalah **proof of concept** yang sangat baik dari kebenaran yang lebih luas : **kamu tidak boleh pernah mempercayai tanda tangan tanpa memverifikasi siapa yang menandatanganinya dan untuk subjek apa**.

Ini adalah pelajaran dalam kriptografi dasar. RSA menandatangani sebuah **pesan**, bukan sebuah **identitas**. Jika aku memberimu tanda tangan RSA yang valid dari Mojang, kamu tahu bahwa Mojang telah menandatangani *sesuatu*. Kamu tidak tahu untuk siapa, dan kamu tidak bisa menganggapnya hanya dengan melihat pesannya.

Persis seperti apa yang terjadi dengan sertifikat SSL/TLS di tahun 2000-an ketika CA menerima apa saja -- tanda tangan itu valid, tetapi diterapkan pada domain yang salah.

## Kesimpulan

Cape Mod bukanlah peretasan dalam arti klasik -- ini adalah eksploitasi elegan dari kurangnya validasi logika di Minecraft. Ini menunjukkan bahwa :

1. **Tanda tangan yang valid tidak menjamin identitas pembawanya**
2. **Di LAN, kepercayaan lebih lemah** dari yang kita kira
3. **Properti `textures` Minecraft pada dasarnya adalah konten yang diinjeksi** -- kita perlu memverifikasi bahwa properti itu sesuai dengan pemain yang membawanya

Jika kamu bergabung ke dunia LAN di server "yang tidak dikenal" (atau lebih tepatnya, yang host-nya memiliki mod mencurigakan), kamu sudah memiliki masalah keamanan jauh sebelum cape. Tapi ini gejala : Minecraft berasumsi bahwa semua orang di LAN saling percaya. Itu benar... sampai tidak lagi.

---

**Sumber Daya**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Auth Minecraft**: [Protokol Yggdrasil](https://wiki.vg/Authentication) (wiki.vg)
- **Kriptografi RSA**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 Poin Penting**

1. Tanda tangan RSA memvalidasi sebuah pesan, bukan identitas -- detail yang telah merugikan banyak sistem.
2. Minecraft tidak memeriksa apakah profil pemain sesuai dengan tanda tangan yang diterima -- celah logika, bukan kriptografi.
3. Di LAN atau tunnel, semuanya terbuka lebar untuk mod yang mengontrol server terintegrasi.
