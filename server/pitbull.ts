import type { PluginHookAgent, PluginHookContext } from "@getpaseo/plugin/server";
import { telemetriYaz } from "./telemetry";
import { ayarOku, VARSAYILAN_AYAR, type VerimlilikAyar } from "./ayar";
import { modCoz } from "./modlar";

const TARAMA_MS = 60_000;
const YAZICI_STALL_ESIK_MS = 15 * 60_000;
const OKUYUCU_STALL_ESIK_MS = 20 * 60_000;
const DURTME_COOLDOWN_MS = 10 * 60_000;
const MAKS_ARDISIK_STALL = 3;
const MAKS_OTURUM_DURTME = 5;
const BAYAT_TUR_MS = 24 * 60 * 60_000;
const FIRTINA_STALL_ESIK_MS = 8 * 60_000;

// K-0032 (v0.19): firtina modunda agresif takilma tespiti (8dk); diger modlarda ayar degerleri aynen korunur.
export function takilmaEsigiMs(modAd: string | null | undefined, yaziciMi = true, ayar: VerimlilikAyar = VARSAYILAN_AYAR): number {
  if (modAd === "firtina") return FIRTINA_STALL_ESIK_MS;
  return (yaziciMi ? ayar.pitbullYaziciDk : ayar.pitbullOkuyucuDk) * 60_000;
}

interface PitbullState {
  turBaslangic: number | null;
  ardisikStall: number;
  sonDurtme: number;
  sonTurEditliydi: boolean;
  toplamDurtme: number;
}

const durum = new Map<string, PitbullState>();

// K-0025 (A2-1): agent.closed sonrasi bellek sizintisini onler.
export function ajanTemizle(agentId: string): void {
  durum.delete(agentId);
}
const PLUGIN_BASLANGIC = Date.now();

function stateAl(agentId: string): PitbullState {
  let s = durum.get(agentId);
  if (!s) {
    s = { turBaslangic: null, ardisikStall: 0, sonDurtme: PLUGIN_BASLANGIC, sonTurEditliydi: false, toplamDurtme: 0 };
    durum.set(agentId, s);
  }
  return s;
}

export function pitbullTurBasladi(agentId: string, simdi?: number): void {
  const s = stateAl(agentId);
  s.turBaslangic = simdi ?? Date.now();
}

export function pitbullTurBitti(agentId: string, editliMi = false): void {
  const s = stateAl(agentId);
  s.turBaslangic = null;
  s.ardisikStall = 0;
  s.sonTurEditliydi = editliMi;
}

export function pitbullTara(
  ajanlar: Map<string, PluginHookAgent>,
  gonder: (agent: PluginHookAgent, mesaj: string) => Promise<void>,
): { dirtulen: number; insanKapisi: number } {
  const simdi = Date.now();
  let dirtulen = 0;
  let insanKapisi = 0;
  for (const [agentId, agent] of ajanlar) {
    const s = durum.get(agentId);
    if (!s || s.turBaslangic === null) continue;
    // Bayat turBaslangic korumasi: 24 saatten eski acik tur = tur_ended hic gelmemis (ajan olu/kapali) — durtme uretme
    if (simdi - s.turBaslangic > BAYAT_TUR_MS) {
      s.turBaslangic = null;
      s.ardisikStall = 0;
      telemetriYaz(agent.cwd, { ts: new Date().toISOString(), tip: "lint", agentId, provider: agent.provider, detay: "pitbull-bayat-tur sifirlandi" });
      continue;
    }
    if (s.toplamDurtme >= MAKS_OTURUM_DURTME) continue;
    const stallSuresi = simdi - s.turBaslangic;
    const yaziciModu = s.sonTurEditliydi;
    const ayar = ayarOku(agent.cwd);
    const modAd = (modCoz(agent.cwd, agent.provider, null)?.ad ?? null) as string | null;
    const esik = takilmaEsigiMs(modAd, yaziciModu, ayar);
    if (stallSuresi < esik) continue;
    if (simdi - s.sonDurtme < DURTME_COOLDOWN_MS) continue;
    if (s.ardisikStall >= MAKS_ARDISIK_STALL) {
      insanKapisi++;
      telemetriYaz(agent.cwd, {
        ts: new Date().toISOString(),
        tip: "lint",
        agentId,
        provider: agent.provider,
        detay: "pitbull-insan-kapisi ardisikStall=" + s.ardisikStall,
      });
      console.error(`[paseo-verimlilik] pitbull insan kapisi: ${agentId} (${s.ardisikStall} ardisik stall)`);
      s.turBaslangic = null;
      s.ardisikStall = 0;
      continue;
    }
    s.ardisikStall++;
    s.toplamDurtme++;
    s.sonDurtme = simdi;
    dirtulen++;
    telemetriYaz(agent.cwd, {
      ts: new Date().toISOString(),
      tip: "lint",
      agentId,
      provider: agent.provider,
      detay: "pitbull-durtme sinif=" + (yaziciModu ? "yazici" : "okuyucu") + " stallSn=" + Math.round(stallSuresi / 1000) + " ardisik=" + s.ardisikStall,
    });
    void gonder(
      agent,
      yaziciModu
        ? "[paseo-verimlilik · pitbull] Tur " + Math.round(stallSuresi / 60) + " dakikadır açık ve yazım kümesi sessiz (önceki tur editliydi) — sessiz ölüm şüphesi. 2 satır durum raporu (ilk satır bağlam yüzdesi) + kaldığın yerden devam veya blokajı yaz. 2. ardışık dürtmede dur (§7.6)."
        : "[paseo-verimlilik · pitbull] Tur " + Math.round(stallSuresi / 60) + " dakikadır açık — takıldıysan: 2 satır durum raporu (ilk satır bağlam yüzdesi) + kaldığın yerden devam. Aynı konuda 2. ardışık dürtmede dur ve kullanıcı işareti bekle (rehber §7.6).",
    ).catch((error) => console.error("[paseo-verimlilik] pitbull gonderim hatasi", error));
  }
  return { dirtulen, insanKapisi };
}

export function pitbullBaslat(
  ajanlar: Map<string, PluginHookAgent>,
  gonder: (agent: PluginHookAgent, mesaj: string) => Promise<void>,
): () => void {
  const timer = setInterval(() => {
    try {
      pitbullTara(ajanlar, gonder);
    } catch (error) {
      console.error("[paseo-verimlilik] pitbull tarama hatasi", error);
    }
  }, TARAMA_MS);
  return () => clearInterval(timer);
}
export function _testIcinDurumVer(agentId: string): PitbullState | undefined {
  return durum.get(agentId);
}
