import index from '../data/decks.json'

/*
  BỘ TỪ CÓ SẴN — dựng bởi `scripts/build_decks.py`.
  Chỉ mục (tên bộ, số từ) nằm trong bundle; DANH SÁCH TỪ nằm ở public/data/decks/<id>.json và chỉ
  tải khi người học mở bộ đó, vì riêng HSK4 đã gần 1.000 từ.
*/

export interface DeckWord {
  /** từ: tiếng Anh hoặc chữ Hán */
  w: string
  /** nghĩa tiếng Việt */
  vi: string
  pinyin?: string
  pos?: string
  /** định nghĩa tiếng Anh (bộ TOEIC — do chính nhóm tác giả TSL viết) */
  def?: string
  /** câu định nghĩa đó dịch sang tiếng Việt */
  defVi?: string
  /** câu ví dụ (bộ HSK) */
  ex?: string
  exPinyin?: string
  exVi?: string
  rank: number
  /** chặng thứ mấy trong bộ */
  part: number
}

export interface DeckInfo {
  id: string
  lang: 'en' | 'zh'
  title: string
  blurb: string
  /** nguồn dữ liệu, luôn hiện cho người học thấy */
  credit: string
  count: number
  parts: number
}

export interface DeckFile extends DeckInfo {
  chunk: number
  items: DeckWord[]
}

const file = index as { generatedAt: string; decks: DeckInfo[] }
export const DECKS: DeckInfo[] = file.decks
export const DECKS_DATE = file.generatedAt

const cache = new Map<string, Promise<DeckFile | null>>()

export function loadDeck(id: string): Promise<DeckFile | null> {
  let p = cache.get(id)
  if (!p) {
    p = fetch(`/data/decks/${id}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<DeckFile>) : null))
      .catch(() => null)
    cache.set(id, p)
  }
  return p
}

/** Nhãn chặng. */
export function partLabel(part: number): string {
  return `Chặng ${part}`
}
