import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { katmanKokuBul } from "./sozlesme";
import type { AgentUsage } from "@getpaseo/protocol/agent-types";

export type ModAd = "atolye" | "matbaa" | "cerrah" | "serbest";

export interface Mod {
  ad: ModAd;
  thinking: string | null; // thinkingOptionId onerisi; null = dokunma
  paralellik: number;
  sistemEki: string;
}

// provider-modlar.json'un gomulu hali (K-0018): asset dosyasi yok, tek kaynak TS modulu.
export const MODLAR: Record<ModAd, Mod> = {
  atolye: {
    ad: "atolye",
    thinking: "ultra",
    paralellik: 6,
    sistemEki: "Mod: ATOLYE (sure-bazli limitsiz provider) — ultra thinking, 6'ya kadar paralel ajan, comert baglam oku. Baglam penceresi >%80 dolarsa yeni turda tazele (Context Rot freni). Tamamlanan is icin cift-ajan dogrulama oner (orkestrasyon kullanicida).",
  },
  matbaa: {
    ad: "matbaa",
    thinking: "high",
    paralellik: 2,
    sistemEki: "Mod: MATBAA (istek-bazli gunluk kota) — high thinking, en fazla 2 paralel, tek-atim buyuk paket uret. Dogrulamayi tur sonunda toplu yap; her ara adimda test kosturma (istek tasarrufu).",
  },
  cerrah: {
    ad: "cerrah",
    thinking: "low",
    paralellik: 1,
    sistemEki: "Mod: CERRAH (token-bazli PAYG) — low thinking, tek paralel, CODEMAP→tek dosya diyeti (genis tarama yasak). Hedefli dogrulama: yalniz degisen kapsamin testi kosulur.",
  },
  serbest: {
    ad: "serbest",
    thinking: null,
    paralellik: 1,
    sistemEki: "",
  },
};

export interface ModEslesme { provider: string; modelDeseni: string; mod: ModAd }

// Gomulu varsayilanlar (K-0018 ornekleri): kimi -> atolye, GLM/deepseek -> cerrah.
export const VARSAYILAN_ESLESME: ModEslesme[] = [
  { provider: "codex", modelDeseni: "kimi", mod: "atolye" },
  { provider: "codefast-glm", modelDeseni: "", mod: "cerrah" },
  { provider: "cf-opensource", modelDeseni: "glm|deepseek", mod: "cerrah" },
];

function guvenliRegex(desen: string): RegExp | null {
  if (!desen) return null;
  try { return new RegExp(desen, "i"); } catch { return null; }
}

export function eslesmeOku(cwd: string): ModEslesme[] {
  // ayar.json modlar.eslesmeler EK listesidir (override degil); kullanici kurallari once denenir.
  try {
    const dosya = join(katmanKokuBul(cwd), ".verimlilik", "ayar.json");
    if (!existsSync(dosya)) return VARSAYILAN_ESLESME;
    const ham = JSON.parse(readFileSync(dosya, "utf8")) as Record<string, unknown>;
    const modlar = ham.modlar as Record<string, unknown> | undefined;
    const ek = (modlar?.eslesmeler ?? []) as ModEslesme[];
    const gecerli = ek.filter((e) => e && typeof e.provider === "string" && typeof e.mod === "string" && e.mod in MODLAR);
    return [...gecerli, ...VARSAYILAN_ESLESME];
  } catch {
    return VARSAYILAN_ESLESME;
  }
}

export function modStateYolu(cwd: string): string {
  return join(katmanKokuBul(cwd), ".verimlilik", "mod.json");
}

export function aktifModOku(cwd: string): ModAd | null {
  try {
    const dosya = modStateYolu(cwd);
    if (!existsSync(dosya)) return null;
    const ham = JSON.parse(readFileSync(dosya, "utf8")) as Record<string, unknown>;
    const ad = ham.aktif;
    return typeof ad === "string" && ad in MODLAR ? (ad as ModAd) : null;
  } catch {
    return null;
  }
}

