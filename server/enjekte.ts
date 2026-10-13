import type { RpcInput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { sozlesmeEnjekte } from "../shared/contracts";
import { enjeksiyonMetni } from "./sozlesme";
import { ayarOku } from "./ayar";
import { modCoz } from "./modlar";

// K-0032 (v0.19): firtina modunda sistem ekine K3 kalan-sure satiri. Hata/bozuk tarihte sessizce null doner.
export function k3Satiri(cwd: string, modAd: string | null, simdi: number = Date.now()): string | null {
  if (modAd !== "firtina") return null;
  try {
    const bitisMetin = ayarOku(cwd).k3Bitis;
    if (!bitisMetin) return "K3 bitis tarihi ayarlanmamis (.verimlilik/ayar.json k3Bitis)";
    const bitis = Date.parse(bitisMetin);
    if (Number.isNaN(bitis)) return null;
    const kalan = Math.max(0, bitis - simdi);
    const gun = Math.floor(kalan / 86_400_000);
    const saat = Math.floor((kalan % 86_400_000) / 3_600_000);
    return "K3 kalan sure: " + gun + " gun " + saat + " saat (bitis: " + bitisMetin + ")";
  } catch {
    return null;
  }
}

export async function enjekteHandler(
  input: RpcInput<typeof sozlesmeEnjekte>,
  { paseo }: PluginHandlerContext,
): Promise<{ hedef: number; gonderildi: number; atlandi: number; not?: string }> {
  if (!input.agentId && !input.workspaceId) {
    return { hedef: 0, gonderildi: 0, atlandi: 0, not: "agentId veya workspaceId gerekli" };
  }
  const hedefler: { id: string; cwd: string | null; provider: string }[] = [];
  if (input.agentId) {
    const handle = paseo.agents.ref(input.agentId);
    const snap = await handle.refresh();
    const snapAjan = snap?.agent as { cwd?: string | null; provider?: unknown } | undefined;
    hedefler.push({ id: input.agentId, cwd: snapAjan?.cwd ?? handle.cwd ?? null, provider: typeof snapAjan?.provider === "string" ? snapAjan.provider : "" });
  } else if (input.workspaceId) {
    const liste = await paseo.agents.list();
    for (const kayit of liste.entries) {
      const agent = kayit.agent as { id: string; cwd?: string | null; workspaceId?: string | null; archivedAt?: string | null; provider?: string | null };
      if (agent.workspaceId !== input.workspaceId) continue;
      if (agent.archivedAt) continue;
      hedefler.push({ id: agent.id, cwd: agent.cwd ?? null, provider: typeof agent.provider === "string" ? agent.provider : "" });
    }
  }
  let gonderildi = 0;
  let atlandi = 0;
  for (const hedef of hedefler) {
    if (!hedef.cwd) {
      atlandi++;
      continue;
    }
    const sonuc = enjeksiyonMetni(hedef.cwd, "");
    if (sonuc.atlandi) {
      atlandi++;
      console.error(`[paseo-verimlilik] enjekte atlandi (mod=kapali): ${hedef.id}`);
      continue;
    }
    const modAd = (modCoz(hedef.cwd, hedef.provider, null)?.ad ?? null) as string | null;
    const k3 = k3Satiri(hedef.cwd, modAd);
    await paseo.agents.ref(hedef.id).send(
      "[paseo-verimlilik · sözleşme enjeksiyonu]\n\n" + sonuc.metin + (k3 ? "\n\n" + k3 : ""),
    );
    gonderildi++;
  }
  return { hedef: hedefler.length, gonderildi, atlandi };
}
