import { createHash } from "node:crypto";
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// K-0033: ikili temsil — plan.md (insan) ↔ emirler.json (makine).
// Derleyici deterministik parser; manager LLM yalniz parser'in cozemedigi serbest metinde devreye girer.
// Checker: tek-id + dongusuz-bagimlilik + olculebilir-kabul + izinli-dizin + round-trip.

export interface Gorev {
  id: string;
  baslik: string;
  durum: string; // bekliyor|kosuyor|bloklu|bitti
  rol: string | null;
  kabul: string | null;
  once: string[];
  dizin: string | null;
  sahip?: string | null;
  deneme?: number;
  tokenHarcanan?: number;
  baslama?: string | null;
  bitis?: string | null;
  mddeYok?: boolean;
}

export interface DerlemeSonuc {
  ok: boolean;
  gorevler: Gorev[];
  hatalar: string[];
  uyarilar: string[];
  kanonikMd: string;
  mdHash: string;
}

const KUTU: Record<string, string> = { " ": "bekliyor", "~": "kosuyor", "!": "bloklu", x: "bitti", X: "bitti" };
const KUTU_TERS: Record<string, string> = { bekliyor: " ", kosuyor: "~", bloklu: "!", bitti: "x" };

export function mdHash(metin: string): string {
  return createHash("sha256").update(metin, "utf8").digest("hex").slice(0, 12);
}

export function planMdParse(md: string): { gorevler: Gorev[]; hatalar: string[] } {
  const gorevler: Gorev[] = [];
  const hatalar: string[] = [];
  const satirlar = md.split(/\r?\n/);
  for (let i = 0; i < satirlar.length; i++) {
    const s = satirlar[i];
    const m = s.match(/^\s*-\s*\[(.)\]\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const durum = KUTU[m[1]];
    if (!durum) { hatalar.push("satir " + (i + 1) + ": bilinmeyen kutu isareti [" + m[1] + "]"); continue; }
    const id = m[2];
    if (!/^[A-Za-z0-9]+-[0-9]+$/.test(id)) { hatalar.push("satir " + (i + 1) + ": id bicimi bekleniyor (orn. S4-01), gelen: " + id); continue; }
    const g: Gorev = { id, baslik: "", durum, rol: null, kabul: null, once: [], dizin: null };
    const parcalar = m[3].split(/\s*·\s*/).map((p) => p.trim()).filter(Boolean);
    const basliklar: string[] = [];
    for (const p of parcalar) {
      const okIdx = p.indexOf("→");
      if (okIdx >= 0) {
        g.rol = p.slice(okIdx + 1).trim() || null;
        const on = p.slice(0, okIdx).trim();
        if (on) basliklar.push(on);
        continue;
      }
      const ikiNokta = p.indexOf(":");
      const anahtar = ikiNokta > 0 ? p.slice(0, ikiNokta).trim().toLowerCase() : "";
      if (anahtar === "kabul") { g.kabul = p.slice(ikiNokta + 1).trim(); continue; }
      if (anahtar === "once") { g.once = p.slice(ikiNokta + 1).split(",").map((x) => x.trim()).filter(Boolean); continue; }
      if (anahtar === "dizin") { g.dizin = p.slice(ikiNokta + 1).trim(); continue; }
      basliklar.push(p);
    }
    g.baslik = basliklar.join(" · ");
    if (!g.baslik) hatalar.push("satir " + (i + 1) + ": baslik bos (" + id + ")");
    gorevler.push(g);
  }
  return { gorevler, hatalar };
}

function donguVarMi(gorevler: Gorev[]): string | null {
  const harita = new Map(gorevler.map((g) => [g.id, g.once]));
  const durum = new Map<string, number>(); // 0=yok 1=yiginda 2=bitti
  function dfs(id: string, yol: string[]): string | null {
    const d = durum.get(id) ?? 0;
    if (d === 1) return "bagimlilik dongusu: " + [...yol, id].join(" → ");
    if (d === 2) return null;
    durum.set(id, 1);
    for (const dep of harita.get(id) ?? []) {
      if (!harita.has(dep)) continue; // yokluk ayri raporlanir
      const r = dfs(dep, [...yol, id]);
      if (r) return r;
    }
    durum.set(id, 2);
    return null;
  }
  for (const g of gorevler) {
    const r = dfs(g.id, []);
    if (r) return r;
  }
  return null;
}

export function kanonikMdUret(gorevler: Gorev[]): string {
  return gorevler.map((g) => {
    const kutu = KUTU_TERS[g.durum] ?? " ";
    let s = "- [" + kutu + "] " + g.id + " " + g.baslik;
    if (g.rol) s += " · →" + g.rol;
    if (g.kabul) s += " · kabul: " + g.kabul;
    if (g.once.length) s += " · once: " + g.once.join(", ");
    if (g.dizin) s += " · dizin: " + g.dizin;
    return s;
  }).join("\n");
}

export function derle(md: string, izinliDizinler: string[] | null): DerlemeSonuc {
  const { gorevler, hatalar } = planMdParse(md);
  const uyarilar: string[] = [];
  const idler = new Set<string>();
  for (const g of gorevler) {
    if (idler.has(g.id)) hatalar.push(g.id + ": id tekrari");
    idler.add(g.id);
    if (!g.kabul) hatalar.push(g.id + ": kabul kriteri yok (olculebilir kabul zorunlu)");
    else if (g.kabul.length < 8) uyarilar.push(g.id + ": kabul kriteri cok kisa, olculebilirligi supheli");
    if (izinliDizinler && g.dizin) {
      const izinli = izinliDizinler.some((d) => g.dizin === d || (g.dizin as string).startsWith(d.replace(/\/$/, "") + "/"));
      if (!izinli) hatalar.push(g.id + ": dizin izin listesinde yok (" + g.dizin + ")");
    }
  }
  for (const g of gorevler) {
    for (const dep of g.once) {
      if (!idler.has(dep)) uyarilar.push(g.id + ": bagimlilik bu md'de yok (" + dep + ") — mevcut emirler.json'da varsa sorun degil");
    }
  }
  const dongu = donguVarMi(gorevler);
  if (dongu) hatalar.push(dongu);
  return { ok: hatalar.length === 0, gorevler, hatalar, uyarilar, kanonikMd: kanonikMdUret(gorevler), mdHash: mdHash(md) };
}

export function repolariBul(kokler: string[]): { ad: string; yol: string }[] {
  const bulunan: { ad: string; yol: string }[] = [];
  for (const kok of kokler) {
    let girdiler;
    try { girdiler = readdirSync(kok, { withFileTypes: true }); } catch { continue; }
    for (const g of girdiler) {
      if (!g.isDirectory()) continue;
      const tel = join(kok, g.name, ".verimlilik");
      if (existsSync(tel)) bulunan.push({ ad: g.name, yol: join(kok, g.name) });
    }
  }
  return bulunan;
}

export function izinliDizinleriOku(repoYol: string): string[] | null {
  const p = join(repoYol, ".verimlilik", "izinler.json");
  if (!existsSync(p)) return null;
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    const d = j?.dizin?.izinli;
    return Array.isArray(d) ? d.map(String) : null;
  } catch { return null; }
}

