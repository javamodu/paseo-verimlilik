import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function isoHafta(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const gun = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - gun);
  const yilBasi = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const hafta = Math.ceil(((t.getTime() - yilBasi.getTime()) / 86400000 + 1) / 7);
  return t.getUTCFullYear() + "-W" + String(hafta).padStart(2, "0");
}

// Haftalik rollup: yalniz HEDEF haftanin kayitlari suzulur (P1-4 duzeltmesi).
// Canli hafta dosyasi her turda yeniden yazilir (deterministik); hafta kapaninca dosya donar
// (hedef her zaman simdiki hafta oldugu icin gecmis haftaya bir daha dokunulmaz).
// Yaninda makine-okunur <hafta>.json uretilir. Yazilan md yolu doner; telemetri yoksa null.
export function haftalikRollup(cwd: string, simdi = new Date()): string | null {
  const hafta = isoHafta(simdi);
  const dir = join(cwd, "raporlar", "telemetri-haftalik");
  const hedefDosya = join(dir, hafta + ".md");
  const tel = join(cwd, ".verimlilik", "telemetri.jsonl");
  if (!existsSync(tel)) return null;

  let tur = 0, kabul = 0, ret = 0, karisiklik = 0, loop = 0, fg = 0, pitbull = 0;
  let turSnToplam = 0, turSnAdet = 0, cacheAgirlikli = 0, cacheAgirlik = 0;
  let altAjanTur = 0;
  // K-0032 (v0.19): LOC + rework olcumleri
  let toplamLocDelta = 0, locAdet = 0, toplamEdit = 0, ciftLoc = 0, ciftSn = 0;
  const dosyaTurlari = new Map<string, number[]>();
  for (const satir of readFileSync(tel, "utf8").split(/\r?\n/)) {
    if (!satir.trim()) continue;
    try {
      const r = JSON.parse(satir) as Record<string, unknown>;
      if (typeof r.ts !== "string") continue;
      const tarih = new Date(r.ts);
      if (isNaN(tarih.getTime()) || isoHafta(tarih) !== hafta) continue;
      if (r.tip === "tur") {
        tur++;
        if (r.altAjan) altAjanTur++;
        if (r.loopDurtme) loop++;
        if (r.finishGateDurtme) fg++;
        if (typeof r.turSn === "number") { turSnToplam += r.turSn; turSnAdet++; }
        if (typeof r.locDelta === "number") { toplamLocDelta += r.locDelta; locAdet++; if (typeof r.turSn === "number") { ciftLoc += r.locDelta; ciftSn += r.turSn; } }
        if (Array.isArray(r.editDosyalari)) {
          for (const d of r.editDosyalari) {
            if (typeof d !== "string") continue;
            toplamEdit++;
            const liste = dosyaTurlari.get(d) ?? [];
            liste.push(tarih.getTime());
            dosyaTurlari.set(d, liste);
          }
        }
        if (typeof r.detay === "string") {
          const m = r.detay.match(/cacheHitPct=([\d.]+)/);
          const inn = r.detay.match(/in=(\d+)/);
          if (m) {
            const agirlik = inn ? Math.max(1, parseInt(inn[1], 10)) : 1;
            cacheAgirlikli += parseFloat(m[1]) * agirlik;
            cacheAgirlik += agirlik;
          }
        }
      } else if (r.tip === "kabul") {
        if (r.kabul) kabul++; else ret++;
      } else if (r.tip === "karisiklik") {
        karisiklik++;
      } else if (r.tip === "lint" && typeof r.detay === "string" && r.detay.startsWith("pitbull-durtme")) {
        pitbull++;
      }
    } catch {
      // bozuk satir atlanir
    }
  }

  if (tur === 0 && kabul + ret === 0 && karisiklik === 0) return null;

  const kabulToplam = kabul + ret;
  const kabulOrani = kabulToplam > 0 ? Math.round((kabul / kabulToplam) * 1000) / 10 : null;
  const ortTurSn = turSnAdet > 0 ? Math.round(turSnToplam / turSnAdet) : null;
  const ortCache = cacheAgirlik > 0 ? Math.round((cacheAgirlikli / cacheAgirlik) * 10) / 10 : null;
  // K-0032: ayni dosya 24 saat icinde birden fazla turda editlendiyse rework sayilir.
  let reworkEdit = 0;
  for (const zamanlar of dosyaTurlari.values()) {
    let rework = false;
    for (let i = 0; i < zamanlar.length && !rework; i++) {
      for (let j = i + 1; j < zamanlar.length; j++) {
        if (Math.abs(zamanlar[i] - zamanlar[j]) <= 24 * 3600 * 1000) { rework = true; break; }
      }
    }
    if (rework) reworkEdit += zamanlar.length;
  }
  const reworkOrani = toplamEdit > 0 ? Math.round((reworkEdit / toplamEdit) * 1000) / 1000 : null;
  const saatlikLoc = ciftSn > 0 ? Math.round(ciftLoc / (ciftSn / 3600)) : null; // K-0032 (R3-06): pay=payda ayni alt-kume (locDelta+turSn birlikte)
  const etkinLoc = locAdet > 0 ? Math.round(toplamLocDelta * (1 - (reworkOrani ?? 0))) : null;
  const oran = kabulOrani !== null ? "%" + Math.round(kabulOrani) + " (" + kabul + "/" + kabulToplam + ")" : "henüz veri yok";
  const oncekiHaftaAd = isoHafta(new Date(simdi.getTime() - 7 * 86400000));
  const kabulKapsam = kabulToplam > 0
    ? kabulToplam + " kayıt"
    : tur > 0
      ? "koşul oluşmadı (koşul: editli completed tur + ardışık kullanıcı mesajı; tek-tur ajanlarda oluşmaz)"
      : "—";
  let deltaObj: { tur: number | null; kabulPuan: number | null; pitbull: number | null; cacheHitPuan: number | null } | null = null;
  const oncekiYol = join(dir, oncekiHaftaAd + ".json");
  if (existsSync(oncekiYol)) {
    try {
      const o = JSON.parse(readFileSync(oncekiYol, "utf8")) as Record<string, unknown>;
      const fark = (a: number | null, b: unknown): number | null => (a === null || typeof b !== "number" ? null : Math.round((a - (b as number)) * 10) / 10);
      deltaObj = { tur: fark(tur, o.tur), kabulPuan: fark(kabulOrani, o.kabulOrani), pitbull: fark(pitbull, o.pitbull), cacheHitPuan: fark(ortCache, o.ortCacheHit) };
    } catch { deltaObj = null; }
  }
  const imzali = (n: number | null, birim = ""): string => (n === null ? "—" : (n > 0 ? "+" : "") + n + birim);
  const deltaSatir = deltaObj
    ? "- Önceki haftaya göre (" + oncekiHaftaAd + "): tur " + imzali(deltaObj.tur) + " · kabul " + imzali(deltaObj.kabulPuan, " puan") + " · pitbull " + imzali(deltaObj.pitbull) + " · cache-hit " + imzali(deltaObj.cacheHitPuan, " puan")
    : "- Önceki hafta (" + oncekiHaftaAd + "): veri yok — baz hafta, trend hesaplanamaz";
  const md = [
    "# Telemetri Haftalık Özet — " + hafta,
    "",
    "Kaynak: .verimlilik/telemetri.jsonl (mekanik rollup, LLM'siz; yalnız " + hafta + " kayıtları) · Üretim: " + simdi.toISOString().slice(0, 10),
    "",
    "- Tur: " + tur + " · ort. tur süresi: " + (ortTurSn !== null ? ortTurSn + "sn" : "—"),
    "- Kabul oranı: " + oran + " (desen tabanlı, T)",
    "- Dürtmeler: loop " + loop + " · finish-gate " + fg + " · pitbull " + pitbull,
    "- Anlaşılmazlık: " + karisiklik,
    "- Ort. cache-hit (token-ağırlıklı): " + (ortCache !== null ? "%" + ortCache : "—") + " — formül: Σ(cacheHitPct×in) / Σ(in); in yoksa ağırlık=1 (K-0028, A4-1)",
    "- Alt-ajan turları: " + altAjanTur + (altAjanTur === 0 ? " (harness spawn'ları bu sayıma girmez — REHBER §8)" : ""),
    "- Kabul kapsamı: " + kabulKapsam,
    deltaSatir,
    "- LOC (K-0032): toplam " + (locAdet > 0 ? String(toplamLocDelta) : "\u2014") + " | saatlik " + (saatlikLoc !== null ? String(saatlikLoc) : "\u2014") + " | rework " + (reworkOrani !== null ? "%" + Math.round(reworkOrani * 100) : "\u2014") + " (T: paralel turlerde sisme payi icerir)" + " | etkin " + (etkinLoc !== null ? String(etkinLoc) : "\u2014"),
    "",
  ].join("\n");
  const json = {
    hafta, uretim: simdi.toISOString(), tur, ortTurSn, kabul, ret, kabulOrani,
    loop, finishGate: fg, pitbull, karisiklik, ortCacheHit: ortCache,
    altAjanTur, kabulKayit: kabulToplam, delta: deltaObj,
    toplamLocDelta, saatlikLoc, reworkOrani, etkinLoc,
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(hedefDosya, md, "utf8");
  writeFileSync(join(dir, hafta + ".json"), JSON.stringify(json, null, 2) + "\n", "utf8");
  return hedefDosya;
}
