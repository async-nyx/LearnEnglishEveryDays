import raw from '../data/library.json'
import { shuffle } from './text'

export type Level = 'A1' | 'A2' | 'B1' | 'B2' | 'C1'
export const LEVELS: Level[] = ['A1', 'A2', 'B1', 'B2', 'C1']

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

export const LEVEL_LABEL: Record<Level, string> = {
  A1: 'Mới bắt đầu',
  A2: 'Sơ cấp',
  B1: 'Trung cấp',
  B2: 'Trên trung cấp',
  C1: 'Nâng cao',
}

/**
 * Đề xuất do app tự chọn: cùng bậc với video đang xem (nếu video thuộc thư viện), rồi bậc kề;
 * ưu tiên video chưa xem, không lặp lại video hiện tại.
 */
export function suggestFor(currentId: string | null, seen: Set<string>, count = 6): LibraryItem[] {
  const cur = currentId ? byId.get(currentId) : undefined
  const order: Level[] = cur
    ? [cur.level, ...LEVELS.filter((l) => Math.abs(LEVELS.indexOf(l) - LEVELS.indexOf(cur.level)) === 1), ...LEVELS]
    : ['B1', 'A2', 'B2', 'A1', 'C1']
  const uniq = Array.from(new Set(order))
  const out: LibraryItem[] = []
  const taken = new Set<string>(currentId ? [currentId] : [])
  for (const pass of [false, true]) {
    // pass 0: chưa xem · pass 1: đã xem cũng được
    for (const level of uniq) {
      const pool = shuffle(LIBRARY.filter((v) => v.level === level && !taken.has(v.id) && (pass || !seen.has(v.id))))
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
export function mostWatchedLevel(historyIds: string[]): { level: Level; fromHistory: boolean } {
  const count = new Map<Level, number>()
  for (const id of historyIds) {
    const v = byId.get(id)
    if (v) count.set(v.level, (count.get(v.level) ?? 0) + 1)
  }
  let best: Level | null = null
  let n = 0
  for (const l of LEVELS) {
    const c = count.get(l) ?? 0
    if (c > n) {
      best = l
      n = c
    }
  }
  return best ? { level: best, fromHistory: true } : { level: 'B1', fromHistory: false }
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
