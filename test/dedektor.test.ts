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

  const { izinKarari } = await import("../server/permission");
  const { pitbullTurBasladi, pitbullTurBitti, pitbullTara, _testIcinDurumVer } = await import("../server/pitbull");

  assert(izinKarari("git status") === "allow", "git status allow");
  assert(izinKarari("rg --files") === "allow", "rg allow");
  assert(izinKarari("Get-Content README.md") === "allow", "Get-Content allow");
  assert(izinKarari("rm -rf node_modules") === "deny", "rm -rf deny");
  assert(izinKarari("git push --force origin main") === "deny", "force push deny");
  assert(izinKarari("git reset --hard HEAD~1") === "deny", "reset --hard deny");
  assert(izinKarari("git status && rm -rf /") === "deny", "zincirde tehlike yine de deny");
  assert(izinKarari("git status && git log") === null, "zincir allow edilmez");
  assert(izinKarari("echo x > dosya.txt") === null, "redirect bypass engellenir");
  assert(izinKarari("npm install") === null, "npm install dokunma (kullaniciya)");
  assert(izinKarari(null) === null, "shell-disina dokunma");

  const aj = { id: "pb1", cwd: "D:/Vibecode/paseo-verimlilik", provider: "codex" } as never;
  const harita = new Map<string, never>([["pb1", aj]]);
  let giden = 0;
  const gonder = async () => { giden++; };
  pitbullTurBasladi("pb1");
  let r1 = pitbullTara(harita, gonder);
  assert(r1.dirtulen === 0 && giden === 0, "yeni tur: pitbull susar");
  pitbullTurBasladi("pb1", Date.now() - 11 * 60_000);
  _testIcinDurumVer("pb1")!.sonDurtme = 0;
  let r2 = pitbullTara(harita, gonder);
  assert(r2.dirtulen === 1 && giden === 1, "11dk stall: pitbull durtur");
  let r3 = pitbullTara(harita, gonder);
  assert(r3.dirtulen === 0 && giden === 1, "cooldown icinde ikinci durtme yok");
  pitbullTurBitti("pb1");
  let r4 = pitbullTara(harita, gonder);
  assert(r4.dirtulen === 0, "tur bitince pitbull sifirlanir");


  const { kapsamSay } = await import("../server/kapsam");
  const { briefTara } = await import("../server/brief");

  const kapsamli = [userMsg("is"),
    tc("e","edit",{filePath:"a.ts"}), tc("e","edit",{filePath:"b.ts"}),
    tc("e","write",{filePath:"c.ts"}), tc("e","edit",{filePath:"d.ts"}),
    asstMsg("bitti")];
  assert(kapsamSay(kapsamli).dosyalar.length === 4, "kapsam: 4 biricik dosya sayilir");
  const kapsamTekrar = [userMsg("is"), tc("e","edit",{filePath:"a.ts"}), tc("e","edit",{filePath:"a.ts"}), asstMsg("ok")];
  assert(kapsamSay(kapsamTekrar).dosyalar.length === 1, "kapsam: ayni dosya tekrarlari birlesir");

  const zayifBrief = [userMsg("delege et"), tc("s","sub_agent",{description:"kisa"}), asstMsg("tamam")];
  assert(briefTara(zayifBrief).zayif === 1, "kisa+madde-siz brief zayif sayilir");
  const iyiBrief = [userMsg("delege et"), tc("s","sub_agent",{description: "- Hedef: X yap\n- Cikti: Y formatinda\n- Arac: Z\n- Sinir: W yapma"}), asstMsg("tamam")];
  assert(briefTara(iyiBrief).zayif === 0, "uzun+maddeli brief gecer");
  const brefsiz = [userMsg("is"), tc("e","edit",{filePath:"a.ts"}), asstMsg("ok")];
  assert(briefTara(brefsiz).toplam === 0, "sub_agent yoksa brief taramasi sifir");

  console.log(hata === 0 ? "TUM TESTLER GECTI" : hata + " HATA");
  process.exit(hata === 0 ? 0 : 1);
})();