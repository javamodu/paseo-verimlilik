import { mkdirSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PluginHookAgent, PluginTurnOutcome } from "@getpaseo/plugin/server";
import type { AgentTimelineItem, AgentUsage } from "@getpaseo/protocol/agent-types";
import { editCagrilari, turCagrilari } from "./inspect";
import { katmanKokuBul } from "./sozlesme";
import { PLUGIN_SURUM } from "./surum";
import { rolCoz } from "./roller";
import { haftalikRollup } from "./rollup";

export interface TelemetriKayit {
  ts: string;
  tip: "tur" | "kabul" | "lint" | "karisiklik";
  agentId: string;
  provider: string;
  turnId?: string | null;
  outcome?: PluginTurnOutcome["kind"];
  turSayisi?: number;
  turSn?: number;
  toolCalls?: number;
  editCalls?: number;
  shellCalls?: number;
  failedCalls?: number;
  loopDurtme?: boolean;
  finishGateDurtme?: boolean;
  kabul?: boolean;
  kabulSinyali?: string;
  pluginSurum?: string;
  rol?: string;
  model?: string;
  mod?: string;
  altAjan?: boolean;
  inTok?: number;
  outTok?: number;
  cacheTok?: number;
  maliyetUsd?: number;
  kuralToplam?: number;
  butceBytes?: number;
  detay?: string;
}

const turSayaclari = new Map<string, number>();
const turBaslangiclari = new Map<string, number>();

// K-0025 (A2-1): agent.closed sonrasi bellek sizintisini onler.
export function ajanTemizle(agentId: string): void {
  turSayaclari.delete(agentId);
  // K-0029 (A2-6): acik turu kapanmadan kapanan ajan aktifTur'u sisirmesin.
  if (turBaslangiclari.delete(agentId)) {
    aktifTur = Math.max(0, aktifTur - 1);
  }
}
export function _testIcinAktifTur(): number {
  return aktifTur;
}
let aktifTur = 0;
let rollupSayisi = 0;
const sonRollup = new Map<string, number>();
export function _testIcinRollupSayisi(): number {
  return rollupSayisi;
}
export const PARALEL_TAVAN = 3;

export function telemetriDosyasi(cwd: string): string {
  return join(katmanKokuBul(cwd), ".verimlilik", "telemetri.jsonl");
}

export function telemetriYaz(cwd: string, kayit: TelemetriKayit): void {
  try {
    const dosya = telemetriDosyasi(cwd);
    // K-0028 (A2-4): mkdir hedef dosyanin dizininde — alt-dizin cwd'sinde kok .verimlilik yoksa kayit sessizce dusuyordu.
    mkdirSync(dirname(dosya), { recursive: true });
    appendFileSync(dosya, JSON.stringify(kayit) + "\n", "utf8");
  } catch (error) {
    console.error("[paseo-verimlilik] telemetri yazim hatasi", error);
  }
}

export function turBaslat(agentId: string, cwd?: string): number {
  turBaslangiclari.set(agentId, Date.now());
  aktifTur++;
  if (cwd && aktifTur > PARALEL_TAVAN) {
    telemetriYaz(cwd, {
      ts: new Date().toISOString(),
      tip: "lint",
      agentId,
      provider: "-",
      detay: "paralellik-asimi aktifTur=" + aktifTur,
    });
  }
  const sayi = (turSayaclari.get(agentId) ?? 0) + 1;
  turSayaclari.set(agentId, sayi);
  return sayi;
}

export function turKaydet(input: {
  agent: PluginHookAgent;
  turnId: string | null;
  outcome: PluginTurnOutcome;
  timeline: readonly AgentTimelineItem[];
  usage: AgentUsage | null;
  model?: string | null;
  mod?: string | null;
  loopDurtme: boolean;
  finishGateDurtme: boolean;
}): void {
  const ozetler = turCagrilari(input.timeline);
  const shell = ozetler.filter((o) => o.command !== undefined);
  const edits = editCagrilari(ozetler);
  const usage = input.usage;
  const detayParca: string[] = [];
  if (usage?.inputTokens) {
    const hit = usage.cachedInputTokens && usage.inputTokens > 0
      ? Math.round((usage.cachedInputTokens / usage.inputTokens) * 1000) / 10
      : null;
    detayParca.push(`in=${usage.inputTokens}`);
    if (hit !== null) detayParca.push(`cacheHitPct=${hit}`);
    if (usage.outputTokens) detayParca.push(`out=${usage.outputTokens}`);
  }
  aktifTur = Math.max(0, aktifTur - 1);
  telemetriYaz(input.agent.cwd, {
    ts: new Date().toISOString(),
    tip: "tur",
    agentId: input.agent.id,
    provider: input.agent.provider,
    pluginSurum: PLUGIN_SURUM,
    rol: rolCoz(input.agent.title ?? null)?.ad,
    model: input.model ?? undefined,
    mod: input.mod ?? undefined,
    altAjan: input.agent.parentAgentId ? true : undefined,
    inTok: usage?.inputTokens ?? undefined,
    outTok: usage?.outputTokens ?? undefined,
    cacheTok: usage?.cachedInputTokens ?? undefined,
    maliyetUsd: usage?.totalCostUsd ?? undefined,
    turnId: input.turnId,
    outcome: input.outcome.kind,
    turSayisi: turSayaclari.get(input.agent.id) ?? 1,
    turSn: (() => { const t0 = turBaslangiclari.get(input.agent.id); return t0 ? Math.round((Date.now() - t0) / 1000) : undefined; })(),
    toolCalls: ozetler.length,
    shellCalls: shell.length,
    editCalls: edits.length,
    failedCalls: ozetler.filter((o) => o.status === "failed").length,
    loopDurtme: input.loopDurtme || undefined,
    finishGateDurtme: input.finishGateDurtme || undefined,
    detay: detayParca.length > 0 ? detayParca.join(" ") : undefined,
  });
  // K-0029 (A2-6): tur kapandi — baslangic kaydi temizlenir; kalan kayit = acik tur.
  turBaslangiclari.delete(input.agent.id);
  // K-0029 (A2-8): rollup her turda tam jsonl okur — 60sn seyreklestirme.
  try {
    const sonR = sonRollup.get(input.agent.cwd) ?? 0;
    if (Date.now() - sonR > 60_000) {
      sonRollup.set(input.agent.cwd, Date.now());
      rollupSayisi++;
      haftalikRollup(input.agent.cwd);
    }
  } catch (error) {
    console.error("[paseo-verimlilik] rollup hatasi", error);
  }
}

