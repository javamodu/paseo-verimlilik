import type { PluginClientContext } from "@getpaseo/plugin/client";
import { sozlesmeEnjekte, modAyarla } from "./shared/contracts";
import { TelemetriEkrani } from "./client/telemetri";
import { DegerlendirmeEkrani } from "./client/degerlendirme";

export default function contribute(client: PluginClientContext) {
  client.addCommandCenterItem({
    id: "enjekte-agent",
    title: "Sözleşmeyi bu ajana enjekte et",
    icon: "ScrollText",
    keywords: ["sozlesme", "cekirdek", "enjekte", "verimlilik"],
    context: "agent",
    async onSelect({ agent, rpc }) {
      await rpc(sozlesmeEnjekte, { agentId: agent.id });
    },
  });

  client.addCommandCenterItem({
    id: "enjekte-workspace",
    title: "Sözleşmeyi workspace'teki tüm ajanlara enjekte et",
    icon: "Layers",
    keywords: ["sozlesme", "cekirdek", "enjekte", "toplu", "verimlilik"],
    context: "workspace",
    async onSelect({ workspace, rpc }) {
      await rpc(sozlesmeEnjekte, { workspaceId: workspace.id });
    },
  });

  client.addScreen({ id: "telemetri", title: "Telemetri özeti", Component: TelemetriEkrani });
  client.addCommandCenterItem({
    id: "telemetri-ozet",
    title: "Verimlilik telemetri özetini aç",
    icon: "Activity",
    keywords: ["telemetri", "ozet", "kabul", "tur", "verimlilik"],
    context: "workspace",
    onSelect({ workspace, openScreen }) {
      openScreen({ screenId: "telemetri", params: { cwd: workspace.directory } });
    },
  });

  client.addScreen({ id: "degerlendirme", title: "Öz-değerlendirme", Component: DegerlendirmeEkrani });
  client.addCommandCenterItem({
    id: "degerlendirme-son",
    title: "Son öz-değerlendirme raporunu aç",
    icon: "Gauge",
    keywords: ["degerlendirme", "oz-degerlendirme", "rapor", "kilit", "kiyas"],
    context: "workspace",
    onSelect({ workspace, openScreen }) {
      openScreen({ screenId: "degerlendirme", params: { cwd: workspace.directory } });
    },
  });

  client.addSlashCommand({
    name: "mod",
    description: "Provider modu ayarla: atolye/matbaa/cerrah/serbest/sifirla (K-0018)",
    argumentHint: "[mod] [provider/model-deseni]",
    context: "workspace",
    async onSubmit({ args, workspace, rpc, openScreen }) {
      const parcalar = args.trim().split(/\s+/).filter(Boolean);
      if (parcalar.length === 0) {
        openScreen({ screenId: "telemetri", params: { cwd: workspace.directory } });
        return;
      }
      const modAd = parcalar[0].toLowerCase();
      let provider: string | undefined;
      let modelDeseni: string | undefined;
      if (parcalar[1]) {
        const i = parcalar[1].indexOf("/");
        if (i <= 0) throw new Error("provider/model bicimi bekleniyor (ornek: codex/kimi)");
        provider = parcalar[1].slice(0, i);
        modelDeseni = parcalar[1].slice(i + 1);
      }
      const r = await rpc(modAyarla, { cwd: workspace.directory, mod: modAd, provider, model: modelDeseni });
      if (!r.ok) throw new Error(r.mesaj);
    },
  });

  return () => {};
}