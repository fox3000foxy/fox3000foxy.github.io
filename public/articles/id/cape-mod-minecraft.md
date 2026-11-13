---
title: "Cape Mod : cara mencuri cape Jeb_ dengan injeksi tanda tangan RSA"
description: "Mod Fabric yang mengeksploitasi cacat logika dalam sistem kepercayaan Minecraft : tanda tangan RSA valid dari Mojang tapi di replay pada akun yang salah. Penjelasan kode, implikasi keamanan, dan pelajaran kriptografis."
date: 2026-07-11
tags:
  - minecraft
  - fabric
  - java
  - security
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "e08KFoVYS1MKAhOUmumbjutupLt1K/rKFdqmS+BW/3YwbiVAOdCKQz63PAkyp8QRV7mWMtY/qbT6HKDx6slS+Q=="
---

# Cape Mod : cara mencuri cape Jeb_ dengan injeksi tanda tangan RSA

![alt text](assets/xbox-profile.png)

Bagaimana kalau saya bilang bahwa satu tanda tangan RSA valid saja sudah cukup -- tapi untuk **akun yang salah** -- untuk membuat teman-temanmu percaya kamu memakai cape resmi Mojang? Selamat datang di `cape-mod`, exploit Fabric yang menunjukkan bagaimana Minecraft memercayai tanda tangan sambil lalai memverifikasi bahwa profil miliknya memang milikmu.

## Konteksnya : cara Minecraft mengelola skin dan cape

Di Java Edition, ada pertanyaan yang jarang diajukan : **siapa yang bertanggung jawab menampilkan skin dan cape pemain -- klien atau server?**

Jawabannya bernuansa :

| Komponen | Siapa yang mengirim? | Siapa yang mengunduh? |
|---|---|---|
| **Tekstur skin** | Server mengirim URL bertanda tangan | Klien mengunduh dari `textures.minecraft.net` |
| **Tekstur cape** | Server mengirim URL bertanda tangan | Klien mengunduh dari `textures.minecraft.net` |
| **Properti `textures`** | Server mengirim `GameProfile` dari auth Mojang | Klien memverifikasi tanda tangan RSA |

Poin kunci : semuanya terkandung dalam properti bernama `textures` dari `GameProfile`. Properti ini berisi :
- Payload JSON dalam base64 berisi URL tekstur
- **Tanda tangan RSA** yang dibuat dengan kunci privat Mojang

## Tembok tanda tangan RSA

Setiap properti `textures` tampak seperti ini setelah didekode :

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

Klien memverifikasi tanda tangan RSA terhadap **kunci publik yang tertanam di jar** (`yggdrasil_session_pubkey.der`) :

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

Untuk pemain jarak jauh (di luar permainan lokal), klien hanya menerima skin yang **ditandai `secure`** -- yaitu dengan tanda tangan valid :

```java
// SkinManager.createLookup() -- disederhanakan
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← pemain jarak jauh harus aman
    .orElse(defaultSkin);
```

Cek ini memblokir spoofing secara teori. Tapi validasi berhenti di situ, dan tepat di sanalah serangan dimulai.

## Cacatnya : replay tanda tangan

Klien memverifikasi bahwa tanda tangan RSA **valid**. Ia secara sistematis lalai memverifikasi bahwa `profileId` di dalam JSON cocok dengan UUID nyata pemain.

Dengan kata lain : properti `textures` yang diambil dari **akun Mojang yang sudah ada** (misalnya milik karyawan Mojang) bisa di replay pada pemain lain mana pun. Tanda tangannya tetap valid -- ia memang benar-benar diproduksi oleh Mojang -- hanya saja berasal dari akun lain.

### Cara mengekstrak tanda tangan asli?

Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) punya cape Mojang Studios. Dari server sesi Mojang :

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

Respons :

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

`signature` dari kolom `value` ini diproduksi oleh Mojang. Ini RSA-2048 SHA-1. Ia **mutlak** valid, bahkan kalau kamu replay pada UUID lain -- karena tanda tangan Jeb_ tetap tanda tangan Jeb_, dan klien lalai mengontrol untuk siapa ia ditujukan.

## Kodenya : cara mod bekerja

Mod `cape-mod` mungil -- 65 baris Java. Berikut intinya :

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

        // Mengganti properti textures dengan milik Jeb_
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

**Langkahnya** :
1. **Mixin** pada `Player.getGameProfile()` -- titik di mana profil pemain dikembalikan
2. Memeriksa bahwa ini server lokal (Integrated Server)
3. Memeriksa bahwa ini host (LAN world)
4. **Mengganti** properti `textures` dengan milik Jeb_ (hardcoded)
5. Mengembalikan `GameProfile` baru dengan tekstur yang disuntikkan

Jadi `GameProfile` itu **dipalsukan** : profil yang dibangun artifisial, yang tidak cocok dengan pemain sebenarnya. Properti `textures` **di replay** dari Jeb_ -- tanda tangan RSA otentik tapi diterapkan pada profil yang salah. Paket jaringannya sah : server mengirim normal `ClientboundPlayerInfoUpdatePacket` dengan profil yang diubah ini. Profilnyalah yang dipalsukan ; paketnya tetap sah.

Ketika teman-teman host bergabung lewat LAN, mereka menerima `ClientboundPlayerInfoUpdatePacket` dengan profil yang diubah. Klien :
1. Mendekode payload base64
2. Memverifikasi tanda tangan RSA → ✅ valid (memang milik Jeb_)
3. Menandai skin sebagai `secure=true` (karena tanda tangannya valid)
4. Lolos filter `!isRemote || ps.secure()` → ✅ lolos
5. **Mengunduh dan menampilkan cape Jeb_**

## Hasil dalam permainan : cape pada skinmu

