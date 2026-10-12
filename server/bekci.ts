import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PluginHookAgent } from "@getpaseo/plugin/server";
import { katmanKokuBul } from "./sozlesme";
import { ayarOku } from "./ayar";

export interface BekciAnomali {
  anahtar: string;
  detay: string;
}

export interface KomutSonuc {
  cikti: string;
  kod: number;
}

export type KomutCalistir = (komut: string[], cwd: string) => KomutSonuc;

const TARAMA_MS = 15 * 60_000;
const FAIL_PENCERE_TUR = 20;
const FAIL_ORAN_ESIK = 0.25;
const FAIL_MIN_TUR = 5;

export const gercekCalistir: KomutCalistir = (komut, cwd) => {
  try {
    const cikti = execFileSync(komut[0], komut.slice(1), { cwd, timeout: 90_000, encoding: "utf8", windowsHide: true });
    return { cikti, kod: 0 };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; message?: string };
    return { cikti: (e.stdout ?? "") + (e.message ?? ""), kod: e.status ?? 1 };
  }
};

function psKopru(repoKok: string, scriptAd: string, calistir: KomutCalistir): KomutSonuc | null {
  const yol = join(repoKok, "scripts", scriptAd);
  if (!existsSync(yol)) return null;
  return calistir(["powershell", "-ExecutionPolicy", "Bypass", "-File", yol], repoKok);
}

function telemetriFailAnomali(repoKok: string): BekciAnomali | null {
  const dosya = join(repoKok, ".verimlilik", "telemetri.jsonl");
  if (!existsSync(dosya)) return null;
  const turlar: { ok: number; fail: number }[] = [];
  for (const satir of readFileSync(dosya, "utf8").split(/\r?\n/)) {
    if (!satir.trim()) continue;
    try {
      const k = JSON.parse(satir) as { tip?: string; toolCalls?: number; failedCalls?: number };
      if (k.tip === "tur" && typeof k.toolCalls === "number" && k.toolCalls > 0) {
        turlar.push({ ok: k.toolCalls - (k.failedCalls ?? 0), fail: k.failedCalls ?? 0 });
      }
    } catch { /* bozuk satir atlanir */ }
  }
  const pencere = turlar.slice(-FAIL_PENCERE_TUR);
  if (pencere.length < FAIL_MIN_TUR) return null;
  const toplam = pencere.reduce((a, t) => a + t.ok + t.fail, 0);
  const fail = pencere.reduce((a, t) => a + t.fail, 0);
  const oran = toplam > 0 ? fail / toplam : 0;
  if (oran <= FAIL_ORAN_ESIK) return null;
  return { anahtar: "telemetri-fail", detay: "son " + pencere.length + " turda basarisiz cagri %" + Math.round(oran * 100) + " (" + fail + "/" + toplam + ")" };
}

export function bekciKontrol(repoKok: string, calistir: KomutCalistir = gercekCalistir): BekciAnomali[] {
  const anomaliler: BekciAnomali[] = [];
  const saglik = psKopru(repoKok, "saglik.ps1", calistir);
  if (saglik) {
    const m = saglik.cikti.match(/SONUC:\s*(\d+) OK,\s*(\d+) EKSIK,\s*(\d+) SARI/);
    if (!m) {
      anomaliler.push({ anahtar: "saglik-belirsiz", detay: "saglik.ps1 SONUC satiri uretmedi (kod=" + saglik.kod + ")" });
    } else if (Number(m[2]) > 0) {
      anomaliler.push({ anahtar: "saglik-eksik", detay: m[2] + " EKSIK, " + m[3] + " SARI" });
    }
  }
  const zincir = psKopru(repoKok, "zincir-kontrol.ps1", calistir);
  if (zincir && zincir.kod !== 0) {
    anomaliler.push({ anahtar: "zincir-kopuk", detay: "handoff zincirinde kopuk var" });
  }
  if (existsSync(join(repoKok, "STATE_BOARD.md"))) {
    const st = calistir(["git", "status", "--short"], repoKok);
    if (st.kod === 0 && st.cikti.trim().length > 0) {
      const kirli = st.cikti.trim().split(/\r?\n/).filter((l) => !/raporlar[\/\\]telemetri-haftalik[\/\\]/.test(l) && !/\.verimlilik[\/\\]/.test(l));
      if (kirli.length > 0) {
        anomaliler.push({ anahtar: "git-drift", detay: kirli.length + " kirli dosya, aktif tur yok" });
      }
    }
  }
  const tel = telemetriFailAnomali(repoKok);
  if (tel) anomaliler.push(tel);
  return anomaliler;
}

