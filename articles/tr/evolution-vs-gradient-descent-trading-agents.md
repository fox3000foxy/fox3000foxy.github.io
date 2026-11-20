---
title: "Bir sinir ağını gradyan inişi yerine doğal seçilimle evrimleştirdim"
description: "Klasik gradyan inişli eğitimi, alım satım DQN ajanlarını evrimleştirmek için NSGA-II genetik algoritmasıyla nasıl değiştirdim: aşırı uyumdan ağırlıkların lamarkçı evrimine dört sürüm."
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "eKEz5iw6X1JyuA2jGFWsXMO1HCPthKkWR9dkUDUBDGR5WNW4Fs7gDzM+5nDANf6bNzrde1l5nTYERvLQes4YTw=="
---

## Yalnızca gradyan inişiyle ilgili sorun

Algoritmik alım satım için bir DQN ajanını klasik gradyan inişiyle eğitmek, söylemesi kolay çözmesi zor bir sorun koyar: gradyan _bir_ ağı _bir_ yerel minimuma, _bir_ piyasa penceresinde optimize eder. Bu minimumun farklı bir piyasa rejimine genelleneceğinin garantisi yoktur ve eğitim döngüsündeki hiçbir şey çeşitliliği teşvik etmez; farklı tohumlardan başlayan iki run genelde neredeyse aynı stratejilere, aynı kör noktalarla yakınsar.

Keşfettiğim yanıt: gradyan inişini genetik bir algoritmayla değiştirmek (daha doğrusu üst üste koymak). Tek bir ajan eğitmek yerine bir ajan popülasyonu evrimleştirilir; her biri mimari ve hiper parametreleri kodlayan bir genomdur; her birey kendi ömrü içinde gradyanla ince ayarlanmaya devam ederken ayıklamayı doğal seçilim yapar.

Bu koşucu tek bir yoğun çalışma oturumunda dört sürümden geçti. Her biri öncekinin yapısal bir kusurunu düzeltti.

## v1: naif sürüm ve neden yetmediği

İlk sürüm temel bir GAdan bekleneni yapıyordu: bir genom popülasyonu, bir fitness fonksiyonu, seçilim, çaprazlama, mutasyon, sonraki nesil. Her genom ağ topolojisini (katman sayısı, genişlik), DQN hiper parametrelerini (öğrenme hızı, epsilon azalması, tekrar tamponu boyutu) ve birkaç mimari seçimi (hangi veri kaynaklarını tüketmek, gömme boyutu) kodluyordu.

Ana kusur: fitness eğitimle aynı veriler üzerinde hesaplanıyordu. Bir ajan bir piyasa penceresini kelimenin tam anlamıyla ezberleyip genellenebilir bir strateji öğrenmeden mükemmel bir skor alabiliyordu. Klasik aşırı uyum ama genetik seçilimle güçlendirilmiş; GA aktif olarak bu açığı en iyi suistimal eden bireyleri seçer.

## v2: eğitim ve değerlendirmeyi ayırmak

Bariz düzeltme fazları ayırmaktı: her genom bir piyasa penceresinde eğitilir, sonra eğitimde hiç görülmemiş farklı bir pencerede değerlendirilir. Fitness için yalnızca değerlendirme performansı sayılır.

Yalnızca bu değişiklik popülasyonun ortalama fitnessını düşürdü; v1de performans gibi görünen şeyin iyi bir kısmının saf ezber olduğunun işareti. Görmesi acı verici ama tam istediğimiz sinyal bu: daha düşük ama dürüst bir skor, şişirilmiş ve yanıltıcı bir skordan iyidir.

## v3: NSGA-IIye ve çok amaçlı fitnessa geçiş

Tek bir fitness skorunu (örneğin getiriyi) optimize etmek mekanik olarak bu tek sayıyı maksimize etmek için aşırı risk alan ajanlara iter. Çözüm, keyfi ağırlıklı bir toplama indirgemeden birden çok hedefi aynı anda optimize eden NSGA-IIye (Non-dominated Sorting Genetic Algorithm II) geçmekti: getiri, maksimum drawdown, Sharpe oranı, pencereler arası kararlılık.