export function kabulKaydet(cwd: string, agentId: string, provider: string, kabul: boolean, sinyal: string): void {
  telemetriYaz(cwd, {
    ts: new Date().toISOString(),
    tip: "kabul",
    agentId,
    provider,
    kabul,
    kabulSinyali: sinyal,
  });
}

export function karisiklikKaydet(cwd: string, agentId: string, provider: string, sinyal: string): void {
  telemetriYaz(cwd, {
    ts: new Date().toISOString(),
    tip: "karisiklik",
    agentId,
    provider,
    detay: sinyal,
  });
}

export function lintKaydet(cwd: string, alan: { kuralToplam: number; butceBytes: number; not?: string }): void {
  telemetriYaz(cwd, {
    ts: new Date().toISOString(),
    tip: "lint",
    agentId: "-",
    provider: "-",
    kuralToplam: alan.kuralToplam,
    butceBytes: alan.butceBytes,
    detay: alan.not,
  });
}

export function telemetriOzetle(cwd: string): {
  dosya: string; tur: number; loopDurtme: number; finishGateDurtme: number;
  kabul: number; ret: number; kabulOrani: number | null; anlasilmazlik: number;
  inTok: number; outTok: number; cacheTok: number; ortTurSn: number | null;
  modeller: Record<string, number>; maliyetUsd: number; modlar: Record<string, number>;
  altAjan: number;
} {
  const dosya = telemetriDosyasi(cwd);
  let tur = 0, loopDurtme = 0, finishGateDurtme = 0, kabul = 0, ret = 0, anlasilmazlik = 0;
  let inTok = 0, outTok = 0, cacheTok = 0, turSnToplam = 0, turSnAdet = 0, maliyetToplam = 0, altAjan = 0;
  const modeller: Record<string, number> = {};
  const modlar: Record<string, number> = {};
  if (existsSync(dosya)) {
    for (const satir of readFileSync(dosya, "utf8").split(/\r?\n/)) {
      if (!satir.trim()) continue;
      try {
        const kayit = JSON.parse(satir) as TelemetriKayit;
        if (kayit.tip === "tur") {
          tur++;
          inTok += kayit.inTok ?? 0;
          outTok += kayit.outTok ?? 0;
          cacheTok += kayit.cacheTok ?? 0;
          maliyetToplam += kayit.maliyetUsd ?? 0;
          if (typeof kayit.turSn === "number") { turSnToplam += kayit.turSn; turSnAdet++; }
          if (kayit.model) modeller[kayit.model] = (modeller[kayit.model] ?? 0) + 1;
          if (kayit.mod) modlar[kayit.mod] = (modlar[kayit.mod] ?? 0) + 1;
          if (kayit.altAjan) altAjan++;
        }
        if (kayit.loopDurtme) loopDurtme++;
        if (kayit.finishGateDurtme) finishGateDurtme++;
        if (kayit.tip === "kabul") {
          if (kayit.kabul) kabul++; else ret++;
        }
        if (kayit.tip === "karisiklik") anlasilmazlik++;
      } catch {
        // bozuk satir atlanir
      }
    }
  }
  const toplam = kabul + ret;
  return {
    dosya, tur, loopDurtme, finishGateDurtme, kabul, ret, altAjan,
    kabulOrani: toplam > 0 ? Math.round((kabul / toplam) * 1000) / 10 : null,
    anlasilmazlik,
    inTok, outTok, cacheTok,
    ortTurSn: turSnAdet > 0 ? Math.round(turSnToplam / turSnAdet) : null,
    modeller,
    maliyetUsd: Math.round(maliyetToplam * 10000) / 10000,
    modlar,
  };
}