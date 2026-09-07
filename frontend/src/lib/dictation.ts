/**
 * Chấm chép chính tả theo luật của betterVocab:
 *  - bỏ hoa/thường, dấu câu; nháy cong về nháy thẳng
 *  - viết tắt và viết bung là MỘT dãy từ: "I've" = "ive" = "I have"
 *  - so theo VỊ TRÍ: đủ từ nhưng sai trật tự vẫn là sai
 *  - đúng = số từ bằng nhau và mọi vị trí khớp
 */

export function normalizeDictation(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[‘’ʼ]/g, "'")
      // ký hiệu người ta hay gõ tắt: đọc thành chữ để so cho công bằng
      .replace(/%/g, ' percent ')
      .replace(/&/g, ' and ')
      .replace(/\+/g, ' plus ')
      .replace(/=/g, ' equals ')
      // 1,000 -> 1000 ; giữ dấu chấm thập phân qua bước bỏ dấu câu bên dưới
      .replace(/(\d),(\d)/g, '$1$2')
      .replace(/(\d)\.(\d)/g, '$1zzdotzz$2')
      .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
      // tách từng chữ Hán ra thành token riêng (tiếng Trung viết liền)
      .replace(/(\p{Script=Han})/gu, ' $1 ')
      .replace(/zzdotzz/g, '.')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/*
  SỐ VIẾT CHỮ = SỐ VIẾT SỐ — user chốt 2026-09-07: "six = 6".
  Nghe "six" mà gõ "6" là nghe ĐÚNG, chỉ khác cách ghi. Gộp cả cụm ("twenty one" -> 21,
  "two hundred and five" -> 205) rồi quy về dạng chữ số, nên hai lối viết ra cùng một dãy từ.
*/
const ONES: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, million: 1000000, billion: 1000000000 }

function isNumberWord(w: string): boolean {
  return w in ONES || w in TENS || w in SCALES
}

/** Gộp các từ số liên tiếp thành một chữ số. `and` chỉ được nuốt khi kẹp giữa hai từ số. */
function foldNumbers(words: string[]): string[] {
  const out: string[] = []
  let i = 0
  while (i < words.length) {
    if (!isNumberWord(words[i])) {
      out.push(words[i++])
      continue
    }
    let total = 0
    let cur = 0
    let used = false
    while (i < words.length) {
      const w = words[i]
      if (w === 'and' && used && i + 1 < words.length && isNumberWord(words[i + 1])) {
        i++
        continue
      }
      if (w in ONES) cur += ONES[w]
      else if (w in TENS) cur += TENS[w]
      else if (w === 'hundred') cur = (cur || 1) * 100
      else if (w in SCALES) {
        total += (cur || 1) * SCALES[w]
        cur = 0
      } else break
      used = true
      i++
    }
    out.push(String(total + cur))
  }
  return out
}

/** Bung viết tắt. Cố ý bỏ mấy dạng mà bỏ dấu lược thành chữ khác (it's/its, we're/were, he'll/hell…). */
const CONTRACTIONS: Record<string, string> = {
  "i'm": 'i am',
  "i've": 'i have',
  "i'll": 'i will',
  "i'd": 'i would',
  "you're": 'you are',
  "you've": 'you have',
  "you'll": 'you will',
  "you'd": 'you would',
  "they're": 'they are',
  "they've": 'they have',
  "they'll": 'they will',
  "they'd": 'they would',
  "we've": 'we have',
  "we'll": 'we will',
  "we'd": 'we would',
  "she's": 'she is',
  "she'll": 'she will',
  "she'd": 'she would',
  "he's": 'he is',
  "he'd": 'he would',
  "that's": 'that is',
  "there's": 'there is',
  "what's": 'what is',
  "who's": 'who is',
  "where's": 'where is',
  "how's": 'how is',
  "let's": 'let us',
  "don't": 'do not',
  "doesn't": 'does not',
  "didn't": 'did not',
  "can't": 'cannot',
  "couldn't": 'could not',
  "won't": 'will not',
  "wouldn't": 'would not',
  "shouldn't": 'should not',
  "isn't": 'is not',
  "aren't": 'are not',
  "wasn't": 'was not',
  "weren't": 'were not',
  "haven't": 'have not',
  "hasn't": 'has not',
  "hadn't": 'had not',
  "mustn't": 'must not',
  "gonna": 'going to',
  "wanna": 'want to',
  "gotta": 'got to',
}
/** Dạng bỏ dấu lược người học hay gõ trên điện thoại: "ive" -> "i have". */
const APOSTROPHE_LESS: Record<string, string> = Object.fromEntries(
  Object.entries(CONTRACTIONS)
    .filter(([k]) => !['its', 'were', 'hell', 'shell', 'well', 'ill', 'id', 'wed', 'hed', 'whos', 'lets'].includes(k.replace("'", '')))
    .map(([k, v]) => [k.replace("'", ''), v]),
)

