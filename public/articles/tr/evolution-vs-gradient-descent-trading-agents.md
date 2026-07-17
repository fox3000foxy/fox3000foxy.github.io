---
title: "Gradyan inişi yerine doğal seçilimle bir sinir ağı evrimleştirdim"
description: "Klasik gradyan inişi eğitimini bir NSGA-II genetik algoritmasıyla değiştirerek DQN alım-satım ajanlarını nasıl evrimleştirdiğim: aşırı uyumdan Lamarckçı ağırlık evrimine dört sürüm"
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
lang: "tr"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "hliDKw4XJ8lf1iZrG5u37rCqnd2umfvsni1ZAN1mp85OCGzj6S2OLOBRb0TK3xqfpfrYBfna1b7UoQsWBLd+HA=="
---

## Sadece gradyan inişinin sorunu

Algoritmik alım-satım için bir DQN ajanını klasik gradyan inişiyle eğitmenin ifade etmesi basit, çözmesi zor bir sorunu vardır: gradyan inişi _tek_ bir ağı _tek_ bir yerel minimuma, _tek_ bir piyasa penceresinde optimize eder. Bu minimumun farklı bir piyasa rejimine genellenebileceğini garanti eden hiçbir şey yoktur ve eğitim döngüsünde çeşitliliği iten hiçbir şey yoktur; farklı tohumlardan başlayan iki çalışma genellikle neredeyse aynı stratejilere ve aynı kör noktalara yakınsar.

Keşfettiğim yanıt: gradyan inişini bir genetik algoritmayla değiştirmek (veya üzerine yerleştirmek). Bir ajanı eğitmek yerine, bir ajan popülasyonunu evrimleştiriyorsunuz; her genom bir mimari ve hiperparametreler kodluyor; doğal seçilim sıralamayı yaparken, gradyan inişi her bireyi kendi yaşam süresi içinde ince ayarlamaya devam ediyor.

Bu koşucu, tek bir yoğun oturumda dört sürümden geçti. Her sürüm, bir öncekindeki yapısal bir kusuru düzeltti.

## v1: saf sürüm ve neden yeterli olmadığı

İlk sürüm, temel bir GA'dan bekleyeceğiniz şeyi yaptı: bir genom popülasyonu, bir uygunluk fonksiyonu, seçilim, çaprazlama, mutasyon, sonraki nesil. Her genom, ağ topolojisini (katman sayısı, genişlik), DQN hiperparametrelerini (öğrenme oranı, epsilon azalması, tekrar oynatma arabelleği boyutu) ve birkaç mimari seçeneği (hangi veri kaynaklarının kullanılacağı, yerleştirme boyutu) kodluyordu.

Ana kusur: uygunluk, eğitim için kullanılan aynı veriler üzerinde hesaplanıyordu. Bir ajan, bir piyasa penceresini tam anlamıyla ezberleyebilir ve genellenebilir bir strateji öğrenmeden mükemmel bir puan alabilirdi. Klasik aşırı uyum, ancak genetik seçilimle güçlendirilmiş; GA bu açıktan en iyi şekilde yararlanan bireyleri aktif olarak seçer.

## v2: eğitim ve değerlendirmeyi ayırma

Bariz düzeltme, aşamaları ayırmaktı: her genom bir piyasa penceresinde eğitilir, ardından eğitim sırasında hiç görülmemiş farklı bir pencerede değerlendirilir. Yalnızca değerlendirme performansı uygunluğa sayılır.

Bu tek değişiklik, ortalama popülasyon uygunluğunun düşmesine neden oldu; bu, v1'de performans gibi görünen şeyin büyük bir kısmının saf ezber olduğunun bir işareti. Görmek acı verici, ancak tam olarak istediğiniz sinyal bu: daha düşük ama dürüst bir puan, şişirilmiş, yanıltıcı olandan daha iyidir.

## v3: NSGA-II ve çok amaçlı uygunluğa geçiş

Tek bir uygunluk puanını (örneğin getirileri) optimize etmek, ajanları mekanik olarak bu tek sayıyı maksimize etmek için aşırı riskler almaya iter. Çözüm, birden çok amacı keyfi bir ağırlıklı toplama indirgemeden eşzamanlı olarak optimize eden NSGA-II'ye (Baskın Olmayan Sıralama Genetik Algoritması II) geçmekti: getiriler, maksimum düşüş, Sharpe oranı, pencereler arası kararlılık.

NSGA-II bir Pareto cephesi oluşturur: bir amacın iyileştirilmesinin diğerini bozmasının mümkün olmadığı genom kümesi. Önceden seçilmiş bir ağırlıklandırma yoluyla tek bir getiri-risk ödünleşimini zorlamak yerine, tüm uzlaşma sınırını tutar ve nihai seçimi açık bırakırsınız.

```
function nonDominatedSort(population: Genome[]): Genome[][] {
  const fronts: Genome[][] = [[]];
  for (const p of population) {
    p.dominationCount = 0;
    p.dominatedSet = [];
    for (const q of population) {
      if (dominates(p, q)) p.dominatedSet.push(q);
      else if (dominates(q, p)) p.dominationCount++;
    }
    if (p.dominationCount === 0) {
      p.rank = 0;
      fronts[0].push(p);
    }
  }
  // ... sonraki cephelerin yinelemeli kaldırma ile oluşturulması
  return fronts;
}
```

v3'teki ikinci ekleme: **kalıcı bir Pareto arşivi**. Onsuz, 12. nesilde bulunan iyi bir genom, çaprazlama şansı onu yeniden üretmezse 15. nesilde kaybolabilir; onun yerini alan her şeyden daha iyi kalsa bile. Arşiv, mevcut popülasyondan bağımsız olarak, tüm nesiller boyunca şimdiye kadar karşılaşılan tüm baskın olmayan bireylerin kümesini tutar.

