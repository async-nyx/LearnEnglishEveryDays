import type { Segment, Sentence } from './types'

export interface Token {
  text: string
  isWord: boolean
}

// Tiếng Trung không có khoảng trắng: MỖI CHỮ HÁN là một token riêng, bấm được và đếm được.
const WORD_RE = /\p{Script=Han}|[A-Za-zÀ-ỹ][A-Za-zÀ-ỹ'’-]*/gu

/** Tách câu thành từ và các ký tự còn lại, giữ nguyên thứ tự để render. */
export function tokenize(text: string): Token[] {
  const out: Token[] = []
  let last = 0
  for (const m of text.matchAll(WORD_RE)) {
    const i = m.index ?? 0
    if (i > last) out.push({ text: text.slice(last, i), isWord: false })
    out.push({ text: m[0], isWord: true })
    last = i + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), isWord: false })
  return out
}

export function normalizeWord(w: string): string {
  return w
    .toLowerCase()
    .replace(/’/g, "'")
    // giữ chữ Hán, không thì mọi từ tiếng Trung thành chuỗi rỗng
    .replace(/[^a-z0-9'\p{Script=Han}]/gu, '')
}

export function wordsOf(text: string): string[] {
  return (text.match(WORD_RE) ?? []).map(normalizeWord).filter(Boolean)
}

export type DiffOp = { type: 'ok' | 'missing' | 'extra'; word: string }

/**
 * So khớp chuỗi từ người gõ với chuỗi từ gốc bằng LCS.
 * Trả về danh sách thao tác theo thứ tự từ gốc, chèn thêm từ dư của người gõ.
 */
export function diffWords(target: string, input: string): { ops: DiffOp[]; correct: number; total: number } {
  const a = wordsOf(target)
  const b = wordsOf(input)
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  let correct = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'ok', word: a[i] })
      correct++
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'missing', word: a[i] })
      i++
    } else {
      ops.push({ type: 'extra', word: b[j] })
      j++
    }
  }
  while (i < n) ops.push({ type: 'missing', word: a[i++] })
  while (j < m) ops.push({ type: 'extra', word: b[j++] })
  return { ops, correct, total: n }
}

/** Tỉ lệ từ khớp giữa hai đoạn (0..1), dùng cho chấm nói. */
export function similarity(target: string, input: string): number {
  const { correct, total } = diffWords(target, input)
  if (total === 0) return 0
  return correct / total
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

/**
 * Gộp các dòng phụ đề rời thành câu để luyện tập.
 * Ngắt khi: kết thúc bằng dấu câu, hoặc đủ số từ, hoặc khoảng lặng lớn.
 */
export function buildSentences(segments: Segment[], opts?: { maxWords?: number; maxGap?: number }): Sentence[] {
  const maxWords = opts?.maxWords ?? 14
  const maxGap = opts?.maxGap ?? 1.4
  const out: Sentence[] = []
  let cur: Sentence | null = null

  const flush = () => {
    if (cur && cur.text.trim()) out.push({ ...cur, id: out.length, text: cur.text.trim() })
    cur = null
  }

  segments.forEach((seg, idx) => {
    const segEnd = seg.start + Math.max(seg.duration, 0.5)
    if (cur) {
      const gap = seg.start - cur.end
      if (gap > maxGap) flush()
    }
    if (!cur) {
      cur = { id: 0, start: seg.start, end: segEnd, text: seg.text, segIndexes: [idx] }
    } else {
      cur.text += ' ' + seg.text
      cur.end = Math.max(cur.end, segEnd)
      cur.segIndexes.push(idx)
    }
    const words = countWords(cur.text)
    // dấu chấm câu của cả hai tiếng: . ! ? và 。！？
    if (/[.!?。！？][""'’”)]?$/.test(seg.text.trim()) || words >= maxWords) flush()
  })
  flush()
  return out
}

/** Đếm từ: tiếng Anh theo khoảng trắng, tiếng Trung theo chữ Hán. */
export function countWords(text: string): number {
  return (text.match(WORD_RE) ?? []).length
}

export function toSrt(segments: Segment[]): string {
  const t = (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    const ms = Math.floor((sec % 1) * 1000)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
  }
  return segments
    .map((seg, i) => `${i + 1}\n${t(seg.start)} --> ${t(seg.start + (seg.duration || 2))}\n${seg.text}\n`)
    .join('\n')
}

export function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
