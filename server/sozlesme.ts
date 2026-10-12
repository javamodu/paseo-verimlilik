import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { ayarOku } from "./ayar";
import { join } from "node:path";
import { CEKIRDEK } from "./cekirdek";

export const ENJEKSIYON_BUTCE_BYTES = 20 * 1024;
export const KURAL_SARI = 40;
export const KURAL_BLOK = 80;

export function cekirdekYukle(): string {
  return CEKIRDEK;
}

export interface ProjeTarama {
  agents: boolean;
  anayasa: boolean;
  stateBoard: boolean;
  dersler: boolean;
  codemap: boolean;
  handoffDizini: boolean;
}

const KATMAN_ISARETLERI = [".git", "AGENTS.md", "ANAYASA.md", "STATE_BOARD.md", "DERSLER.md"];

// Alt-dizin oturumlarinda yanlis-negatifi onler: katman kokune kadar yukari yurur (maks 5 seviye).
export function katmanKokuBul(cwd: string): string {
  let cur = cwd;
  for (let i = 0; i < 6; i++) {
    if (KATMAN_ISARETLERI.some((m) => existsSync(join(cur, m)))) return cur;
    const up = join(cur, "..");
    if (up === cur) break;
    cur = up;
  }
  return cwd;
}

export function projeyiTara(cwd: string): ProjeTarama {
  const kok = katmanKokuBul(cwd);
  const varMi = (ad: string) => existsSync(join(kok, ad));
  return {
    agents: varMi("AGENTS.md"),
    anayasa: varMi("ANAYASA.md"),
    stateBoard: varMi("STATE_BOARD.md") || existsSync(join(kok, "plans", "STATE_BOARD.md")),
    dersler: varMi("DERSLER.md"),
    codemap: varMi("CODEMAP.md"),
    handoffDizini: existsSync(join(kok, "plans", "handoff")),
  };
}


export function sonHandoffDosyasi(cwd: string): string | null {
  const dir = join(katmanKokuBul(cwd), "plans", "handoff");
  if (!existsSync(dir)) return null;
  try {
    const dosyalar = readdirSync(dir)
      .filter((d) => /^HANDOFF-.*\.md$/i.test(d))
      .map((d) => ({ ad: d, mt: statSync(join(dir, d)).mtimeMs }))
      .sort((a, b) => b.mt - a.mt || (a.ad < b.ad ? 1 : -1));
    return dosyalar.length > 0 ? dosyalar[0].ad : null;
  } catch {
    return null;
  }
}

export function kuralSayisi(metin: string): number {
  let sayi = 0;
  for (const satir of metin.split(/\r?\n/)) {
    if (/^\s*(\d+\.|[-*]|[A-Z]\d+\.)\s+\S/.test(satir)) {
      sayi++;
    }
  }
  return sayi;
}

export function projeKuralSayisi(cwd: string): number {
  let toplam = 0;
  const kok = katmanKokuBul(cwd);
  for (const ad of ["ANAYASA.md", "AGENTS.md"]) {
    const yol = join(kok, ad);
    if (existsSync(yol)) {
      try {
        toplam += kuralSayisi(readFileSync(yol, "utf8"));
      } catch {
        // okunamayan dosya sayima girmez
      }
    }
  }
  return toplam;
}

export interface EnjeksiyonSonuc {
  metin: string;
  kuralToplam: number;
  kuralBlok: boolean;
  kuralSari: boolean;
  butceAsimi: boolean;
  atlandi: boolean;
}

export function isaretciMetni(kuralToplam: number, sebep?: string): string {
  const neden = sebep ?? ("Aktif kural sayısı ~" + kuralToplam + " (>80) — tam ÇEKİRDEK enjeksiyonu bloklandı (bağlam hijyeni).");
  return [
    "[paseo-verimlilik · sözleşme işaretçisi]",
    neden,
    "Özet: okumadan yazma · kanıt = kalıcı kayıt · kapanış = test/lint yeşil · devir töreni (handoff + echo) · dürtmede 2 satır durum.",
    "Tam metin proje sahibinden istenir: PASEO-VERIMLILIK-REHBERI-v2.0.md (EK özetleri ÇEKİRDEK içindedir).",
  ].join("\n");
}

