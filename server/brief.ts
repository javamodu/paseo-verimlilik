import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PluginHookContext } from "@getpaseo/plugin/server";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { katmanKokuBul } from "./sozlesme";
import { telemetriYaz } from "./telemetry";

const MIN_BRIEF_UZUNLUK = 30;
const OGE_ANAHTAR = /\b(Hedef|Cikti|Çıktı|Arac|Araç|Sinir|Sınır|Kabul|Butce|Bütçe)\s*:/gi;

export interface BriefBulgu {
  toplam: number;
  zayif: number;
}

export function briefTara(timeline: readonly AgentTimelineItem[], gorulen?: Set<string>): BriefBulgu {
  let toplam = 0;
  let zayif = 0;
  for (const item of timeline) {
    if (item.type !== "tool_call") continue;
    const detail = item.detail as Record<string, unknown> | undefined;
    if (!detail || detail.type !== "sub_agent") continue;
    const callId = typeof (item as { callId?: unknown }).callId === "string" ? (item as { callId: string }).callId : null;
    const desc = typeof detail.description === "string" ? detail.description : "";
    // BK-01: callId'siz sub_agent kalemleri metin parmak iziyle dedupe'lanir (kirp+uzunluk imzasi).
    const anahtar = callId ? "c:" + callId : "m:" + desc.length + ":" + desc.slice(0, 200);
    if (gorulen?.has(anahtar)) continue;
    if (gorulen) gorulenEkle(gorulen, anahtar);
    toplam++;
    const maddeVar = /(^|\n)\s*[-*\d]+[.)]\s/.test(desc) || desc.includes(" · ") || desc.includes("·");
    const anahtarSayisi = (desc.match(OGE_ANAHTAR) ?? []).length;
    const gucluYapi = maddeVar || anahtarSayisi >= 3;
    if (desc.length < MIN_BRIEF_UZUNLUK || !gucluYapi) {
      zayif++;
    }
  }
  return { toplam, zayif };
}

const durum = new Map<string, number>();
const gorulenler = new Map<string, Set<string>>();

// D2-15: gorulen kumesi ajan omru boyunca sinirsiz buyuyordu - FIFO tavan.
const GORULEN_TAVAN = 500;
const AJAN_TAVAN = 20;

function gorulenEkle(gorulen: Set<string>, anahtar: string): void {
  gorulen.add(anahtar);
  while (gorulen.size > GORULEN_TAVAN) {
    const ilk = gorulen.values().next().value;
    if (ilk === undefined) break;
    gorulen.delete(ilk);
  }
}

interface BriefStateKayit { g: string[]; s: number }

function briefStateDosyasi(cwd: string): string {
  return join(katmanKokuBul(cwd), ".verimlilik", "brief-state.json");
}

function briefStateOku(cwd: string): Record<string, BriefStateKayit> {
  try {
    const dosya = briefStateDosyasi(cwd);
    if (!existsSync(dosya)) return {};
    const j = JSON.parse(readFileSync(dosya, "utf8")) as Record<string, BriefStateKayit>;
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

// BK-01: reload'da bellek-ici gorulen/durum sifirlaniyordu; diske yazilan durumla devam edilir.
// Taze oku+birlestir: ayni cwd'deki paralel ajanlarin yazimini ezme. En eski ajanlar budanir.
function briefStateKaydet(cwd: string, agentId: string, gorulen: Set<string>, sonDurtme: number): void {
  try {
    const state = briefStateOku(cwd);
    state[agentId] = { g: [...gorulen].slice(-GORULEN_TAVAN), s: sonDurtme };
    const anahtarlar = Object.keys(state);
    if (anahtarlar.length > AJAN_TAVAN) {
      anahtarlar.sort((a, b) => (state[a].s ?? 0) - (state[b].s ?? 0));
      for (const eski of anahtarlar.slice(0, anahtarlar.length - AJAN_TAVAN)) delete state[eski];
    }
    const dosya = briefStateDosyasi(cwd);
    mkdirSync(dirname(dosya), { recursive: true });
    writeFileSync(dosya, JSON.stringify(state), "utf8");
  } catch (error) {
    console.error("[paseo-verimlilik] brief state kayit hatasi", error);
  }
}

export function _testIcinBriefSifirla(): void {
  durum.clear();
  gorulenler.clear();
}

// K-0025 (A2-1): agent.closed sonrasi bellek sizintisini onler.
export function ajanTemizle(agentId: string): void {
  durum.delete(agentId);
  gorulenler.delete(agentId);
}

export async function briefKontrol(
  agentId: string,
  cwd: string,
  provider: string,
  timeline: readonly AgentTimelineItem[],
  context: PluginHookContext,
): Promise<boolean> {
  let gorulen = gorulenler.get(agentId);
  if (!gorulen) {
    gorulen = new Set<string>();
    gorulenler.set(agentId, gorulen);
    const kayit = briefStateOku(cwd)[agentId];
    if (kayit) {
      for (const k of kayit.g ?? []) gorulen.add(k);
      if (typeof kayit.s === "number") durum.set(agentId, kayit.s);
    }
  }
  const bulgu = briefTara(timeline, gorulen);
  briefStateKaydet(cwd, agentId, gorulen, durum.get(agentId) ?? 0);
  if (bulgu.toplam === 0 || bulgu.zayif === 0) {
    return false;
  }
  const sonDurtme = durum.get(agentId) ?? 0;
  if (Date.now() - sonDurtme < 10 * 60_000) {
    return false;
  }
  durum.set(agentId, Date.now());
  telemetriYaz(cwd, {
    ts: new Date().toISOString(),
    tip: "lint",
    agentId,
    provider,
    detay: "zayif-brief " + bulgu.zayif + "/" + bulgu.toplam,
  });
  await context.paseo.agents.ref(agentId).send(
    "[paseo-verimlilik · brief] Bu turdaki " + bulgu.zayif + "/" + bulgu.toplam + " subagent brief'i zayif (rehber §8). " +
    "Brief 4 oge sart: hedef · cikti formati · arac/kaynak · gorev siniri ('ne YAPMAMALI'). 2 oge onerilir: kabul kriteri · tahmini butce.",
  );
  return true;
}

// K-0032 (v0.19): firtina modu brief paket fabrikasi — gelen-kutu maddesinden 4-ogeli doldurulabilir taslak.
export interface GelenKutuMadde {
  id: string;
  baslik: string;
  dosyaRef: string;
  oneri: string;
}

export interface BriefTaslak {
  hedef: string;
  ciktiFormati: string;
  aracKaynak: string;
  gorevSiniri: string;
}

export function briefTaslakUret(madde: GelenKutuMadde): BriefTaslak {
  return {
    hedef: madde.id + ": " + madde.baslik + " — " + madde.oneri,
    ciktiFormati: "<doldur: beklenen cikti — degisen dosya listesi + calistirilan komutlar + exit kodlari + 3 satir ozet>",
    aracKaynak: "Baslangic: " + madde.dosyaRef + " — <doldur: gerekli ek arac/kaynak ve kisitlar>",
    gorevSiniri: "<doldur: ne YAPMAMALI — dokunulmayacak dosyalar ve yasak islemler>",
  };
}
