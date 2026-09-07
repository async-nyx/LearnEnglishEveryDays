/**
 * Chấm chép chính tả theo luật của betterVocab:
 *  - bỏ hoa/thường, dấu câu; nháy cong về nháy thẳng
 *  - viết tắt và viết bung là MỘT dãy từ: "I've" = "ive" = "I have"
 *  - so theo VỊ TRÍ: đủ từ nhưng sai trật tự vẫn là sai
 *  - đúng = số từ bằng nhau và mọi vị trí khớp
 */

export function normalizeDictation(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
  return out
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
