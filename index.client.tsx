import type { PluginClientContext } from "@getpaseo/plugin/client";
import { sozlesmeEnjekte, telemetriOzet } from "./shared/contracts";

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

  client.addCommandCenterItem({
    id: "telemetri-ozet",
    title: "Verimlilik telemetri özetini kopyala",
    icon: "Activity",
    keywords: ["telemetri", "ozet", "kabul", "tur", "verimlilik"],
    context: "workspace",
    async onSelect({ workspace, rpc }) {
      const ozet = await rpc(telemetriOzet, { cwd: workspace.directory });
      console.log("[paseo-verimlilik] telemetri ozeti", ozet);
    },
  });

  return () => {};
}