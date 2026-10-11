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

// Haftada bir kez: .verimlilik/telemetri.jsonl -> raporlar/telemetri-haftalik/<ISO-hafta>.md
// Bu haftanın dosyası varsa atlar (idempotent). Yazılan dosya yolu döner, atlandıysa null.
export function haftalikRollup(cwd: string, simdi = new Date()): string | null {
  const hafta = isoHafta(simdi);
  const dir = join(cwd, "raporlar", "telemetri-haftalik");
  const hedefDosya = join(dir, hafta + ".md");
  if (existsSync(hedefDosya)) return null;
  const tel = join(cwd, ".verimlilik", "telemetri.jsonl");
  if (!existsSync(tel)) return null;

  let tur = 0, kabul = 0, ret = 0, karisiklik = 0, loop = 0, fg = 0, pitbull = 0;
  let turSnToplam = 0, turSnAdet = 0, cacheToplam = 0, cacheAdet = 0;
  for (const satir of readFileSync(tel, "utf8").split(/\r?\n/)) {
    if (!satir.trim()) continue;
    try {
      const r = JSON.parse(satir) as Record<string, unknown>;
      if (r.tip === "tur") {
        tur++;
        if (r.loopDurtme) loop++;
        if (r.finishGateDurtme) fg++;
        if (typeof r.turSn === "number") { turSnToplam += r.turSn; turSnAdet++; }
        const m = typeof r.detay === "string" ? r.detay.match(/cacheHitPct=([\d.]+)/) : null;
        if (m) { cacheToplam += parseFloat(m[1]); cacheAdet++; }
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

  const kabulToplam = kabul + ret;
  const oran = kabulToplam > 0 ? "%" + Math.round((kabul / kabulToplam) * 100) + " (" + kabul + "/" + kabulToplam + ")" : "henüz veri yok";
  const ortTur = turSnAdet > 0 ? Math.round(turSnToplam / turSnAdet) + "sn" : "—";
  const ortCache = cacheAdet > 0 ? "%" + (Math.round((cacheToplam / cacheAdet) * 10) / 10) : "—";
  const md = [
    "# Telemetri Haftalık Özet — " + hafta,
    "",
    "Kaynak: .verimlilik/telemetri.jsonl (mekanik rollup, LLM'siz) · Üretim: " + simdi.toISOString().slice(0, 10),
    "",
    "- Tur: " + tur + " · ort. tur süresi: " + ortTur,
    "- Kabul oranı: " + oran + " (desen tabanlı, T)",
    "- Dürtmeler: loop " + loop + " · finish-gate " + fg + " · pitbull " + pitbull,
    "- Anlaşılmazlık: " + karisiklik,
    "- Ort. cache-hit: " + ortCache,
    "",
  ].join("\n");
  mkdirSync(dir, { recursive: true });
  writeFileSync(hedefDosya, md, "utf8");
  return hedefDosya;
}
