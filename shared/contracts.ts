import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const sozlesmeEnjekte = defineRpc({
  name: "sozlesme.enjekte",
  input: z.object({
    agentId: z.string().optional(),
    workspaceId: z.string().optional(),
  }),
  output: z.object({
    hedef: z.number(),
    gonderildi: z.number(),
    atlandi: z.number(),
    not: z.string().optional(),
  }),
});

export const telemetriOzet = defineRpc({
  name: "telemetri.ozet",
  input: z.object({ cwd: z.string() }),
  output: z.object({
    dosya: z.string(),
    tur: z.number(),
    loopDurtme: z.number(),
    finishGateDurtme: z.number(),
    kabul: z.number(),
    ret: z.number(),
    kabulOrani: z.number().nullable(),
    anlasilmazlik: z.number(),
    inTok: z.number(),
    outTok: z.number(),
    cacheTok: z.number(),
    ortTurSn: z.number().nullable(),
    modeller: z.record(z.string(), z.number()),
    maliyetUsd: z.number(),
    modlar: z.record(z.string(), z.number()),
    altAjan: z.number(),
  }),
});

export const modDurum = defineRpc({
  name: "mod.durum",
  input: z.object({ cwd: z.string() }),
  output: z.object({
    aktif: z.string().nullable(),
    eslesmeler: z.array(z.object({ provider: z.string(), modelDeseni: z.string(), mod: z.string() })),
    modlar: z.array(z.string()),
  }),
});

export const modAyarla = defineRpc({
  name: "mod.ayarla",
  input: z.object({
    cwd: z.string(),
    mod: z.string(),
    provider: z.string().optional(),
    model: z.string().optional(),
  }),
  output: z.object({ ok: z.boolean(), mesaj: z.string() }),
});

export const sonDegerlendirme = defineRpc({
  name: "degerlendirme.son",
  input: z.object({ cwd: z.string() }),
  output: z.object({
    dosya: z.string().nullable(),
    icerik: z.string().nullable(),
    kilitler: z.array(z.string()),
  }),
});

export const panoDurum = defineRpc({
  name: "pano.durum",
  input: z.object({}),
  output: z.object({
    ok: z.boolean(),
    port: z.number(),
    uiDir: z.string(),
    uiVar: z.boolean(),
    paseoBagli: z.boolean(),
    yazma: z.boolean(),
    dinliyor: z.boolean(),
  }),
});

export const orduEmir = defineRpc({
  name: "ordu.emir",
  input: z.object({ cwd: z.string(), emir: z.string() }),
  output: z.object({ ok: z.boolean(), managerId: z.string().nullable(), mesaj: z.string() }),
});
