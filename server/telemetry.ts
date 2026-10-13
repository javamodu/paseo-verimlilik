import { execFileSync } from "node:child_process";
import { mkdirSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PluginHookAgent, PluginTurnOutcome } from "@getpaseo/plugin/server";
import type { AgentTimelineItem, AgentUsage } from "@getpaseo/protocol/agent-types";
import { editCagrilari, turCagrilari, latestOutputText } from "./inspect";
import { katmanKokuBul } from "./sozlesme";
import { PLUGIN_SURUM } from "./surum";
import { rolCoz } from "./roller";
import { haftalikRollup } from "./rollup";

export interface TelemetriKayit {
  ts: string;
  tip: "tur" | "kabul" | "lint" | "karisiklik";
  agentId: string;
  provider: string;
  turnId?: string | null;
  outcome?: PluginTurnOutcome["kind"];
  turSayisi?: number;
  turSn?: number;
  toolCalls?: number;
  editCalls?: number;
  shellCalls?: number;
  failedCalls?: number;
  loopDurtme?: boolean;
  finishGateDurtme?: boolean;
  kabul?: boolean;
  kabulSinyali?: string;
  pluginSurum?: string;
  rol?: string;
  model?: string;
  mod?: string;
  altAjan?: boolean;
  inTok?: number;
  outTok?: number;
  cacheTok?: number;
  maliyetUsd?: number;
  kuralToplam?: number;
  butceBytes?: number;
  detay?: string;
  locDelta?: number | null;
  decodeTps?: number;
  testKosu?: number;
  testKirmizi?: number;
  halRef?: number;
  halKirik?: number;
  editDosyalari?: string[];
}

const turSayaclari = new Map<string, number>();
const turBaslangiclari = new Map<string, number>();
const locBaslangiclari = new Map<string, { sha: string | null; uncommitted: number | null }>();

