import * as path from "node:path";
import type { AgentPermissionRequest } from "@getpaseo/protocol/agent-types";
import { izinKarari, izinYanitla, ZINCIR_SERT } from "./permission";
import type { PluginHookAgent, PluginHookContext } from "@getpaseo/plugin/server";

export type IzinProfili = "tam" | "okur" | "raporcu";

export interface Rol {
  ad: string;
  profil: IzinProfili;
  modeId?: string;
  sistemEki: string;
}

// roller.json'un gomulu hali (K-0015): asset dosyasi yerine tek kaynak burada.
export const ROLLER: Record<string, Rol> = {
  coder: {
    ad: "coder",
    profil: "tam",
    sistemEki: "Rol: CODER — tek yazıcısın; commit tek elden sende. Kanıt + damga disiplini sende.",
  },
  tester: {
    ad: "tester",
    profil: "okur",
    modeId: "read-only",
    sistemEki: "Rol: TESTER — salt-okunur + test koşucu. Dosya YAZMAZSIN; yalnız COMMIT'Lİ durumu test edersin. Bulguyu raporla, düzeltme yapma.",
  },
  reviewer: {
    ad: "reviewer",
    profil: "raporcu",
    modeId: "read-only",
    sistemEki: "Rol: REVIEWER — salt-okunur + raporlar/** yazımı. Onay VERMEZSİN; bulgu + öneri üretirsin, kanıt dosya:satır etiketli.",
  },
  bekci: {
    ad: "bekci",
    profil: "raporcu",
    modeId: "read-only",
    sistemEki: "Rol: BEKÇİ — salt-okunur + raporlar/** yazımı (Ferman 4). Drift/anomali raporlarsın; asla onay vermezsin.",
  },
};

const ROL_DESENI = /^\[(coder|tester|reviewer|bekci|bekçi)\]\s*/i;

export function rolCoz(title: string | null | undefined): Rol | null {
  if (!title) return null;
  const m = title.match(ROL_DESENI);
  if (!m) return null;
  const ad = m[1].toLowerCase().replace("bekçi", "bekci");
  return ROLLER[ad] ?? null;
}

// D2-07: npx yalniz --no-install ile guvenli; bayraksiz npx paket yoksa registry'den kod indirip calistirir, insan kapisina duser.
const TEST_KOSUCU = /^(npm\s+(run\s+)?(test|typecheck|lint|build)\b|npx\s+--no-install\s+(vitest|jest|tsc\s+--noEmit|tsx\s+test)|pnpm\s+(test|typecheck)|pytest\b|go\s+test\b|cargo\s+test\b|dotnet\s+test\b)/i;
const YAZMA_KOMUTU = /\b(Set-Content|Out-File|Add-Content|New-Item|mkdir|copy|move|del|Remove-Item)\b|>+\s*[^|]|\bwriteFileSync\b|\bgit\s+(add|commit|push|tag|restore|checkout)\b/i;
const RAPOR_SEGMENT = /(^|\/)raporlar(\/|$)/i;

// K-0025 (A2-3): once normalize et (.. cozumlenir), sonra raporlar segmenti ara; traversal raporlar disina cikarsa izin yok.
export function raporYoluGuvenliMi(dosya: string): boolean {
  const n = path.win32.normalize(dosya).replace(/\\/g, "/");
  return RAPOR_SEGMENT.test(n);
}

// K-0027 (D2-03): yazma HEDEFI ayristirilir; substring yetmez. Her hedef raporlar/ altinda olmali, aksi insan kapisina duser.
const YAZMA_ILK_YOL = /^(?:Set-Content|Out-File|Add-Content|New-Item|mkdir|copy|move|del|Remove-Item)\s+["']?([^\s"']+)/i;

function yazmaHedefleriGuvenliMi(k: string): boolean {
  const hedefler: string[] = [];
  const ilk = k.match(YAZMA_ILK_YOL);
  if (ilk) hedefler.push(ilk[1]);
  const redir = k.match(/>+\s*["']?([^\s"']+)/);
  if (redir) hedefler.push(redir[1]);
  const gitAdd = k.match(/^git\s+add\s+(.+)$/i);
  if (gitAdd) {
    for (const tk of gitAdd[1].split(/\s+/)) {
      if (!tk.startsWith("-")) hedefler.push(tk.replace(/^["']|["']$/g, ""));
    }
  }
  if (hedefler.length === 0) return false;
  return hedefler.every((h) => raporYoluGuvenliMi(h));
}

function istekDosyaYolu(request: AgentPermissionRequest): string | null {
  const input = (request.input ?? {}) as Record<string, unknown>;
  if (typeof input.filePath === "string") return input.filePath;
  const detail = (request.detail ?? {}) as Record<string, unknown>;
  if (typeof detail.filePath === "string") return detail.filePath;
  return null;
}

function istekKomutu(request: AgentPermissionRequest): string | null {
  const input = (request.input ?? {}) as Record<string, unknown>;
  if (typeof input.command === "string") return input.command;
  if (typeof input.cmd === "string") return input.cmd;
  return null;
}

export function rolIzinKarari(request: AgentPermissionRequest, rol: Rol): "allow" | "deny" | null {
  const komut = istekKomutu(request);
  const dosya = istekDosyaYolu(request);
  if (rol.profil === "tam") {
    return komut !== null ? izinKarari(komut) : null;
  }
  if (dosya !== null) {
    if (rol.profil === "raporcu" && raporYoluGuvenliMi(dosya)) return "allow";
    return "deny";
  }
  if (komut === null) return null;
  const k = komut.trim();
  const taban = izinKarari(k);
  if (taban === "allow") return "allow";
  if (taban === "deny") return "deny";
  // K-0027 (D2-01/02): zincir/ikame iceren komut hicbir rolden auto-allow almaz; insan kapisina duser.
  if (ZINCIR_SERT.test(k)) return null;
  if (TEST_KOSUCU.test(k)) return "allow";
  if (rol.profil === "raporcu" && YAZMA_KOMUTU.test(k) && yazmaHedefleriGuvenliMi(k)) return "allow";
  if (YAZMA_KOMUTU.test(k)) return "deny";
  return null;
}

export async function rolIzinKontrol(
  agent: PluginHookAgent,
  request: AgentPermissionRequest,
  context: PluginHookContext,
  rol: Rol,
): Promise<void> {
  const karar = rolIzinKarari(request, rol);
  if (karar === null) return;
  const komut = istekKomutu(request);
  const dosya = istekDosyaYolu(request);
  const ad = komut ? komut.trim().split(/\s+/)[0] : dosya ?? "?";
  await izinYanitla(agent, request, context, karar, "[rol:" + rol.ad + "] " + ad);
}
