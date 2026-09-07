import type { SrsState } from './types'

const DAY = 24 * 60 * 60 * 1000
/** Khoảng cách ôn theo hộp (ngày): hộp 0 ôn ngay, hộp 5 là "đã thuộc". */
const INTERVALS_DAYS = [0, 1, 3, 7, 14, 30]

export function newSrs(): SrsState {
  return { box: 0, due: Date.now(), reps: 0, lapses: 0 }
}

export function rateSrs(s: SrsState, remembered: boolean): SrsState {
  const box = remembered ? Math.min(s.box + 1, INTERVALS_DAYS.length - 1) : 0
  return {
    box,
    due: Date.now() + INTERVALS_DAYS[box] * DAY,
    reps: s.reps + 1,
    lapses: s.lapses + (remembered ? 0 : 1),
  }
}

export function isDue(s: SrsState, now = Date.now()): boolean {
  return s.due <= now
}

export function boxLabel(box: number): string {
  if (box === 0) return 'Mới'
  if (box <= 2) return 'Đang học'
  if (box <= 4) return 'Quen'
  return 'Thuộc'
}