export interface EmirlerDosya {
  schemaSurum: number;
  repo: string;
  kaynakMdHash: string;
  guncelleme: string;
  gorevler: Gorev[];
}

export function emirlerOku(repoYol: string): EmirlerDosya | null {
  const p = join(repoYol, ".verimlilik", "emirler.json");
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")) as EmirlerDosya; } catch { return null; }
}

export function planMdOku(repoYol: string): string | null {
  const p = join(repoYol, ".verimlilik", "plan.md");
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

// Merge kurali: insan (md) yapisal alanlarda kazanir; runtime alanlari (sahip/deneme/token/zaman) json'da kalir.
// md'de olmayan gorev silinmez (append-kilit), mddeYok isaretlenir.
export function birlestir(yeni: Gorev[], eski: EmirlerDosya | null): Gorev[] {
  const eskiHarita = new Map((eski?.gorevler ?? []).map((g) => [g.id, g]));
  const sonuc: Gorev[] = yeni.map((g) => {
    const e = eskiHarita.get(g.id);
    if (!e) return g;
    return { ...g, sahip: e.sahip ?? null, deneme: e.deneme ?? 0, tokenHarcanan: e.tokenHarcanan ?? 0, baslama: e.baslama ?? null, bitis: e.bitis ?? null };
  });
  const yeniIdler = new Set(yeni.map((g) => g.id));
  for (const e of eski?.gorevler ?? []) {
    if (!yeniIdler.has(e.id)) sonuc.push({ ...e, mddeYok: true });
  }
  return sonuc;
}

export function emirlerYaz(repoYol: string, repoAd: string, gorevler: Gorev[], hash: string): EmirlerDosya {
  const dosya: EmirlerDosya = { schemaSurum: 1, repo: repoAd, kaynakMdHash: hash, guncelleme: new Date().toISOString(), gorevler };
  writeFileSync(join(repoYol, ".verimlilik", "emirler.json"), JSON.stringify(dosya, null, 2) + "\n", "utf8");
  return dosya;
}

export function planMdYaz(repoYol: string, md: string): void {
  const dir = join(repoYol, ".verimlilik");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "plan.md"), md, "utf8");
}
