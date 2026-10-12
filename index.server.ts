import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { PluginHookAgent } from "@getpaseo/plugin/server";
import type { PaseoApi } from "@getpaseo/client";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { sozlesmeEnjekte, telemetriOzet, sonDegerlendirme } from "./shared/contracts";
import { enjeksiyonMetni } from "./server/sozlesme";
import { kabulKaydet, karisiklikKaydet, lintKaydet, telemetriOzetle, turBaslat, turKaydet } from "./server/telemetry";
import { loopKontrol } from "./server/loopguard";
import { finishGateKontrol } from "./server/finishgate";
import { permissionKontrol } from "./server/permission";
import { pitbullBaslat, pitbullTurBasladi, pitbullTurBitti } from "./server/pitbull";
import { bekciBaslat } from "./server/bekci";
import { rolCoz, rolIzinKontrol } from "./server/roller";
import { katmanKokuBul } from "./server/sozlesme";
import { briefKontrol } from "./server/brief";
import { kapsamKontrol } from "./server/kapsam";
import { onboardingKontrol, onboardingTara } from "./server/onboarding";
import { enjekteHandler } from "./server/enjekte";
import { editliMi, turCagrilari } from "./server/inspect";
import { KARISIKLIK_DESENI, RET_DESENI } from "./server/desenler";
import { sonDegerlendirmeOku } from "./server/degerlendirme";
import { basarisizOranMesaji } from "./server/kalite";


interface TurState {
  oncekiEditliCompleted: boolean;
  oncekiCompleted: boolean;
}

const turDurumu = new Map<string, TurState>();
let paseoRef: PaseoApi | null = null;

function kullaniciMesajlari(timeline: readonly AgentTimelineItem[]): string[] {
  return timeline.filter((i) => i.type === "user_message").map((i) => (i as { text: string }).text);
}

