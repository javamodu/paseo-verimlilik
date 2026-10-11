import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { sozlesmeEnjekte, telemetriOzet } from "./shared/contracts";
import { enjeksiyonMetni } from "./server/sozlesme";
import { kabulKaydet, lintKaydet, telemetriOzetle, turBaslat, turKaydet } from "./server/telemetry";
import { loopKontrol } from "./server/loopguard";
import { finishGateKontrol } from "./server/finishgate";
import { enjekteHandler } from "./server/enjekte";
import { toolCallOzetleri } from "./server/inspect";

const RET_DESENI = /\b(hayır|yanlış|olmamış|bozuk|bozuldu|çalışmıyor|geri al|revert|undo|wrong|broken|hatalı)\b/i;

interface TurState {
  oncekiEditliCompleted: boolean;
}

const turDurumu = new Map<string, TurState>();

function kullaniciMesajlari(timeline: readonly AgentTimelineItem[]): string[] {
  return timeline.filter((i) => i.type === "user_message").map((i) => (i as { text: string }).text);
}

export default function contribute(server: PluginServerContext) {
  const removers: Array<() => void> = [];

  removers.push(
    server.before("agent.create", ({ request }) => {
      if (request.config.internal === true) {
        return undefined;
      }
      const mevcut = request.config.systemPrompt ?? "";
      let sonuc;
      try {
        sonuc = enjeksiyonMetni(request.config.cwd, mevcut);
      } catch (error) {
        console.error("[paseo-verimlilik] enjeksiyon hatasi (dokunulmadi)", error);
        return undefined;
      }
      const butceBytes = Buffer.byteLength(sonuc.metin, "utf8");
      lintKaydet(request.config.cwd, {
        kuralToplam: sonuc.kuralToplam,
        butceBytes,
        not: sonuc.kuralBlok ? "kural-blok" : sonuc.butceAsimi ? "butce-asimi" : undefined,
      });
      if (sonuc.kuralBlok) {
        console.error(`[paseo-verimlilik] enjeksiyon engellendi: aktif kural ~${sonuc.kuralToplam} (>80)`);
        return undefined;
      }
      return { ...request, config: { ...request.config, systemPrompt: sonuc.metin } };
    }),
  );

  removers.push(
    server.on("agent.turn_started", (event) => {
      turBaslat(event.agent.id);
    }),
  );

  removers.push(
    server.on("agent.turn_ended", async (event, context) => {
      const agentId = event.agent.id;
      let loopDurtme = false;
      let finishGateDurtme = false;
      try {
        if (event.outcome.kind === "completed") {
          loopDurtme = await loopKontrol(agentId, event.timeline, context);
          finishGateDurtme = await finishGateKontrol(agentId, event.timeline, context);
        }
      } catch (error) {
        console.error("[paseo-verimlilik] dedektor hatasi", error);
      }

      try {
        const state = turDurumu.get(agentId) ?? { oncekiEditliCompleted: false };
        const mesajlar = kullaniciMesajlari(event.timeline);
        const buTurunPromptu = mesajlar.length > 0 ? mesajlar[mesajlar.length - 1] : "";
        if (state.oncekiEditliCompleted && mesajlar.length >= 2) {
          const ret = RET_DESENI.test(buTurunPromptu);
          kabulKaydet(event.agent.cwd, agentId, event.agent.provider, !ret, "onceki-tur-prompt-deseni(T)");
        }
        const ozetler = toolCallOzetleri(event.timeline);
        const editli = ozetler.some((o) => o.detailType === "edit" || o.detailType === "write");
        state.oncekiEditliCompleted = event.outcome.kind === "completed" && editli;
        turDurumu.set(agentId, state);
      } catch (error) {
        console.error("[paseo-verimlilik] kabul takip hatasi", error);
      }

      let usage = null;
      try {
        const snap = await context.paseo.agents.ref(agentId).refresh();
        usage = snap?.agent?.lastUsage ?? null;
      } catch {
        // usage alinamazsa null kalir
      }
      turKaydet({
        agent: event.agent,
        turnId: event.turnId,
        outcome: event.outcome,
        timeline: event.timeline,
        usage,
        loopDurtme,
        finishGateDurtme,
      });
    }),
  );

  server.handle(sozlesmeEnjekte, enjekteHandler);
  server.handle(telemetriOzet, ({ cwd }) => telemetriOzetle(cwd));

  return () => {
    for (const remove of removers) remove();
  };
}