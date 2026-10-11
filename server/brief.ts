import type { PluginHookContext } from "@getpaseo/plugin/server";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { telemetriYaz } from "./telemetry";

const MIN_BRIEF_UZUNLUK = 30;
const OGE_ANAHTAR = /\b(Hedef|Cikti|Çıktı|Arac|Araç|Sinir|Sınır|Kabul|Butce|Bütçe)\s*:/gi;

export interface BriefBulgu {
  toplam: number;
  zayif: number;
}

export function briefTara(timeline: readonly AgentTimelineItem[]): BriefBulgu {
  let toplam = 0;
  let zayif = 0;
  for (const item of timeline) {
    if (item.type !== "tool_call") continue;
    const detail = item.detail as Record<string, unknown> | undefined;
    if (!detail || detail.type !== "sub_agent") continue;
    toplam++;
    const desc = typeof detail.description === "string" ? detail.description : "";
    const maddeVar = /(^|\n)\s*[-*\d]+[.)]\s/.test(desc) || desc.includes(" · ") || desc.includes("·");
    const anahtarSayisi = (desc.match(OGE_ANAHTAR) ?? []).length;
    const gucluYapi = maddeVar || anahtarSayisi >= 2;
    if (desc.length < MIN_BRIEF_UZUNLUK || !gucluYapi) {
      zayif++;
    }
  }
  return { toplam, zayif };
}

const durum = new Map<string, number>();

export async function briefKontrol(
  agentId: string,
  cwd: string,
  provider: string,
  timeline: readonly AgentTimelineItem[],
  context: PluginHookContext,
): Promise<boolean> {
  const bulgu = briefTara(timeline);
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