Begini tampilannya in-game. Pertama, tampak depan dengan cape Jeb_ ditampilkan pada host :

![Cape Mod -- cape Jeb_ ditampilkan pada host](/images/cape-mod/cape-01-jeb-cape.png)

Motif merah/putih cape resmi Mojang Studios terlihat jelas. Rendernya tetap identik dengan Jeb_ asli yang memakai capenya sendiri -- klien mengunduh tepat tekstur yang sama dari `textures.minecraft.net`.

Dan dalam tampilan imersif, dalam permainan sungguhan :

![Cape Mod -- tampak dalam permainan dengan cape terlihat](/images/cape-mod/cape-02-lava-cape.png)

Cape berkibar di belakang pemain, bergelombang mengikuti gerakan. Sempurna tidak bisa dibedakan dari skin otentik dengan cape resmi.

Sudut lain, di dunia dengan lava dan medan :

![Cape Mod -- cape di lingkungan alami](/images/cape-mod/cape-03-local-game.png)

Dan satu tampilan dekat terakhir dari gameplay nyata, di mana cape terlihat beraksi :

![Cape Mod -- cape dalam gameplay Minecraft klasik](/images/cape-mod/cape-04-real-gameplay.png)

Bagi seseorang yang bergabung ke LAN tanpa tahu host memakai mod, cape tetap terlihat identik dengan cape Mojang asli. Tepat itulah poinnya : **tanda tangannya valid**, jadi klien memperlakukannya sebagai sah.

## Kenapa ini cacat (dan kenapa bukan)

Ironisnya : exploit berfungsi **tepat karena tanda tangannya valid**. Ini soal lain daripada bypass kriptografis -- lebih buruk : **cacat logika** dalam model kepercayaan.

| Cek | Hasil |
|---|---|
| **Validitas tanda tangan RSA** | ✅ Valid (ditandatangani oleh Mojang untuk Jeb_) |
| **Apakah `profileId` dalam payload cocok dengan UUID host?** | ❌ Tidak (UUID Jeb_ ≠ UUID host) |
| **Apakah klien memverifikasi kecocokannya?** | ❌ **Tidak. Hanya tanda tangan RSA yang diverifikasi.** |

Minecraft memercayai **tanda tangan** alih-alih identitas pembawanya. Selama tanda tangan berasal dari Mojang, klien menerimanya. Seperti menunjukkan paspor palsu yang dicap pemerintah -- capnya sah, meski paspor bukan milikmu.

## Implikasi keamanan

### Cakupan terbatas pada LAN

Mod hanya berfungsi pada server terintegrasi (LAN). Penyerang harus :
- Memasang mod Fabric
- Menjadi host dunia LAN
- Teman-temannya terhubung tanpa mod (vanilla)

### Tapi kemungkinannya meluas

Secara teori, dengan teknik yang sama, orang bisa :
- **Menyuntik ulang data bertanda tangan lain** : heads, enchantment ilegal, komponen chat berbahaya
- **Menggabung dengan tunnel LAN** (NGROK, playit.gg, Radmin VPN) untuk memengaruhi pemain di internet
- **Memperluas ke properti lain** dari profil yang bergantung pada tanda tangan

### Kenapa Mojang mungkin tidak akan menambal

Ini soal lain daripada "kerentanan" dalam arti sempit -- tanda tangannya valid. Menambalnya menuntut Mojang mengubah model autentikasi lengkap, yang rumit. Untuk sekarang, ini kasus batas : pemain LAN diasumsikan saling percaya.

## Jebakan filosofis

Cape Mod adalah **proof of concept** yang bagus untuk kebenaran yang lebih luas : **kamu harus selalu memverifikasi siapa menandatangani sebuah data dan untuk subjek apa sebelum memercayainya**.

Ini pelajaran kriptografi dasar. RSA menandatangani sebuah **pesan** ; **identitas** penerima tetap di luar tanda tangan. Kalau saya memberimu tanda tangan RSA valid dari Mojang, kamu hanya tahu Mojang menandatangani *sesuatu*, tanpa indikasi andal tentang penerima hanya dari pesannya.

Tepat inilah yang terjadi dengan sertifikat SSL/TLS di tahun 2000-an ketika CA menandatangani sertifikat tanpa memverifikasi domain dengan benar -- tanda tangannya valid, tapi diterapkan pada domain yang salah.

## Kesimpulan

Cape Mod soal lain daripada hack dalam arti klasik -- ini eksploitasi elegan atas kurangnya validasi logika di Minecraft. Ia menunjukkan bahwa :

1. **Tanda tangan valid tidak menjamin identitas pembawanya**
2. **Di LAN, kepercayaan lebih lemah** daripada yang dikira
3. **Properti `textures` Minecraft pada dasarnya konten yang disuntikkan** -- harus diverifikasi bahwa mereka cocok dengan pemain yang membawanya

Kalau kamu bergabung ke dunia LAN di server "tidak dikenal" (atau lebih tepatnya, yang hostnya punya mod mencurigakan), kamu sudah punya masalah keamanan jauh sebelum cape. Tapi ini revelator : Minecraft mengasumsikan semua orang di LAN saling percaya. Itu benar... sampai host pertama menyalahgunakan kepercayaan itu.

---

**Sumber daya**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft auth**: [Yggdrasil protocol](https://wiki.vg/Authentication) (wiki.vg)
- **RSA cryptographie**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 poin kunci**

1. Tanda tangan RSA memvalidasi pesan alih-alih identitas -- detail yang merugikan banyak sistem.
2. Minecraft lalai memverifikasi bahwa profil pemain cocok dengan tanda tangan yang diterimanya -- cacat logika dalam validasi, dengan kriptografi yang utuh.
3. Di LAN atau tunnel, semuanya open bar untuk mod yang mengendalikan server terintegrasi.