export default function contribute(server: PluginServerContext) {
  const removers: Array<() => void> = [];
  const aktifAjanlar = new Map<string, PluginHookAgent>();
  const aktifTurler = new Map<string, string>();

  const gonderAjana = async (agent: PluginHookAgent, mesaj: string) => {
    if (!paseoRef) return;
    await paseoRef.agents.ref(agent.id).send(mesaj);
  };
  removers.push(pitbullBaslat(aktifAjanlar, gonderAjana));
  removers.push(
    bekciBaslat(
      aktifAjanlar,
      (repoKok) => [...aktifTurler.values()].some((c) => { try { return katmanKokuBul(c) === repoKok; } catch { return false; } }),
      gonderAjana,
    ),
  );

  removers.push(
    server.before("agent.create", ({ request }) => {
      if (request.config.internal === true) {
        return undefined;
      }
      const mevcut = request.config.systemPrompt ?? "";
      const rol = rolCoz(request.config.title ?? null);
      let sonuc;
      try {
        sonuc = enjeksiyonMetni(request.config.cwd, mevcut, rol?.sistemEki ?? null);
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
      if (sonuc.atlandi) {
        console.error(`[paseo-verimlilik] enjeksiyon engellendi (mod=kapali): kural ~${sonuc.kuralToplam}`);
        return undefined;
      }
      const yeniConfig = { ...request.config, systemPrompt: sonuc.metin };
      if (rol?.modeId && !yeniConfig.modeId) yeniConfig.modeId = rol.modeId;
      return { ...request, config: yeniConfig };
    }),
  );

  removers.push(
    server.on("agent.created", (event) => {
      try {
        onboardingTara(event.agent.id, event.agent.cwd);
      } catch (error) {
        console.error("[paseo-verimlilik] onboarding tarama hatasi", error);
      }
    }),
  );

  removers.push(
    server.on("agent.turn_started", (event, context) => {
      paseoRef = context.paseo;
      aktifAjanlar.set(event.agent.id, event.agent);
      turBaslat(event.agent.id, event.agent.cwd);
      pitbullTurBasladi(event.agent.id);
      aktifTurler.set(event.agent.id, event.agent.cwd);
    }),
  );

  removers.push(
    server.on("agent.turn_ended", async (event, context) => {
      paseoRef = context.paseo;
      const agentId = event.agent.id;
      aktifTurler.delete(agentId);
      const ozetlerTur = turCagrilari(event.timeline);
      const editliTur = editliMi(ozetlerTur);
      pitbullTurBitti(agentId, editliTur);
      let loopDurtme = false;
      let finishGateDurtme = false;
      try {
        if (event.outcome.kind === "completed") {
          loopDurtme = await loopKontrol(agentId, event.timeline, context);
          finishGateDurtme = await finishGateKontrol(agentId, event.timeline, context);
          await kapsamKontrol(agentId, event.agent.cwd, event.agent.provider, event.timeline, context);
          await briefKontrol(agentId, event.agent.cwd, event.agent.provider, event.timeline, context);
          await onboardingKontrol(agentId, event.agent.cwd, event.agent.provider, event.timeline, context);
          const kaliteMesaj = basarisizOranMesaji(agentId, ozetlerTur);
          if (kaliteMesaj) await context.paseo.agents.ref(agentId).send(kaliteMesaj);
        }
      } catch (error) {
        console.error("[paseo-verimlilik] dedektor hatasi", error);
      }

      try {
        const state = turDurumu.get(agentId) ?? { oncekiEditliCompleted: false, oncekiCompleted: false };
        const mesajlar = kullaniciMesajlari(event.timeline);
        const buTurunPromptu = mesajlar.length > 0 ? mesajlar[mesajlar.length - 1] : "";
        if (state.oncekiEditliCompleted && mesajlar.length >= 2) {
          const ret = RET_DESENI.test(buTurunPromptu);
          kabulKaydet(event.agent.cwd, agentId, event.agent.provider, !ret, "onceki-tur-prompt-deseni(T)");
        }
        if (state.oncekiCompleted && mesajlar.length >= 2 && KARISIKLIK_DESENI.test(buTurunPromptu)) {
          karisiklikKaydet(event.agent.cwd, agentId, event.agent.provider, "onceki-tur-prompt-deseni(T)");
        }
        const editli = editliTur;
        state.oncekiCompleted = event.outcome.kind === "completed";
        state.oncekiEditliCompleted = event.outcome.kind === "completed" && editli;
        turDurumu.set(agentId, state);
      } catch (error) {
        console.error("[paseo-verimlilik] kabul takip hatasi", error);
      }

      let usage = null;
      let model: string | null = null;
      try {
        const snap = await context.paseo.agents.ref(agentId).refresh();
        usage = snap?.agent?.lastUsage ?? null;
        model = snap?.agent?.model ?? null;
      } catch {
        // usage alinamazsa null kalir
      }
      turKaydet({
        agent: event.agent,
        turnId: event.turnId,
        outcome: event.outcome,
        timeline: event.timeline,
        usage,
        model,
        loopDurtme,
        finishGateDurtme,
      });
    }),
  );

  removers.push(
    server.on("agent.permission_requested", async (event, context) => {
      paseoRef = context.paseo;
      try {
        const rol = rolCoz(event.agent.title ?? null);
        if (rol && rol.profil !== "tam") {
          await rolIzinKontrol(event.agent, event.request, context, rol);
        } else {
          await permissionKontrol(event.agent, event.request, context);
        }
      } catch (error) {
        console.error("[paseo-verimlilik] permission hatasi", error);
      }
    }),
  );

  removers.push(
    server.on("agent.closed", (event) => {
      aktifAjanlar.delete(event.agent.id);
      aktifTurler.delete(event.agent.id);
    }),
  );

  server.handle(sozlesmeEnjekte, enjekteHandler);
  server.handle(telemetriOzet, ({ cwd }) => telemetriOzetle(cwd));
  server.handle(sonDegerlendirme, ({ cwd }) => sonDegerlendirmeOku(cwd));

  return () => {
    for (const remove of removers) remove();
  };
}