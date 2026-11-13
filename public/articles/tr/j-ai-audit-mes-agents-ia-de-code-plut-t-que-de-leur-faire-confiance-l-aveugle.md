---
title: "Kod yapay zekâsı ajanlarıma körü körüne güvenmek yerine denetledim"
description: "Alım satım platformumun 4. teknik raporunu yazmak için yürütülen iki denetim bana iki ayrı sapmayı nasıl açığa çıkardı: depo bağlam penceresine artık sığmadığı için unutan ajan ve özlülüğe hiçbir şey itmediği için gerekenden on kat fazla kod yazan ajan."
date: 2026-09-15
tags: ["ai", "llm-agents", "code-review", "context-window", "trading", "typescript"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "fgJn7wMR3Nq4D40TfQxEfC1e0RnrwGd86tD0+NQniieQcLrH36cgyS6ErGvly3RsUXuSc0kG9Y9j3FPRLFug7w=="
---

## Tanıdan önce belirti

Platformun teknik raporunun her baskısı mimariyi baştan gezmemi zorunlu kılar: servisler, ajanlar, veri pipelineları. 4. baskıyı hazırlarken deponun hacmi sonunda gözüme battı, oysa onu durmadan kademeli büyürken görüyordum: başlangıçta birkaç bin satıra, 10KB altına sığan depo artık 100MBye ulaşıyor. Platformda ancak biraz fazla özellik vardı. Kodu uygulamak ve düzeltmek için Claude Chat türü ajanlara yaslanmıştım, onlardan ne istediğimi ne de hangi kapsamda istediğimi kesin çerçevelemeden.

Raporu yazmak beni "ilerliyor" modundan çıkıp "gerçekte ne oldu" moduna dönmeye zorladı. Deponun tarihçesinde iki ayrı denetim yaptım. İkisi aynı nedene işaret ediyordu, tamamen farklı iki nedenle.

## Denetim 1: yalan söyleyen bağlam penceresi

İlk denetim, yapay zekâ ajanının aylar boyunca yaptığı düzeltmeleri servis servis geri alıp uygulandıkları anda deponun geri kalanıyla tutarlı olup olmadığını doğrulamaktan ibaretti.

Sürekli dönen kalıp: ajan sorunu yerel düzeltiyordu, gözlerinin önündeki dosya ya da modülde, deponun başka yerindeki eşdeğerini görmeden ya da hatırlamadan. Sonuç: iki serviste hafif farklı yeniden tanımlanmış aynı arayüz, ikinci oluşum istem anında bağlam penceresi dışında kaldığı için yarı uygulanmış yeniden adlandırma, bir modülde uyulan sonraki modülde yoksayılan adlandırma uzlaşımı. Tek başına muhteşem hiçbir şey yok ama onlarca oturumda birikince tam sonraki çalıştırılan aracın ipini kaybettiren yedeklilik ve kod kokuları üretir. Kendi kendini besleyen döngü: depo büyüyüp parçalandıkça ajanın tamamını kafada tutması zorlaşır, düzeltmeler yerelleşir ve kısmi olur, depo büyür.

Sorun ajanın "yalan söylemesi" ya da uydurması değildir; verilen bağlamda sorulan soruya doğru yanıt verir. Sorun çoğu zaman sorunun kapsamını önceden tanımlamamış olmamdır. "Bu yazım hatasını, bu davranışı, bu fonksiyonu düzelt" diyordum, bu hatanın ajanın göremeyeceği deponun başka yerinde eşdeğerleri olup olmadığını sormadan.

## Denetim 2: gevezelik koda dönüşünce

İkinci denetim daha mekanikti: tüm tarihçede `git log --numstat` çalıştırmak, commit başına eklenen satır ve karakterleri toplamak ve dağılıma bakmak.

Eklenen satırda en büyük 30 commit tek başına deponun toplam hacminin açık oransız payını temsil ediyordu. Sistematik aynı commitler eklenen karakterde de en büyük çıkıyordu. Öngörülebilirdi, tek fark bu commitlerin karakter/satır oranı yalnızca satır sayısına bağlı değildi: satırların kendisi daha gevezeydi, fonksiyon adlarıyla yedek gereksiz açıklayıcı yorumlar, çarpanlarına ayrılmak yerine yinelenen daha fazla hata yönetimi bloğu, aynı şeyi üç kez yeniden formüle eden daha fazla docstring ile.

Bu sohbette LLM ile etkileşimde bilinen davranışın doğrudan sonucudur: açık özlülük talimatı olmadan çok konuşma, gerekçelendirme, yorumlama, yeniden formüle etme eğilimindedir. Sohbette bu çıktı jetonlarına mal olur. Kod üretiminde aynı refleks depoda süresiz kalan satırlara dönüşür, kod çalıştığı sürece gerçekten yeniden okunmadan commit commit.

## İki denetim yan yana konunca ne gösterdi

İlk rapor için: servisler arası tutarlılık depoyu tamam tutmaya küçük bağlam penceresinden muzdariptir, bu yerel düzeltmeler, yedeklilikler ve uzlaşım sapmaları doğurur.

İkinci için: `git log --numstat`, çerçevelenmemiş LLMnin varsayılan gevezeliğini gösterir, bu oransız eklenmiş satır ve karakterlere ve az çarpanlarına ayrılmış koda neden olur.

İkisi birleşince yedeklilik ve hacme işaret eder: bu gelecek ajanın kafada tutamayacağı kadar büyük depo verir, bu da ilk denetimin gösterdiği ilk sorunu daha kötüleştirir.

Raporu yazarken beni en çok endişelendiren bu son satır oldu: iki sorun bağlıdır, birbirini besler. Üretilen kod ne geveze, depo o hızlı büyür; ne büyür, ajan onu bağlamda o az tutabilir; ne az tutabilir, düzeltmeleri o yerel ve yedek olur; ne yedek olur, o hacim ekler. Tamamen çerçevesiz ajan kullanımından kaynaklanan olumsuz geri bildirim döngüsü.

## Neden bu belirli bir aracın noktasal hatası değildir

Bu tanıda hiçbir şey belirli model ya da ürüne özgü değildir. Sohbet türü ajan her neyse T anında ona gösterilen üzerinden çalışır ve varsayılan en eksiksiz ve gerekçeli yanıtı üretir. Bu konuşma asistanından tam beklenen davranıştır ve üretim deposuna yazan araç için tam kaçınılacak olan. Sorun araç ile depo arası çerçevelem yokluğundan gelir: dikkate alınacak dosya kapsamı, beklenen çıktı formatı, satır ya da gevezelik bütçesi, yeni bir şey yazmadan önce zaten var olanı kesin alıntılama zorunluluğu.

## O zamandan beri neyi değiştirdim

Mantıklı refleks yazılmış olanı drastik azaltmak olurdu. Kişisel olarak farklı yapmaya karar verdim. Denetimler başka işe yaradı: kod kokularını tespit etmek için kodu taramak ve gerçek sorunların tam nerede olduğunu sınırlamak için kullanmak. Servisler arası tutarsızlıklar, yedeklilikler, ipin kaybolduğu yerler, tahmin etmek yerine. Yazılan kod hacmi anlamlı aynı kalır: geveze olsun olmasın iyi kullanılırsa faydalı kalır. Kaldıraç uymayanı düzeltmek için tam nereye bakılacağını bilmekti, ajanın yazmasını engellemekten çok.

## Sonraki adımlar

Deponun daha küçük ve iyi sınırlı birimlere bölünmesi. Ayrıca yürütme ve belgeleme için üretim korkulukları. Sırayla ortaya çıkan sorun mimari sorusudur: bir kez ayrılıp yine de kararlarını koordine etmesi gereken servisler, bileşenler ve belgeleme düzgün nasıl analiz edilir, eleştirilir ve iletişir, öncekiyle aynı monolite dönmeden.
