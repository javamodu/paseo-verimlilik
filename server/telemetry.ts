import { mkdirSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PluginHookAgent, PluginTurnOutcome } from "@getpaseo/plugin/server";
import type { AgentTimelineItem, AgentUsage } from "@getpaseo/protocol/agent-types";
import { toolCallOzetleri } from "./inspect";

export interface TelemetriKayit {
  ts: string;
  tip: "tur" | "kabul" | "lint";
  agentId: string;
  provider: string;
  turnId?: string | null;
  outcome?: PluginTurnOutcome["kind"];
  turSayisi?: number;
  toolCalls?: number;
  editCalls?: number;
  shellCalls?: number;
  failedCalls?: number;
  loopDurtme?: boolean;
  finishGateDurtme?: boolean;
  kabul?: boolean;
  kabulSinyali?: string;
  kuralToplam?: number;
  butceBytes?: number;
  detay?: string;
}

const turSayaclari = new Map<string, number>();

export function telemetriDosyasi(cwd: string): string {
  return join(cwd, ".verimlilik", "telemetri.jsonl");
}

export function telemetriYaz(cwd: string, kayit: TelemetriKayit): void {
  try {
    const dosya = telemetriDosyasi(cwd);
    mkdirSync(join(cwd, ".verimlilik"), { recursive: true });
    appendFileSync(dosya, JSON.stringify(kayit) + "\n", "utf8");
  } catch (error) {
    console.error("[paseo-verimlilik] telemetri yazim hatasi", error);
  }
}

export function turBaslat(agentId: string): number {
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
  loopDurtme: boolean;
  finishGateDurtme: boolean;
}): void {
  const ozetler = toolCallOzetleri(input.timeline);
  const shell = ozetler.filter((o) => o.command !== undefined);
  const edits = ozetler.filter((o) => o.detailType === "edit" || o.detailType === "write");
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
  telemetriYaz(input.agent.cwd, {
    ts: new Date().toISOString(),
    tip: "tur",
    agentId: input.agent.id,
    provider: input.agent.provider,
    turnId: input.turnId,
    outcome: input.outcome.kind,
    turSayisi: turSayaclari.get(input.agent.id) ?? 1,
    toolCalls: ozetler.length,
    shellCalls: shell.length,
    editCalls: edits.length,
    failedCalls: ozetler.filter((o) => o.status === "failed").length,
    loopDurtme: input.loopDurtme || undefined,
    finishGateDurtme: input.finishGateDurtme || undefined,
    detay: detayParca.length > 0 ? detayParca.join(" ") : undefined,
  });
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
  kabul: number; ret: number; kabulOrani: number | null;
} {
  const dosya = telemetriDosyasi(cwd);
  let tur = 0, loopDurtme = 0, finishGateDurtme = 0, kabul = 0, ret = 0;
  if (existsSync(dosya)) {
    for (const satir of readFileSync(dosya, "utf8").split(/\r?\n/)) {
      if (!satir.trim()) continue;
      try {
        const kayit = JSON.parse(satir) as TelemetriKayit;
        if (kayit.tip === "tur") tur++;
        if (kayit.loopDurtme) loopDurtme++;
        if (kayit.finishGateDurtme) finishGateDurtme++;
        if (kayit.tip === "kabul") {
          if (kayit.kabul) kabul++; else ret++;
        }
      } catch {
        // bozuk satir atlanir
      }
    }
  }
  const toplam = kabul + ret;
  return {
    dosya, tur, loopDurtme, finishGateDurtme, kabul, ret,
    kabulOrani: toplam > 0 ? Math.round((kabul / toplam) * 1000) / 10 : null,
  };
}