import type { PluginHookContext } from "@getpaseo/plugin/server";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { sonKullaniciMesajiIndex, toolCallOzetleri } from "./inspect";

const PENCERE = 8;
const TEKRAR_ESIGI = 3;
const MAKS_ARDISIK_DURTME = 2;

interface LoopState {
  ardisikDurtme: number;
  sonHash: string | null;
}

const durum = new Map<string, LoopState>();

// K-0025 (A2-1): agent.closed sonrasi bellek sizintisini onler.
export function ajanTemizle(agentId: string): void {
  durum.delete(agentId);
}

function loopVarMi(hashler: string[]): string | null {
  if (hashler.length >= TEKRAR_ESIGI) {
    const son = hashler.slice(-TEKRAR_ESIGI);
    if (son.every((h) => h === son[0])) {
      return son[0];
    }
  }
  const pencere = hashler.slice(-PENCERE);
  const sayac = new Map<string, number>();
  for (const h of pencere) {
    sayac.set(h, (sayac.get(h) ?? 0) + 1);
  }
  for (const [h, n] of sayac) {
    if (n >= TEKRAR_ESIGI) {
      return h;
    }
  }
  if (hashler.length >= 4) {
    const [a, b, c, d] = hashler.slice(-4);
    if (a === c && b === d && a !== b) {
      return a + " <-> " + b;
    }
  }
  return null;
}

export async function loopKontrol(
  agentId: string,
  timeline: readonly AgentTimelineItem[],
  context: PluginHookContext,
): Promise<boolean> {
  const sonMesaj = sonKullaniciMesajiIndex(timeline);
  const cagri = toolCallOzetleri(sonMesaj >= 0 ? timeline.slice(sonMesaj + 1) : timeline);
  if (cagri.length < TEKRAR_ESIGI) {
    return false;
  }
  const hashler = cagri.map((c) => c.hash);
  const bulgu = loopVarMi(hashler);
  if (bulgu === null) {
    const s = durum.get(agentId);
    if (s) s.ardisikDurtme = 0;
    return false;
  }
  const s = durum.get(agentId) ?? { ardisikDurtme: 0, sonHash: null };
  if (s.sonHash === bulgu) {
    return false;
  }
  if (s.ardisikDurtme >= MAKS_ARDISIK_DURTME) {
    console.error(`[paseo-verimlilik] loop dedektoru insan kapisi: ${agentId} — ${bulgu}`);
    durum.set(agentId, { ardisikDurtme: 0, sonHash: bulgu });
    return false;
  }
  s.ardisikDurtme++;
  s.sonHash = bulgu;
  durum.set(agentId, s);
  await context.paseo.agents.ref(agentId).send(
    "[paseo-verimlilik · loop dedektoru] Son turda ayni arac+arguman 3 kez tekrarlandi (veya A→B→A deseni). " +
    "Dur: strateji degistir — farkli arac/yaklasim dene; takildiysan kullaniciya tek cümlelik durum sor. " +
    "Bu 2. ardisik uyarida dedektor susar ve insan kapisi acilir (rehber §7.6).",
  );
  return true;
}