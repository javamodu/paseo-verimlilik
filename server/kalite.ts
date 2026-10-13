import type { ToolCallOzeti } from "./inspect";

export const BASARISIZ_ORAN_ESIK = 0.10;
export const BASARISIZ_MIN_CAGRI = 5;
const COOLDOWN_MS = 10 * 60_000;

const cooldown = new Map<string, number>();

// K-0025 (A2-1): agent.closed sonrasi bellek sizintisini onler.
export function ajanTemizle(agentId: string): void {
  cooldown.delete(agentId);
}

// Tur bazinda basarisiz cagri orani esigi asilirsa tek durtme (cooldown'lu).
export function basarisizOranMesaji(agentId: string, ozetler: readonly ToolCallOzeti[], simdi = Date.now()): string | null {
  const toplam = ozetler.length;
  if (toplam < BASARISIZ_MIN_CAGRI) return null;
  const basarisiz = ozetler.filter((o) => o.status === "failed").length;
  const oran = basarisiz / toplam;
  if (oran <= BASARISIZ_ORAN_ESIK) return null;
  const son = cooldown.get(agentId) ?? 0;
  if (simdi - son < COOLDOWN_MS) return null;
  cooldown.set(agentId, simdi);
  return "[paseo-verimlilik · kalite] Bu turda başarısız araç çağrısı oranı %" + Math.round(oran * 100) + " (" + basarisiz + "/" + toplam + "). Tekrarlanan kalıbı DERSLER'e işle — aynı tuzağa iki kez düşme (§8).";
}

export function _testIcinKaliteSifirla(): void {
  cooldown.clear();
}
