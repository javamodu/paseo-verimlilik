import { toolCallOzetleri } from "../server/inspect";
import * as osM from "node:os";
import * as fspM from "node:fs";
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



// v0.8c1: enjeksiyon modu her akista uygulanir (P1-5)
{
  const mkMod = (mod: string) => {
    const d = fspM.mkdtempSync(osM.tmpdir() + "/mod-");
    fspM.mkdirSync(d + "/.verimlilik", { recursive: true });
    fspM.writeFileSync(d + "/.verimlilik/ayar.json", JSON.stringify({ enjeksiyonMod: mod }));
    fspM.writeFileSync(d + "/AGENTS.md", "- kural1");
    return d;
  };
  const dKapali = mkMod("kapali");
  const rKapali = enjeksiyonMetni(dKapali, "MP");
  assert(rKapali.atlandi === true && rKapali.metin === "", "mod=kapali: enjeksiyon atlanir (kural blogu olmadan da)");
  const dIsaretci = mkMod("isaretci");
  const rIsaretci = enjeksiyonMetni(dIsaretci, "MP");
  assert(rIsaretci.atlandi === false && rIsaretci.metin.includes("sözleşme işaretçisi") && !rIsaretci.metin.includes("# SÖZLEŞME ÇEKİRDEK"), "mod=isaretci: kisa metin, cekirdek yok");
  assert(rIsaretci.metin.endsWith("MP"), "mod=isaretci: mevcut prompt korunur");
  const dTam = mkMod("tam");
  const rTam = enjeksiyonMetni(dTam, "MP");
  assert(rTam.atlandi === false && rTam.metin.includes("# SÖZLEŞME ÇEKİRDEK"), "mod=tam: tam cekirdek");
  assert(!rIsaretci.metin.includes("(paket reposu)"), "isaretci hayalet referans icermez");
  fspM.rmSync(dKapali, { recursive: true, force: true });
  fspM.rmSync(dIsaretci, { recursive: true, force: true });
  fspM.rmSync(dTam, { recursive: true, force: true });
}

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

