import type { PluginHookContext } from "@getpaseo/plugin/server";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { sonKullaniciMesajiIndex, toolCallOzetleri } from "./inspect";
import { telemetriYaz } from "./telemetry";

export const KAPSAM_TAVAN = 3;

const durum = new Map<string, number>();

export function kapsamSay(timeline: readonly AgentTimelineItem[]): { dosyalar: string[]; pencere: number } {
  const sonMesaj = sonKullaniciMesajiIndex(timeline);
  const cagri = toolCallOzetleri(sonMesaj >= 0 ? timeline.slice(sonMesaj + 1) : timeline);
  const dosyalar = new Set<string>();
  for (const c of cagri) {
    if ((c.detailType === "edit" || c.detailType === "write") && c.filePath) {
      dosyalar.add(c.filePath);
    }
  }
  return { dosyalar: [...dosyalar], pencere: cagri.length };
}

export async function kapsamKontrol(
  agentId: string,
  cwd: string,
  provider: string,
  timeline: readonly AgentTimelineItem[],
  context: PluginHookContext,
): Promise<boolean> {
  const { dosyalar } = kapsamSay(timeline);
  if (dosyalar.length <= KAPSAM_TAVAN) {
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
    detay: "kapsam-asimi dosya=" + dosyalar.length,
  });
  await context.paseo.agents.ref(agentId).send(
    "[paseo-verimlilik · kapsam] Bu turda " + dosyalar.length + " dosyaya dokundun (tavan 3, rehber §6). " +
    "Isi bol: her parca ayri tur + ayri commit. Buyuk is = yeni dosya + ince kanca.",
  );
  return true;
}