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
  }),
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
