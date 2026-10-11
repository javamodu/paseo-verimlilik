import { toolCallOzetleri } from "../server/inspect";
import { CEKIRDEK } from "../server/cekirdek";
import { enjeksiyonMetni, kuralSayisi, KURAL_BLOK } from "../server/sozlesme";

function tc(name: string, detailType: string, detail: Record<string, unknown>, status = "completed") {
  return { type: "tool_call", callId: Math.random().toString(36).slice(2), name, detail: { type: detailType, ...detail }, status, error: null } as never;
}

let hata = 0;
function assert(kosul: boolean, mesaj: string) {
  if (!kosul) { hata++; console.error("FAIL: " + mesaj); } else { console.log("ok: " + mesaj); }
}

const uc = [tc("exec", "shell", { command: "npm test", exitCode: 0 }), tc("exec", "shell", { command: "npm test", exitCode: 1 }), tc("exec", "shell", { command: "npm test", exitCode: 1 })];
const ozetler = toolCallOzetleri(uc);
assert(ozetler.length === 3, "uc tool call ozetlendi");
assert(ozetler[0].hash === ozetler[1].hash, "ayni komut ayni hash (exitCode hash'e girmez)");
assert(ozetler[0].hash.includes("shell"), "hash detailType icerir");

const farkli = toolCallOzetleri([tc("exec", "shell", { command: "npm test" }), tc("exec", "shell", { command: "npm run build" })]);
assert(farkli[0].hash !== farkli[1].hash, "farkli komut farkli hash");

assert(kuralSayisi(CEKIRDEK) > 10, "CEKIRDEK kural sayisi pozitif: " + kuralSayisi(CEKIRDEK));
assert(kuralSayisi(CEKIRDEK) < KURAL_BLOK, "CEKIRDEK tek basina blok esiginin altinda");

const enj = enjeksiyonMetni("D:\\Vibecode\\paseo-plugin", "MEVCUT PROMPT");
assert(enj.metin.startsWith("# SÖZLEŞME ÇEKİRDEK"), "enjeksiyon CEKIRDEK ile baslar (cache dostu)");
assert(enj.metin.endsWith("MEVCUT PROMPT"), "mevcut prompt sonda korunur");
assert(enj.metin.includes("ANAYASA.md VAR"), "paseo-plugin reposunda ANAYASA tespit edildi");
assert(enj.kuralToplam > kuralSayisi(CEKIRDEK), "proje kurallari toplama eklendi: " + enj.kuralToplam);

const bos = enjeksiyonMetni("D:\\", "");
assert(bos.metin.includes("ilk-15-dakika"), "bossuz projede onboarding isaretcisi duser");

console.log(hata === 0 ? "TUM TESTLER GECTI" : hata + " HATA");
process.exit(hata === 0 ? 0 : 1);