NSGA-II bir Pareto cephesi inşa eder: bir hedefte başka bir hedefi bozmadan iyileştirmenin mümkün olmadığı genomlar kümesi. Getiri ve risk arasında önceden seçilmiş bir ağırlıkla tek bir uzlaşma dayatmak yerine tüm uzlaşma sınırını tutar ve nihai seçimi açık bırakır.

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
  // ... sonraki cephelerin yinelemeli çıkarımla inşası
  return fronts;
}
```

v3ün ikinci eklemesi: kalıcı bir **Pareto arşivi**. O olmadan 12. nesilde bulunan iyi bir genom, çaprazlama şansı onu yeniden üretmezse 15. nesilde kaybolabilir; yerini alan her şeyden hâlâ daha iyi olsa bile. Arşiv, mevcut popülasyondan bağımsız olarak tüm nesiller boyunca karşılaşılan baskın olmayan bireylerin kümesini korur.

## v4: lamarkçı evrim ve çevresel çeşitlilik

v3ün yapısal bir kör noktası vardı: genom mimariyi tanımlıyordu ama eğitimde öğrenilen ağırlıklar her yeni nesilde kayboluyordu. İyi iki ebeveynin çaprazlamasından doğan bir yavru mimarilerini kalıtıyordu ama sıfırdan yeniden öğrenmek zorundaydı; ebeveynlerini performanslı kılan ağırlıklardan iz yoktu.

v4 **lamarkçı evrimi** getirir: eğitilmiş ağırlıklar eğitimden sonra genoma geri enjekte edilir ve yavruya (mutasyonla) aktarılır. Bu üstlenilmiş bir biyolojik sapkınlıktır; Lamarck canlı organizmalar için haksızdı, kazanılmış karakterlerin kalıtımı biyolojide yoktur; ama sayısal bir GAnın zekice hile yapmasına hiçbir şey engel değil: burada kazanılmışı aktarmak yakınsamayı kökten hızlandırır çünkü her nesil rastgele ağırlıklar yerine zaten bilgili bir başlatma noktasından başlar.

Bu sürümde üç yapısal değişiklik daha:

*   **Çevresel çeşitlilik**: her genom artık tek bir piyasa penceresinde değil, farklı rejimlerden çekilmiş birkaç pencerede değerlendirilir (yükselen, düşen, yatay). Bir pencerede parlayıp diğerinde çöken bir ajan Pareto cephesine artık hükmedemez.
    
*   **FLOPs karmaşıklığıyla düzenlileştirme**: ağın hesaplama maliyeti (FLOPs cinsinden) NSGA-II içinde başlı başına bir hedef olur. Bu, evrimin sırf ham kapasitesi daha fazla diye devasa mimarilere, performans kazancıyla haklı çıkarmadan yakınsamasını engeller.
    
*   Ayrıştırılmış `RLBackend` **arayüzü**: GA artık DQN detaylarını bilmez. Bir genomu yönetir ve soyut bir arayüz üzerinden `train()` / `evaluate()` çağırır, bu da teoride evrimsel motora dokunmadan başka bir RL algoritması takmaya izin verir.
    

```
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

Son teknik nokta: değerlendirme **sınırlı eşzamanlı eşzamanlılığa** geçti; sıralı bir döngü yerine paralel N değerlendirmeden bir havuz ve mevcut GPU/CPU kaynaklarını doyurmamak için açık bir limit.

## v4ün pratikte v3e göre düzelttiği şey

v3 kusuru v4 düzeltmesi Her nesilde kaybolan ağırlıklar Eğitilmiş ağırlıkların lamarkçı geri enjeksiyonu Tek piyasa penceresine aşırı uyum Çeşitli rejimlerde çok pencereli değerlendirme Kısıtsız büyüyen mimariler Açık Pareto hedefi olarak FLOPs DQN detaylarına bağlı GA Soyut `RLBackend` arayüzü Yavaş sıralı değerlendirme Sınırlı eşzamanlı eşzamanlılık

v4 ayrıca on somut "grounding" API hatasını düzeltti; GA kodunun `TradingAgent` için gerçek uygulamayla tam örtüşmeyen bir arayüz varsaydığı durumlar. Bu tür hata kod gerçek ajan kaynak koduyla yüzleşene kadar görünmezdir: v4 yalnızca gerçek dosya karşısında satır satır yeniden okuduktan sonra doğrulandı.

## Evrim ve gradyanı birini seçmek yerine neden karıştırmalı

Neden saf RL ya da NEAT tarzı saf evrim yapmıyoruz diye sorulabilir. Yanıt tek cümlede: gradyan yerel ince ayar için mükemmeldir (sürekli ağırlıkları yakın bir optimuma ayarlamak), evrim küresel keşif için mükemmeldir (hiçbir gradyanın ulaşamayacağı mimarileri ve hiper parametre kombinasyonlarını keşfetmek, çünkü ayrık arama uzayı türevlenebilir değildir). Birini diğer olmadan kullanmak iki keşif biçiminden birinden mahrum kalmaktır.

Ödenecek bedel mühendislik karmaşıklığıdır; dört sürüm lüks değildi, GA + RL döngüsünün kendini sabote etmeyi bırakması için gereken yineleme sayısıydı (aşırı uyum, iyi bireylerin kaybı, kazanılmış ağırlıkların kaybı). Ama sonuç, basit bir hiper parametre grid searchten çok daha geniş bir tasarım uzayını keşfeden, değerlendirilen her aday için gradyanın yerel verimliliğini koruyan bir sistemdir.

## Sonraki adım

Bu tek seviyeli evrimsel mimari (düz bir DQN genom popülasyonu) kapsanacak varlık sayısı arttığında sınırlarına ulaşır. Üç seviyeli hiyerarşik bir mimariye geçişi motive eden şey bu (Varlık Analistleri → Sektör Yöneticileri → Portföy Tahsisçisi), her seviyede bağımsız çalışan bir GA ile... ama o başka bir yazının konusu.
