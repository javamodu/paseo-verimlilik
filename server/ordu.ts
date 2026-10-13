import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { PaseoApi } from "@getpaseo/client";

// F2 (K-0020/K-0033): ordu komuta hatti.
// Manager spawn-kuyruk.jsonl'e emir YAZAR (append-only); plugin ISLER, sonucu spawn-sonuc.jsonl'e EKLER (append-only).
// Iki dosya da append-only: kimse kimseyi ezmez, denetim = dosyanin kendisi.

export interface KuyrukKayit {
  id: string;
  ts: string;
  tip: "spawn";
  provider: string;
  rol: string; // coder | tester | ...
  gorev: string; // emirler.json id'si (orn. S4-01)
  cwd: string;
  title?: string;
  prompt: string;
  parentId?: string;
}

export interface SonucKayit {
  kuyrukId: string;
  ts: string;
  sonuc: "ok" | "red";
  agentId?: string;
  sebep?: string;
}

export interface OrduAyar {
  managerProvider: string;
  sinirlar: { maxCoder: number; maxTester: number; maxToplam: number };
}

export const VARSAYILAN_AYAR: OrduAyar = {
  managerProvider: "codex/gpt-5.4",
  sinirlar: { maxCoder: 3, maxTester: 2, maxToplam: 6 },
};

export function orduAyarOku(repoYol: string): OrduAyar {
  const p = join(repoYol, ".verimlilik", "ordu.json");
  if (!existsSync(p)) return VARSAYILAN_AYAR;
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    return {
      managerProvider: typeof j.managerProvider === "string" ? j.managerProvider : VARSAYILAN_AYAR.managerProvider,
      sinirlar: { ...VARSAYILAN_AYAR.sinirlar, ...(j.sinirlar ?? {}) },
    };
  } catch { return VARSAYILAN_AYAR; }
}

export function kuyrukOku(repoYol: string): KuyrukKayit[] {
  const p = join(repoYol, ".verimlilik", "spawn-kuyruk.jsonl");
  if (!existsSync(p)) return [];
  const kayitlar: KuyrukKayit[] = [];
  for (const satir of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!satir.trim()) continue;
    try { kayitlar.push(JSON.parse(satir)); } catch { /* bozuk satir atlanir */ }
  }
  return kayitlar;
}

export function islenenIdler(repoYol: string): Set<string> {
  const p = join(repoYol, ".verimlilik", "spawn-sonuc.jsonl");
  const set = new Set<string>();
  if (!existsSync(p)) return set;
  for (const satir of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!satir.trim()) continue;
    try { const j = JSON.parse(satir); if (j.kuyrukId) set.add(j.kuyrukId); } catch { /* atla */ }
  }
  return set;
}

export function sonucYaz(repoYol: string, sonuc: SonucKayit): void {
  const dir = join(repoYol, ".verimlilik");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "spawn-sonuc.jsonl"), JSON.stringify(sonuc) + "\n", "utf8");
}

// Max-paralel freni: red sebebi dondurur; null = spawn serbest.
export function spawnDogrula(
  kayit: Partial<KuyrukKayit>,
  aktif: { coder: number; tester: number; toplam: number },
  sinirlar: OrduAyar["sinirlar"],
): string | null {
  if (!kayit.id || !kayit.provider || !kayit.cwd || !kayit.prompt || !kayit.gorev) {
    return "zorunlu alan eksik (id/provider/cwd/prompt/gorev)";
  }
  if (kayit.tip !== "spawn") return "bilinmeyen kuyruk tipi: " + String(kayit.tip);
  const rol = kayit.rol ?? "coder";
  if (aktif.toplam >= sinirlar.maxToplam) return "max-toplam asimi (" + aktif.toplam + "/" + sinirlar.maxToplam + ")";
  if (rol === "coder" && aktif.coder >= sinirlar.maxCoder) return "max-coder asimi (" + aktif.coder + "/" + sinirlar.maxCoder + ")";
  if (rol === "tester" && aktif.tester >= sinirlar.maxTester) return "max-tester asimi (" + aktif.tester + "/" + sinirlar.maxTester + ")";
  return null;
}

