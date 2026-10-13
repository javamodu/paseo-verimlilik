import type { PluginHookAgent, PluginHookContext } from "@getpaseo/plugin/server";
import type { AgentPermissionRequest } from "@getpaseo/protocol/agent-types";
import { shellCommand } from "./inspect";
import { telemetriYaz } from "./telemetry";

const TEHLIKE_DESENI = /\b(rm\s+-rf|rm\s+-fr|Remove-Item\b.*-Recurse|push\b.*--force|push\s+-f\b|reset\s+--hard|DROP\s+TABLE|Format-Volume|del\s+\/[sq]|rd\s+\/s|git\s+clean\s+-[a-z]*f[a-z]*|git\s+checkout\s+--|mkfs|shutdown|format\s+[a-z]:)(?=\s|$)/i;
const ZINCIR_DESENI = /[>|&;`]|&&|\|\|/;
// K-0025 (A2-2): rg/find serbest argumanli; yazici/calistirici bayrak tasiyorsa otomatik izin yok, insan kapisina duser.
const SERBEST_ARGUMANLI = /^(rg|find)\b/i;
const OKUYUCU_YAZICI_BAYRAK = /(^|\s)(--pre\b|--pre-glob\b|-delete\b|-exec\b|-execdir\b|-ok\b|-okdir\b|-fls\b|-fprint\b|-fprintf\b)/;
// Salt-okuma beyaz listesi: komut + alt-komut + secenek birlesimi esasi (v0.8a).
// Okuyucu komutlarda arguman serbest; git/npm'de alt-komut ve bayrak kontrollu.
const OKUYUCU_TAM = /^(ls|dir|Get-ChildItem|Get-Content|Get-Item|cat|type|rg|grep|find|where|Test-Path|pwd|Get-Location|node\s+--version|npm\s+--version|git\s+--version)\b/i;
const ECHO_KISITLI = /^echo\s+["']?[A-Za-z0-9 _.-]*["']?$/i;
const GIT_SALT_OKUR = /^git\s+(status|log|diff|show|blame|shortlog)\b/i;
const NPM_SALT_OKUR = /^npm\s+(ls|list|outdated|view)\b/i;
const GIT_BRANCH = /^git\s+branch\b/i;
const BRANCH_YAZICI = /(^|\s)(-[dDmcCfFu]\b|--delete|--move|--copy|--force|--set-upstream-to\b|--unset-upstream\b|--edit-description\b)/;
const GIT_REMOTE_IZIN = /^git\s+remote\s+(-v|--verbose|show\s+\S+|get-url\s+\S+)\s*$/i;
const GIT_STASH_IZIN = /^git\s+stash\s+(list|show(\s+\S+)?)\s*$/i;
const NPM_AUDIT_IZIN = /^npm\s+audit(\s+--(json|production|omit=\S+|audit-level=\S+|package-lock-only))*\s*$/i;

function branchSaltOkurMu(komut: string): boolean {
  if (BRANCH_YAZICI.test(komut)) return false;
  const tokenlar = komut.trim().split(/\s+/).slice(2);
  const bayrakVar = tokenlar.some((t) => t.startsWith("-"));
  const pozisyonel = tokenlar.filter((t) => !t.startsWith("-"));
  // Bayrak yokken pozisyonel arguman = dal olusturma (yazici). Bayrak varken pozisyonel = liste deseni.
  if (pozisyonel.length > 0 && !bayrakVar) return false;
  return true;
}

function izinVerilenMi(k: string): boolean {
  if (OKUYUCU_TAM.test(k) || ECHO_KISITLI.test(k)) return true;
  if (GIT_SALT_OKUR.test(k) || NPM_SALT_OKUR.test(k)) return true;
  if (GIT_BRANCH.test(k)) return branchSaltOkurMu(k);
  if (GIT_REMOTE_IZIN.test(k) || GIT_STASH_IZIN.test(k) || NPM_AUDIT_IZIN.test(k)) return true;
  return false;
}

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
  if (SERBEST_ARGUMANLI.test(k) && OKUYUCU_YAZICI_BAYRAK.test(k)) {
    return null;
  }
  if (izinVerilenMi(k)) {
    return "allow";
  }
  return null;
}

export async function izinYanitla(
  agent: PluginHookAgent,
  request: AgentPermissionRequest,
  context: PluginHookContext,
  karar: "allow" | "deny",
  komutAdi: string,
): Promise<void> {
  try {
    if (karar === "deny") {
      await context.paseo.agents.ref(agent.id).respondToPermission({
        requestId: request.id,
        response: { behavior: "deny", message: "paseo-verimlilik permission polisi: tehlikeli/yetkisiz komut engellendi (" + komutAdi + " ...)" },
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
  await izinYanitla(agent, request, context, karar, komutAdi);
}