import raw from '../data/library.json'
import { shuffle } from './text'

export type Lang = 'en' | 'zh'
export type EnLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1'
export type ZhLevel = 'HSK1' | 'HSK2' | 'HSK3' | 'HSK4' | 'HSK5' | 'HSK6' | 'HSK7-9'
export type Level = EnLevel | ZhLevel

export const EN_LEVELS: Level[] = ['A1', 'A2', 'B1', 'B2', 'C1']
export const ZH_LEVELS: Level[] = ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6', 'HSK7-9']
export const LEVELS_OF: Record<Lang, Level[]> = { en: EN_LEVELS, zh: ZH_LEVELS }
/** giữ tên cũ cho chỗ đang dùng tiếng Anh */
export const LEVELS = EN_LEVELS

export const LANG_LABEL: Record<Lang, string> = { en: 'Tiếng Anh', zh: 'Tiếng Trung' }

export interface LibraryItem {
  id: string
  title: string
  channel: string
  channelUrl: string
  /** giây */
  duration: number
  level: Level
  topic: string
  captions: string
  source: string
  lang?: Lang
  /** phụ đề do máy sinh (chỉ gặp ở tiếng Trung) */
  generated?: boolean
}

interface LibraryFile {
  generatedAt: string
  note: string
  items: LibraryItem[]
}

const file = raw as LibraryFile
export const LIBRARY: LibraryItem[] = file.items
export const LIBRARY_NOTE = file.note
export const LIBRARY_DATE = file.generatedAt

const byId = new Map(LIBRARY.map((v) => [v.id, v]))

export function libraryItem(id: string): LibraryItem | undefined {
  return byId.get(id)
}

export function thumbnailOf(id: string, quality: 'mq' | 'hq' = 'mq'): string {
  return `https://i.ytimg.com/vi/${id}/${quality}default.jpg`
}

export const LEVEL_LABEL: Record<string, string> = {
  A1: 'Mới bắt đầu',
  A2: 'Sơ cấp',
  B1: 'Trung cấp',
  B2: 'Trên trung cấp',
  C1: 'Nâng cao',
  HSK1: 'Vỡ lòng',
  HSK2: 'Sơ cấp',
  HSK3: 'Sơ trung',
  HSK4: 'Trung cấp',
  HSK5: 'Trên trung cấp',
  HSK6: 'Nâng cao',
  'HSK7-9': 'Thành thạo',
}

export function langOf(v: LibraryItem): Lang {
  return v.lang ?? 'en'
}

export function itemsOf(lang: Lang): LibraryItem[] {
  return LIBRARY.filter((v) => langOf(v) === lang)
}

/** Video hoạt hình: người mới nghe dễ hơn hẳn, nên được ưu tiên xếp trước ở bậc thấp. */
export function isCartoon(v: LibraryItem): boolean {
  return /hoạt hình|cartoon|animation/i.test(v.topic) || /小猪佩奇|动画|cartoon|peppa/i.test(v.title)
}

const EASY_FIRST = new Set(['A1', 'A2', 'HSK1', 'HSK2'])

/** Sắp xếp trong một bậc: bậc thấp thì hoạt hình lên trước, rồi video ngắn trước. */
export function sortForLevel(list: LibraryItem[], level: string): LibraryItem[] {
  if (!EASY_FIRST.has(level)) return list
  return [...list].sort((a, b) => Number(isCartoon(b)) - Number(isCartoon(a)) || a.duration - b.duration)
}

/**
 * Đề xuất do app tự chọn: cùng bậc với video đang xem (nếu video thuộc thư viện), rồi bậc kề;
 * ưu tiên video chưa xem, không lặp lại video hiện tại.
 */
export function suggestFor(currentId: string | null, seen: Set<string>, count = 6, lang: Lang = 'en'): LibraryItem[] {
  const cur = currentId ? byId.get(currentId) : undefined
  const useLang: Lang = cur ? langOf(cur) : lang
  const levels = LEVELS_OF[useLang]
  const order: Level[] = cur
    ? [cur.level, ...levels.filter((l) => Math.abs(levels.indexOf(l) - levels.indexOf(cur.level)) === 1), ...levels]
    : useLang === 'en'
      ? ['B1', 'A2', 'B2', 'A1', 'C1']
      : ['HSK2', 'HSK1', 'HSK3', 'HSK4', 'HSK5']
  const uniq = Array.from(new Set(order))
  const out: LibraryItem[] = []
  const taken = new Set<string>(currentId ? [currentId] : [])
  for (const pass of [false, true]) {
    // pass 0: chưa xem · pass 1: đã xem cũng được
    for (const level of uniq) {
      const pool = shuffle(LIBRARY.filter((v) => langOf(v) === useLang && v.level === level && !taken.has(v.id) && (pass || !seen.has(v.id))))
      for (const v of pool) {
        if (out.length >= count) return out
        out.push(v)
        taken.add(v.id)
      }
    }
  }
  return out
}

/** Bậc người dùng mở nhiều nhất (đếm video đã mở thuộc thư viện). Không có lịch sử thì B1. */
export function mostWatchedLevel(historyIds: string[], lang: Lang = 'en'): { level: Level; fromHistory: boolean } {
  const count = new Map<Level, number>()
  for (const id of historyIds) {
    const v = byId.get(id)
    if (v && langOf(v) === lang) count.set(v.level, (count.get(v.level) ?? 0) + 1)
  }
  let best: Level | null = null
  let n = 0
  for (const l of LEVELS_OF[lang]) {
    const c = count.get(l) ?? 0
    if (c > n) {
      best = l
      n = c
    }
  }
  return best ? { level: best, fromHistory: true } : { level: lang === 'en' ? 'B1' : 'HSK2', fromHistory: false }
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
