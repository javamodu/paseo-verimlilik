import type { PluginHookAgent, PluginHookContext } from "@getpaseo/plugin/server";
import type { AgentPermissionRequest } from "@getpaseo/protocol/agent-types";
import { shellCommand } from "./inspect";
import { telemetriYaz } from "./telemetry";

const TEHLIKE_DESENI = /\b(rm\s+-rf|rm\s+-fr|Remove-Item\b.*-Recurse|push\b.*--force|push\s+-f\b|reset\s+--hard|DROP\s+TABLE|Format-Volume|del\s+\/[sq]|mkfs|shutdown|format\s+[a-z]:)\b/i;
const ZINCIR_DESENI = /[>|&;`]|&&|\|\|/;
const ALLOW_KOMUTLARI = /^(git\s+(status|log|diff|show|branch|blame|shortlog|remote\s+-v|stash\s+list)|ls|dir|Get-ChildItem|Get-Content|Get-Item|cat|type|rg|grep|find|where|echo\s+["']?[A-Za-z0-9 _.-]*["']?|npm\s+(ls|list|outdated|view|audit)|node\s+--version|npm\s+--version|git\s+--version|pwd|Get-Location|Test-Path)\b/i;

export function izinKarari(komut: string | null): "allow" | "deny" | null {
  if (komut === null) {
    return null;
  }
  const k = komut.trim();
  if (TEHLIKE_DESENI.test(k)) {
    return "deny";
  }
  if (ZINCIR_DESENI.test(k)) {
    return null;
  }
  if (ALLOW_KOMUTLARI.test(k)) {
    return "allow";
  }
  return null;
}

export async function permissionKontrol(
  agent: PluginHookAgent,
  request: AgentPermissionRequest,
  context: PluginHookContext,
): Promise<void> {
  const komut = shellCommand(request);
  const karar = izinKarari(komut);
  if (karar === null) {
    return;
  }
  const komutAdi = komut ? komut.trim().split(/\s+/)[0] : "?";
  try {
    if (karar === "deny") {
      await context.paseo.agents.ref(agent.id).respondToPermission({
        requestId: request.id,
        response: { behavior: "deny", message: "paseo-verimlilik permission polisi: tehlikeli komut kalibi engellendi (" + komutAdi + " ...)" },
      });
    } else {
      await context.paseo.agents.ref(agent.id).respondToPermission({
        requestId: request.id,
        response: { behavior: "allow" },
      });
    }
    telemetriYaz(agent.cwd, {
      ts: new Date().toISOString(),
      tip: "lint",
      agentId: agent.id,
      provider: agent.provider,
      detay: "izin:" + karar + " komut=" + komutAdi,
    });
  } catch (error) {
    console.error("[paseo-verimlilik] permission yanit hatasi", error);
  }
}