export function aktifModYaz(cwd: string, mod: ModAd | null): void {
  const dosya = modStateYolu(cwd);
  mkdirSync(dirname(dosya), { recursive: true });
  writeFileSync(dosya, JSON.stringify({ aktif: mod, ts: new Date().toISOString() }, null, 2) + "\n", "utf8");
}

export function modCoz(cwd: string, provider: string, model: string | null | undefined): Mod | null {
  const aktif = aktifModOku(cwd);
  if (aktif) return MODLAR[aktif]; // bilincli secim eslemeyi ezer (serbest dahil: notr mod bilgisi telemetride degerli)
  const eslesme = eslesmeOku(cwd).find((e) => {
    if (e.provider !== provider) return false;
    if (!e.modelDeseni) return true;
    const re = guvenliRegex(e.modelDeseni);
    return re !== null && typeof model === "string" && re.test(model);
  });
  return eslesme ? MODLAR[eslesme.mod] : null;
}

export function contextRotOrani(usage: AgentUsage | null): number | null {
  if (!usage?.contextWindowMaxTokens || !usage.contextWindowUsedTokens) return null;
  return usage.contextWindowUsedTokens / usage.contextWindowMaxTokens;
}

// Context Rot freni cooldown (ATOLYE): reload'da sifirlanir — kabul edilebilir (tur basina max 1 durtme).
const rotSonDurtme = new Map<string, number>();

// K-0025 (A2-1): agent.closed sonrasi bellek sizintisini onler.
export function ajanTemizle(agentId: string): void {
  rotSonDurtme.delete(agentId);
}
const ROT_COOLDOWN_MS = 30 * 60 * 1000;
export function rotDurtmeliMi(agentId: string, simdi: number): boolean {
  const son = rotSonDurtme.get(agentId);
  if (son !== undefined && simdi - son < ROT_COOLDOWN_MS) return false;
  rotSonDurtme.set(agentId, simdi);
  return true;
}

export function modDurumOku(cwd: string): { aktif: ModAd | null; eslesmeler: ModEslesme[]; modlar: ModAd[] } {
  return { aktif: aktifModOku(cwd), eslesmeler: eslesmeOku(cwd), modlar: Object.keys(MODLAR) as ModAd[] };
}

export function modAyarla(cwd: string, modAd: string, provider?: string, modelDeseni?: string): { ok: boolean; mesaj: string } {
  if (modAd === "sifirla") {
    aktifModYaz(cwd, null);
    return { ok: true, mesaj: "Aktif mod temizlendi (eslesme varsayilanina donuldu). Yeni ajanlarda etkili." };
  }
  if (!(modAd in MODLAR)) return { ok: false, mesaj: "Bilinmeyen mod: " + modAd + " — gecerli: " + Object.keys(MODLAR).join("/") + "/sifirla" };
  aktifModYaz(cwd, modAd as ModAd);
  let mesaj = "Aktif mod: " + modAd + " (workspace). Yeni ajanlarda etkili; tur ortasi degisim yok.";
  if (provider && modelDeseni !== undefined) {
    try {
      const ayarDosya = join(katmanKokuBul(cwd), ".verimlilik", "ayar.json");
      const ham = existsSync(ayarDosya) ? (JSON.parse(readFileSync(ayarDosya, "utf8")) as Record<string, unknown>) : {};
      const modlar = (ham.modlar ?? {}) as Record<string, unknown>;
      const liste = ((modlar.eslesmeler ?? []) as ModEslesme[]).filter((e) => !(e.provider === provider && e.modelDeseni === modelDeseni));
      liste.push({ provider, modelDeseni, mod: modAd as ModAd });
      modlar.eslesmeler = liste;
      ham.modlar = modlar;
      mkdirSync(dirname(ayarDosya), { recursive: true });
      writeFileSync(ayarDosya, JSON.stringify(ham, null, 2) + "\n", "utf8");
      mesaj += " Eslesme kaydedildi: " + provider + "/" + modelDeseni + " -> " + modAd + ".";
    } catch (error) {
      return { ok: false, mesaj: "Mod ayarlandi ama eslesme yazilamadi: " + String(error) };
    }
  }
  return { ok: true, mesaj };
}
