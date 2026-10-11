// JS \b ASCII-only'dir — Turkce harfle (s, i, g...) biten kelimelerde sinir kacar.
// Bu yuzden Unicode-aware lookaround kullanilir (u bayragi ile).
export const RET_DESENI = /(?<![\p{L}\p{N}])(hayır|yanlış|olmamış|olmadı|bozuk|bozuldu|çalışmıyor|geri al|revert|undo|wrong|broken|hatalı)(?![\p{L}\p{N}])/iu;
export const KARISIKLIK_DESENI = /(?<![\p{L}\p{N}])(karışık|anlaşılmadı|anlamadım|anlaşılır değil|net değil|ne demek|unclear|confusing|confused)(?![\p{L}\p{N}])/iu;
