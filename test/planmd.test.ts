import { planMdParse, derle, kanonikMdUret, birlestir, mdHash } from "../server/planmd";

let hata = 0;
function assert(kosul: boolean, mesaj: string) {
  if (!kosul) { hata++; console.error("FAIL: " + mesaj); } else { console.log("ok: " + mesaj); }
}

const md = [
  "## Sprint 4",
  "- [ ] S4-01 login akisini refactor et → coder · kabul: npm test auth yesil · once: S3-07 · dizin: src/auth",
  "- [x] S3-07 token yenileme · kabul: token testi gecer",
  "- [~] S4-02 docs guncelle → docs-coder · kabul: docs/auth.md linkleri calisiyor",
].join("\n");

const p = planMdParse(md);
assert(p.hatalar.length === 0, "temiz parse: hata yok");
assert(p.gorevler.length === 3, "3 gorev parse edildi");
assert(p.gorevler[0].id === "S4-01" && p.gorevler[0].rol === "coder" && p.gorevler[0].durum === "bekliyor", "S4-01 alanlari dogru");
assert(p.gorevler[0].kabul === "npm test auth yesil", "kabul kriteri dogru ayrildi");
assert(p.gorevler[0].once.join(",") === "S3-07", "bagimlilik parse edildi");
assert(p.gorevler[0].dizin === "src/auth", "dizin parse edildi");
assert(p.gorevler[1].durum === "bitti" && p.gorevler[2].durum === "kosuyor", "kutu isaretleri duruma donustu");

const k1 = derle(md, null);
assert(k1.ok, "derleme yesil (kabul+dizin-kuralsiz)");
assert(k1.kanonikMd.includes("S4-01"), "kanonik md uretildi");

const tekrar = md + "\n- [ ] S4-01 baska baslik · kabul: bir seyler olsun";
assert(!derle(tekrar, null).ok, "id tekrari RED");

const kabulYok = "- [ ] S4-03 baslik var ama kriter yok";
assert(!derle(kabulYok, null).ok, "kabul kriteri yoksa RED (K-0033 sert kural)");

const dongu = [
  "- [ ] A-1 bir · kabul: x testi gecer · once: B-2",
  "- [ ] B-2 iki · kabul: y testi gecer · once: A-1",
].join("\n");
const dsonuc = derle(dongu, null);
assert(!dsonuc.ok && dsonuc.hatalar.some((h) => h.includes("dongusu")), "bagimlilik dongusu RED");

const izin = derle(md, ["src/", "docs/"]);
assert(izin.ok, "izinli dizin gecer");
const izinRed = derle(md, ["baska/"]);
assert(!izinRed.ok && izinRed.hatalar.some((h) => h.includes("izin listesinde")), "izinsiz dizin RED");

const eski = { schemaSurum: 1, repo: "t", kaynakMdHash: "x", guncelleme: "t", gorevler: [
  { id: "S4-01", baslik: "eski baslik", durum: "kosuyor", rol: "coder", kabul: "eski", once: [], dizin: null, sahip: "agent-9", deneme: 2, tokenHarcanan: 5000, baslama: "t0", bitis: null },
  { id: "S9-99", baslik: "md'den silinmis", durum: "bitti", rol: null, kabul: "k", once: [], dizin: null },
] };
const birlesik = birlestir(k1.gorevler, eski as never);
const s401 = birlesik.find((g) => g.id === "S4-01");
assert(s401?.baslik === "login akisini refactor et", "insan md'si kazanir (baslik guncellendi)");
assert(s401?.sahip === "agent-9" && s401?.deneme === 2, "runtime alanlari korunur");
assert(birlesik.find((g) => g.id === "S9-99")?.mddeYok === true, "md'de olmayan silinmez, isaretlenir (append-kilit)");

const rt = planMdParse(kanonikMdUret(k1.gorevler));
assert(rt.gorevler.length === k1.gorevler.length, "round-trip: gorev sayisi korunur");
assert(rt.gorevler.every((g, i) => g.id === k1.gorevler[i].id && g.kabul === k1.gorevler[i].kabul && g.rol === k1.gorevler[i].rol), "round-trip: id/kabul/rol korunur");

assert(mdHash("a") !== mdHash("b") && mdHash("a") === mdHash("a"), "mdHash kararli ve ayristirici");

if (hata > 0) { console.error(hata + " test KIRILDI"); process.exit(1); }
console.log("TUM TESTLER GECTI (planmd)");
