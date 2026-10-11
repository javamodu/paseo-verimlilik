# Paseo Verimlilik

Ajan verimlilik sözleşmesini (PASEO-VERIMLILIK-REHBERI ÇEKİRDEK v2.0) her yeni ajana otomatik enjekte eder ve çalışma disiplinini mekanik kancalarla korur.

## Ne yapar

- **Enjeksiyon:** yeni ajan oluşturulurken systemPrompt başına sözleşme çekirdeği + proje katmanı işaretçileri (ANAYASA, AGENTS, STATE_BOARD, DERSLER, CODEMAP, plans/handoff son dosya adı). Sabit içerik başta kalır — önbellek dostudur. Toplam enjeksiyon 20 KB bütçeyle sınırlıdır; aktif kural sayısı 80'i aşarsa enjeksiyon engellenir (lint kaydı), 40'ı aşarsa uyarı düşülür.
- **Geçiş + ekranlar:** Command Center'dan tek ajana veya workspace'teki tüm ajanlara sözleşme gönderimi (sozlesme.enjekte); telemetri özeti ve öz-değerlendirme ekranları (10 sn'de bir tazelenir).
- **Telemetri:** her tur bitiminde `.verimlilik/telemetri.jsonl` — tur sayısı/süresi, araç çağrısı sayımları, token + önbellek isabeti (sağlayıcı raporluyorsa), dürtme kayıtları, kabul/ret ve anlaşılmazlık sinyalleri, paralellik aşımı (>3 eşzamanlı tur). Komut metinleri ve çıktılar kaydedilmez (redaksiyon).
- **Loop dedektörü:** aynı araç+argüman üç kez tekrarlanırsa ya da A-B-A-B deseni görülürse strateji-değiştir dürtmesi; 2 ardışık dürtmeden sonra susar.
- **Finish-gate:** ajan "bitti" iddiasını exit-code 0 ile biten doğrulama komutu olmadan raporlarsa kanıt ister (yalnız edit'li turlarda); 2 ardışıkta susar.
- **Pitbull (iki sınıf):** önceki tur editliyse yazıcı sınıfı — 15 dk'da "yazım kümesi sessiz, sessiz ölüm şüphesi" dürtmesi; değilse okuyucu sınıfı — 20 dk eşik (yanlış-pozitif koruması). Cooldown 10 dk; 3 ardışık stall → insan kapısı.
- **Permission polisi:** salt-okuma komutlara otomatik allow, tehlikeli kalıplara deny (rm -rf, force push, reset --hard, rd /s, git clean -f*, git checkout --, Format-Volume, DROP TABLE...); zincir/redirect içeren komutlara dokunmaz (bypass önleme). Kararlar telemetriye komut-adı-only yazılır.
- **Kapsam lint:** tur başına 3'ten fazla biricik dosya düzenlenirse kapsam dürtmesi (cooldown'lu).
- **Brief lint:** zayıf delegasyon brief'lerini (4+2 öğe-anahtarı eksik) geriye dönük tespit edip dürtür.
- **Onboarding + echo kapısı:** L0/L1/L5 yoksa ilk-15-dakika iskeleti dürtmesi; handoff varsa ilk turda echo üçlüsü doğrulaması (eksikse tek dürtme).
- **Kabul / anlaşılmazlık sinyali:** edit'li tamamlanmış turdan sonra ret desenli kullanıcı mesajı önceki turu reddedilmiş sayar; karışıklık deseni (karışık/anlaşılmadı/net değil...) ayrı sayaca düşer (T — desen tabanlı yaklaşık ölçüm; Unicode-sınır güvenli).

## Neyi okur, neye müdahale eder

Okur: ajan çalışma dizinindeki kural dosyaları (sayım/işaretçi için), `.verimlilik/telemetri.jsonl`, `raporlar/oz-degerlendirme/`, `surumler/`. Yazar: `.verimlilik/telemetri.jsonl`. **Müdahale eder: permission isteklerine allow/deny yanıtı verir ve ajana dürtme mesajları gönderir — salt-okur değildir.** Ağa istek atmaz, kimlik bilgisi okumaz.

## Sınırlar

- Enjeksiyon yalnızca yeni ajanlarda otomatiktir; süren oturumlara Command Center öğesiyle gönderilir (konuşmaya mesaj olarak — açık oturumun systemPrompt'u değiştirilemez).
- Kabul/anlaşılmazlık sinyalleri desen tabanlıdır (T) — tek tek kayıtlara değil trende bakılır.
- Shell dışı araçlar (edit/write) permission polisinin kapsamı dışındadır — bilinen kör alan.
- Token telemetrisi sağlayıcının raporladığı `lastUsage` alanına bağlıdır; raporlamayan sağlayıcıda alan boş kalır.
- Daemon 0.11.2 ve üzeri gerekir.
