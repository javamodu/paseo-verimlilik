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


const uzunA = "Get-Content " + "A".repeat(300);
const uzunB = "Get-Content " + "B".repeat(300);
const uzunlar = toolCallOzetleri([tc("exec", "shell", { command: uzunA }), tc("exec", "shell", { command: uzunB }), tc("exec", "shell", { command: uzunA })]);
assert(uzunlar[0].hash !== uzunlar[1].hash, "uzun komutlar birbirinden ayrilir (200+ char kirpma)");
assert(uzunlar[0].hash === uzunlar[2].hash, "ayni uzun komut ayni hash");

import { finishGateKontrol } from "../server/finishgate";
let gonderilen = 0;
const mockContext = { paseo: { agents: { ref: () => ({ send: async () => { gonderilen++; } }) } }, signal: new AbortController().signal } as never;
const userMsg = (t: string) => ({ type: "user_message", text: t }) as never;
const asstMsg = (t: string) => ({ type: "assistant_message", text: t }) as never;

void (async () => {
  gonderilen = 0;
  const saltMetin = [userMsg("hazir mi?"), asstMsg("Evet, tamamlandi.")];
  assert(await finishGateKontrol("t1", saltMetin, mockContext) === false && gonderilen === 0, "salt-metin turda finish-gate susar");
  
  gonderilen = 0;
  const editliKanitsiz = [userMsg("duzelt"), tc("edit", "edit", { filePath: "a.ts" }), asstMsg("Tamam, bitti.")];
  assert(await finishGateKontrol("t2", editliKanitsiz, mockContext) === true && gonderilen === 1, "editli + kanitsiz turda finish-gate durtur");
  
  gonderilen = 0;
  const editliKanitli = [userMsg("duzelt"), tc("edit", "edit", { filePath: "a.ts" }), tc("exec", "shell", { command: "npm test", exitCode: 0 }), asstMsg("Bitti, testler gecti.")];
  assert(await finishGateKontrol("t3", editliKanitli, mockContext) === false && gonderilen === 0, "editli + exit-0 testli turda finish-gate susar");
  console.log(hata === 0 ? "TUM TESTLER GECTI" : hata + " HATA");
  process.exit(hata === 0 ? 0 : 1);
})();