# Kilitli Surum - v0.22-kilit

- Tarih: 2026-10-14 - Commit: `df9101c` - Tag: `v0.22-kilit`
- Doctor: 1 OK / 0 EKSIK / 0 SARI
- Ek ozet: 345+ assertion yesil
- Hedefler + eksen puanlari: `
kilit.json` (makine-okunur)
- Not: aktifSn metrigi (bekleme-haric calisma suresi) + D2-07/08, BK-01, D2-15, R3-05/07/08/09 kapanislari

## Rollback

`
git reset --hard v0.22-kilit` -> `
scripts\codemap.ps1` (tazelik damgasi) -> `
scripts\saglik.ps1` yesil.
Plugin reposunda: tag'e don + `
paseo plugin reload paseo-verimlilik`.
