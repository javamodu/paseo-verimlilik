import type { PluginHookContext } from "@getpaseo/plugin/server";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { editliMi, latestOutputText, sonKullaniciMesajiIndex, toolCallOzetleri } from "./inspect";

const TAMAMLANMA_DESENI = /\b(tamam(landı|landi)?|bitti|hazır|hazir|geçti|gecti|başarılı|basarili|passed|done|complet(ed|e)|yeşil|yesil)\b/i;
const DOGRULAMA_DESENI = /\b(npm\s+(run\s+)?(test|typecheck|lint|build)|npx\s+(tsc|vitest|jest|tsx\s+test)|pnpm\s+(test|typecheck|lint)|yarn\s+(test|build)|tsc\b|pytest|vitest|jest|mocha|cargo\s+test|go\s+test|dotnet\s+test|saglik\.ps1|zincir-kontrol\.ps1)/i;
const MAKS_ARDISIK_DURTME = 2;

const durum = new Map<string, number>();

export async function finishGateKontrol(
  agentId: string,
  timeline: readonly AgentTimelineItem[],
  context: PluginHookContext,
): Promise<boolean> {
  const metin = latestOutputText(timeline);
  if (!TAMAMLANMA_DESENI.test(metin)) {
    durum.set(agentId, 0);
    return false;
  }
  const sonMesaj = sonKullaniciMesajiIndex(timeline);
  const cagri = toolCallOzetleri(sonMesaj >= 0 ? timeline.slice(sonMesaj + 1) : timeline);
  const isTurundaEditVar = editliMi(cagri);
  if (!isTurundaEditVar) {
    return false;
  }
  const kanit = cagri.some(
    (c) => c.command !== undefined && DOGRULAMA_DESENI.test(c.command) && c.exitCode === 0,
  );
  if (kanit) {
    durum.set(agentId, 0);
    return false;
  }
  const sayi = durum.get(agentId) ?? 0;
  if (sayi >= MAKS_ARDISIK_DURTME) {
    console.error(`[paseo-verimlilik] finish-gate insan kapisi: ${agentId}`);
    durum.set(agentId, 0);
    return false;
  }
  durum.set(agentId, sayi + 1);
  const hicShellYok = !cagri.some((c) => c.command !== undefined);
  const mesaj = hicShellYok
    ? "[paseo-verimlilik · finish-gate] Edit'li turu hic dogrulama komutu kosturmadan 'bitti' diye kapattin (Replit dersi: metin pass degildir). " +
      "Test/lint/typecheck kostur, exit-code 0'i raporla; kosturamiyorsan nedenini yaz."
    : "[paseo-verimlilik · finish-gate] 'Bitti' iddian dis sinyal kaniti tasimiyor — kostulan komutlar arasinda exit-0 dogrulama yok. " +
      "Test/lint/dogrulama komutunu kostur ve exit-code 0'i raporla; kosturamiyorsan nedenini yaz.";
  await context.paseo.agents.ref(agentId).send(
    mesaj + " Bu 2. ardisik uyarida kapi susar ve insan kapisi acilir.",
  );
  return true;
}