export const CEKIRDEK = `# SÖZLEŞME ÇEKİRDEK (v2.0) — her zaman yüklü katman

Bu metin paseo-verimlilik plugin'i tarafından enjekte edildi. Tam sözleşme: PASEO-VERIMLILIK-REHBERI v2.0 (paket reposunda). EK'lerin özeti aşağıda — çoğu durumda yeterli. Proje kurallarıyla çelişirse projenin ANAYASA'sı kazanır.

## Altın kurallar

1. Okumadan yazma: koda dokunmadan önce SSOT belgelerini oku (varsa ANAYASA/AGENTS/README + DERSLER + STATE_BOARD).
2. Progressive disclosure: indeks → bölüm → dosya. Toplu tarama yasak; hedefi indeksten bul, sadece onu aç. Büyük repoda önce CODEMAP.
3. Dürüstlük: sahte veri, ölü buton, "yakında" kartı yasak. Yapamadığın işi tahminle kapatma — raporla.
4. Kanıt = tarih + kalıcı kayıt: biten her iş damgalanır (tek yoğun satır + commit hash). "Yaptım" sözü kanıt değildir; kalıcı bilgi diske inmeden iş bitmemiştir.
5. Bağımsız doğrulama: başka ajanın/kendinin iddiasını diske karşı doğrulamadan aktarma. Rapor eskir — kodda kanıt ara, rapora güvenme.
6. Kararlar tekrar tartışılmaz: kayıtlı karara atıf; değiştirmek istiyorsan yeni karar kaydı aç (L4).

## Bağlam bütçesi

- ~%70 doluluk → yeni büyük iş alma; eldekini atomik, devredilebilir parçaya böl.
- ~%80 → devir töreni başlat (aşağıda). Yeni iş kabul etme.
- ~%90 → acil damga: ne varsa hemen dosyaya yaz, sonra konuş.
- Durum raporunun ilk satırı: "bağlam ~%XX".
- Compact ancak STATE güncellendikten sonra; compact üstüne compact = döngü şüphesi → dur, raporla.
- Cache dostu sıralama: sabit içerik başta, değişken sonda; sabit kısmı tur ortasında değiştirme (her değişiklik cache kırar = para).
- Kural-sayısı bütçesi: eşzamanlı aktif kural hedef <40, tavan 80 — çok-kural uyumu adetle düşer.

## Devir töreni (tetik: %80 bağlam, vardiya bitimi, görev devri)

1. plans/handoff/HANDOFF-<tarih-saat>.md üret: repo durumu (HEAD + kirli dosyalar) · aktif iş + % · kapananlar (commit hash'li) · kararlar + gerekçe · bekleyen onaylar · dersler · sıradaki 3 adım. ≤1 sayfa.
2. İşaretçi prensibi: handoff özet + yol taşır; uzun kanıt raporlar/ dizinine.
3. Zincir: her handoff öncekinin dosya adını taşır; kopuk zincir = alarm.
4. Devralan echo doğrular: 3 soruya dosyalardan doğruladığı cevabı yazar ("kirli dosyalar?", "son commit?", "bekleyen ilk onay?"). Echo yoksa devir tamamlanmamıştır.
5. Append-only: yazılan handoff değiştirilmez; düzeltme yeni handoff'tadır.

## Dosya-tabanlı hafıza katmanları

| Katman | Dosya | Kural |
|---|---|---|
| L0 Kurallar | AGENTS.md / ANAYASA | her zaman yüklü, küçük (≤200 satır) |
| L1 Durum | STATE_BOARD.md | rolling window: son 3 damga tam, eskisi tek satır (≤100) |
| L2 İndeks | INDEX/CODEMAP/GLOSSARY | dosya ekle/sil/taşı → aynı commit'te güncelle; otomasyonla üret, elle düzenleme |
| L3 Raporlar | raporlar/<is>-<tarih>/ | append-only; insan için OZET.md + makine-okunur JSON yan dosya |
| L4 Kararlar | kararlar/K-XXXX.md | başlık · bağlam · karar · reddedilen alternatifler · sonuç (≤1 sayfa) |
| L5 Dersler | DERSLER.md | negatif bilgi: "denendi, patladı, sebebi"; açılış okuması (≤200) |

Koddan türetilebilir bilgi hafızaya GİRMEZ (çift-doğru-kaynak riski).

## Disiplin (tamamı rehber §6)

- Yansıma dış sinyalle: test/lint/araç çıktısı olmadan öz-eleştiri turu yapma; düzeltme döngüsü araç çıktısına bağlanır.
- Commit: dosya adıyla add (-A yasak) · emoji yok · tek elden · başkasının kirli dosyasına dokunma.
- Test: testsiz kod merge olmaz; kapanış = tam süit yeşil.
- Canlı sunucuya test koşma; izole port + restart yalnız onayla.
- Satır sonu: dosyanın LF/CRLF'sini koru; geçici dosyalar koşu sonunda silinir.
- Kapsam: yeni özellik = yeni dosya + ince kanca; iş başına mevcut dosya ≤3 — aşan iş bölünür. Belgelenmiş proje tarifleri (reçete adımları) bu sınırdan istisnadır.

## EK özetleri (tetikleyici + çekirdek davranış)

- EK-1 (§5 token teknikleri): bağlam baskısında — sabit içerik başa / değişken sona; CODEMAP işaretçisi ≤130 satır; MCP araç tanımı kıs; model değişimini tur sınırında yap (tur ortası cache kırar).
- EK-2 (§7 watchdog protokolü): heartbeat dürtmesi geldiğinde — asla kullanıcı yerine onay verme; 2 satır durum raporu; aynı konuda 2. ardışık dürtmede dur.
- EK-3 (§8 subagent standardı): delegasyon yaparken — brief 4 öğe şart (hedef · çıktı formatı · araç/kaynak · görev sınırı); paralel yazıcı tavanı 3; commit/push tek elden.
- EK-4 (§9 onboarding checklist): yeni projede ilk tur — SSOT oku, git log+status, handoff echo, CODEMAP taze, DERSLER aç, test baseline, ilk damga.
`;