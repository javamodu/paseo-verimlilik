# Kilitli Surum - v0.9-kilit

- Tarih: 2026-10-12 - Commit: `69b4648` - Tag: `v0.9-kilit`
- Doctor: (doctor yok)
- Ek ozet: sozlesme bekcisi (K-0013): saglik/zincir koprusu + git-drift + telemetri-fail + coder-aktif korumasi; pluginSurum damgasi; test kirlenmesi fix
- Hedefler + eksen puanlari: `
kilit.json` (makine-okunur)
- Not: 

## Rollback

`
git reset --hard v0.9-kilit` -> `
scripts\codemap.ps1` (tazelik damgasi) -> `
scripts\saglik.ps1` yesil.
Plugin reposunda: tag'e don + `
paseo plugin reload paseo-verimlilik`.
