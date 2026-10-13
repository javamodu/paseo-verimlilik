import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize, sep } from "node:path";
import type { PaseoApi } from "@getpaseo/client";
import { derle, repolariBul, izinliDizinleriOku, emirlerOku, planMdOku, planMdYaz, birlestir, emirlerYaz, mdHash } from "./planmd";

// K-0019/K-0020 koprüsu: paseo-pano vanilla yuzeyini plugin subprocess'inden servis eder.
// Bagimliliksiz node:http, yalniz 127.0.0.1, POST'lar PANO_TOKEN fail-closed.

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export interface PanoDurum {
  ok: boolean;
  port: number;
  uiDir: string;
  uiVar: boolean;
  paseoBagli: boolean;
  yazma: boolean;
  dinliyor: boolean;
}

interface AjanKart {
  id: string;
  title: string | null;
  status: string | null;
  provider: string | null;
  model: string | null;
  cwd: string | null;
  workspaceId: string | null;
  requiresAttention: boolean;
  attentionReason: string | null;
  bekleyenIzin: number;
  sonMesaj: string | null;
}

export function panoBaslat(getPaseo: () => PaseoApi | null): { durum: () => PanoDurum; kapat: () => void } {
  const port = Number(process.env.PANO_PORT ?? 4378);
  const uiDir = process.env.PANO_UI_DIR ?? "D:\\Vibecode\\paseo-pano";
  const token = process.env.PANO_TOKEN ?? null;
  const sseIstemciler = new Set<http.ServerResponse>();
  let dinliyor = false;
  let sonDurumJson = "";
  let sayac: ReturnType<typeof setInterval> | null = null;

  function jsonYaz(res: http.ServerResponse, kod: number, obj: unknown): void {
    res.writeHead(kod, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(obj));
  }

  async function ajanlariTopla(): Promise<AjanKart[] | null> {
    const paseo = getPaseo();
    if (!paseo) return null;
    const liste = await paseo.agents.list();
    const kartlar: AjanKart[] = [];
    for (const kayit of liste.entries) {
      const a = kayit.agent as Record<string, unknown>;
      if (a.archivedAt) continue;
      kartlar.push({
        id: String(a.id),
        title: (a.title as string | null) ?? null,
        status: (a.status as string | null) ?? null,
        provider: (a.provider as string | null) ?? null,
        model: (a.model as string | null) ?? null,
        cwd: (a.cwd as string | null) ?? null,
        workspaceId: (a.workspaceId as string | null) ?? null,
        requiresAttention: Boolean(a.requiresAttention),
        attentionReason: (a.attentionReason as string | null) ?? null,
        bekleyenIzin: Array.isArray(a.pendingPermissions) ? a.pendingPermissions.length : 0,
        sonMesaj: null,
      });
    }
    return kartlar;
  }

  async function izinleriTopla(): Promise<unknown[]> {
    const paseo = getPaseo();
    if (!paseo) return [];
    const liste = await paseo.agents.list();
    const izinler: unknown[] = [];
    for (const kayit of liste.entries) {
      const a = kayit.agent as Record<string, unknown>;
      if (a.archivedAt) continue;
      const bekleyen = Array.isArray(a.pendingPermissions) ? a.pendingPermissions : [];
      for (const p of bekleyen) izinler.push({ agentId: a.id, agentTitle: a.title ?? null, ...(p as Record<string, unknown>) });
    }
    return izinler;
  }

  function sseYayin(veri: unknown): void {
    const satir = "data: " + JSON.stringify(veri) + "\n\n";
    for (const res of sseIstemciler) {
      try { res.write(satir); } catch { sseIstemciler.delete(res); }
    }
  }

  async function canliDongu(): Promise<void> {
    try {
      const kartlar = await ajanlariTopla();
      if (!kartlar) return;
      const json = JSON.stringify(kartlar);
      if (json !== sonDurumJson) {
        sonDurumJson = json;
        sseYayin({ tip: "ajanlar", ajanlar: kartlar, ts: new Date().toISOString() });
      }
    } catch (error) {
      console.error("[paseo-verimlilik] pano canli dongu hatasi", error);
    }
  }

  async function emirUygula(emir: Record<string, unknown>): Promise<{ ok: boolean; mesaj?: string; id?: string }> {
    const paseo = getPaseo();
    if (!paseo) return { ok: false, mesaj: "daemon baglantisi henuz yok (panel bir kez acilmali veya bir tur kosmali)" };
    const eylem = String(emir.eylem ?? "");
    if (eylem === "gonder") {
      const agentId = String(emir.agentId ?? "");
      const metin = String(emir.metin ?? "");
      if (!agentId || !metin.trim()) return { ok: false, mesaj: "agentId ve metin gerekli" };
      await paseo.agents.ref(agentId).send(metin);
      return { ok: true };
    }
    if (eylem === "yarat") {
      const cwd = String(emir.cwd ?? "");
      const provider = String(emir.provider ?? "");
      if (!cwd || !provider) return { ok: false, mesaj: "cwd ve provider gerekli (ornek provider: codex/gpt-5.4)" };
      const handle = await paseo.agents.create({
        config: { provider },
        cwd,
        title: emir.title ? String(emir.title) : undefined,
        prompt: emir.prompt ? String(emir.prompt) : undefined,
      });
      return { ok: true, id: handle.id };
    }
    if (eylem === "izin") {
      const agentId = String(emir.agentId ?? "");
      const requestId = String(emir.requestId ?? "");
      const karar = emir.karar === "allow" ? "allow" : "deny";
      if (!agentId || !requestId) return { ok: false, mesaj: "agentId ve requestId gerekli" };
      await paseo.agents.ref(agentId).respondToPermission({ requestId, response: { behavior: karar } });
      return { ok: true };
    }
    if (eylem === "arsivle") {
      const agentId = String(emir.agentId ?? "");
      if (!agentId) return { ok: false, mesaj: "agentId gerekli" };
      await paseo.agents.ref(agentId).archive();
      return { ok: true };
    }
    if (eylem === "plan-kaydet") {
      const repoAd = String(emir.repo ?? "");
      const md = String(emir.md ?? "");
      const kokler = (process.env.PANO_KOKLER ?? "D:\\Vibecode").split(";");
      const repo = repolariBul(kokler).find((r) => r.ad === repoAd);
      if (!repo) return { ok: false, mesaj: "repo yok: " + repoAd };
      if (!md.trim()) return { ok: false, mesaj: "bos plan kaydedilmez" };
      planMdYaz(repo.yol, md);
      return { ok: true, mesaj: "plan.md kaydedildi (" + md.length + " bayt)" };
    }
    if (eylem === "plan-derle" || eylem === "plan-uygula") {
      const repoAd = String(emir.repo ?? "");
      const kokler = (process.env.PANO_KOKLER ?? "D:\\Vibecode").split(";");
      const repo = repolariBul(kokler).find((r) => r.ad === repoAd);
      if (!repo) return { ok: false, mesaj: "repo yok veya .verimlilik'siz: " + repoAd };
      const md = planMdOku(repo.yol);
      if (md === null) return { ok: false, mesaj: repoAd + "/.verimlilik/plan.md yok" };
      const sonuc = derle(md, izinliDizinleriOku(repo.yol));
      if (eylem === "plan-derle") {
        return { ok: sonuc.ok, mesaj: JSON.stringify({ hatalar: sonuc.hatalar, uyarilar: sonuc.uyarilar, gorevSayisi: sonuc.gorevler.length, kanonikMd: sonuc.kanonikMd }) };
      }
      if (!sonuc.ok) return { ok: false, mesaj: "checker RED: " + sonuc.hatalar.join(" | ") };
      const birlesik = birlestir(sonuc.gorevler, emirlerOku(repo.yol));
      emirlerYaz(repo.yol, repo.ad, birlesik, sonuc.mdHash);
      return { ok: true, mesaj: birlesik.length + " gorev islendi" };
    }
    return { ok: false, mesaj: "bilinmeyen eylem: " + eylem };
  }

  function statikServis(res: http.ServerResponse, yol: string): boolean {
    const temiz = normalize(yol).replace(/^([/\\])+/, "");
    const tam = normalize(join(uiDir, temiz));
    if (!tam.startsWith(normalize(uiDir) + sep) && tam !== normalize(uiDir)) return false;
    if (!existsSync(tam) || !statSync(tam).isFile()) return false;
    let icerik: Buffer | string = readFileSync(tam);
    const ext = extname(tam).toLowerCase();
    if (ext === ".html" && token) {
      icerik = icerik.toString("utf8").replace("__PANO_TOKEN__", JSON.stringify(token));
    }
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(icerik);
    return true;
  }

  const sunucu = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const yol = url.pathname;
    if (req.method === "GET" && yol === "/api/durum") {
      jsonYaz(res, 200, durumGetir());
      return;
    }
    if (req.method === "GET" && yol === "/api/ajanlar") {
      ajanlariTopla()
        .then((kartlar) => jsonYaz(res, kartlar ? 200 : 503, kartlar ? { ajanlar: kartlar } : { hata: "daemon baglantisi yok" }))
        .catch((e) => jsonYaz(res, 500, { hata: String(e?.message ?? e) }));
      return;
    }
    if (req.method === "GET" && yol === "/api/izinler") {
      izinleriTopla()
        .then((izinler) => jsonYaz(res, 200, { izinler }))
        .catch((e) => jsonYaz(res, 500, { hata: String(e?.message ?? e) }));
      return;
    }
    if (req.method === "GET" && yol === "/api/repolar") {
      const kokler = (process.env.PANO_KOKLER ?? "D:\\Vibecode").split(";");
      jsonYaz(res, 200, { repolar: repolariBul(kokler).map((r) => r.ad) });
      return;
    }
    if (req.method === "GET" && yol === "/api/plan") {
      const repoAd = url.searchParams.get("repo") ?? "";
      const kokler = (process.env.PANO_KOKLER ?? "D:\\Vibecode").split(";");
      const repo = repolariBul(kokler).find((r) => r.ad === repoAd);
      if (!repo) { jsonYaz(res, 404, { hata: "repo yok veya .verimlilik'siz" }); return; }
      const md = planMdOku(repo.yol);
      const emirler = emirlerOku(repo.yol);
      const drift = md !== null && emirler !== null && mdHash(md) !== emirler.kaynakMdHash;
      jsonYaz(res, 200, { repo: repoAd, md, emirler, drift });
      return;
    }
    if (req.method === "GET" && yol === "/api/canli") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.write("retry: 5000\n\n");
      const hb = setInterval(() => { try { res.write(": nabiz\n\n"); } catch { /* kapali */ } }, 15_000);
      sseIstemciler.add(res);
      req.on("close", () => { clearInterval(hb); sseIstemciler.delete(res); });
      void canliDongu();
      return;
    }
    if (req.method === "POST" && yol === "/api/emir") {
      if (!token) { jsonYaz(res, 403, { hata: "PANO_TOKEN tanimli degil - yazma kapali (fail-closed)" }); return; }
      if (req.headers["x-pano-token"] !== token) { jsonYaz(res, 401, { hata: "token gecersiz" }); return; }
      let govde = "";
      req.on("data", (p) => { govde += p; if (govde.length > 65536) req.destroy(); });
      req.on("end", () => {
        try {
          const emir = JSON.parse(govde) as Record<string, unknown>;
          emirUygula(emir)
            .then((sonuc) => { jsonYaz(res, sonuc.ok ? 202 : 422, sonuc); void canliDongu(); })
            .catch((e) => jsonYaz(res, 500, { ok: false, mesaj: String(e?.message ?? e) }));
        } catch { jsonYaz(res, 400, { ok: false, mesaj: "gecersiz json" }); }
      });
      return;
    }
    if (req.method === "GET") {
      const hedef = yol === "/" ? "orkestra.html" : yol;
      if (statikServis(res, hedef)) return;
    }
    jsonYaz(res, 404, { hata: "bulunamadi" });
  });

  function durumGetir(): PanoDurum {
    return {
      ok: true,
      port,
      uiDir,
      uiVar: existsSync(join(uiDir, "orkestra.html")),
      paseoBagli: getPaseo() !== null,
      yazma: token !== null,
      dinliyor,
    };
  }

  sunucu.on("error", (error) => {
    console.error("[paseo-verimlilik] pano sunucu hatasi (port " + port + " mesgul olabilir)", error);
  });
  sunucu.listen(port, "127.0.0.1", () => {
    dinliyor = true;
    console.log("[paseo-verimlilik] pano koprusu: http://127.0.0.1:" + port + " (ui: " + uiDir + ", yazma " + (token ? "ACIK" : "fail-closed") + ")");
  });
  sayac = setInterval(() => void canliDongu(), 5000);

  return {
    durum: durumGetir,
    kapat: () => {
      if (sayac) clearInterval(sayac);
      for (const res of sseIstemciler) { try { res.end(); } catch { /* kapali */ } }
      sseIstemciler.clear();
      dinliyor = false;
      sunucu.close();
    },
  };
}
