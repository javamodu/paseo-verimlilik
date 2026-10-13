import { spawnDogrula, orduAyarOku, kuyrukOku, islenenIdler, sonucYaz, VARSAYILAN_AYAR } from "../server/ordu";
import { mkdtempSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let hata = 0;
function assert(kosul: boolean, mesaj: string) {
  if (!kosul) { hata++; console.error("FAIL: " + mesaj); } else { console.log("ok: " + mesaj); }
}

const S = VARSAYILAN_AYAR.sinirlar;
const taban = { tip: "spawn" as const, provider: "codex/gpt-5.4", rol: "coder", gorev: "S1-01", cwd: "D:\\x", prompt: "is" };

assert(spawnDogrula({ ...taban, id: "a" }, { coder: 0, tester: 0, toplam: 0 }, S) === null, "bos orduda spawn serbest");
assert(spawnDogrula({ ...taban, id: "a" }, { coder: 3, tester: 0, toplam: 3 }, S)?.includes("max-coder") === true, "4. coder RED (max-coder)");
assert(spawnDogrula({ ...taban, id: "a", rol: "tester" }, { coder: 0, tester: 2, toplam: 2 }, S)?.includes("max-tester") === true, "3. tester RED (max-tester)");
assert(spawnDogrula({ ...taban, id: "a", rol: "tester" }, { coder: 3, tester: 2, toplam: 5 }, S)?.includes("max-tester") === true, "tester doluysa toplam altinda olsa bile RED");
assert(spawnDogrula({ ...taban, id: "a" }, { coder: 2, tester: 2, toplam: 6 }, S)?.includes("max-toplam") === true, "toplam 6 RED (max-toplam)");
assert(spawnDogrula({ ...taban }, { coder: 0, tester: 0, toplam: 0 }, S)?.includes("zorunlu") === true, "id'siz RED");
assert(spawnDogrula({ ...taban, id: "a", tip: "baska" as never }, { coder: 0, tester: 0, toplam: 0 }, S)?.includes("bilinmeyen") === true, "bilinmeyen tip RED");

const tmp = mkdtempSync(join(tmpdir(), "ordu-test-"));
mkdirSync(join(tmp, ".verimlilik"), { recursive: true });
appendFileSync(join(tmp, ".verimlilik", "spawn-kuyruk.jsonl"),
  JSON.stringify({ ...taban, id: "sp-1", ts: "t" }) + "\n" +
  JSON.stringify({ ...taban, id: "sp-2", ts: "t" }) + "\n" +
  "{bozuk satir\n");
assert(kuyrukOku(tmp).length === 2, "kuyruk: 2 gecerli satir (bozuk atlanir)");
assert(islenenIdler(tmp).size === 0, "sonuc yoksa hepsi islenmemis");
sonucYaz(tmp, { kuyrukId: "sp-1", ts: "t", sonuc: "red", sebep: "max-coder asimi" });
assert(islenenIdler(tmp).has("sp-1") && !islenenIdler(tmp).has("sp-2"), "sonuc yazimi sonrasi islenen/sp-1");
const kalan = kuyrukOku(tmp).filter((k) => !islenenIdler(tmp).has(k.id));
assert(kalan.length === 1 && kalan[0].id === "sp-2", "append-only: kuyruk ezilmedi, kalan sp-2");
const sonucIc = readFileSync(join(tmp, ".verimlilik", "spawn-sonuc.jsonl"), "utf8");
assert(sonucIc.includes("max-coder"), "red sebebi sonuc dosyasinda");

assert(orduAyarOku(tmp).sinirlar.maxCoder === 3, "ordu.json yoksa varsayilan");
appendFileSync(join(tmp, ".verimlilik", "ordu.json"), JSON.stringify({ sinirlar: { maxCoder: 1 } }));
assert(orduAyarOku(tmp).sinirlar.maxCoder === 1 && orduAyarOku(tmp).sinirlar.maxTester === 2, "ordu.json kismi override");

if (hata > 0) { console.error(hata + " test KIRILDI"); process.exit(1); }
console.log("TUM TESTLER GECTI (ordu)");
