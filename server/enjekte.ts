import type { RpcInput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { sozlesmeEnjekte } from "../shared/contracts";
import { enjeksiyonMetni } from "./sozlesme";

export async function enjekteHandler(
  input: RpcInput<typeof sozlesmeEnjekte>,
  { paseo }: PluginHandlerContext,
): Promise<{ hedef: number; gonderildi: number; atlandi: number; not?: string }> {
  if (!input.agentId && !input.workspaceId) {
    return { hedef: 0, gonderildi: 0, atlandi: 0, not: "agentId veya workspaceId gerekli" };
  }
  const hedefler: { id: string; cwd: string | null }[] = [];
  if (input.agentId) {
    const handle = paseo.agents.ref(input.agentId);
    const snap = await handle.refresh();
    hedefler.push({ id: input.agentId, cwd: snap?.agent?.cwd ?? handle.cwd ?? null });
  } else if (input.workspaceId) {
    const liste = await paseo.agents.list();
    for (const kayit of liste.entries) {
      const agent = kayit.agent as { id: string; cwd?: string | null; workspaceId?: string | null; archivedAt?: string | null };
      if (agent.workspaceId !== input.workspaceId) continue;
      if (agent.archivedAt) continue;
      hedefler.push({ id: agent.id, cwd: agent.cwd ?? null });
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
    await paseo.agents.ref(hedef.id).send(
      "[paseo-verimlilik · sözleşme enjeksiyonu]\n\n" + sonuc.metin,
    );
    gonderildi++;
  }
  return { hedef: hedefler.length, gonderildi, atlandi };
}