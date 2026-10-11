import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface VerimlilikAyar {
  pitbullYaziciDk: number;
  pitbullOkuyucuDk: number;
  kapsamEsik: number;
  enjeksiyonMod: "tam" | "isaretci" | "kapali";
}

export const VARSAYILAN_AYAR: VerimlilikAyar = {
  pitbullYaziciDk: 15,
  pitbullOkuyucuDk: 20,
  kapsamEsik: 3,
  enjeksiyonMod: "tam",
};

const cache = new Map<string, { mt: number; boyut: number; ayar: VerimlilikAyar }>();

function sayiAl(deger: unknown, min: number, maks: number, dusus: number): number {
  return typeof deger === "number" && Number.isFinite(deger) && deger >= min && deger <= maks ? deger : dusus;
}

export function ayarOku(cwd: string): VerimlilikAyar {
  const dosya = join(cwd, ".verimlilik", "ayar.json");
  try {
    if (!existsSync(dosya)) return VARSAYILAN_AYAR;
    const st = statSync(dosya);
    const c = cache.get(cwd);
    if (c && c.mt === st.mtimeMs && c.boyut === st.size) return c.ayar;
    const ham = JSON.parse(readFileSync(dosya, "utf8")) as Record<string, unknown>;
    const mod = ham.enjeksiyonMod;
    const ayar: VerimlilikAyar = {
      pitbullYaziciDk: sayiAl(ham.pitbullYaziciDk, 1, 240, VARSAYILAN_AYAR.pitbullYaziciDk),
      pitbullOkuyucuDk: sayiAl(ham.pitbullOkuyucuDk, 1, 240, VARSAYILAN_AYAR.pitbullOkuyucuDk),
      kapsamEsik: sayiAl(ham.kapsamEsik, 1, 50, VARSAYILAN_AYAR.kapsamEsik),
      enjeksiyonMod: mod === "isaretci" || mod === "kapali" ? mod : "tam",
    };
    cache.set(cwd, { mt: st.mtimeMs, boyut: st.size, ayar });
    return ayar;
  } catch {
    return VARSAYILAN_AYAR;
  }
}