// K-0032 (v0.19): tur baslangicinda working-tree numstat toplami (ekleme+silme).
// Git yoksa / repo degilse null - asla exception firlatmaz.
function locSnapshot(cwd: string): number | null {
  try {
    const cikti = execFileSync("git", ["diff", "--numstat", "HEAD"], {
      cwd,
      timeout: 2000, // K-0032 (R3-02): event-loop blokajini sinirla
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    let toplam = 0;
    for (const satir of cikti.split(/\r?\n/)) {
      const m = satir.match(/^(\d+)\s+(\d+)\s+/);
      if (m) toplam += parseInt(m[1], 10) + parseInt(m[2], 10);
    }
    return toplam;
  } catch {
    return null;
  }
}

// K-0025 (A2-1): agent.closed sonrasi bellek sizintisini onler.
export function ajanTemizle(agentId: string): void {
  turSayaclari.delete(agentId);
  locBaslangiclari.delete(agentId);
  // K-0029 (A2-6): acik turu kapanmadan kapanan ajan aktifTur'u sisirmesin.
  if (turBaslangiclari.delete(agentId)) {
    aktifTur = Math.max(0, aktifTur - 1);
  }
}
export function _testIcinAktifTur(): number {
  return aktifTur;
}
let aktifTur = 0;
let rollupSayisi = 0;
const sonRollup = new Map<string, number>();
export function _testIcinRollupSayisi(): number {
  return rollupSayisi;
}
export const PARALEL_TAVAN = 3;

export function telemetriDosyasi(cwd: string): string {
  return join(katmanKokuBul(cwd), ".verimlilik", "telemetri.jsonl");
}

export function telemetriYaz(cwd: string, kayit: TelemetriKayit): void {
  try {
    const dosya = telemetriDosyasi(cwd);
    // K-0028 (A2-4): mkdir hedef dosyanin dizininde — alt-dizin cwd'sinde kok .verimlilik yoksa kayit sessizce dusuyordu.
    mkdirSync(dirname(dosya), { recursive: true });
    appendFileSync(dosya, JSON.stringify(kayit) + "\n", "utf8");
  } catch (error) {
    console.error("[paseo-verimlilik] telemetri yazim hatasi", error);
  }
}

// K-0032 (v0.21): saf metrik yardimcilari
export function decodeTpsHesap(outTok: number | undefined, turSn: number | undefined): number | null {
  if (!outTok || !turSn || turSn <= 0) return null;
  return Math.round((outTok / turSn) * 10) / 10;
}

const TEST_KOMUTU = /\b(npm (run )?test(:\w+)?|npx (vitest|jest)|vitest|jest|go test|pytest|cargo test)\b/;
export function testKomutuMu(cmd: string): boolean {
  return TEST_KOMUTU.test(cmd);
}

// K-0032 (v0.21): halusinasyon proxy'si — cikti metnindeki dosya:satir referanslari diske karsi dogrulanir.
const HAL_DESEN = /(?:^|[\s(`"'])((?:[\w.\-]+[\/\\])*[\w.\-]+\.(?:ts|tsx|js|mjs|py|md|go|rs|json)):(\d{1,6})\b/g;
export function halRefTara(metin: string, cwd: string): { toplam: number; kirik: number } {
  let toplam = 0, kirik = 0;
  HAL_DESEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HAL_DESEN.exec(metin)) !== null && toplam < 10) {
    toplam++;
    try {
      const p = join(cwd, m[1]);
      if (!existsSync(p)) { kirik++; continue; }
      const satirSayisi = readFileSync(p, "utf8").split(/\r?\n/).length;
      if (parseInt(m[2], 10) > satirSayisi) kirik++;
    } catch { kirik++; }
  }
  return { toplam, kirik };
}

// K-0032 (v0.20, BK-02): tur baslangic HEAD'i — commit-aware locDelta icin.
export function headSha(cwd: string): string | null {
  try {
    const s = execFileSync("git", ["rev-parse", "HEAD"], { cwd, timeout: 2000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return s || null;
  } catch { return null; }
}

// K-0032 (v0.20, BK-02): iki rev arasi numstat toplami (ekleme+silme). Git yoksa null.
export function commitSatirlari(cwd: string, eski: string, yeni: string): number | null {
  try {
    const cikti = execFileSync("git", ["diff", "--numstat", eski, yeni], { cwd, timeout: 2000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    let toplam = 0;
    for (const satir of cikti.split(/\r?\n/)) {
      const m = satir.match(/^(\d+)\s+(\d+)\s+/);
      if (m) toplam += parseInt(m[1], 10) + parseInt(m[2], 10);
    }
    return toplam;
  } catch { return null; }
}

export function turBaslat(agentId: string, cwd?: string): number {
  turBaslangiclari.set(agentId, Date.now());
  aktifTur++;
  if (cwd) {
    locBaslangiclari.set(agentId, { sha: headSha(cwd), uncommitted: locSnapshot(cwd) });
  }
  if (cwd && aktifTur > PARALEL_TAVAN) {
    telemetriYaz(cwd, {
      ts: new Date().toISOString(),
      tip: "lint",
      agentId,
      provider: "-",
      detay: "paralellik-asimi aktifTur=" + aktifTur,
    });
  }
  const sayi = (turSayaclari.get(agentId) ?? 0) + 1;
  turSayaclari.set(agentId, sayi);
  return sayi;
}

export function turKaydet(input: {
  agent: PluginHookAgent;
  turnId: string | null;
  outcome: PluginTurnOutcome;
  timeline: readonly AgentTimelineItem[];
  usage: AgentUsage | null;
  model?: string | null;
  mod?: string | null;
  loopDurtme: boolean;
  finishGateDurtme: boolean;
}): void {
  const ozetler = turCagrilari(input.timeline);
  const shell = ozetler.filter((o) => o.command !== undefined);
  const edits = editCagrilari(ozetler);
  const dosyaSet = new Set<string>();
  for (const e of edits) {
    if (e.filePath) dosyaSet.add(e.filePath);
  }
  const usage = input.usage;
  const detayParca: string[] = [];
  if (usage?.inputTokens) {
    const hit = usage.cachedInputTokens && usage.inputTokens > 0
      ? Math.round((usage.cachedInputTokens / usage.inputTokens) * 1000) / 10
      : null;
    detayParca.push(`in=${usage.inputTokens}`);
    if (hit !== null) detayParca.push(`cacheHitPct=${hit}`);
    if (usage.outputTokens) detayParca.push(`out=${usage.outputTokens}`);
  }
  aktifTur = Math.max(0, aktifTur - 1);
  // K-0032 (v0.21): hiz/kalite sinyalleri
  const t0v21 = turBaslangiclari.get(input.agent.id);
  const turSnV21 = t0v21 ? Math.round((Date.now() - t0v21) / 1000) : undefined;
  const testKosuV21 = shell.filter((o) => o.exitCode !== undefined && o.exitCode !== null && testKomutuMu(o.command ?? "")).length;
  const testKirmiziV21 = shell.filter((o) => o.exitCode !== undefined && o.exitCode !== null && o.exitCode !== 0 && testKomutuMu(o.command ?? "")).length;
  const halV21 = halRefTara(latestOutputText(input.timeline), input.agent.cwd);
  // K-0032 (v0.19): baslangic snapshot'i ile fark; git'siz ortamda null.
  const locBaslangic = locBaslangiclari.get(input.agent.id);
  locBaslangiclari.delete(input.agent.id);
  // K-0032 (v0.20, BK-02): commit-aware — tur icinde atilan commit'lerin satirlari + uncommitted fark.
  const locDelta = !locBaslangic || locBaslangic.uncommitted === null
    ? null
    : (() => {
        const simdi = locSnapshot(input.agent.cwd);
        if (simdi === null) return null;
        const simdiSha = headSha(input.agent.cwd);
        const commitSatir = locBaslangic.sha && simdiSha && locBaslangic.sha !== simdiSha
          ? (commitSatirlari(input.agent.cwd, locBaslangic.sha, simdiSha) ?? 0)
          : 0;
        return commitSatir + (simdi - (locBaslangic.uncommitted as number));
      })();
  telemetriYaz(input.agent.cwd, {
    ts: new Date().toISOString(),
    tip: "tur",
    agentId: input.agent.id,
    provider: input.agent.provider,
    pluginSurum: PLUGIN_SURUM,
    rol: rolCoz(input.agent.title ?? null)?.ad,
    model: input.model ?? undefined,
    mod: input.mod ?? undefined,
    altAjan: input.agent.parentAgentId ? true : undefined,
    inTok: usage?.inputTokens ?? undefined,
    outTok: usage?.outputTokens ?? undefined,
    cacheTok: usage?.cachedInputTokens ?? undefined,
    maliyetUsd: usage?.totalCostUsd ?? undefined,
    turnId: input.turnId,
    outcome: input.outcome.kind,
    turSayisi: turSayaclari.get(input.agent.id) ?? 1,
    turSn: turSnV21,
    decodeTps: decodeTpsHesap(usage?.outputTokens ?? undefined, turSnV21) ?? undefined,
    testKosu: testKosuV21 || undefined,
    testKirmizi: testKirmiziV21 || undefined,
    halRef: halV21.toplam || undefined,
    halKirik: halV21.kirik || undefined,
    toolCalls: ozetler.length,
    shellCalls: shell.length,
    editCalls: edits.length,
    failedCalls: ozetler.filter((o) => o.status === "failed").length,
    loopDurtme: input.loopDurtme || undefined,
    finishGateDurtme: input.finishGateDurtme || undefined,
    locDelta,
    editDosyalari: dosyaSet.size > 0 ? [...dosyaSet] : undefined,
    detay: detayParca.length > 0 ? detayParca.join(" ") : undefined,
  });
  // K-0029 (A2-6): tur kapandi — baslangic kaydi temizlenir; kalan kayit = acik tur.
  turBaslangiclari.delete(input.agent.id);
  // K-0029 (A2-8): rollup her turda tam jsonl okur — 60sn seyreklestirme.
  try {
    const sonR = sonRollup.get(input.agent.cwd) ?? 0;
    if (Date.now() - sonR > 60_000) {
      sonRollup.set(input.agent.cwd, Date.now());
      rollupSayisi++;
      haftalikRollup(input.agent.cwd);
    }
  } catch (error) {
    console.error("[paseo-verimlilik] rollup hatasi", error);
  }
}

export function kabulKaydet(cwd: string, agentId: string, provider: string, kabul: boolean, sinyal: string): void {
  telemetriYaz(cwd, {
    ts: new Date().toISOString(),
    tip: "kabul",
    agentId,
    provider,
    kabul,
    kabulSinyali: sinyal,
  });
}

export function karisiklikKaydet(cwd: string, agentId: string, provider: string, sinyal: string): void {
  telemetriYaz(cwd, {
    ts: new Date().toISOString(),
    tip: "karisiklik",
    agentId,
    provider,
    detay: sinyal,
  });
}

export function lintKaydet(cwd: string, alan: { kuralToplam: number; butceBytes: number; not?: string }): void {
  telemetriYaz(cwd, {
    ts: new Date().toISOString(),
    tip: "lint",
    agentId: "-",
    provider: "-",
    kuralToplam: alan.kuralToplam,
    butceBytes: alan.butceBytes,
    detay: alan.not,
  });
}

export function telemetriOzetle(cwd: string): {
  dosya: string; tur: number; loopDurtme: number; finishGateDurtme: number;
  kabul: number; ret: number; kabulOrani: number | null; anlasilmazlik: number;
  inTok: number; outTok: number; cacheTok: number; ortTurSn: number | null;
  modeller: Record<string, number>; maliyetUsd: number; modlar: Record<string, number>;
  altAjan: number;
} {
  const dosya = telemetriDosyasi(cwd);
  let tur = 0, loopDurtme = 0, finishGateDurtme = 0, kabul = 0, ret = 0, anlasilmazlik = 0;
  let inTok = 0, outTok = 0, cacheTok = 0, turSnToplam = 0, turSnAdet = 0, maliyetToplam = 0, altAjan = 0;
  const modeller: Record<string, number> = {};
  const modlar: Record<string, number> = {};
  if (existsSync(dosya)) {
    for (const satir of readFileSync(dosya, "utf8").split(/\r?\n/)) {
      if (!satir.trim()) continue;
      try {
        const kayit = JSON.parse(satir) as TelemetriKayit;
        if (kayit.tip === "tur") {
          tur++;
          inTok += kayit.inTok ?? 0;
          outTok += kayit.outTok ?? 0;
          cacheTok += kayit.cacheTok ?? 0;
          maliyetToplam += kayit.maliyetUsd ?? 0;
          if (typeof kayit.turSn === "number") { turSnToplam += kayit.turSn; turSnAdet++; }
          if (kayit.model) modeller[kayit.model] = (modeller[kayit.model] ?? 0) + 1;
          if (kayit.mod) modlar[kayit.mod] = (modlar[kayit.mod] ?? 0) + 1;
          if (kayit.altAjan) altAjan++;
        }
        if (kayit.loopDurtme) loopDurtme++;
        if (kayit.finishGateDurtme) finishGateDurtme++;
        if (kayit.tip === "kabul") {
          if (kayit.kabul) kabul++; else ret++;
        }
        if (kayit.tip === "karisiklik") anlasilmazlik++;
      } catch {
        // bozuk satir atlanir
      }
    }
  }
  const toplam = kabul + ret;
  return {
    dosya, tur, loopDurtme, finishGateDurtme, kabul, ret, altAjan,
    kabulOrani: toplam > 0 ? Math.round((kabul / toplam) * 1000) / 10 : null,
    anlasilmazlik,
    inTok, outTok, cacheTok,
    ortTurSn: turSnAdet > 0 ? Math.round(turSnToplam / turSnAdet) : null,
    modeller,
    maliyetUsd: Math.round(maliyetToplam * 10000) / 10000,
    modlar,
  };
}
