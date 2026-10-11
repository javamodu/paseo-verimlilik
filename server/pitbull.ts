import type { PluginHookAgent, PluginHookContext } from "@getpaseo/plugin/server";
import { telemetriYaz } from "./telemetry";

const TARAMA_MS = 60_000;
const STALL_ESIK_MS = 10 * 60_000;
const DURTME_COOLDOWN_MS = 10 * 60_000;
const MAKS_ARDISIK_STALL = 3;

interface PitbullState {
  turBaslangic: number | null;
  ardisikStall: number;
  sonDurtme: number;
}

const durum = new Map<string, PitbullState>();

function stateAl(agentId: string): PitbullState {
  let s = durum.get(agentId);
  if (!s) {
    s = { turBaslangic: null, ardisikStall: 0, sonDurtme: 0 };
    durum.set(agentId, s);
  }
  return s;
}

export function pitbullTurBasladi(agentId: string, simdi?: number): void {
  const s = stateAl(agentId);
  s.turBaslangic = simdi ?? Date.now();
}

export function pitbullTurBitti(agentId: string): void {
  const s = stateAl(agentId);
  s.turBaslangic = null;
  s.ardisikStall = 0;
}

export function pitbullTara(
  ajanlar: Map<string, PluginHookAgent>,
  gonder: (agent: PluginHookAgent, mesaj: string) => Promise<void>,
): { dirtulen: number; insanKapisi: number } {
  const simdi = Date.now();
  let dirtulen = 0;
  let insanKapisi = 0;
  for (const [agentId, agent] of ajanlar) {
    const s = durum.get(agentId);
    if (!s || s.turBaslangic === null) continue;
    const stallSuresi = simdi - s.turBaslangic;
    if (stallSuresi < STALL_ESIK_MS) continue;
    if (simdi - s.sonDurtme < DURTME_COOLDOWN_MS) continue;
    if (s.ardisikStall >= MAKS_ARDISIK_STALL) {
      insanKapisi++;
      telemetriYaz(agent.cwd, {
        ts: new Date().toISOString(),
        tip: "lint",
        agentId,
        provider: agent.provider,
        detay: "pitbull-insan-kapisi ardisikStall=" + s.ardisikStall,
      });
      console.error(`[paseo-verimlilik] pitbull insan kapisi: ${agentId} (${s.ardisikStall} ardisik stall)`);
      s.turBaslangic = null;
      s.ardisikStall = 0;
      continue;
    }
    s.ardisikStall++;
    s.sonDurtme = simdi;
    dirtulen++;
    telemetriYaz(agent.cwd, {
      ts: new Date().toISOString(),
      tip: "lint",
      agentId,
      provider: agent.provider,
      detay: "pitbull-durtme stallSn=" + Math.round(stallSuresi / 1000) + " ardisik=" + s.ardisikStall,
    });
    void gonder(
      agent,
      "[paseo-verimlilik · pitbull] Tur " + Math.round(stallSuresi / 60) + " dakikadir acik — takildiysan: 2 satir durum raporu (ilk satir baglam yuzdesi) + kalinan yerden devam. " +
      "Ayni konuda 2. ardisik dürtmede dur ve kullanici isareti bekle (rehber §7.6).",
    ).catch((error) => console.error("[paseo-verimlilik] pitbull gonderim hatasi", error));
  }
  return { dirtulen, insanKapisi };
}

export function pitbullBaslat(
  ajanlar: Map<string, PluginHookAgent>,
  gonder: (agent: PluginHookAgent, mesaj: string) => Promise<void>,
): () => void {
  const timer = setInterval(() => {
    try {
      pitbullTara(ajanlar, gonder);
    } catch (error) {
      console.error("[paseo-verimlilik] pitbull tarama hatasi", error);
    }
  }, TARAMA_MS);
  return () => clearInterval(timer);
}