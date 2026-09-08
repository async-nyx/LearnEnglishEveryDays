/*
  PHỤ ĐỀ BA TẦNG TRÊN MỘT DÒNG.

  Nhiều kênh dạy tiếng Trung nhét cả ba thứ vào cùng một dòng phụ đề:
      哈哈哈小猪佩奇 hāhā hā xiǎo zhū pèi qí Hahaha Peppa Pig
  Để nguyên thì mọi thứ hỏng: chép chính tả bắt gõ cả pinyin lẫn tiếng Anh, dịch máy dịch lại
  chính bản tiếng Anh, tra từ thì bấm trúng chữ Latin.

  Cách tách (không đoán mò, đo bằng chính chuỗi):
   1. Chữ Hán và dấu câu Trung -> phần TIẾNG TRUNG.
   2. Phần Latin còn lại cắt thành từ; chuỗi từ đầu tiên vừa là ÂM TIẾT PINYIN hợp lệ vừa viết
      thường (hoặc có dấu thanh) -> phần PINYIN. Phải có ít nhất một từ mang dấu thanh, không thì
      coi như dòng đó không có pinyin (tránh nuốt nhầm tiếng Anh).
   3. Còn lại -> phần TIẾNG ANH.
*/

const HAN = /[\p{Script=Han}]/u
const ZH_PUNCT = /[，。！？、；：「」『』（）《》〈〉—…·～"”'’]/
const TONE = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙ]/

const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w']
const FINALS = new Set([
  'a', 'o', 'e', 'ai', 'ei', 'ao', 'ou', 'an', 'en', 'ang', 'eng', 'ong', 'er',
  'i', 'ia', 'ie', 'iao', 'iu', 'iou', 'ian', 'in', 'iang', 'ing', 'iong',
  'u', 'ua', 'uo', 'uai', 'ui', 'uei', 'uan', 'un', 'uen', 'uang', 'ueng',
  'v', 've', 'van', 'vn', 'ü', 'üe', 'üan', 'ün', 'n', 'ng', 'm',
])

/** Bỏ dấu thanh: hāhā -> haha. Giữ ü. */
function stripTone(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[̄́̌̀̆]/g, '')
    .normalize('NFC')
    .toLowerCase()
}

function isSyllable(base: string): boolean {
  if (!base) return false
  if (FINALS.has(base)) return true
  for (const ini of INITIALS) {
    if (base.startsWith(ini) && FINALS.has(base.slice(ini.length))) return true
  }
  return false
}

/**
 * Một từ Latin có phải pinyin không. BẪY đã trả giá: kênh viết dính âm tiết ("hāhā", "māma",
 * "dì di"), nên phải thử cắt từ thành NHIỀU âm tiết chứ không chỉ so một âm tiết.
 */
export function isPinyinSyllable(word: string): boolean {
  const w = stripTone(word)
    .replace(/[.,!?;:'"]+$/g, '')
    .replace(/^['"]+/, '')
    .replace(/ü/g, 'v')
    .replace(/[1-5]/g, '')
  if (!w || !/^[a-z]+$/.test(w)) return false
  // quy hoạch động: cắt được hết chuỗi thành âm tiết hợp lệ là được
  const ok = new Array(w.length + 1).fill(false)
  ok[0] = true
  for (let i = 1; i <= w.length; i++) {
    for (let len = 1; len <= 6 && len <= i; len++) {
      if (ok[i - len] && isSyllable(w.slice(i - len, i))) {
        ok[i] = true
        break
      }
    }
  }
  return ok[w.length]
}

export interface Trilingual {
  /** phần chữ Hán (rỗng nếu dòng không có chữ Hán) */
  zh: string
  /** phần phiên âm, rỗng nếu dòng không kèm pinyin */
  pinyin: string
  /** phần tiếng Anh có sẵn trong phụ đề, rỗng nếu không có */
  en: string
  /** dòng này thật sự là kiểu ba tầng hay không */
  split: boolean
}

export function splitTrilingual(line: string): Trilingual {
  const text = line.trim()
  if (!HAN.test(text)) return { zh: '', pinyin: '', en: text, split: false }

  // 1. gom chữ Hán (và dấu câu Trung xen giữa) — chúng luôn đứng trước phần Latin ở kiểu này
  let zh = ''
  let rest = ''
  let seenLatin = false
  for (const ch of text) {
    if (!seenLatin && (HAN.test(ch) || ZH_PUNCT.test(ch) || (zh && /\s/.test(ch)))) {
      zh += ch
      continue
    }
    if (!zh) return { zh: text, pinyin: '', en: '', split: false }
    seenLatin = true
    rest += ch
  }
  zh = zh.trim()
  rest = rest.trim()
  if (!rest) return { zh, pinyin: '', en: '', split: false }
  if (HAN.test(rest)) return { zh: text, pinyin: '', en: '', split: false } // Hán xen giữa: không phải kiểu ba tầng

  // 2. chuỗi âm tiết pinyin ở đầu phần Latin
  const words = rest.split(/\s+/)
  let i = 0
  let toned = 0
  while (i < words.length) {
    const w = words[i]
    const hasTone = TONE.test(w)
    const lower = w === w.toLowerCase()
    if (isPinyinSyllable(w) && (hasTone || lower)) {
      if (hasTone) toned += 1
      i += 1
      continue
    }
    break
  }
  // cần ít nhất một âm tiết có dấu thanh, không thì phần Latin đó là tiếng Anh chứ không phải pinyin
  if (toned === 0) return { zh, pinyin: '', en: rest, split: !!rest }
  const pinyin = words.slice(0, i).join(' ')
  const en = words.slice(i).join(' ')
  return { zh, pinyin, en, split: true }
}
