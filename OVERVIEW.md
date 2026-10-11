# Paseo Verimlilik

Ajan verimlilik sözleşmesini (PASEO-VERIMLILIK-REHBERI ÇEKİRDEK v2.0) her yeni ajana otomatik enjekte eder ve çalışma disiplinini mekanik kancalarla korur.

## Ne yapar

- Yeni ajan oluşturulurken systemPrompt başına sözleşme çekirdeğini ve proje katmanı işaretçilerini (ANAYASA, AGENTS, STATE_BOARD, DERSLER, CODEMAP, plans/handoff) ekler. Sabit içerik başta kalır; önbellek dostudur. Toplam enjeksiyon 20 KB bütçeyle sınırlıdır; aktif kural sayısı 80'i aşarsa enjeksiyon engellenir, 40'ı aşarsa uyarı düşülür.
- Mevcut ajanlara geçiş için Command Center üzerinden tek ajana veya workspace'teki tüm ajanlara sözleşme gönderir (sozlesme.enjekte).
- Her tur bitiminde ajan çalışma dizininde `.verimlilik/telemetri.jsonl` dosyasına redaksiyonlu kayıt yazar: tur sayısı, araç çağrısı sayımları, token ve önbellek isabeti (sağlayıcı raporluyorsa), loop ve finish-gate dürtmeleri. Komut metinleri ve çıktılar kaydedilmez, yalnızca sayımlar tutulur.
- Loop dedektörü: aynı araç ve argüman üç kez tekrarlanırsa ya da A-B-A-B deseni görülürse ajana strateji değiştirme dürtmesi gönderir. Ardışık iki dürtmeden sonra susar ve insan kapısı için log düşer.
- Finish-gate: ajan "bitti" benzeri bir iddiayı exit-code 0 ile biten bir doğrulama komutu olmadan raporlarsa kanıt ister. Ardışık iki dürtmeden sonra susar.
- Kabul oranı takibi: düzenleme içeren tamamlanmış bir turdan sonra gelen kullanıcı mesajı ret desenleri taşıyorsa önceki turu reddedilmiş sayar (T; desen tabanlı yaklaşık ölçüm).

## Neyi okur, neyi yazar

Okur: ajan çalışma dizinindeki ANAYASA.md, AGENTS.md ve kural sayımı için içerikleri. Yazar: yalnızca `.verimlilik/telemetri.jsonl`. Ağa istek atmaz, kimlik bilgisi okumaz.

## Sınırlar

- Enjeksiyon yalnızca yeni ajanlarda otomatiktir; süren oturumlara Command Center öğesiyle gönderilir.
- Token telemetrisi sağlayıcının raporladığı `lastUsage` alanına bağlıdır; raporlamayan sağlayıcıda alan boş kalır.
- Daemon 0.11.2 ve üzeri gerekir.