## v4: Lamarckçı evrim ve çevresel çeşitlilik

V3'ün yapısal bir kör noktası vardı: genom mimariyi tanımlıyordu, ancak eğitim sırasında öğrenilen ağırlıklar her yeni nesilde kayboluyordu. İki iyi ebeveynin çaprazlanmasından doğan bir çocuk, onların mimarisini miras aldı, ancak sıfırdan yeniden öğrenmek zorundaydı; ebeveynlerini performanslı yapan ağırlıkların hiçbir izi yoktu.

V4, **Lamarckçı evrimi** getiriyor: eğitilmiş ağırlıklar, eğitimden sonra genoma geri beslenir ve (mutasyonla birlikte) yavrulara iletilir. Bu, kasıtlı bir biyolojik sapkınlıktır; Lamarck canlı organizmalar için yanılmıştı -- edinilmiş karakteristiklerin kalıtımı biyolojide mevcut değildir -- ancak dijital bir GA'nın akıllıca hile yapmasını hiçbir şey engelleyemez: burada, edinilmiş bilgiyi iletmek, yakınsamayı radikal bir şekilde hızlandırır, çünkü her nesil rastgele ağırlıklar yerine zaten bilgilendirilmiş bir başlangıçtan yeniden başlar.

Bu sürümdeki diğer üç yapısal değişiklik:

*   **Çevresel çeşitlilik**: her genom artık tek bir piyasa penceresinde değil, farklı rejimlerden (yükseliş, düşüş, bant) alınan birden çok pencerede değerlendirilir. Bir pencerede mükemmel olan ve diğerinde çöken bir ajan, artık Pareto cephesine hakim olamaz.
    
*   **FLOPs karmaşıklık düzenlileştirmesi**: ağın hesaplama maliyeti (FLOPs cinsinden) NSGA-II'de tam bir amaç haline gelir. Bu, evrimin, haklı bir performans kazancı olmaksızın, yalnızca daha fazla ham kapasiteye sahip oldukları için devasa mimarilere yakınsamasını önler.
    
*   **Ayrıştırılmış `RLBackend` arayüzü**: GA artık DQN ayrıntılarını bilmez. Bir genomu manipüle eder ve soyut bir arayüz aracılığıyla `train()` / `evaluate()` işlevlerini çağırır; bu, teorik olarak, evrim motoruna dokunmadan başka bir RL algoritmasının değiştirilmesine olanak tanır.
    

```
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

Son teknik nokta: değerlendirme, **sınırlı async eşzamanlılığa** geçti; sıralı bir döngü yerine N paralel değerlendirmeden oluşan bir havuz ve mevcut GPU/CPU kaynaklarının doygunluğunu önlemek için açık bir sınır.

## v4'ün pratikte v3'te hangi sorunları düzelttiği

V3 kusuru V4 düzeltmesi Her nesilde kaybedilen ağırlıklar Eğitilmiş ağırlıkların Lamarckçı yeniden enjekte edilmesi Tek bir piyasa penceresine aşırı uyum Birden çok pencerede, çeşitli rejimlerde değerlendirme Sınırsız büyüyen mimariler Açık Pareto hedefi olarak FLOPs GA'nın DQN ayrıntılarına bağlı olması Soyut `RLBackend` arayüzü Yavaş sıralı değerlendirme Sınırlı async eşzamanlılık

V4 ayrıca on somut API "temel" hatasını düzeltti; GA kodunun, gerçek uygulamayla tam olarak eşleşmeyen bir `TradingAgent` arayüzü varsaydığı durumlar. Bu tür hatalar, kodu gerçek ajan kaynağıyla karşılaştırana kadar görünmezdir: v4, yalnızca gerçek dosyaya karşı satır satır yeniden okuma yapıldıktan sonra doğrulandı.

## Neden birini seçmek yerine hem evrimi hem de gradyanı karıştırmalı

Neden sadece saf RL veya NEAT gibi saf evrim kullanmadığınızı merak edebilirsiniz. Cevap tek bir cümle: gradyan, yerel ince ayar için mükemmeldir (sürekli ağırlıkları yakındaki bir optimuma ayarlamak), evrim ise küresel keşif için mükemmeldir (gradyanın ulaşamayacağı mimarileri ve hiperparametre kombinasyonlarını keşfetmek, çünkü ayrık arama uzayı türevlenebilir değildir). Birini diğeri olmadan kullanmak, iki keşif biçiminden birini kendinizden mahrum bırakmak anlamına gelir.

Bedeli mühendislik karmaşıklığıdır; dört sürüm bir lüks değil, GA+RL döngüsünün kendini sabote etmeyi (aşırı uyum, iyi bireylerin kaybı, edinilmiş ağırlıkların kaybı) durdurması için gereken yineleme sayısıydı. Ancak sonuç, değerlendirilen her aday için gradyan inişinin yerel verimliliğini korurken, basit bir hiperparametre ızgara aramasından çok daha geniş bir tasarım alanını keşfeden bir sistemdir.

## Sonraki adım

Bu tek seviyeli evrimsel mimari (düz bir DQN genom popülasyonu), kapsanacak varlık sayısı arttığında sınırlarına ulaşır. Bu, üç seviyeli bir hiyerarşik mimariye (Varlık Analistleri → Sektör Yöneticileri → Portföy Tahsis Edici) geçişi motive etti ve her seviyede bağımsız olarak çalışan bir GA ile... ancak bu başka bir makalenin konusu.
