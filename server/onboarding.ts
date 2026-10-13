import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PluginHookContext } from "@getpaseo/plugin/server";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { latestOutputText } from "./inspect";
import { telemetriYaz } from "./telemetry";
import { katmanKokuBul, sonHandoffDosyasi } from "./sozlesme";

export function sonHandoff(cwd: string): string | null {
  return sonHandoffDosyasi(cwd);
}

const ECHO_SINYALLERI = [
  /\b(kirli dosya|git status|working (tree|directory))\b/i,
  /\b(son commit|HEAD|commit hash|[0-9a-f]{7}\b)/i,
  /\b(bekleyen onay|bekleyen ilk onay|onay bekleyen)\b/i,
];

interface Beklenti {
  tip: "echo" | "iskelet";
  hedef: string;
  tur: number;
}

const beklentiler = new Map<string, Beklenti>();

// K-0025 (A2-1): agent.closed sonrasi bellek sizintisini onler.
export function ajanTemizle(agentId: string): void {
  beklentiler.delete(agentId);
}

export function onboardingTara(agentId: string, cwd: string): void {
  const handoff = sonHandoff(cwd);
  if (handoff) {
    beklentiler.set(agentId, { tip: "echo", hedef: handoff, tur: 0 });
    return;
  }
  const kok = katmanKokuBul(cwd);
  const l0 = existsSync(join(kok, "AGENTS.md")) || existsSync(join(kok, "ANAYASA.md"));
  const l1 = existsSync(join(kok, "STATE_BOARD.md"));
  const l5 = existsSync(join(kok, "DERSLER.md"));
  if (!l0 && !l1 && !l5) {
    beklentiler.set(agentId, { tip: "iskelet", hedef: "L0/L1/L5", tur: 0 });
  }
}

export async function onboardingKontrol(
  agentId: string,
  cwd: string,
  provider: string,
  timeline: readonly AgentTimelineItem[],
  context: PluginHookContext,
): Promise<boolean> {
  const b = beklentiler.get(agentId);
  if (!b) return false;
  b.tur++;
  if (b.tur > 1) {
    beklentiler.delete(agentId);
    return false;
  }
  beklentiler.delete(agentId);

  if (b.tip === "echo") {
    const metin = latestOutputText(timeline);
    const eslesme = ECHO_SINYALLERI.filter((s) => s.test(metin)).length;
    if (eslesme >= 2) {
      telemetriYaz(cwd, { ts: new Date().toISOString(), tip: "lint", agentId, provider, detay: "echo-tamam sinyal=" + eslesme });
      return false;
    }
    telemetriYaz(cwd, { ts: new Date().toISOString(), tip: "lint", agentId, provider, detay: "echo-eksik sinyal=" + eslesme + " handoff=" + b.hedef });
    await context.paseo.agents.ref(agentId).send(
      "[paseo-verimlilik · echo kapisi] plans/handoff/" + b.hedef + " icin echo dogrulaman eksik (rehber §3.4): " +
      "3 soruya dosyalardan dogruladigin cevabi yaz — kirli dosyalar? son commit? bekleyen ilk onay? Echo yoksa devir tamamlanmamistir.",
    );
    return true;
  }

  const kok = katmanKokuBul(cwd);
  const l0 = existsSync(join(kok, "AGENTS.md")) || existsSync(join(kok, "ANAYASA.md"));
  const l1 = existsSync(join(kok, "STATE_BOARD.md"));
  const l5 = existsSync(join(kok, "DERSLER.md"));
  if (l0 && l1 && l5) {
    return false;
  }
  const eksikler = [!l0 ? "L0(AGENTS.md)" : null, !l1 ? "L1(STATE_BOARD.md)" : null, !l5 ? "L5(DERSLER.md)" : null].filter(Boolean).join("+");
  telemetriYaz(cwd, { ts: new Date().toISOString(), tip: "lint", agentId, provider, detay: "iskelet-eksik" });
  await context.paseo.agents.ref(agentId).send(
    "[paseo-verimlilik · onboarding] Eksik katmanlar: " + eksikler + " (rehber §9 ilk-15-dakika). " +
    "Iskeleti kur: AGENTS.md (L0) + STATE_BOARD.md (L1) + DERSLER.md (L5) + plans/handoff/ + kararlar/ + raporlar/ dizinleri. 3 dosya + 3 dizin, 10 dakika.",
  );
  return true;
}