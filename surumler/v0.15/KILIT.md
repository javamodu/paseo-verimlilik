# Kilitli Surum - v0.15-kilit

- Tarih: 2026-10-13 - Commit: `aedbd30` - Tag: `v0.15-kilit`
- Doctor: (doctor yok)
- Ek ozet: TEST_KOSUCU/raporcu dallarinda zincir insan kapisina; yazma hedefi ayristirma; ZINCIR_DESENI dolar-parantez
- Hedefler + eksen puanlari: `
kilit.json` (makine-okunur)
- Not: K-0027 denetim2 guvenlik dortlusu: D2-01..04

## Rollback

`
git reset --hard v0.15-kilit` -> `
scripts\codemap.ps1` (tazelik damgasi) -> `
scripts\saglik.ps1` yesil.
Plugin reposunda: tag'e don + `
paseo plugin reload paseo-verimlilik`.
