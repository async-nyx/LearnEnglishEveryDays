import { create } from 'zustand'

/*
  PHIÊN ÂM PINYIN cho phụ đề không kèm sẵn pinyin (phim tiên hiệp, phim hoạt hình…).
  Bảng lấy từ Unihan `kMandarin` (scripts/build_hanviet.py) — 26.710 chữ, ~340 KB nên KHÔNG import
  tĩnh: chỉ tải khi người học bật lớp pinyin. Chữ đa âm chỉ lấy âm phổ biến nhất, đủ để đọc theo.
*/

let table: Record<string, string> | null = null
let loading: Promise<void> | null = null

interface PinyinState {
  /** tăng lên khi bảng tải xong, để React vẽ lại */
  version: number
}
export const usePinyinReady = create<PinyinState>()(() => ({ version: 0 }))

export function ensurePinyin(): Promise<void> {
  if (table) return Promise.resolve()
  if (!loading) {
    // tệp tĩnh ở public/data: fetch nhẹ hơn hẳn import() (JSON hoá thành JS phình gấp đôi)
    loading = Promise.all([
      fetch('/data/pinyin.json').then((r) => r.json() as Promise<Record<string, string>>),
      fetch('/data/zh-words.json')
        .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
        .catch(() => [] as string[]),
    ])
      .then(([data, list]) => {
        table = data
        if (list.length) {
          words = new Set(list)
          maxWord = list.reduce((n, w) => Math.max(n, w.length), 1)
        }
        usePinyinReady.setState((s) => ({ version: s.version + 1 }))
      })
      .catch(() => {
        table = {}
      })
  }
  return loading
}

const HAN = /\p{Script=Han}/u

/**
 * Danh sách từ tiếng Trung để GHÉP âm tiết theo từ: 水果很好吃 -> "shuǐguǒ hěn hǎochī" chứ không
 * phải "shuǐ guǒ hěn hǎo chī". Tải cùng bảng pinyin (public/data/zh-words.json).
 */
let words: Set<string> | null = null
let maxWord = 1

/**
 * Phiên âm cả câu.
 *
 * BẪY đã trả giá: bản đầu duyệt TỪNG KÝ TỰ rồi nối bằng dấu cách, nên dòng phụ đề vốn đã là chữ
 * Latin ("Shuǐguǒ hěn hǎo chī Fruits are delicious") bị xé thành "S h u ǐ g u ǒ …". Chữ không phải
 * Hán phải giữ nguyên cả cụm; câu không có chữ Hán thì KHÔNG phiên âm gì cả.
 */
export function pinyinLine(text: string): string {
  if (!table || !HAN.test(text)) return ''
  const out: string[] = []
  let latin = ''
  let i = 0
  const flush = () => {
    if (latin.trim()) out.push(latin.trim())
    latin = ''
  }
  while (i < text.length) {
    const ch = text[i]
    if (!HAN.test(ch)) {
      latin += ch
      i += 1
      continue
    }
    flush()
    // ghép theo từ dài nhất tra được, để đọc ra nhịp như người bản ngữ
    let taken = 1
    if (words) {
      for (let len = Math.min(maxWord, text.length - i); len >= 2; len--) {
        const piece = text.slice(i, i + len)
        if (words.has(piece) && Array.from(piece).every((c) => HAN.test(c))) {
          taken = len
          break
        }
      }
    }
    const chunk = text.slice(i, i + taken)
    out.push(
      Array.from(chunk)
        .map((c) => table?.[c] ?? c)
        .join(''),
    )
    i += taken
  }
  flush()
  return out.join(' ').replace(/\s+([,.!?;:])/g, '$1').trim()
}

export function pinyinChar(ch: string): string | null {
  return table?.[ch] ?? null
}
