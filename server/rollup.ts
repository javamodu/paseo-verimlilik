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
    "- Ort. cache-hit (token-ağırlıklı): " + (ortCache !== null ? "%" + ortCache : "—"),
    "- Alt-ajan turları: " + altAjanTur + (altAjanTur === 0 ? " (harness spawn'ları bu sayıma girmez — REHBER §8)" : ""),
    "- Kabul kapsamı: " + kabulKapsam,
    deltaSatir,
    "",
  ].join("\n");
  const json = {
    hafta, uretim: simdi.toISOString(), tur, ortTurSn, kabul, ret, kabulOrani,
    loop, finishGate: fg, pitbull, karisiklik, ortCacheHit: ortCache,
    altAjanTur, kabulKayit: kabulToplam, delta: deltaObj,
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(hedefDosya, md, "utf8");
  writeFileSync(join(dir, hafta + ".json"), JSON.stringify(json, null, 2) + "\n", "utf8");
  return hedefDosya;
}