export function enjeksiyonMetni(cwd: string, mevcutPrompt: string): EnjeksiyonSonuc {
  const cekirdek = cekirdekYukle();
  const tarama = projeyiTara(cwd);
  const kuralToplam = kuralSayisi(cekirdek) + projeKuralSayisi(cwd);
  const kuralBlok = kuralToplam > KURAL_BLOK;
  const kuralSari = kuralToplam > KURAL_SARI && !kuralBlok;
  const mod = ayarOku(cwd).enjeksiyonMod;

  if (mod === "kapali") {
    return { metin: "", kuralToplam, kuralBlok, kuralSari, butceAsimi: false, atlandi: true };
  }
  if (kuralBlok || mod === "isaretci") {
    const sebep = kuralBlok ? undefined : "Enjeksiyon modu: işaretçi (.verimlilik/ayar.json) — tam ÇEKİRDEK atlandı.";
    return { metin: isaretciMetni(kuralToplam, sebep) + "\n\n" + mevcutPrompt, kuralToplam, kuralBlok, kuralSari, butceAsimi: false, atlandi: false };
  }

  const satirlar: string[] = [];
  if (tarama.anayasa) satirlar.push("- ANAYASA.md VAR → üst otorite; çelişkide o kazanır. İlk işin okumak.");
  if (tarama.agents) satirlar.push("- AGENTS.md VAR → L0 kuralları; okumadan koda dokunma.");
  if (tarama.stateBoard) satirlar.push("- STATE_BOARD.md VAR → açılışta oku; biten işte damga at.");
  if (tarama.dersler) satirlar.push("- DERSLER.md VAR → açılış okuması; aynı tuzağa iki kez düşmek hatadır.");
  if (tarama.codemap) satirlar.push("- CODEMAP.md VAR → dosya ararken önce buraya bak; elle düzenlenmez.");
  if (tarama.handoffDizini) {
    const son = sonHandoffDosyasi(cwd);
    satirlar.push(son
      ? "- plans/handoff/ VAR → son devir: " + son + " — echo doğrula (ÇEKİRDEK §devir, 3 soru)."
      : "- plans/handoff/ VAR → son handoff'u bul ve echo doğrulaması yap (ÇEKİRDEK §devir).");
  }
  if (!tarama.agents && !tarama.anayasa && !tarama.stateBoard) {
    satirlar.push("- L0/L1/L5 bulunamadı → ilk-15-dakika protokolü (EK-4): AGENTS.md + STATE_BOARD.md + DERSLER.md iskeletini kur.");
  }
  if (kuralSari) {
    satirlar.push(`- UYARI: aktif kural sayısı ~${kuralToplam} (>40) — sadeleştirme önerilir (T).`);
  }

  const isaretciler = ["", "## Proje katmanları (katman kökü: " + katmanKokuBul(cwd) + ")", ...satirlar].join("\n");
  let metin = cekirdek.trimEnd() + "\n" + isaretciler + "\n\n" + mevcutPrompt;
  let butceAsimi = false;
  if (Buffer.byteLength(metin, "utf8") > ENJEKSIYON_BUTCE_BYTES) {
    butceAsimi = true;
    metin = cekirdek.trimEnd() + "\n[not: 20KB bütçe aşımı — proje işaretçileri kırpıldı]\n\n" + mevcutPrompt;
    if (Buffer.byteLength(metin, "utf8") > ENJEKSIYON_BUTCE_BYTES) {
      metin = cekirdek.trimEnd() + "\n[not: 20KB aşımı sürüyor — işaretçiler kırpıldı; mevcut prompt hacimli (" + Buffer.byteLength(metin, "utf8") + "B)]\n\n" + mevcutPrompt;
    }
  }
  return { metin, kuralToplam, kuralBlok, kuralSari, butceAsimi, atlandi: false };
}