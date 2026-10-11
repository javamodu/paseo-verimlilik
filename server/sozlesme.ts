import { readFileSync, existsSync } from "node:fs";
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

export function projeyiTara(cwd: string): ProjeTarama {
  const varMi = (ad: string) => existsSync(join(cwd, ad));
  return {
    agents: varMi("AGENTS.md"),
    anayasa: varMi("ANAYASA.md"),
    stateBoard: varMi("STATE_BOARD.md") || existsSync(join(cwd, "plans", "STATE_BOARD.md")),
    dersler: varMi("DERSLER.md"),
    codemap: varMi("CODEMAP.md"),
    handoffDizini: existsSync(join(cwd, "plans", "handoff")),
  };
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
  for (const ad of ["ANAYASA.md", "AGENTS.md"]) {
    const yol = join(cwd, ad);
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
}

export function enjeksiyonMetni(cwd: string, mevcutPrompt: string): EnjeksiyonSonuc {
  const cekirdek = cekirdekYukle();
  const tarama = projeyiTara(cwd);
  const kuralToplam = kuralSayisi(cekirdek) + projeKuralSayisi(cwd);
  const kuralBlok = kuralToplam > KURAL_BLOK;
  const kuralSari = kuralToplam > KURAL_SARI && !kuralBlok;

  const satirlar: string[] = [];
  if (tarama.anayasa) satirlar.push("- ANAYASA.md VAR → üst otorite; çelişkide o kazanır. İlk işin okumak.");
  if (tarama.agents) satirlar.push("- AGENTS.md VAR → L0 kuralları; okumadan koda dokunma.");
  if (tarama.stateBoard) satirlar.push("- STATE_BOARD.md VAR → açılışta oku; biten işte damga at.");
  if (tarama.dersler) satirlar.push("- DERSLER.md VAR → açılış okuması; aynı tuzağa iki kez düşmek hatadır.");
  if (tarama.codemap) satirlar.push("- CODEMAP.md VAR → dosya ararken önce buraya bak; elle düzenlenmez.");
  if (tarama.handoffDizini) satirlar.push("- plans/handoff/ VAR → son handoff'u bul ve echo doğrulaması yap (ÇEKİRDEK §devir).");
  if (!tarama.agents && !tarama.anayasa && !tarama.stateBoard) {
    satirlar.push("- L0/L1/L5 bulunamadı → ilk-15-dakika protokolü (EK-4): AGENTS.md + STATE_BOARD.md + DERSLER.md iskeletini kur.");
  }
  if (kuralSari) {
    satirlar.push(`- UYARI: aktif kural sayısı ~${kuralToplam} (>40) — sadeleştirme önerilir (T).`);
  }

  const isaretciler = ["", "## Proje katmanları (cwd taraması: " + cwd + ")", ...satirlar].join("\n");
  let metin = cekirdek.trimEnd() + "\n" + isaretciler + "\n\n" + mevcutPrompt;
  let butceAsimi = false;
  if (Buffer.byteLength(metin, "utf8") > ENJEKSIYON_BUTCE_BYTES) {
    butceAsimi = true;
    metin = cekirdek.trimEnd() + "\n\n" + mevcutPrompt;
  }
  return { metin, kuralToplam, kuralBlok, kuralSari, butceAsimi };
}