interface Canon {
  word: string
  /** chỉ số từ GỐC mà mảnh này thuộc về */
  from: number
}

/** Tách thành các từ chuẩn, nhớ mỗi mảnh xuất phát từ từ gốc nào. */
export function canonWords(text: string): Canon[] {
  const out: Canon[] = []
  normalizeDictation(text)
    .split(' ')
    .filter(Boolean)
    .forEach((raw, from) => {
      const expanded = CONTRACTIONS[raw] ?? APOSTROPHE_LESS[raw] ?? raw.replace(/'/g, '')
      for (const piece of expanded.split(' ')) if (piece) out.push({ word: piece, from })
    })
  // gộp số SAU khi bung viết tắt, nhưng phải giữ được từ gốc nào sinh ra mảnh nào
  const words = foldNumbers(out.map((o) => o.word))
  if (words.length === out.length) return out.map((o, i) => ({ ...o, word: words[i] }))
  // cụm số bị gộp -> dựng lại danh sách, mảnh gộp mang chỉ số từ gốc ĐẦU của cụm
  const folded: Canon[] = []
  let i = 0
  for (const w of words) {
    folded.push({ word: w, from: out[Math.min(i, out.length - 1)]?.from ?? 0 })
    // nhảy qua các mảnh đã bị gộp vào w
    let j = i
    if (/^\d+$/.test(w) && out[i] && !/^\d+$/.test(out[i].word)) {
      while (j < out.length && (isNumberWord(out[j].word) || (out[j].word === 'and' && j > i && j + 1 < out.length && isNumberWord(out[j + 1].word)))) j++
    } else j = i + 1
    i = Math.max(j, i + 1)
  }
  return folded
}

export function answerWords(expected: string): string[] {
  return expected.split(/\s+/).filter((w) => w.length > 0)
}

export function isDictationCorrect(typed: string, expected: string): boolean {
  const got = canonWords(typed)
  const want = canonWords(expected)
  return got.length === want.length && want.every((item, i) => got[i]?.word === item.word)
}

/**
 * Mảng theo câu GỐC: mỗi từ kèm cờ `hit` (đã gõ đúng ở đúng vị trí). Một từ gốc bung ra hai mảnh
 * (I've -> i have) thì chỉ xanh khi cả hai mảnh đều khớp.
 */
export function dictationDiff(typed: string, expected: string): { word: string; hit: boolean }[] {
  const got = canonWords(typed)
  const want = canonWords(expected)
  const original = answerWords(expected)
  const hits = new Map<number, boolean>()
  want.forEach((item, i) => {
    const ok = got[i]?.word === item.word
    hits.set(item.from, (hits.get(item.from) ?? true) && ok)
  })
  return original.map((word, i) => ({ word, hit: hits.get(i) === true }))
}

/** Tỉ lệ từ đúng vị trí (0..1) để tô màu tiến độ. */
export function dictationRatio(typed: string, expected: string): number {
  const d = dictationDiff(typed, expected)
  if (d.length === 0) return 0
  return d.filter((x) => x.hit).length / d.length
}
