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
  assert(r2.dirtulen === 0 && giden === 0, "11dk okuyucu stall: pitbull susar (okuyucu esigi 20dk)");
  pitbullTurBasladi("pb1", Date.now() - 21 * 60_000);
  let r2b = pitbullTara(harita, gonder);
  assert(r2b.dirtulen === 1 && giden === 1, "21dk okuyucu stall: pitbull durtur");
  let r3 = pitbullTara(harita, gonder);
  assert(r3.dirtulen === 0 && giden === 1, "cooldown icinde ikinci durtme yok");
  pitbullTurBitti("pb1");
  let r4 = pitbullTara(harita, gonder);
  assert(r4.dirtulen === 0, "tur bitince pitbull sifirlanir");

  const aj2 = { id: "pb2", cwd: "D:/Vibecode/paseo-verimlilik", provider: "codex" } as never;
  harita.set("pb2", aj2);
  pitbullTurBasladi("pb2", Date.now() - 30 * 60_000);
  pitbullTurBitti("pb2", true);
  pitbullTurBasladi("pb2", Date.now() - 16 * 60_000);
  _testIcinDurumVer("pb2")!.sonDurtme = 0;
  let sonMetin = "";
  const gonder2 = async (_a: unknown, m: string) => { giden++; sonMetin = m; };
  let r5 = pitbullTara(harita, gonder2);
  assert(r5.dirtulen === 1, "16dk yazici stall: pitbull durtur (yazici esigi 15dk)");
  assert(sonMetin.includes("yazım kümesi sessiz"), "yazici durtmesi yazim-kumesi sinifini bildirir");
  harita.delete("pb2");


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


  const { onboardingTara, onboardingKontrol, sonHandoff } = await import("../server/onboarding");
  const os = await import("node:os");
  const fsp = await import("node:fs");

  const tmp = fsp.mkdtempSync(os.tmpdir() + "/ob-");
  fsp.mkdirSync(tmp + "/plans/handoff", { recursive: true });
  fsp.writeFileSync(tmp + "/plans/handoff/HANDOFF-2026-01-01-0000.md", "eski");
  fsp.writeFileSync(tmp + "/plans/handoff/HANDOFF-2026-06-01-0000.md", "yeni");
  assert(sonHandoff(tmp) === "HANDOFF-2026-06-01-0000.md", "sonHandoff en yeni dosyayi bulur");

  onboardingTara("ob1", tmp);
  let obGiden = 0;
  const obCtx = { paseo: { agents: { ref: () => ({ send: async () => { obGiden++; } }) } }, signal: new AbortController().signal } as never;
  const echoEksik = [userMsg("is"), asstMsg("ok tamam")];
  assert(await onboardingKontrol("ob1", tmp, "codex", echoEksik, obCtx) === true && obGiden === 1, "echo eksikse ilk turda durtme");

  onboardingTara("ob2", tmp);
  obGiden = 0;
  const echoTam = [userMsg("is"), asstMsg("Echo: kirli dosyalar yok (git status temiz), son commit abc1234, bekleyen onay: yok.")];
  assert(await onboardingKontrol("ob2", tmp, "codex", echoTam, obCtx) === false && obGiden === 0, "echo uclusu varsa susar");

  const tmpBos = fsp.mkdtempSync(os.tmpdir() + "/ob-bos-");
  onboardingTara("ob3", tmpBos);
  obGiden = 0;
  assert(await onboardingKontrol("ob3", tmpBos, "codex", echoEksik, obCtx) === true && obGiden === 1, "iskelet yoksa durtme");
  onboardingTara("ob4", tmpBos);
  fsp.writeFileSync(tmpBos + "/AGENTS.md", "kurallar");
  obGiden = 0;
  assert(await onboardingKontrol("ob4", tmpBos, "codex", echoEksik, obCtx) === false && obGiden === 0, "iskelet sonradan kurulduysa susar");
  fsp.rmSync(tmp, { recursive: true, force: true });
  fsp.rmSync(tmpBos, { recursive: true, force: true });

  const { sonDegerlendirmeOku, kilitleriListele } = await import("../server/degerlendirme");
  const degTmp = fsp.mkdtempSync(os.tmpdir() + "/deg-");
  const bosSonuc = sonDegerlendirmeOku(degTmp);
  assert(bosSonuc.dosya === null && bosSonuc.icerik === null && bosSonuc.kilitler.length === 0, "bos projede degerlendirme null doner");
  fsp.mkdirSync(degTmp + "/raporlar/oz-degerlendirme", { recursive: true });
  fsp.writeFileSync(degTmp + "/raporlar/oz-degerlendirme/2026-10-04.md", "eski rapor");
  fsp.writeFileSync(degTmp + "/raporlar/oz-degerlendirme/2026-10-11.md", "yeni rapor icerik");
  const doluSonuc = sonDegerlendirmeOku(degTmp);
  assert(doluSonuc.dosya === "2026-10-11.md", "en yeni rapor adyla secilir (ISO siralama)");
  assert(doluSonuc.icerik === "yeni rapor icerik", "rapor icerigi okunur");
  fsp.mkdirSync(degTmp + "/surumler/v0.4", { recursive: true });
  fsp.writeFileSync(degTmp + "/surumler/v0.4/kilit.json", "{}");
  fsp.mkdirSync(degTmp + "/surumler/yarim", { recursive: true });
  const kilitler = kilitleriListele(degTmp);
  assert(kilitler.length === 1 && kilitler[0] === "v0.4", "yalniz kilit.json iceren surumler listelenir");
  fsp.rmSync(degTmp, { recursive: true, force: true });

  const { karisiklikKaydet, kabulKaydet, telemetriOzetle } = await import("../server/telemetry");
  const telTmp = fsp.mkdtempSync(os.tmpdir() + "/tel-");
  karisiklikKaydet(telTmp, "a1", "codex", "onceki-tur-prompt-deseni(T)");
  karisiklikKaydet(telTmp, "a1", "codex", "onceki-tur-prompt-deseni(T)");
  kabulKaydet(telTmp, "a1", "codex", true, "x");
  const telOz = telemetriOzetle(telTmp);
  assert(telOz.anlasilmazlik === 2, "karisiklik kayitlari ozete sayilir");
  assert(telOz.kabul === 1 && telOz.kabulOrani === 100, "kabul sayaci karisikliktan etkilenmez");
  assert(telemetriOzetle(os.tmpdir() + "/tel-yok-" + Date.now()).anlasilmazlik === 0, "dosya yoksa anlasilmazlik 0");
  fsp.rmSync(telTmp, { recursive: true, force: true });

  const { RET_DESENI, KARISIKLIK_DESENI } = await import("../server/desenler");
  assert(RET_DESENI.test("bu olmadı"), "ret deseni: olmadi yakalanir");
  assert(RET_DESENI.test("bu yanlış"), "ret deseni: Turkce harfle biten kelime satir sonunda yakalanir (unicode sinir)");
  assert(RET_DESENI.test("olmamış, tekrar dene"), "ret deseni: olmamis yakalanir");
  assert(!RET_DESENI.test("tamam, güzel iş"), "ret deseni: temiz mesaj yakalanmaz");
  assert(!RET_DESENI.test("yanlışlar listesi"), "ret deseni: kelime-parcasi eslesmesi yok (yanlislar != yanlis)");
  assert(KARISIKLIK_DESENI.test("bu çok karışık"), "karisiklik: karisik yakalanir");
  assert(KARISIKLIK_DESENI.test("net değil"), "karisiklik: net degil yakalanir");
  assert(!KARISIKLIK_DESENI.test("açık ve anlaşılır"), "karisiklik: temiz mesaj yakalanmaz");
  assert(izinKarari("rd /s /q build") === "deny", "rd /s deny");
  assert(izinKarari("git clean -fd") === "deny", "git clean -fd deny");
  assert(izinKarari("git checkout -- src/a.ts") === "deny", "git checkout -- deny");
  assert(izinKarari("git checkout main") === null, "git checkout main dokunma");

  const { ayarOku, VARSAYILAN_AYAR } = await import("../server/ayar");
  const ayTmp = fsp.mkdtempSync(os.tmpdir() + "/ayar-");
  assert(ayarOku(ayTmp).pitbullYaziciDk === 15 && ayarOku(ayTmp).enjeksiyonMod === "tam", "ayar yoksa varsayilan");
  fsp.mkdirSync(ayTmp + "/.verimlilik", { recursive: true });
  fsp.writeFileSync(ayTmp + "/.verimlilik/ayar.json", JSON.stringify({ pitbullYaziciDk: 30, kapsamEsik: 6, enjeksiyonMod: "isaretci" }));
  const ay1 = ayarOku(ayTmp);
  assert(ay1.pitbullYaziciDk === 30 && ay1.kapsamEsik === 6 && ay1.enjeksiyonMod === "isaretci", "ayar.json override okunur");
  assert(ay1.pitbullOkuyucuDk === VARSAYILAN_AYAR.pitbullOkuyucuDk, "belirtilmeyen alan varsayilana duser");
  fsp.writeFileSync(ayTmp + "/.verimlilik/ayar.json", "{bozuk json");
  assert(ayarOku(ayTmp).pitbullYaziciDk === 15, "bozuk json varsayilana duser (crash yok)");
  fsp.writeFileSync(ayTmp + "/.verimlilik/ayar.json", JSON.stringify({ pitbullYaziciDk: 9999, enjeksiyonMod: "sacma" }));
  const ay2 = ayarOku(ayTmp);
  assert(ay2.pitbullYaziciDk === 15 && ay2.enjeksiyonMod === "tam", "sinir-disi degerler reddedilir");
  fsp.rmSync(ayTmp, { recursive: true, force: true });

  const { isaretciMetni } = await import("../server/sozlesme");
  const ism = isaretciMetni(103);
  assert(ism.includes("103") && ism.includes("bloklandı"), "isaretci metni kural sayisini ve blok sebebini tasir");
  assert(ism.split("\n").length === 4 && ism.length < 600, "isaretci 4 satir ve kucuk (butce dostu)");

  const { isoHafta, haftalikRollup } = await import("../server/rollup");
  assert(isoHafta(new Date("2026-10-12T12:00:00")) === "2026-W42", "ISO hafta: 2026-10-12 = W42");
  const roTmp = fsp.mkdtempSync(os.tmpdir() + "/roll-");
  assert(haftalikRollup(roTmp) === null, "telemetri yoksa rollup uretmez");
  fsp.mkdirSync(roTmp + "/.verimlilik", { recursive: true });
  const roKayitlar = [
    { ts: "2026-10-12T10:00:00Z", tip: "tur", agentId: "a", provider: "p", turSn: 100, loopDurtme: true, detay: "in=1000 cacheHitPct=80" },
    { ts: "2026-10-12T10:05:00Z", tip: "tur", agentId: "a", provider: "p", turSn: 200, detay: "in=1000 cacheHitPct=100" },
    { ts: "2026-10-12T10:06:00Z", tip: "kabul", agentId: "a", provider: "p", kabul: true },
    { ts: "2026-10-12T10:07:00Z", tip: "karisiklik", agentId: "a", provider: "p" },
  ];
  fsp.writeFileSync(roTmp + "/.verimlilik/telemetri.jsonl", roKayitlar.map((k) => JSON.stringify(k)).join("\n") + "\n");
  const roDosya = haftalikRollup(roTmp, new Date("2026-10-12T18:00:00"));
  assert(roDosya !== null && fsp.existsSync(roDosya), "rollup dosyasi uretilir");
  const roMd = fsp.readFileSync(roDosya!, "utf8");
  assert(roMd.includes("Tur: 2") && roMd.includes("150sn"), "rollup tur sayisi ve ortalama dogru");
  assert(roMd.includes("%100 (1/1)"), "rollup kabul orani dogru");
    assert(roMd.includes("loop 1") && roMd.includes("Anlaşılmazlık: 1"), "rollup durtmeler dogru");
  assert(roMd.includes("%90"), "rollup cache-hit ortalamasi dogru (80+100)/2");
  assert(haftalikRollup(roTmp, new Date("2026-10-12T19:00:00")) === null, "ayni hafta ikinci rollup atlar (idempotent)");
  fsp.rmSync(roTmp, { recursive: true, force: true });

  console.log(hata === 0 ? "TUM TESTLER GECTI" : hata + " HATA");
  process.exit(hata === 0 ? 0 : 1);
})();