// v0.8a: yazici secenek/alt-komut daraltmasi (P0 review bulgusu)
assert(izinKarari("git branch -D deneme") === null, "git branch -D kullaniciya birakilir");
assert(izinKarari("git branch -m eski yeni") === null, "git branch -m kullaniciya");
assert(izinKarari("git branch yeni-dal") === null, "dal olusturma kullaniciya");
assert(izinKarari("git branch") === "allow", "git branch allow");
assert(izinKarari("git branch -a -v") === "allow", "git branch -a -v allow");
assert(izinKarari("git branch --list feat") === "allow", "git branch --list allow");
assert(izinKarari("npm audit fix") === null, "npm audit fix kullaniciya");
assert(izinKarari("npm audit") === "allow", "npm audit allow");
assert(izinKarari("npm audit --json") === "allow", "npm audit --json allow");
assert(izinKarari("git remote -v") === "allow", "git remote -v allow");
assert(izinKarari("git remote add origin x") === null, "git remote add kullaniciya");
assert(izinKarari("git stash list") === "allow", "git stash list allow");
assert(izinKarari("git stash drop") === null, "git stash drop kullaniciya");
assert(izinKarari("rg fix src/") === "allow", "okuyucu komutta arguman serbest (yanlis-pozitif yok)");

  const pbTmp = fspM.mkdtempSync(osM.tmpdir() + "/pb-");
  const aj = { id: "pb1", cwd: pbTmp, provider: "qoder" } as never; // R3-01: codex provider artik null-modelde firtina (8dk) — varsayilan esik testi eslesmesiz provider kullanir
  const harita = new Map<string, never>([["pb1", aj]]);
  let giden = 0;
  let sonPitbullMesaj = "";
  const gonder = async (_a: unknown, mesaj?: string) => { giden++; sonPitbullMesaj = mesaj || ""; };
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
  // K-fix: dakika metni birim dogrulamasi — stallSuresi ms, mesaj gercek dakika gostermeli (regresyon: /60 yazilip ms->saniye varsayilmisti)
  assert(sonPitbullMesaj.includes("21 dakikadır"), "21dk stall mesaji '21 dakikadır' demeli, gelen: " + sonPitbullMesaj);
  let r3 = pitbullTara(harita, gonder);
  assert(r3.dirtulen === 0 && giden === 1, "cooldown icinde ikinci durtme yok");
  pitbullTurBitti("pb1");
  let r4 = pitbullTara(harita, gonder);
  assert(r4.dirtulen === 0, "tur bitince pitbull sifirlanir");

  const aj2 = { id: "pb2", cwd: pbTmp, provider: "codex" } as never;
  harita.set("pb2", aj2);
  pitbullTurBasladi("pb2", Date.now() - 30 * 60_000);
  pitbullTurBitti("pb2", true);
  pitbullTurBasladi("pb2", Date.now() - 16 * 60_000);
  _testIcinDurumVer("pb2")!.sonDurtme = 0;
  let sonMetin = "";
  const gonder2 = async (_a: unknown, m: string) => { giden++; sonMetin = m; };
  let r5 = pitbullTara(harita, gonder2);
  assert(r5.dirtulen === 1, "16dk yazici stall: pitbull durtur (yazici esigi 15dk)");

  // v0.8c3: oturum durtme tavani (5) + bayat tur korumasi (24sa)
  const aj3 = { id: "pb3", cwd: pbTmp, provider: "codex" } as never;
  const harita3 = new Map<string, never>([["pb3", aj3]]);
  pitbullTurBasladi("pb3", Date.now() - 21 * 60_000);
  let giden3 = 0;
  const gonder3 = async () => { giden3++; };
  for (let i = 0; i < 7; i++) {
    const st = _testIcinDurumVer("pb3");
    if (st) { st.sonDurtme = Date.now() - 11 * 60_000; st.turBaslangic = Date.now() - 21 * 60_000; st.ardisikStall = 0; }
    pitbullTara(harita3, gonder3);
  }
  assert(giden3 === 5, "oturum tavani: 5 durtmeden sonra susar (giden=" + giden3 + ")");
  const aj4 = { id: "pb4", cwd: pbTmp, provider: "codex" } as never;
  const harita4 = new Map<string, never>([["pb4", aj4]]);
  pitbullTurBasladi("pb4", Date.now() - 25 * 60 * 60_000);
  const rBayat = pitbullTara(harita4, async () => { throw new Error("olmamali"); });
  assert(rBayat.dirtulen === 0 && _testIcinDurumVer("pb4")!.turBaslangic === null, "bayat tur (25sa) durtme uretmez, sifirlanir");
  assert(sonMetin.includes("yazım kümesi sessiz"), "yazici durtmesi yazim-kumesi sinifini bildirir");
  harita.delete("pb2");
  fspM.rmSync(pbTmp, { recursive: true, force: true });


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
  const ikiAnahtar = [userMsg("delege et"), tc("s","sub_agent",{description:"Hedef: X yap. Cikti: Y formatinda olsun. Bu metin uzunluk esigini gecmek icin biraz daha uzun."}), asstMsg("tamam")];
  assert(briefTara(ikiAnahtar).zayif === 1, "v0.8c3: 2 anahtar yetmez (>=3 sarti)");
  const ucAnahtar = [userMsg("delege et"), tc("s","sub_agent",{description:"Hedef: X yap. Cikti: Y formatinda. Sinir: W yapma. Uzunluk icin ek metin."}), asstMsg("tamam")];
  assert(briefTara(ucAnahtar).zayif === 0, "v0.8c3: 3 anahtar gecer");

  // v0.12.1: callId-bazli dedupe — eski brief her turda yeniden durtmesin
  const gorulen = new Set<string>();
  const br1 = briefTara(zayifBrief, gorulen);
  assert(br1.toplam === 1 && br1.zayif === 1, "ilk tarama sayar");
  const br2 = briefTara(zayifBrief, gorulen);
  assert(br2.toplam === 0 && br2.zayif === 0, "ayni callId ikinci taramada atlanir (dedupe)");
  assert(briefTara(zayifBrief).zayif === 1, "gorulen seti verilmezse eski davranis korunur");


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
  assert(await onboardingKontrol("ob4", tmpBos, "codex", echoEksik, obCtx) === true && obGiden === 1, "v0.8c2: tek katman yetmez (L1+L5 eksikse durtme surer)");
  onboardingTara("ob5", tmpBos);
  fsp.writeFileSync(tmpBos + "/STATE_BOARD.md", "durum");
  fsp.writeFileSync(tmpBos + "/DERSLER.md", "dersler");
  obGiden = 0;
  assert(await onboardingKontrol("ob5", tmpBos, "codex", echoEksik, obCtx) === false && obGiden === 0, "uc katman kurulduysa susar");
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
  // hafta disi kayit sayilmaz (P1-4 suzme testi)
  fsp.appendFileSync(roTmp + "/.verimlilik/telemetri.jsonl", JSON.stringify({ ts: "2026-10-05T10:00:00Z", tip: "tur", agentId: "a", provider: "p", turSn: 999, detay: "in=1 cacheHitPct=1" }) + "\n");
  const roDosya2 = haftalikRollup(roTmp, new Date("2026-10-12T19:00:00"));
  const roMd2 = fsp.readFileSync(roDosya2!, "utf8");
  assert(roMd2.includes("Tur: 2"), "hafta disi kayit sayilmaz (W41 disarida): " + roMd2.match(/Tur: \d+/));
  const roJson = JSON.parse(fsp.readFileSync(roDosya2!.replace(".md", ".json"), "utf8"));
  assert(roJson.hafta === "2026-W42" && roJson.tur === 2 && roJson.ortCacheHit === 90, "makine-okunur json yan dosya dogru");
  const roMd3 = fsp.readFileSync(haftalikRollup(roTmp, new Date("2026-10-12T20:00:00"))!, "utf8");
  assert(roMd3 === roMd2, "ayni veri ayni raporu uretir (deterministik, canli hafta guncel)");
  fsp.rmSync(roTmp, { recursive: true, force: true });

  // v0.12: rollup delta + kabul kapsami + alt-ajan (K-0021/K-0022)
  const rdTmp = fsp.mkdtempSync(os.tmpdir() + "/rolld-");
  fsp.mkdirSync(rdTmp + "/.verimlilik", { recursive: true });
  fsp.mkdirSync(rdTmp + "/raporlar/telemetri-haftalik", { recursive: true });
  fsp.writeFileSync(rdTmp + "/raporlar/telemetri-haftalik/2026-W41.json", JSON.stringify({ hafta: "2026-W41", tur: 1, kabulOrani: 50, pitbull: 0, ortCacheHit: 80 }));
  fsp.writeFileSync(rdTmp + "/.verimlilik/telemetri.jsonl", [
    { ts: "2026-10-12T10:00:00Z", tip: "tur", agentId: "a", provider: "p", altAjan: true, detay: "in=1000 cacheHitPct=90" },
    { ts: "2026-10-12T11:00:00Z", tip: "tur", agentId: "b", provider: "p" },
    { ts: "2026-10-12T12:00:00Z", tip: "kabul", agentId: "a", provider: "p", kabul: true },
  ].map((k) => JSON.stringify(k)).join("\n") + "\n");
  const rdMd = fsp.readFileSync(haftalikRollup(rdTmp, new Date("2026-10-12T18:00:00"))!, "utf8");
  assert(rdMd.includes("Alt-ajan turları: 1"), "alt-ajan turu sayilir (K-0021)");
  assert(rdMd.includes("Kabul kapsamı: 1 kayıt"), "kabul kapsami kayit sayisi");
  assert(rdMd.includes("Önceki haftaya göre (2026-W41)"), "delta satiri onceki haftayi anar");
  assert(rdMd.includes("tur +1") && rdMd.includes("kabul +50 puan") && rdMd.includes("cache-hit +10 puan"), "delta yon ve buyukluk dogru");
  const rdJson = JSON.parse(fsp.readFileSync(rdTmp + "/raporlar/telemetri-haftalik/2026-W42.json", "utf8"));
  assert(rdJson.altAjanTur === 1 && rdJson.kabulKayit === 1 && rdJson.delta.tur === 1 && rdJson.delta.kabulPuan === 50, "delta json makine-okunur");
  fsp.rmSync(rdTmp, { recursive: true, force: true });

  const rbTmp = fsp.mkdtempSync(os.tmpdir() + "/rollb-");
  fsp.mkdirSync(rbTmp + "/.verimlilik", { recursive: true });
  fsp.writeFileSync(rbTmp + "/.verimlilik/telemetri.jsonl", JSON.stringify({ ts: "2026-10-12T10:00:00Z", tip: "tur", agentId: "a", provider: "p" }) + "\n");
  const rbMd = fsp.readFileSync(haftalikRollup(rbTmp, new Date("2026-10-12T18:00:00"))!, "utf8");
  assert(rbMd.includes("baz hafta") && rbMd.includes("koşul oluşmadı"), "onceki hafta yoksa baz notu + kabul kosulu aciklamasi");
  fsp.rmSync(rbTmp, { recursive: true, force: true });

  // v0.12: bekci STATE_BOARD isaretcisi (K-0023 O2)
  const { panoIsaretciYaz } = await import("../server/bekci");
  const bpTmp = fsp.mkdtempSync(os.tmpdir() + "/pano-");
  fsp.writeFileSync(bpTmp + "/STATE_BOARD.md", "# Pano\n\n## Aktif iş\nYok.\n", "utf8");
  assert(panoIsaretciYaz(bpTmp, "2026-10-13") === true, "isaretci ilk yazimda eklenir");
  const bp1 = fsp.readFileSync(bpTmp + "/STATE_BOARD.md", "utf8");
  assert(bp1.includes("- bekci raporu: raporlar/takip-sozlesme/2026-10-13.md"), "isaretci Aktif is altina duser");
  assert(panoIsaretciYaz(bpTmp, "2026-10-13") === false, "ayni gun idempotent");
  panoIsaretciYaz(bpTmp, "2026-10-14");
  const bp2 = fsp.readFileSync(bpTmp + "/STATE_BOARD.md", "utf8");
  assert((bp2.match(/bekci raporu:/g) || []).length === 1 && bp2.includes("2026-10-14"), "yeni gun satiri kopyalamaz, gunceller");
  fsp.rmSync(bpTmp, { recursive: true, force: true });

  assert(CEKIRDEK.includes("okumadan-yazma kuralına tabi kalır"), "K-0023 O1: %90 maddesi kapsam yarim cumlesi tasir");

  const { katmanKokuBul, projeyiTara } = await import("../server/sozlesme");
  const wTmp = fsp.mkdtempSync(os.tmpdir() + "/walk-");
  fsp.mkdirSync(wTmp + "/proje/alt/derin", { recursive: true });
  fsp.writeFileSync(wTmp + "/proje/AGENTS.md", "kurallar");
  assert(katmanKokuBul(wTmp + "/proje/alt/derin").replace(/\\/g, "/").endsWith("/proje"), "yukari tarama katman kokune ulasir");
  assert(projeyiTara(wTmp + "/proje/alt/derin").agents === true, "alt dizinden AGENTS bulunur (yanlis-negatif kapandi)");
  const wBos = wTmp + "/bos/a/b/c/d/e";
  fsp.mkdirSync(wBos, { recursive: true });
  assert(katmanKokuBul(wBos).replace(/\\/g, "/").endsWith("/bos/a/b/c/d/e"), "isaretsizde cwd korunur (5 seviye tavani)");
  assert(CEKIRDEK.includes("EK özetleri") && CEKIRDEK.includes("model değişimini tur sınırında"), "EK-1 ozeti cekirdekte (hayalet referans yok)");
  assert(Buffer.byteLength(CEKIRDEK, "utf8") < 12 * 1024, "CEKIRDEK 12KB altinda (20KB butceye proje payi kalir)");
  fsp.rmSync(wTmp, { recursive: true, force: true });

  const { yazmaKomutuMu, editliMi } = await import("../server/inspect");
  assert(yazmaKomutuMu('Set-Content a.txt "x"'), "yazma: Set-Content");
  assert(yazmaKomutuMu("echo x > out.txt"), "yazma: redirect");
  assert(yazmaKomutuMu("fs.writeFileSync cagrisi iceren komut"), "yazma: writeFileSync");
  assert(!yazmaKomutuMu("npm test 2>&1 | Select-Object -Last 3"), "yazma: stderr redirect yanlis-pozitif degil");
  assert(!yazmaKomutuMu("git status"), "yazma: git status degil");
  assert(editliMi(toolCallOzetleri([tc("exec", "shell", { command: "Set-Content a.txt x" })])), "editliMi: shell yazma editli sayilir");
  gonderilen = 0;
  const shellYazmaKanitsiz = [userMsg("duzelt"), tc("exec", "shell", { command: "Set-Content a.ts x" }), asstMsg("Tamam, bitti.")];
  assert(await finishGateKontrol("t4", shellYazmaKanitsiz, mockContext) === true && gonderilen === 1, "shell-yazmali + kanitsiz turda finish-gate durtur");
  gonderilen = 0;
  const echoTestSahteKanit = [userMsg("duzelt"), tc("edit", "edit", { filePath: "a.ts" }), tc("exec", "shell", { command: "echo test", exitCode: 0 }), asstMsg("Bitti.")];
  assert(await finishGateKontrol("t5", echoTestSahteKanit, mockContext) === true && gonderilen === 1, "v0.8c2: 'echo test' kanit sayilmaz (runner deseni)");
  gonderilen = 0;
  const typecheckKanit = [userMsg("duzelt"), tc("edit", "edit", { filePath: "a.ts" }), tc("exec", "shell", { command: "npx tsc --noEmit", exitCode: 0 }), asstMsg("Bitti.")];
  assert(await finishGateKontrol("t6", typecheckKanit, mockContext) === false && gonderilen === 0, "v0.8c2: npx tsc kanit sayilir");

  const { basarisizOranMesaji, _testIcinKaliteSifirla } = await import("../server/kalite");
  const onCagri = (n: number, fail: number) => toolCallOzetleri(Array.from({ length: n }, (_, i) => tc("exec", "shell", { command: "k" + i, exitCode: i < fail ? 1 : 0 }, i < fail ? "failed" : "completed")));
  _testIcinKaliteSifirla();
  assert(basarisizOranMesaji("k1", onCagri(10, 2)) !== null, "kalite: 2/10 (%20) durtme uretir");
  assert(basarisizOranMesaji("k1", onCagri(10, 3)) === null, "kalite: cooldown ikinci durtmeyi engeller");
  _testIcinKaliteSifirla();
  assert(basarisizOranMesaji("k2", onCagri(4, 4)) === null, "kalite: 5 cagri altinda susar (gurultu korumasi)");
  assert(basarisizOranMesaji("k3", onCagri(10, 1)) === null, "kalite: %10 esiginde susar");

  // v0.8b1: tur penceresi + editCagrilari
  const { turCagrilari, editCagrilari } = await import("../server/inspect");
  const karma = [
    userMsg("ilk tur"),
    tc("exec", "shell", { command: "npm test", exitCode: 1 }),
    tc("edit", "edit", { filePath: "a.ts" }),
    userMsg("ikinci tur"),
    tc("exec", "shell", { command: "Set-Content b.ts x", exitCode: 0 }),
  ];
  const pencere = turCagrilari(karma);
  assert(pencere.length === 1, "turCagrilari yalniz son turu sayar (kumulatif kapandi): " + pencere.length);
  assert(editCagrilari(pencere).length === 1, "editCagrilari shell-yazmayi edit sayar");
  const bos = turCagrilari([tc("exec", "shell", { command: "ls", exitCode: 0 })]);
  assert(bos.length === 1, "kullanici mesaji yoksa tum timeline pencere sayilir");
  _testIcinKaliteSifirla();

  // v0.8c5: tur kaydina pluginSurum damgasi + kilit drift bekçisi
  const { PLUGIN_SURUM } = await import("../server/surum");
  const { turKaydet, telemetriDosyasi } = await import("../server/telemetry");
  const surTmp = fsp.mkdtempSync(os.tmpdir() + "/sur-");
  turKaydet({ agent: { id: "s1", cwd: surTmp, provider: "codex" }, turnId: "t1", outcome: { kind: "completed" }, timeline: [], usage: null, loopDurtme: false, finishGateDurtme: false } as never);
  const surSatir = fsp.readFileSync(telemetriDosyasi(surTmp), "utf8").trim().split("\n")[0];
  const surKayit = JSON.parse(surSatir);
  assert(surKayit.pluginSurum === PLUGIN_SURUM, "tur kaydi pluginSurum tasir: " + surKayit.pluginSurum);
  assert(/^v\d+\.\d+/.test(PLUGIN_SURUM), "PLUGIN_SURUM semver biciminde: " + PLUGIN_SURUM);
  try {
    const { execSync } = await import("node:child_process");
    const tag = execSync("git describe --tags --abbrev=0", { cwd: "D:/Vibecode/paseo-verimlilik", encoding: "utf8" }).trim().replace(/-kilit$/, "");
    assert(tag === PLUGIN_SURUM, "PLUGIN_SURUM en yeni kilit ile uyumlu (drift bekçisi): " + tag);
  } catch { console.log("uyari: git tag okunamadi, drift bekçisi atlandi"); }
  fsp.rmSync(surTmp, { recursive: true, force: true });

  // v0.9: bekci (K-0013) — kopru + agnostik kontroller, dedupe, coder-aktif korumasi
  const { bekciKontrol, bekciTara } = await import("../server/bekci");
  const bTmp = fsp.mkdtempSync(os.tmpdir() + "/bek-");
  fsp.mkdirSync(bTmp + "/scripts", { recursive: true });
  fsp.writeFileSync(bTmp + "/scripts/saglik.ps1", "stub");
  fsp.writeFileSync(bTmp + "/scripts/zincir-kontrol.ps1", "stub");
  fsp.writeFileSync(bTmp + "/STATE_BOARD.md", "durum");
  const stubTemiz = (komut: string[], _cwd: string) => {
    const s = komut.join(" ");
    if (s.includes("saglik.ps1")) return { cikti: "SONUC: 16 OK, 0 EKSIK, 1 SARI", kod: 0 };
    if (s.includes("zincir-kontrol.ps1")) return { cikti: "ZINCIR OK", kod: 0 };
    if (s.includes("git status")) return { cikti: "", kod: 0 };
    return { cikti: "", kod: 0 };
  };
  assert((await bekciKontrol(bTmp, stubTemiz)).length === 0, "bekci: temiz repo anomali uretmez");
  const stubEksik = (komut: string[], cwd: string) => komut.join(" ").includes("saglik.ps1") ? { cikti: "SONUC: 14 OK, 2 EKSIK, 1 SARI", kod: 0 } : stubTemiz(komut, cwd);
  const aEksik = await bekciKontrol(bTmp, stubEksik);
  assert(aEksik.length === 1 && aEksik[0].anahtar === "saglik-eksik" && aEksik[0].detay.includes("2 EKSIK"), "bekci: saglik EKSIK yakalanir");
  const stubZincir = (komut: string[], cwd: string) => komut.join(" ").includes("zincir-kontrol.ps1") ? { cikti: "ZINCIR KOPUK: 1 nokta", kod: 1 } : stubTemiz(komut, cwd);
  assert((await bekciKontrol(bTmp, stubZincir)).some((a) => a.anahtar === "zincir-kopuk"), "bekci: zincir kopugu yakalanir");
  const stubKirli = (komut: string[], cwd: string) => komut.join(" ").includes("git status") ? { cikti: " M README.md\n?? yeni.txt", kod: 0 } : stubTemiz(komut, cwd);
  const aDrift = await bekciKontrol(bTmp, stubKirli);
  assert(aDrift.some((a) => a.anahtar === "git-drift" && a.detay.includes("2 kirli dosya")), "bekci: kirli agac + aktif tur yok = git-drift");
  const stubSadeceRollup = (komut: string[], cwd: string) => komut.join(" ").includes("git status") ? { cikti: " M raporlar/telemetri-haftalik/2026-W42.md", kod: 0 } : stubTemiz(komut, cwd);
  assert(!(await bekciKontrol(bTmp, stubSadeceRollup)).some((a) => a.anahtar === "git-drift"), "bekci: yalniz rollup kiri drift sayilmaz (otomasyon istisnasi)");
  const stubSadeceVerimlilik = (komut: string[], cwd: string) => komut.join(" ").includes("git status") ? { cikti: "?? .verimlilik/", kod: 0 } : stubTemiz(komut, cwd);
  assert(!(await bekciKontrol(bTmp, stubSadeceVerimlilik)).some((a) => a.anahtar === "git-drift"), "bekci: yalniz .verimlilik kiri drift sayilmaz (telemetri istisnasi)");
  fsp.rmSync(bTmp + "/STATE_BOARD.md");
  assert(!(await bekciKontrol(bTmp, stubKirli)).some((a) => a.anahtar === "git-drift"), "bekci: STATE_BOARD'suz repo git-drift uretmez (agnostik sinir)");
  fsp.writeFileSync(bTmp + "/STATE_BOARD.md", "durum");
  const stubBelirsiz = (komut: string[], cwd: string) => komut.join(" ").includes("saglik.ps1") ? { cikti: "coktum", kod: 2 } : stubTemiz(komut, cwd);
  assert((await bekciKontrol(bTmp, stubBelirsiz)).some((a) => a.anahtar === "saglik-belirsiz"), "bekci: SONUC'suz saglik ciktisi belirsiz anomalisi");

  // telemetri-fail (agnostik, kontrol kohortu dahil)
  const tTmp = fsp.mkdtempSync(os.tmpdir() + "/bekt-");
  fsp.mkdirSync(tTmp + "/.verimlilik", { recursive: true });
  const failKayitlar = Array.from({ length: 6 }, (_, i) => JSON.stringify({ ts: "2026-10-12T1" + i + ":00:00Z", tip: "tur", agentId: "a", provider: "p", toolCalls: 10, failedCalls: 4 })).join("\n") + "\n";
  fsp.writeFileSync(tTmp + "/.verimlilik/telemetri.jsonl", failKayitlar);
  const aTel = await bekciKontrol(tTmp, stubTemiz);
  assert(aTel.some((a) => a.anahtar === "telemetri-fail" && a.detay.includes("%40")), "bekci: fail %40 (6 tur) telemetri anomalisi");
  fsp.writeFileSync(tTmp + "/.verimlilik/telemetri.jsonl", failKayitlar.replace(/"failedCalls":4/g, '"failedCalls":1'));
  assert(!(await bekciKontrol(tTmp, stubTemiz)).some((a) => a.anahtar === "telemetri-fail"), "bekci: fail %10 esik altinda susar");
  fsp.rmSync(tTmp, { recursive: true, force: true });

  // bekciTara: dedupe + coder-aktif + rapor dosyasi
  const cTmp = fsp.mkdtempSync(os.tmpdir() + "/bekc-");
  fsp.mkdirSync(cTmp + "/scripts", { recursive: true });
  fsp.writeFileSync(cTmp + "/scripts/saglik.ps1", "stub");
  fsp.writeFileSync(cTmp + "/STATE_BOARD.md", "durum");
  const bAj = { id: "bek1", cwd: cTmp, provider: "codex" } as never;
  const bHarita = new Map<string, never>([["bek1", bAj]]);
  let bGiden = 0;
  const bGonder = async () => { bGiden++; };
  const gun = new Date("2026-10-12T18:30:00Z");
  const t1 = await bekciTara(bHarita, () => false, bGonder, stubEksik, gun);
  assert(t1.anomalili === 1 && t1.bildirilen === 1 && bGiden === 1, "bekciTara: anomali bildirilir");
  assert(fsp.existsSync(cTmp + "/raporlar/takip-sozlesme/2026-10-12.md"), "bekciTara: rapor dosyasi olusur");
  const rIcerik = fsp.readFileSync(cTmp + "/raporlar/takip-sozlesme/2026-10-12.md", "utf8");
  assert(rIcerik.includes("| saglik-eksik |"), "bekciTara: rapor satiri anahtar icerir");
  const t2 = await bekciTara(bHarita, () => false, bGonder, stubEksik, new Date("2026-10-12T19:00:00Z"));
  assert(t2.anomalili === 1 && t2.bildirilen === 0 && bGiden === 1, "bekciTara: ayni gun ayni anahtar tekrar bildirilmez (dedupe)");
  const t3 = await bekciTara(bHarita, () => true, bGonder, stubEksik, gun);
  assert(t3.ertelenen === 1 && t3.bildirilen === 0 && bGiden === 1, "bekciTara: aktif tur varken ertelenir (coder-aktif korumasi)");
  fsp.mkdirSync(cTmp + "/.verimlilik", { recursive: true });
  fsp.writeFileSync(cTmp + "/.verimlilik/ayar.json", JSON.stringify({ bekciKapali: true }));
  const t4 = await bekciTara(bHarita, () => false, bGonder, stubEksik, gun);
  assert(t4.anomalili === 0 && t4.bildirilen === 0, "bekciTara: bekciKapali repo atlanir");
  fsp.rmSync(cTmp, { recursive: true, force: true });

  // v0.10: rol sistemi (K-0015)
  const { rolCoz, rolIzinKarari, ROLLER } = await import("../server/roller");
  assert(rolCoz("[reviewer] drift incelemesi")?.ad === "reviewer", "rolCoz: [reviewer] taninir");
  assert(rolCoz("[Coder] x")?.ad === "coder", "rolCoz: buyuk-kucuk harf");
  assert(rolCoz("[bekçi] tarama")?.ad === "bekci", "rolCoz: bekci Turkce-cevirisi");
  assert(rolCoz("duz baslik") === null && rolCoz(null) === null, "rolCoz: basliksiz/prefikssiz null");
  const mkReq = (input: Record<string, unknown>) => ({ id: "r1", provider: "codex", name: "t", kind: "x", input }) as never;
  const okur = ROLLER.tester, raporcu = ROLLER.reviewer, coderR = ROLLER.coder;
  assert(rolIzinKarari(mkReq({ command: "git status" }), okur) === "allow", "okur: git status allow");
  assert(rolIzinKarari(mkReq({ command: "npm test" }), okur) === "allow", "okur: npm test allow (kosucu)");
  assert(rolIzinKarari(mkReq({ command: "npx tsc --noEmit" }), okur) === "allow", "okur: tsc --noEmit allow");
  assert(rolIzinKarari(mkReq({ command: "Set-Content a.txt x" }), okur) === "deny", "okur: Set-Content deny");
  assert(rolIzinKarari(mkReq({ command: "git commit -m x" }), okur) === "deny", "okur: git commit deny");
  assert(rolIzinKarari(mkReq({ filePath: "src/a.ts" }), okur) === "deny", "okur: edit deny");
  assert(rolIzinKarari(mkReq({ filePath: "raporlar/ozet.md" }), raporcu) === "allow", "raporcu: raporlar/ edit allow");
  assert(rolIzinKarari(mkReq({ filePath: "src/a.ts" }), raporcu) === "deny", "raporcu: src edit deny");
  assert(rolIzinKarari(mkReq({ command: "Set-Content raporlar/gun.md ozet" }), raporcu) === "allow", "raporcu: raporlar/ shell yazma allow");
  assert(rolIzinKarari(mkReq({ command: "Set-Content src/a.ts y" }), raporcu) === "deny", "raporcu: src shell yazma deny");
  assert(rolIzinKarari(mkReq({ command: "rm -rf x" }), okur) === "deny", "okur: tehlike kalibi deny korunur");
  assert(rolIzinKarari(mkReq({ command: "npm install" }), okur) === null, "okur: tanimadik komut kullaniciya (null)");
  assert(rolIzinKarari(mkReq({ command: "git status" }), coderR) === "allow", "coder: tam profil mevcut davranis");
  assert(rolIzinKarari(mkReq({ command: "git commit -m x" }), coderR) === null, "coder: commit kullaniciya birakilir (mevcut polis)");
  const { enjeksiyonMetni: enj2 } = await import("../server/sozlesme");
  const rolEnj = enj2("D:\\Vibecode\\paseo-plugin", "MP", ROLLER.reviewer.sistemEki);
  assert(rolEnj.metin.includes("## Rol") && rolEnj.metin.includes("REVIEWER"), "enjeksiyon: rol blogu cekirdek sonrasi duser");
  assert(rolEnj.metin.indexOf("## Rol") < rolEnj.metin.indexOf("## Proje katman"), "enjeksiyon: rol isaretcilerden once (cache dostu)");

  // v0.10.1: bekci gelen-kutu-bekleyen (K-0017)
  const gkTmp = fsp.mkdtempSync(os.tmpdir() + "/gk-");
  fsp.mkdirSync(gkTmp + "/raporlar/gelen-kutu", { recursive: true });
  assert(!(await bekciKontrol(gkTmp, stubTemiz)).some((a) => a.anahtar === "gelen-kutu-bekleyen"), "kutu: bos dizin anomali uretmez");
  const madde = (id: string, tarih: string, islenme: unknown) => ({ id, tarih, islenme });
  fsp.writeFileSync(gkTmp + "/raporlar/gelen-kutu/reviewer-2026-10-10.json", JSON.stringify({ schemaSurum: 1, kaynak: "reviewer", tarih: "2026-10-10", maddeler: [madde("r-1", "2026-10-10", null), madde("r-2", "2026-10-10", { durum: "kabul", hash: "abc1234", ts: "2026-10-11" })] }));
  const gkA = await bekciKontrol(gkTmp, stubTemiz);
  assert(gkA.some((a) => a.anahtar === "gelen-kutu-bekleyen" && a.detay.includes("1 madde")), "kutu: 2 gunluk islenmemis madde anomalisi");
  fsp.writeFileSync(gkTmp + "/raporlar/gelen-kutu/reviewer-2026-10-10.json", JSON.stringify({ schemaSurum: 1, kaynak: "reviewer", tarih: "2026-10-10", maddeler: [madde("r-1", "2026-10-10", { durum: "kabul", hash: "abc1234", ts: "2026-10-11" })] }));
  assert(!(await bekciKontrol(gkTmp, stubTemiz)).some((a) => a.anahtar === "gelen-kutu-bekleyen"), "kutu: islenmis madde susar");
  const bugun = new Date().toISOString().slice(0, 10);
  fsp.writeFileSync(gkTmp + "/raporlar/gelen-kutu/reviewer-2026-10-10.json", JSON.stringify({ schemaSurum: 1, kaynak: "reviewer", tarih: bugun, maddeler: [madde("r-9", bugun, null)] }));
  assert(!(await bekciKontrol(gkTmp, stubTemiz)).some((a) => a.anahtar === "gelen-kutu-bekleyen"), "kutu: 24s dolmamis bekleyen susar (gurultu yok)");
  fsp.rmSync(gkTmp, { recursive: true, force: true });

  
  // v0.10.3: model + ayrik token + maliyet telemetrisi
  {
    const { turKaydet: tk2, telemetriOzetle: to2, telemetriDosyasi: td2, turBaslat: tb2 } = await import("../server/telemetry");
    const tokTmp = fsp.mkdtempSync(os.tmpdir() + "/tok-");
    tk2({ agent: { id: "k1", cwd: tokTmp, provider: "codex" }, turnId: "t1", outcome: { kind: "completed" }, timeline: [], usage: { inputTokens: 1000, outputTokens: 200, cachedInputTokens: 800, totalCostUsd: 0.0123 }, model: "gpt-6.1-sol", loopDurtme: false, finishGateDurtme: false } as never);
    tk2({ agent: { id: "k2", cwd: tokTmp, provider: "kilo" }, turnId: "t2", outcome: { kind: "completed" }, timeline: [], usage: { inputTokens: 500, outputTokens: 100 }, model: "claude-opus-4.8", loopDurtme: false, finishGateDurtme: false } as never);
    const satirlar = fsp.readFileSync(td2(tokTmp), "utf8").trim().split("\n");
    const k1 = JSON.parse(satirlar[0]);
    assert(k1.model === "gpt-6.1-sol", "tur kaydi model tasir: " + k1.model);
    assert(k1.inTok === 1000 && k1.outTok === 200 && k1.cacheTok === 800, "ayrik token alanlari: " + JSON.stringify([k1.inTok, k1.outTok, k1.cacheTok]));
    assert(Math.abs(k1.maliyetUsd - 0.0123) < 0.0001, "tur kaydi maliyet tasir: " + k1.maliyetUsd);
    const tokOz = to2(tokTmp);
    assert(tokOz.inTok === 1500 && tokOz.outTok === 300 && tokOz.cacheTok === 800, "ozet token toplamlari: " + JSON.stringify([tokOz.inTok, tokOz.outTok, tokOz.cacheTok]));
    assert(tokOz.modeller["gpt-6.1-sol"] === 1 && tokOz.modeller["claude-opus-4.8"] === 1, "model dagilimi: " + JSON.stringify(tokOz.modeller));
    assert(Math.abs(tokOz.maliyetUsd - 0.0123) < 0.0001, "ozet maliyet: " + tokOz.maliyetUsd);
    assert(tokOz.ortTurSn === null, "turBaslat olmadan ortTurSn null");
    tb2("k3");
    tk2({ agent: { id: "k3", cwd: tokTmp, provider: "codex" }, turnId: "t3", outcome: { kind: "completed" }, timeline: [], usage: null, model: null, loopDurtme: false, finishGateDurtme: false } as never);
    const tokOz2 = to2(tokTmp);
    assert(typeof tokOz2.ortTurSn === "number", "turBaslat sonrasi ortTurSn sayi: " + tokOz2.ortTurSn);
    fsp.rmSync(tokTmp, { recursive: true, force: true });
  }

  
  // v0.11 (K-0018): provider-modlar
  {
    const { modCoz, aktifModYaz, aktifModOku, modAyarla: ma2, contextRotOrani, rotDurtmeliMi, MODLAR } = await import("../server/modlar");
    const mTmp = fsp.mkdtempSync(os.tmpdir() + "/mod11-");
    // eslesme: kimi -> firtina (K-0032)
    const m1 = modCoz(mTmp, "codex", "kimi-K3-ultra");
    assert(m1?.ad === "firtina", "kimi eslesmesi firtina: " + m1?.ad);
    // eslesme yok -> null
    assert(modCoz(mTmp, "qoder", "qwen3.8") === null, "eslesme yoksa null");
// R3-01: hook'larda model null — provider-seviye firtina varsayilani (ikinci emre kadar)
assert(modCoz(mTmp, "codex", null)?.ad === "firtina", "null model: provider-seviye firtina: " + modCoz(mTmp, "codex", null)?.ad);
assert(modCoz(mTmp, "codex", undefined)?.ad === "firtina", "undefined model: provider-seviye firtina");
    // aktif override eslemeyi ezer
    aktifModYaz(mTmp, "cerrah");
    assert(modCoz(mTmp, "codex", "kimi-K3")?.ad === "cerrah", "aktif mod eslemeyi ezer");
    assert(aktifModOku(mTmp) === "cerrah", "disk state okunur");
    // serbest: notr ama kayitli
    aktifModYaz(mTmp, "serbest");
    const ms = modCoz(mTmp, "codex", "kimi-K3");
    assert(ms?.ad === "serbest" && ms.sistemEki === "" && ms.thinking === null, "serbest notr: " + JSON.stringify(ms));
    // sifirla
    aktifModYaz(mTmp, null);
    assert(aktifModOku(mTmp) === null, "sifirla state temizler");
    // ayar.json ek-listesi
    const ma = ma2(mTmp, "matbaa", "qoder", "qwen");
    assert(ma.ok, "modAyarla ok: " + ma.mesaj);
    assert(modCoz(mTmp, "qoder", "qwen3.8-flash")?.ad === "matbaa", "ayar.json eslesmesi calisir (aktif matbaa ile ayni)");
    aktifModYaz(mTmp, null);
    assert(modCoz(mTmp, "codex", "kimi")?.ad === "firtina", "sifirlama sonrasi varsayilan eslesme korunur (firtina, K-0032)");
    assert(modCoz(mTmp, "qoder", "qwen3.8-flash")?.ad === "matbaa", "sifirlama sonrasi ayar eslesmesi korunur");
    // kotu regex patlamaz (ayri tmp — ayar.json ezmeyi testten izole et)
    const rTmp = fsp.mkdtempSync(os.tmpdir() + "/modre-");
    fsp.mkdirSync(rTmp + "/.verimlilik", { recursive: true });
    fsp.writeFileSync(rTmp + "/.verimlilik/ayar.json", JSON.stringify({ modlar: { eslesmeler: [{ provider: "x", modelDeseni: "[", mod: "atolye" }] } }));
    assert(modCoz(rTmp, "x", "herhangi") === null, "kotu regex eslesmez, patlamaz");
    fsp.rmSync(rTmp, { recursive: true, force: true });
    // bilinmeyen mod reddedilir
    assert(ma2(mTmp, "bilinmeyen").ok === false, "bilinmeyen mod red");
    // context rot
    assert(contextRotOrani(null) === null, "usage yoksa oran null");
    assert(Math.abs((contextRotOrani({ contextWindowUsedTokens: 80, contextWindowMaxTokens: 100 } as never) ?? 0) - 0.8) < 0.001, "oran 0.8");
    // rot cooldown: ilk durtme gecer, ikincisi 30dk icinde susar
    assert(rotDurtmeliMi("rot-test", 100000) === true, "ilk durtme gecer");
    assert(rotDurtmeliMi("rot-test", 100000 + 60000) === false, "cooldown icinde susar");
    assert(rotDurtmeliMi("rot-test", 100000 + 31 * 60 * 1000) === true, "cooldown sonrasi tekrar durtur");
    // mod tanimlari butunlugu
    assert(MODLAR.atolye.paralellik === 6 && MODLAR.matbaa.thinking === "high" && MODLAR.cerrah.thinking === "low", "mod tanimlari K-0018'e uygun");
    assert(MODLAR.firtina.thinking === "high" && MODLAR.firtina.paralellik === 6 && MODLAR.firtina.sistemEki.includes("FIRTINA"), "firtina tanimi K-0032'ye uygun");
    fsp.rmSync(mTmp, { recursive: true, force: true });
  }
  // v0.11: telemetri mod alani + ozet modlar sayaci
  {
    const { turKaydet: tk3, telemetriOzetle: to3 } = await import("../server/telemetry");
    const mmTmp = fsp.mkdtempSync(os.tmpdir() + "/modtel-");
    tk3({ agent: { id: "m1", cwd: mmTmp, provider: "codex" }, turnId: "t1", outcome: { kind: "completed" }, timeline: [], usage: null, model: "kimi-K3", mod: "atolye", loopDurtme: false, finishGateDurtme: false } as never);
    tk3({ agent: { id: "m2", cwd: mmTmp, provider: "codex" }, turnId: "t2", outcome: { kind: "completed" }, timeline: [], usage: null, model: null, mod: null, loopDurtme: false, finishGateDurtme: false } as never);
    const mo = to3(mmTmp);
    assert(mo.modlar.atolye === 1, "ozet mod sayaci: " + JSON.stringify(mo.modlar));
    assert(Object.keys(mo.modlar).length === 1, "modsuz tur sayilmaz");
    fsp.rmSync(mmTmp, { recursive: true, force: true });
  }

  // v0.13 (K-0025, A2-2): serbest-argumanli okuyucularda yazici bayraklar insan kapisina duser
  {
    const { izinKarari: ik2 } = await import("../server/permission");
    assert(ik2("find . -name x -delete") === null, "find -delete auto-allow degil");
    assert(ik2("find . -exec rm {} +") === null, "find -exec auto-allow degil");
    assert(ik2("rg --pre cat foo") === null, "rg --pre auto-allow degil");
    assert(ik2("rg foo src") === "allow", "duz rg hala allow");
    assert(ik2("find . -name '*.ts'") === "allow", "duz find hala allow");
    assert(ik2("Get-Content a.txt") === "allow", "diger okuyucular etkilenmedi");
  }
  // v0.13 (K-0025, A2-3): raporcu rolu traversal yazamaz
  {
    const { rolIzinKarari: rik, ROLLER: R2, raporYoluGuvenliMi: ryg } = await import("../server/roller");
    const rap = R2.reviewer;
    const req = (filePath: string) => ({ input: { filePath } }) as never;
    assert(rik(req("raporlar/../STATE_BOARD.md"), rap) === "deny", "traversal raporcu yazimi engellendi");
    assert(rik(req("raporlar/gelen-kutu/x.md"), rap) === "allow", "duz rapor yolu izinli");
    assert(rik(req("D:\\proj\\raporlar\\x.md"), rap) === "allow", "mutlak rapor yolu izinli");
    assert(rik(req("src/raporlars/x.md"), rap) === "deny", "raporlar-benzeri segment izinsiz");
    assert(ryg("raporlar/..") === false, "kok traversal normalize sonrasi reddedilir");
  }
  // v0.13 (K-0025, A2-1): agent.closed tum ajan-state haritalarini temizler
  {
    const { pitbullTurBasladi: ptb, _testIcinDurumVer: pdv, ajanTemizle: pTemizle } = await import("../server/pitbull");
    ptb("kapandi-1");
    assert(pdv("kapandi-1") !== undefined, "pitbull durumu seed'lendi");
    pTemizle("kapandi-1");
    assert(pdv("kapandi-1") === undefined, "ajanTemizle pitbull durumunu sildi");
    const { ajanTemizleHepsi: ath } = await import("../server/temizlik");
    ath("kapandi-1");
    assert(true, "ajanTemizleHepsi tum modullerde hatasiz calisti");
  }

  // v0.14 (K-0026, A3-1): loopguard — 3x hash, A-B-A, insan kapisi
  {
    const { loopKontrol: lk, ajanTemizle: lTemizle } = await import("../server/loopguard");
    const giden: string[] = [];
    const ctx = { paseo: { agents: { ref: () => ({ send: async (m: string) => { giden.push(m); } }) } } } as never;
    const tl = (cmds: string[]) => cmds.map((c) => tc("exec", "shell", { command: c }));
    assert(await lk("lg-1", tl(["a1", "a1", "a1"]), ctx) === true, "3x ayni hash: durtme gider");
    assert(giden.length === 1 && giden[0].includes("loop dedektoru"), "durtme metni gonderildi");
    assert(await lk("lg-1", tl(["a1", "a1", "a1"]), ctx) === false, "ayni bulgu tekrar durtmez (sonHash)");
    assert(giden.length === 1, "gonderi sayisi sabit");
    assert(await lk("lg-1", tl(["b2", "b2", "b2"]), ctx) === true, "farkli hash uclusu yeni bulgu: 2. ardisik durtme");
    assert(giden.length === 2, "2. durtme gonderildi");
    assert(await lk("lg-1", tl(["c3", "c3", "c3"]), ctx) === false, "3. farkli bulgu: insan kapisi, durtme yok");
    assert(giden.length === 2, "insan kapisinda susuldu");
    lTemizle("lg-1");
    assert(await lk("lg-1", tl(["x", "y", "x", "y"]), ctx) === true, "A-B-A-B deseni yakalanir");
    assert(await lk("lg-2", tl(["t1", "t2", "t3"]), ctx) === false, "uc farkli cagri: loop yok");
    lTemizle("lg-1"); lTemizle("lg-2");
  }
  // v0.14 (K-0026, A3-2): enjekteHandler — archived atlama, cwd=null, mod=kapali
  {
    const { enjekteHandler: eh } = await import("../server/enjekte");
    const dKapali2 = fspM.mkdtempSync(osM.tmpdir() + "/enj-");
    fspM.mkdirSync(dKapali2 + "/.verimlilik", { recursive: true });
    fspM.writeFileSync(dKapali2 + "/.verimlilik/ayar.json", JSON.stringify({ enjeksiyonMod: "kapali" }));
    const dNormal = fspM.mkdtempSync(osM.tmpdir() + "/enj-");
    const giden2: string[] = [];
    const paseo = { agents: {
      ref: (id: string) => ({ cwd: dNormal, refresh: async () => ({ agent: { cwd: dNormal } }), send: async () => { giden2.push(id); } }),
      list: async () => ({ entries: [
        { agent: { id: "w1", cwd: dNormal, workspaceId: "ws", archivedAt: null } },
        { agent: { id: "w2", cwd: dKapali2, workspaceId: "ws", archivedAt: null } },
        { agent: { id: "w3", cwd: null, workspaceId: "ws", archivedAt: null } },
        { agent: { id: "w4", cwd: dNormal, workspaceId: "ws", archivedAt: "2026-10-13" } },
        { agent: { id: "w5", cwd: dNormal, workspaceId: "baska", archivedAt: null } },
      ] }),
    } };
    const r1 = await eh({ workspaceId: "ws" }, { paseo } as never);
    assert(r1.hedef === 3 && r1.gonderildi === 1 && r1.atlandi === 2, "ws: archived+baska-ws disarida, kapali+cwd-null atlandi: " + JSON.stringify(r1));
    assert(giden2.join(",") === "w1", "yalniz w1'e gonderildi");
    const r2 = await eh({ agentId: "a1" }, { paseo } as never);
    assert(r2.gonderildi === 1, "agentId yolu gonderir");
    const r3 = await eh({}, { paseo } as never);
    assert(r3.hedef === 0 && typeof r3.not === "string", "idsiz istek reddedilir");
    fspM.rmSync(dKapali2, { recursive: true, force: true });
    fspM.rmSync(dNormal, { recursive: true, force: true });
  }

  // v0.15 (K-0027, D2-01..04): rol katmani zincir/ikame guvenligi
  {
    const { rolIzinKarari: rik3, ROLLER: R3 } = await import("../server/roller");
    const { izinKarari: ik3 } = await import("../server/permission");
    const okur3 = R3.tester, rap3 = R3.reviewer;
    const mk3 = (command: string) => ({ input: { command } }) as never;
    assert(rik3(mk3("npm test; Get-Content x"), okur3) === null, "D2-01: kosucu+zincir auto-allow degil");
    assert(rik3(mk3("npm test && npm run build"), okur3) === null, "D2-01b: kosucu+&& auto-allow degil");
    assert(rik3(mk3("npm test"), okur3) === "allow", "D2-01 guard: duz kosucu hala allow");
    assert(rik3(mk3("Set-Content raporlar/x.md ozet; echo b"), rap3) === null, "D2-02: raporcu yazma+zincir insan kapisina");
    assert(rik3(mk3("echo ozet > raporlar/gun.md"), rap3) === "allow", "D2-02 guard: redirect hedefi raporlar ise allow");
    assert(rik3(mk3("Set-Content src/x.ts (Get-Content raporlar/ok.md)"), rap3) === "deny", "D2-03: hedef src, substring raporlar -> deny");
    assert(rik3(mk3("git add raporlar/a.md"), rap3) === "allow", "D2-03 guard: git add raporlar hedefi allow");
    assert(rik3(mk3("git add -A"), rap3) === "deny", "D2-03b: git add -A raporcu'ya deny");
    assert(ik3("echo $(whoami)") === null, "D2-04: $() ikamesi zincir sayilir");
    assert(ik3("echo hello") === "allow", "D2-04 guard: duz echo allow");
  }

  // v0.16 (K-0028): A2-7 tool_call JSON yanlis-pozitifi + A2-4 alt-dizin telemetri + A4-1 formul
  {
    const { latestOutputText: lot } = await import("../server/inspect");
    const tl2 = [tc("exec", "shell", { command: "npm test", exitCode: 0 }), { type: "assistant_message", text: "duz metin" } as never];
    const m2 = lot(tl2);
    assert(!m2.includes("completed"), "A2-7: tool_call JSON ciktida yok (status completed yanlis-pozitif kapandi)");
    assert(m2.includes("duz metin"), "A2-7 guard: assistant metni korunur");
  }
  {
    const { telemetriYaz: ty2, telemetriDosyasi: td2 } = await import("../server/telemetry");
    const kokTmp = fspM.mkdtempSync(osM.tmpdir() + "/a24-");
    fspM.writeFileSync(kokTmp + "/AGENTS.md", "- kural");
    const alt = kokTmp + "/src/alt";
    fspM.mkdirSync(alt, { recursive: true });
    ty2(alt, { ts: new Date().toISOString(), tip: "lint", agentId: "a24", provider: "-", detay: "alt-dizin testi" });
    assert(fspM.existsSync(kokTmp + "/.verimlilik/telemetri.jsonl"), "A2-4: alt-dizin cwd'sinde kayit kok .verimlilik'e dustu");
    assert(td2(alt) === kokTmp.replace(/\//g, "/") + "/.verimlilik/telemetri.jsonl" || td2(alt).includes(".verimlilik"), "A2-4 guard: dosya yolu kokte");
    fspM.rmSync(kokTmp, { recursive: true, force: true });
  }
  {
    const { haftalikRollup: hr2 } = await import("../server/rollup");
    const rTmp = fspM.mkdtempSync(osM.tmpdir() + "/a41-");
    fspM.mkdirSync(rTmp + "/.verimlilik", { recursive: true });
    fspM.writeFileSync(rTmp + "/.verimlilik/telemetri.jsonl", JSON.stringify({ ts: new Date().toISOString(), tip: "tur", detay: "cacheHitPct=90 in=1000" }) + "\n");
    const yol = hr2(rTmp);
    assert(yol !== null && fspM.readFileSync(yol, "utf8").includes("cacheHitPct"), "A4-1: rollup raporu formul notu tasir");
    fspM.rmSync(rTmp, { recursive: true, force: true });
  }

  // v0.17/0.18 (K-0029): A2-6 acik-tur dusumu + A2-8 rollup seyreklestirme + A3-3..A3-8
  {
    const { turBaslat: tb2, ajanTemizle: tTemizle, _testIcinAktifTur: atf, turKaydet: tk4, _testIcinRollupSayisi: rs } = await import("../server/telemetry");
    tb2("a26-1"); tb2("a26-2");
    assert(atf() === 2, "A2-6: iki acik tur sayili");
    tTemizle("a26-1");
    assert(atf() === 1, "A2-6: kapanan ajanin acik turu dusuldu");
    tTemizle("a26-2"); tTemizle("hic-yok");
    assert(atf() === 0, "A2-6: sifirin altina dusmez");
    const sTmp = fspM.mkdtempSync(osM.tmpdir() + "/a28-");
    const once = rs();
    const tkIn = { turnId: "t", outcome: { kind: "completed" }, timeline: [], usage: null, model: null, mod: null, loopDurtme: false, finishGateDurtme: false } as const;
    tk4({ agent: { id: "a28", cwd: sTmp, provider: "codex" }, ...tkIn } as never);
    tk4({ agent: { id: "a28", cwd: sTmp, provider: "codex" }, ...tkIn } as never);
    assert(rs() - once === 1, "A2-8: 60sn icinde ikinci turKaydet rollup'i seyreklestirdi");
    fspM.rmSync(sTmp, { recursive: true, force: true });
  }
  {
    const { haftalikRollup: hr3, isoHafta: ih } = await import("../server/rollup");
    const bTmp = fspM.mkdtempSync(osM.tmpdir() + "/a33-");
    fspM.mkdirSync(bTmp + "/raporlar/telemetri-haftalik", { recursive: true });
    fspM.mkdirSync(bTmp + "/.verimlilik", { recursive: true });
    fspM.writeFileSync(bTmp + "/raporlar/telemetri-haftalik/" + ih(new Date(Date.now() - 7 * 86400000)) + ".json", "bozuk{json");
    fspM.writeFileSync(bTmp + "/.verimlilik/telemetri.jsonl", JSON.stringify({ ts: new Date().toISOString(), tip: "tur" }) + "\n");
    const yol3 = hr3(bTmp);
    assert(yol3 !== null && fspM.readFileSync(yol3, "utf8").includes("baz hafta"), "A3-3: bozuk onceki-hafta json baz-hafta dalina duser");
    fspM.rmSync(bTmp, { recursive: true, force: true });
  }
  {
    const { briefKontrol: bk2, ajanTemizle: bTemizle } = await import("../server/brief");
    const bTmp2 = fspM.mkdtempSync(osM.tmpdir() + "/a37-");
    const giden3: string[] = [];
    const ctx3 = { paseo: { agents: { ref: () => ({ send: async (m: string) => { giden3.push(m); } }) } } } as never;
    const idssiz = [{ type: "tool_call", name: "spawn", detail: { type: "sub_agent", description: "kisa" }, status: "completed", error: null } as never];
    assert(await bk2("a37", bTmp2, "codex", idssiz, ctx3) === true, "A3-4/3-7: callId'siz zayif brief durtme uretir");
    assert(giden3.length === 1, "A3-7: durtme gonderildi");
    assert(fspM.readFileSync(bTmp2 + "/.verimlilik/telemetri.jsonl", "utf8").includes("zayif-brief"), "A3-7: telemetri yazildi");
    assert(await bk2("a37", bTmp2, "codex", idssiz, ctx3) === false, "A3-7: cooldown ikinci durtmeyi engeller");
    assert(giden3.length === 1, "A3-4: callId'siz item yeniden sayilir ama cooldown susar");
    bTemizle("a37");
    fspM.rmSync(bTmp2, { recursive: true, force: true });
  }
  {
    const { panoIsaretciYaz: piY } = await import("../server/bekci");
    const pTmp = fspM.mkdtempSync(osM.tmpdir() + "/a35-");
    fspM.writeFileSync(pTmp + "/STATE_BOARD.md", "# Pano\n## Baska\n");
    assert(piY(pTmp, "2026-10-13") === false, "A3-5: Aktif-is basliksiz pano dokunulmaz");
    fspM.writeFileSync(pTmp + "/STATE_BOARD.md", "# Pano\r\n## Aktif iş\r\nYok\r\n");
    assert(piY(pTmp, "2026-10-13") === true, "A3-5: isaretci eklendi");
    assert(fspM.readFileSync(pTmp + "/STATE_BOARD.md", "utf8").includes("\r\n"), "A3-5: CRLF korunur");
    fspM.rmSync(pTmp, { recursive: true, force: true });
  }
  {
    const { turKaydet: tk5 } = await import("../server/telemetry");
    const aTmp = fspM.mkdtempSync(osM.tmpdir() + "/a36-");
    tk5({ agent: { id: "a36", cwd: aTmp, provider: "codex", parentAgentId: "ebeveyn" }, turnId: "t", outcome: { kind: "completed" }, timeline: [], usage: null, model: null, mod: null, loopDurtme: false, finishGateDurtme: false } as never);
    const satir5 = JSON.parse(fspM.readFileSync(aTmp + "/.verimlilik/telemetri.jsonl", "utf8").trim().split("\n").pop()!);
    assert(satir5.altAjan === true, "A3-6: parentAgentId -> altAjan:true uretim zinciri");
    fspM.rmSync(aTmp, { recursive: true, force: true });
  }
  {
    const { kapsamKontrol: kk2, ajanTemizle: kTemizle } = await import("../server/kapsam");
    const kTmp = fspM.mkdtempSync(osM.tmpdir() + "/a38-");
    const giden4: string[] = [];
    const ctx4 = { paseo: { agents: { ref: () => ({ send: async (m: string) => { giden4.push(m); } }) } } } as never;
    const dort = ["a.ts", "b.ts", "c.ts", "d.ts"].map((f) => tc("edit", "edit", { filePath: f }));
    assert(await kk2("a38", kTmp, "codex", dort, ctx4) === true, "A3-8: 4 biricik dosya tavan-asim durtmesi");
    assert(giden4[0].includes("kapsam"), "A3-8: durtme metni kapsam icerir");
    kTemizle("a38");
    fspM.rmSync(kTmp, { recursive: true, force: true });
  }

  // v0.18 (K-0030, A6-1): telemetriOzet altAjan sayaci
  {
    const { turKaydet: tk6, telemetriOzetle: to6 } = await import("../server/telemetry");
    const m6 = fspM.mkdtempSync(osM.tmpdir() + "/a61-");
    tk6({ agent: { id: "p1", cwd: m6, provider: "codex", parentAgentId: "ebeveyn" }, turnId: "t1", outcome: { kind: "completed" }, timeline: [], usage: null, model: null, mod: null, loopDurtme: false, finishGateDurtme: false } as never);
    tk6({ agent: { id: "p2", cwd: m6, provider: "codex" }, turnId: "t2", outcome: { kind: "completed" }, timeline: [], usage: null, model: null, mod: null, loopDurtme: false, finishGateDurtme: false } as never);
    const o6 = to6(m6);
    assert(o6.altAjan === 1 && o6.tur === 2, "A6-1: ozet altAjan sayar: " + o6.altAjan);
    fspM.rmSync(m6, { recursive: true, force: true });
  }

  // v0.19 (K-0032): LOC telemetrisi - null-guard + editDosyalari
  {
    const { turBaslat: tb7, turKaydet: tk7, telemetriDosyasi: td7 } = await import("../server/telemetry");
    const gTmp = fspM.mkdtempSync(osM.tmpdir() + "/loc-");
    // git'siz/repo'suz ortam: turBaslat + turKaydet exception firlatmaz, locDelta null
    tb7("loc-1", gTmp);
    tk7({ agent: { id: "loc-1", cwd: gTmp, provider: "codex" }, turnId: "t", outcome: { kind: "completed" }, timeline: [], usage: null, model: null, mod: null, loopDurtme: false, finishGateDurtme: false } as never);
    const satir7 = JSON.parse(fspM.readFileSync(td7(gTmp), "utf8").trim().split("\n").pop()!);
    assert(satir7.locDelta === null, "git'siz ortamda locDelta null: " + JSON.stringify(satir7.locDelta));
    tk7({ agent: { id: "loc-2", cwd: gTmp, provider: "codex" }, turnId: "t", outcome: { kind: "completed" }, timeline: [], usage: null, model: null, mod: null, loopDurtme: false, finishGateDurtme: false } as never);
    const satir7b = JSON.parse(fspM.readFileSync(td7(gTmp), "utf8").trim().split("\n").pop()!);
    assert(satir7b.locDelta === null, "turBaslat'siz turKaydet locDelta null");
    // v0.20 (BK-02): commit-aware locDelta — tur icinde commit atilirsa satirlar pozitif sayilir
    const cp7 = await import("node:child_process");
    const rTmp3 = fspM.mkdtempSync(osM.tmpdir() + "/locgit-");
    let gitVar = true;
    try { cp7.execFileSync("git", ["init"], { cwd: rTmp3, stdio: "ignore" }); } catch { gitVar = false; }
    if (gitVar) {
      cp7.execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: rTmp3 });
      cp7.execFileSync("git", ["config", "user.name", "t"], { cwd: rTmp3 });
      fspM.writeFileSync(rTmp3 + "/a.txt", "satir1\n");
      cp7.execFileSync("git", ["add", "a.txt"], { cwd: rTmp3 });
      cp7.execFileSync("git", ["commit", "-m", "init"], { cwd: rTmp3, stdio: "ignore" });
      tb7("loc-4", rTmp3);
      fspM.writeFileSync(rTmp3 + "/b.txt", "s1\ns2\ns3\n");
      cp7.execFileSync("git", ["add", "b.txt"], { cwd: rTmp3 });
      cp7.execFileSync("git", ["commit", "-m", "tur-ici"], { cwd: rTmp3, stdio: "ignore" });
      tk7({ agent: { id: "loc-4", cwd: rTmp3, provider: "codex" }, turnId: "t", outcome: { kind: "completed" }, timeline: [], usage: null, model: null, mod: null, loopDurtme: false, finishGateDurtme: false } as never);
      const satir7c = JSON.parse(fspM.readFileSync(td7(rTmp3), "utf8").trim().split("\n").pop()!);
      assert(satir7c.locDelta === 3, "BK-02: tur-ici commit pozitif sayilir (3 satir): " + JSON.stringify(satir7c.locDelta));
      tb7("loc-5", rTmp3);
      fspM.appendFileSync(rTmp3 + "/a.txt", "yeni1\nyeni2\n");
      tk7({ agent: { id: "loc-5", cwd: rTmp3, provider: "codex" }, turnId: "t", outcome: { kind: "completed" }, timeline: [], usage: null, model: null, mod: null, loopDurtme: false, finishGateDurtme: false } as never);
      const satir7d = JSON.parse(fspM.readFileSync(td7(rTmp3), "utf8").trim().split("\n").pop()!);
      assert(satir7d.locDelta === 2, "BK-02: commitsiz tur uncommitted fark (2 satir): " + JSON.stringify(satir7d.locDelta));
      fspM.rmSync(rTmp3, { recursive: true, force: true });
    }
    const zamanli = [tc("edit", "edit", { filePath: "a.ts" }), tc("edit", "edit", { filePath: "a.ts" }), tc("edit", "write", { filePath: "b.ts" }), tc("exec", "shell", { command: "echo x > c.txt", exitCode: 0 })];
    tb7("loc-3", gTmp);
    tk7({ agent: { id: "loc-3", cwd: gTmp, provider: "codex" }, turnId: "t", outcome: { kind: "completed" }, timeline: zamanli, usage: null, model: null, mod: null, loopDurtme: false, finishGateDurtme: false } as never);
    const satir7c = JSON.parse(fspM.readFileSync(td7(gTmp), "utf8").trim().split("\n").pop()!);
    assert(Array.isArray(satir7c.editDosyalari) && satir7c.editDosyalari.join(",") === "a.ts,b.ts", "editDosyalari benzersiz: " + JSON.stringify(satir7c.editDosyalari));
    fspM.rmSync(gTmp, { recursive: true, force: true });
  }
  // v0.19 (K-0032): rollup LOC alanlari - saatlikLoc sifir-guard + reworkOrani
  {
    const { haftalikRollup: hr7, isoHafta: ih7 } = await import("../server/rollup");
    const rTmp = fspM.mkdtempSync(osM.tmpdir() + "/rol-");
    fspM.mkdirSync(rTmp + "/.verimlilik", { recursive: true });
    const simdi7 = new Date();
    const t0 = simdi7.getTime();
    const kayitlar = [
      { ts: new Date(t0 - 2 * 3600e3).toISOString(), tip: "tur", locDelta: 100, editDosyalari: ["a.ts"] },
      { ts: new Date(t0 - 1 * 3600e3).toISOString(), tip: "tur", locDelta: 50, editDosyalari: ["a.ts", "b.ts"] },
      { ts: simdi7.toISOString(), tip: "tur", locDelta: 30, turSn: 3600, editDosyalari: ["c.ts"] },
    ];
    fspM.writeFileSync(rTmp + "/.verimlilik/telemetri.jsonl", kayitlar.map((k) => JSON.stringify(k)).join("\n") + "\n");
    const yol7 = hr7(rTmp, simdi7);
    assert(yol7 !== null, "LOC kayitli rollup uretildi");
    const j7 = JSON.parse(fspM.readFileSync(rTmp + "/raporlar/telemetri-haftalik/" + ih7(simdi7) + ".json", "utf8"));
    assert(j7.toplamLocDelta === 180, "toplamLocDelta: " + j7.toplamLocDelta);
    assert(j7.saatlikLoc === 30, "R3-06: saatlikLoc ayni alt-kume (locDelta+turSn cifti: 30/1saat): " + j7.saatlikLoc);
    assert(j7.reworkOrani === 0.5, "reworkOrani = 2/4: " + j7.reworkOrani);
    assert(j7.etkinLoc === 90, "etkinLoc = 180 * 0.5: " + j7.etkinLoc);
    assert(fspM.readFileSync(yol7!, "utf8").includes("rework"), "md rework satiri icerir");
    const rTmp2 = fspM.mkdtempSync(osM.tmpdir() + "/rol2-");
    fspM.mkdirSync(rTmp2 + "/.verimlilik", { recursive: true });
    fspM.writeFileSync(rTmp2 + "/.verimlilik/telemetri.jsonl", JSON.stringify({ ts: simdi7.toISOString(), tip: "tur", locDelta: 10 }) + "\n");
    const yol7b = hr7(rTmp2, simdi7);
    const j7b = JSON.parse(fspM.readFileSync(rTmp2 + "/raporlar/telemetri-haftalik/" + ih7(simdi7) + ".json", "utf8"));
    assert(yol7b !== null && j7b.saatlikLoc === null, "turSn yoksa saatlikLoc null (sifira bolunme yok)");
    assert(j7b.reworkOrani === null && j7b.etkinLoc === 10, "editsiz: reworkOrani null, etkinLoc=toplamLocDelta");
    fspM.rmSync(rTmp, { recursive: true, force: true });
    fspM.rmSync(rTmp2, { recursive: true, force: true });
  }

  // v0.19 (K-0032): firtina modu uc davranisi
  {
    const { takilmaEsigiMs } = await import("../server/pitbull");
    assert(takilmaEsigiMs("firtina") === 8 * 60_000, "K-0032: firtina takilma esigi 8dk");
    assert(takilmaEsigiMs("atolye") === 15 * 60_000, "K-0032: firtina disi yazici esigi korunur (15dk)");
    assert(takilmaEsigiMs(null) === 15 * 60_000, "K-0032: modsuz varsayilan yazici esigi (15dk)");
    assert(takilmaEsigiMs("atolye", false) === 20 * 60_000, "K-0032: firtina disi okuyucu esigi korunur (20dk)");

    const { briefTaslakUret } = await import("../server/brief");
    const taslak = briefTaslakUret({ id: "F-1", baslik: "Test baslik", dosyaRef: "server/x.ts:10", oneri: "Bunu duzelt" });
    assert(taslak.hedef.includes("F-1") && taslak.hedef.includes("Test baslik") && taslak.hedef.includes("Bunu duzelt"), "K-0032: hedef id+baslik+oneri icerir");
    assert(taslak.ciktiFormati.length > 0, "K-0032: ciktiFormati dolu");
    assert(taslak.aracKaynak.includes("server/x.ts:10"), "K-0032: aracKaynak dosyaRef icerir");
    assert(taslak.gorevSiniri.length > 0, "K-0032: gorevSiniri dolu");

    const { k3Satiri } = await import("../server/enjekte");
    assert(k3Satiri("D:/", "atolye") === null, "K-0032: firtina disi modda k3 satiri yok");
    const k3Tmp = fspM.mkdtempSync(osM.tmpdir() + "/k3-");
    assert(k3Satiri(k3Tmp, "firtina") === "K3 bitis tarihi ayarlanmamis (.verimlilik/ayar.json k3Bitis)", "K-0032: k3Bitis yoksa uyari satiri");
    fspM.mkdirSync(k3Tmp + "/.verimlilik", { recursive: true });
    fspM.writeFileSync(k3Tmp + "/.verimlilik/ayar.json", JSON.stringify({ k3Bitis: "2026-10-15T12:00:00.000Z" }));
    const k3Simdi = Date.parse("2026-10-13T00:00:00.000Z");
    const k3Satir = k3Satiri(k3Tmp, "firtina", k3Simdi);
    assert(k3Satir === "K3 kalan sure: 2 gun 12 saat (bitis: 2026-10-15T12:00:00.000Z)", "K-0032: kalan sure dogru: " + k3Satir);
    fspM.writeFileSync(k3Tmp + "/.verimlilik/ayar.json", JSON.stringify({ k3Bitis: "bozuk-tarih" }));
    assert(k3Satiri(k3Tmp, "firtina", k3Simdi) === null, "K-0032: bozuk tarihte satir sessizce atlanir");
    fspM.rmSync(k3Tmp, { recursive: true, force: true });
  }

  console.log(hata === 0 ? "TUM TESTLER GECTI" : hata + " HATA");
  process.exit(hata === 0 ? 0 : 1);
})();
