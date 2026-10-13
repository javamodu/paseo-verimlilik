import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { PluginHookAgent } from "@getpaseo/plugin/server";
import type { PaseoApi } from "@getpaseo/client";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { sozlesmeEnjekte, telemetriOzet, sonDegerlendirme, modDurum, modAyarla, panoDurum, orduEmir } from "./shared/contracts";
import { enjeksiyonMetni } from "./server/sozlesme";
import { kabulKaydet, karisiklikKaydet, lintKaydet, telemetriOzetle, turBaslat, turKaydet } from "./server/telemetry";
import { loopKontrol } from "./server/loopguard";
import { finishGateKontrol } from "./server/finishgate";
import { permissionKontrol } from "./server/permission";
import { pitbullAktivite, pitbullBaslat, pitbullTurBasladi, pitbullTurBitti } from "./server/pitbull";
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
import { modCoz, modDurumOku, modAyarla as modAyarlaUygula, contextRotOrani, rotDurtmeliMi } from "./server/modlar";
import { ajanTemizleHepsi } from "./server/temizlik";
import { panoBaslat } from "./server/pano";
import { orduDongu, orduAyarOku, aktifWorkerSay, MANAGER_BRIEF } from "./server/ordu";
import { repolariBul } from "./server/planmd";


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
  const aktiviteAbonelikleri = new Map<string, (() => void) & { ready: Promise<void> }>();

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
      const mod = modCoz(request.config.cwd, request.config.provider, request.config.model ?? null);
      const ekler = [rol?.sistemEki, mod?.sistemEki].filter((e): e is string => !!e);
      let sonuc;
      try {
        sonuc = enjeksiyonMetni(request.config.cwd, mevcut, ekler.length > 0 ? ekler.join("\n") : null);
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
      if (mod?.thinking && !yeniConfig.thinkingOptionId) yeniConfig.thinkingOptionId = mod.thinking;
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
      // K-0033: tur-ici aktivite kalbi — pitbull stall'i tur suresi degil, son timeline olayindan olculur.
      try {
        const oncekiAbone = aktiviteAbonelikleri.get(event.agent.id);
        if (oncekiAbone) { aktiviteAbonelikleri.delete(event.agent.id); oncekiAbone(); }
        const aboneAgentId = event.agent.id;
        const abonelik = context.paseo.agents.ref(aboneAgentId).timeline.subscribe((olay) => {
          if (olay && "event" in olay && olay.event && (olay.event as { type?: string }).type === "timeline") {
            pitbullAktivite(aboneAgentId);
          }
        });
        abonelik.ready.catch(() => undefined);
        aktiviteAbonelikleri.set(aboneAgentId, abonelik);
      } catch (error) {
        console.error("[paseo-verimlilik] pitbull aktivite aboneligi kurulamadi", error);
      }
    }),
  );

  removers.push(
    server.on("agent.turn_ended", async (event, context) => {
      paseoRef = context.paseo;
      const agentId = event.agent.id;
      let loopDurtme = false;
      let finishGateDurtme = false;
      // K-0029 (A2-5): turKaydet finally'de — govdedeki hata tur kaydini ve aktifTur dusumunu atlamaz.
      let usage = null;
      let model: string | null = null;
      let modBilgi: ReturnType<typeof modCoz> = null;
      try {
        aktifTurler.delete(agentId);
        const kapananAbone = aktiviteAbonelikleri.get(agentId);
        if (kapananAbone) { aktiviteAbonelikleri.delete(agentId); try { kapananAbone(); } catch { /* abonelik zaten kopuk olabilir */ } }
        // K-fix: ozetleme hatasi pitbullTurBitti'yi atlayamaz — aksi halde abort/canceled turda
        // turBaslangic acik kalir ve pitbull sahte "takilma" durtmesi uretir.
        let ozetlerTur: ReturnType<typeof turCagrilari> = [];
        let editliTur = false;
        try {
          ozetlerTur = turCagrilari(event.timeline);
          editliTur = editliMi(ozetlerTur);
        } catch (ozetHata) {
          console.error("[paseo-verimlilik] tur ozetleme hatasi (tur yine kapanir)", ozetHata);
        }
        pitbullTurBitti(agentId, editliTur);
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

      try {
        const snap = await context.paseo.agents.ref(agentId).refresh();
        usage = snap?.agent?.lastUsage ?? null;
        model = snap?.agent?.model ?? null;
      } catch {
        // usage alinamazsa null kalir
      }
      modBilgi = modCoz(event.agent.cwd, event.agent.provider, model);
      } catch (error) {
        console.error("[paseo-verimlilik] turn_ended govde hatasi", error);
      } finally {
        try {
          turKaydet({
            agent: event.agent,
            turnId: event.turnId,
            outcome: event.outcome,
            timeline: event.timeline,
            usage,
            model,
            mod: modBilgi?.ad ?? null,
            loopDurtme,
            finishGateDurtme,
          });
        } catch (error) {
          console.error("[paseo-verimlilik] turKaydet hatasi", error);
        }
      }
      if (modBilgi?.ad === "atolye") {
        const oran = contextRotOrani(usage);
        if (oran !== null && oran >= 0.8 && rotDurtmeliMi(agentId, Date.now())) {
          gonderAjana(event.agent, "[paseo-verimlilik · context-rot] Bağlam penceresi %" + Math.round(oran * 100) + " dolu (ATÖLYE freni) — yeni turda taze oturum önerilir.").catch((e) => console.error("[paseo-verimlilik] rot durtme hatasi", e));
        }
      }
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
      turDurumu.delete(event.agent.id);
      const kapananAbone2 = aktiviteAbonelikleri.get(event.agent.id);
      if (kapananAbone2) { aktiviteAbonelikleri.delete(event.agent.id); try { kapananAbone2(); } catch { /* abonelik zaten kopuk olabilir */ } }
      ajanTemizleHepsi(event.agent.id);
    }),
  );

  server.handle(sozlesmeEnjekte, enjekteHandler);
  server.handle(telemetriOzet, ({ cwd }) => telemetriOzetle(cwd));
  server.handle(modDurum, ({ cwd }) => modDurumOku(cwd));
  server.handle(modAyarla, ({ cwd, mod, provider, model }) => modAyarlaUygula(cwd, mod, provider, model));
  const pano = panoBaslat(() => paseoRef);
  removers.push(pano.kapat);

  const orduSayac = setInterval(() => {
    if (!paseoRef) return;
    const kokler = (process.env.PANO_KOKLER ?? "D:\\Vibecode").split(";");
    for (const repo of repolariBul(kokler)) {
      orduDongu(paseoRef, repo.yol, repo.ad).catch((e) => console.error("[paseo-verimlilik] ordu dongu hatasi", repo.ad, e));
    }
  }, 5000);
  removers.push(() => clearInterval(orduSayac));

  server.handle(sonDegerlendirme, ({ cwd }) => sonDegerlendirmeOku(cwd));
  server.handle(panoDurum, (_input, { paseo }) => { paseoRef = paseo; return pano.durum(); });
  server.handle(orduEmir, async ({ cwd, emir }, { paseo }) => {
    paseoRef = paseo;
    if (!emir.trim()) return { ok: false, managerId: null, mesaj: "bos emir" };
    const ayar = orduAyarOku(cwd);
    const mevcut = await aktifWorkerSay(paseo, cwd);
    let managerId = mevcut.managerId;
    if (!managerId) {
      const handle = await paseo.agents.create({
        config: { provider: ayar.managerProvider },
        cwd,
        title: "ordu manager",
        prompt: MANAGER_BRIEF,
        labels: { ordu: "manager" },
      } as Parameters<typeof paseo.agents.create>[0]);
      managerId = handle.id;
    }
    await paseo.agents.ref(managerId).send("[ORDU-EMRI] " + emir);
    return { ok: true, managerId, mesaj: mevcut.managerId ? "emir mevcut manager'a iletildi" : "manager yaratildi, emir iletildi" };
  });

  return () => {
    for (const remove of removers) remove();
  };
}