function raporDosyasi(repoKok: string, simdi: Date): string {
  const gun = simdi.toISOString().slice(0, 10);
  return join(repoKok, "raporlar", "takip-sozlesme", gun + ".md");
}

export interface BekciOzet {
  taranan: number;
  ertelenen: number;
  anomalili: number;
  bildirilen: number;
}

export function bekciTara(
  ajanlar: Map<string, PluginHookAgent>,
  aktifTurVarMi: (repoKok: string) => boolean,
  gonder: (agent: PluginHookAgent, mesaj: string) => Promise<void>,
  calistir: KomutCalistir = gercekCalistir,
  simdi: Date = new Date(),
): BekciOzet {
  const ozet: BekciOzet = { taranan: 0, ertelenen: 0, anomalili: 0, bildirilen: 0 };
  const repoAjan = new Map<string, PluginHookAgent>();
  for (const [, agent] of ajanlar) {
    const kok = katmanKokuBul(agent.cwd);
    if (!repoAjan.has(kok)) repoAjan.set(kok, agent);
  }
  for (const [repoKok, agent] of repoAjan) {
    ozet.taranan++;
    try {
      if (ayarOku(repoKok).bekciKapali) continue;
      if (aktifTurVarMi(repoKok)) { ozet.ertelenen++; continue; }
      const anomaliler = bekciKontrol(repoKok, calistir);
      if (anomaliler.length === 0) continue;
      ozet.anomalili++;
      const dosya = raporDosyasi(repoKok, simdi);
      const mevcut = existsSync(dosya) ? readFileSync(dosya, "utf8") : "";
      const yeni = anomaliler.filter((a) => !mevcut.includes("| " + a.anahtar + " |"));
      if (yeni.length === 0) continue;
      mkdirSync(join(repoKok, "raporlar", "takip-sozlesme"), { recursive: true });
      const saat = simdi.toISOString().slice(11, 16);
      const baslik = mevcut.length === 0 ? "# Sozlesme bekci raporu — " + simdi.toISOString().slice(0, 10) + "\n\n" : "";
      appendFileSync(dosya, baslik + yeni.map((a) => "- " + saat + " | " + a.anahtar + " | " + a.detay).join("\n") + "\n", "utf8");
      ozet.bildirilen++;
      const repoAd = repoKok.replace(/.*[\\/]/, "");
      void gonder(
        agent,
        "[paseo-verimlilik · bekçi] " + repoAd + ": " + yeni.length + " anomali — " +
        yeni.map((a) => a.anahtar + " (" + a.detay + ")").join("; ") +
        ". Rapor: raporlar/takip-sozlesme/" + simdi.toISOString().slice(0, 10) + ".md. Onay verme; bulguları kullanıcıya özetle (Ferman 3).",
      ).catch((error) => console.error("[paseo-verimlilik] bekci gonderim hatasi", error));
    } catch (error) {
      console.error("[paseo-verimlilik] bekci repo hatasi: " + repoKok, error);
    }
  }
  return ozet;
}

export function bekciBaslat(
  ajanlar: Map<string, PluginHookAgent>,
  aktifTurVarMi: (repoKok: string) => boolean,
  gonder: (agent: PluginHookAgent, mesaj: string) => Promise<void>,
): () => void {
  const timer = setInterval(() => {
    try {
      bekciTara(ajanlar, aktifTurVarMi, gonder);
    } catch (error) {
      console.error("[paseo-verimlilik] bekci tarama hatasi", error);
    }
  }, TARAMA_MS);
  return () => clearInterval(timer);
}
