import type { AgentPermissionRequest } from "@getpaseo/protocol/agent-types";
import { izinKarari, izinYanitla } from "./permission";
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

const TEST_KOSUCU = /^(npm\s+(run\s+)?(test|typecheck|lint|build)\b|npx\s+(vitest|jest|tsc\s+--noEmit|tsx\s+test)|pnpm\s+(test|typecheck)|pytest\b|go\s+test\b|cargo\s+test\b|dotnet\s+test\b)/i;
const YAZMA_KOMUTU = /\b(Set-Content|Out-File|Add-Content|New-Item|mkdir|copy|move|del|Remove-Item)\b|>+\s*[^|]|\bwriteFileSync\b|\bgit\s+(add|commit|push|tag|restore|checkout)\b/i;
const RAPOR_YOLU = /raporlar[\/\\]/i;

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
    if (rol.profil === "raporcu" && RAPOR_YOLU.test(dosya)) return "allow";
    return "deny";
  }
  if (komut === null) return null;
  const k = komut.trim();
  if (TEST_KOSUCU.test(k)) return "allow";
  const taban = izinKarari(k);
  if (taban === "allow") return "allow";
  if (taban === "deny") return "deny";
  if (rol.profil === "raporcu" && YAZMA_KOMUTU.test(k) && RAPOR_YOLU.test(k)) return "allow";
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