// Aktif worker sayisi: label'li, arsivlenmemis, kapanmis olmayan ajanlar.
export async function aktifWorkerSay(paseo: PaseoApi, repoKok: string): Promise<{ coder: number; tester: number; toplam: number; managerId: string | null }> {
  const liste = await paseo.agents.list();
  let coder = 0, tester = 0, toplam = 0, managerId: string | null = null;
  for (const kayit of liste.entries) {
    const a = kayit.agent as Record<string, unknown>;
    if (a.archivedAt) continue;
    if (a.status === "closed") continue;
    const labels = (a.labels ?? {}) as Record<string, string>;
    const rol = labels.ordu;
    if (!rol) continue;
    const cwd = (a.cwd as string | null) ?? "";
    if (repoKok && cwd && !cwd.startsWith(repoKok)) continue;
    if (rol === "manager") { managerId = a.id as string; continue; }
    toplam++;
    if (rol === "coder") coder++;
    if (rol === "tester") tester++;
  }
  return { coder, tester, toplam, managerId };
}

// Kuyruk dongusu: her repo icin islenmemis spawn isteklerini isler.
export async function orduDongu(paseo: PaseoApi, repoYol: string, repoAd: string): Promise<number> {
  const islenen = islenenIdler(repoYol);
  const bekleyen = kuyrukOku(repoYol).filter((k) => k.id && !islenen.has(k.id));
  if (bekleyen.length === 0) return 0;
  const ayar = orduAyarOku(repoYol);
  let islenenSayi = 0;
  for (const kayit of bekleyen) {
    const aktif = await aktifWorkerSay(paseo, repoYol);
    const red = spawnDogrula(kayit, aktif, ayar.sinirlar);
    if (red) {
      sonucYaz(repoYol, { kuyrukId: kayit.id, ts: new Date().toISOString(), sonuc: "red", sebep: red });
      islenenSayi++;
      continue;
    }
    try {
      const handle = await paseo.agents.create({
        config: { provider: kayit.provider },
        cwd: kayit.cwd,
        title: kayit.title ?? (kayit.rol + " · " + kayit.gorev),
        prompt: kayit.prompt,
        parent: kayit.parentId ?? aktif.managerId ?? undefined,
        labels: { ordu: kayit.rol ?? "coder", gorev: kayit.gorev, repo: repoAd },
      } as Parameters<PaseoApi["agents"]["create"]>[0]);
      sonucYaz(repoYol, { kuyrukId: kayit.id, ts: new Date().toISOString(), sonuc: "ok", agentId: handle.id });
    } catch (error) {
      sonucYaz(repoYol, { kuyrukId: kayit.id, ts: new Date().toISOString(), sonuc: "red", sebep: String((error as Error)?.message ?? error) });
    }
    islenenSayi++;
  }
  return islenenSayi;
}

export const MANAGER_BRIEF = [
  "# ORDU MANAGER BRIEF (v1, ORDU-PLAN §3)",
  "",
  "Sen bu workspace'in ordu manager'isin. Kullanici SADECE sana konusur; worker'lara dogrudan emir yok.",
  "",
  "## Worker spawn etme (TEK yol)",
  "Worker ACMAK ICIN: .verimlilik/spawn-kuyruk.jsonl dosyasina TEK SATIR JSON append et (dosyayi oku-sona-ekle, ezme):",
  '{ "id": "sp-<zdamgasi>", "ts": "<iso>", "tip": "spawn", "provider": "codex/gpt-5.4", "rol": "coder", "gorev": "S4-01", "cwd": "<repo yolu>", "prompt": "<worker briefi: hedef, cikti formati, araclar, gorev siniri>", "parentId": "<senin-agent-id>" }',
  "Plugin 5 sn icinde isler; sonuc .verimlilik/spawn-sonuc.jsonl'e duser (ok/red + sebep). Red gorursen sebebi oku, duzelt, tekrar dene.",
  "",
  "## Kendi basina halledersin",
  "- Worker 8 dk sessiz: durtur (bir kez); 20 dk: yeniden atama oner",
  "- Test 2. kez ayni hatada kirmizi: coder'a hata ozetiyle geri gonder",
  "- Gorev butcesinin %80'i: kullaniciya bildir",
  "",
  "## Kullaniciya sorarsin (asla kendi karar verme)",
  "- izinler.json disi dizin/komut istegi · 3. kez kirmizi test · emirler.json'da olmayan kapsam · butce asimi",
  "",
  "## ASLA",
  "- izinler.json disina yazma, force-push, canli sunucu, bu brief'i degistirme, emirler.json'a dogrudan yazma (append-kilit)",
  "- Max paralel istegi: fren plugin'de, istesen de olmaz",
  "",
  "## Rapor (her sprint sonu, tek blok)",
  "biten/kalan satirlar + token + kirmizi test ozeti + DERSLER adayi. Sahte veri yok.",
].join("\n");
