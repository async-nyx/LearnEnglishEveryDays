/*
  BỘ SƯU TẬP PHIM — dữ liệu do `scripts/build_series.py` dựng (danh sách phát thật của YouTube).
  Tệp series.json nặng vài trăm KB nên KHÔNG import tĩnh: chỉ nạp khi người dùng mở tab Bộ sưu tập.
*/

export interface SeriesEpisode {
  id: string
  title: string
  /** số tập trong mùa */
  ep: number
  season: number
  duration: number
  captions: string
  generated: boolean
  /** đã kiểm phụ đề tận nơi hay chỉ suy từ mẫu cùng mùa */
  checked: boolean
}

export interface SeriesSeason {
  season: number
  playlistId: string
  title: string
  count: number
}

export interface SeriesInfo {
  id: string
  /** tên chữ Hán */
  cn: string
  /** tên Hán-Việt quen thuộc */
  vi: string
  en: string
  level: string
  blurb: string
  seasons: SeriesSeason[]
  channel: string
  count: number
  firstEp: number
  lastEp: number
  /** mã video tập đầu, dùng làm ảnh bìa */
  poster: string
}

export interface SeriesFile {
  generatedAt: string
  note: string
  series: SeriesInfo[]
  episodes: Record<string, SeriesEpisode[]>
}

let cache: Promise<SeriesFile> | null = null

/** Nạp một lần rồi dùng lại. Chưa dựng dữ liệu thì trả về bộ rỗng thay vì làm vỡ giao diện. */
export function loadSeries(): Promise<SeriesFile> {
  if (!cache) {
    cache = import('../data/series.json')
      .then((m) => (m.default ?? m) as unknown as SeriesFile)
      .catch(() => ({ generatedAt: '', note: '', series: [], episodes: {} }))
  }
  return cache
}

export function seasonLabel(n: number): string {
  return n <= 1 ? 'Phần 1' : `Phần ${n}`
}

/**
 * Tên tập trên YouTube rất nhiễu: "ENG SUB | 《神印王座》Throne of Seal EP27 | 腾讯视频 - 动漫".
 * Bỏ nhãn phụ đề, số tập, tên kênh và CẢ TÊN BỘ (đã hiện ở đầu trang) — còn lại mới là mô tả
 * riêng của tập; không còn gì thì trả chuỗi rỗng để giao diện chỉ hiện "Tập N".
 */
export function cleanEpisodeTitle(title: string, series?: { cn?: string; en?: string }): string {
  let t = title
  t = t.replace(/\b(multi|eng|ind|thai|arab|vie|esp)[\s-]*sub\b/gi, '')
  t = t.replace(/\bEP\s*\.?\s*\d+/gi, '').replace(/第\s*\d+\s*集/g, '').replace(/#\s*\d+/g, '')
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '')
  if (series?.cn) t = t.split(series.cn).join('')
  if (series?.en) t = t.replace(new RegExp(series.en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
  // bỏ tên kênh và các mảnh rỗng sau khi cắt
  const parts = t
    .split('|')
    .map((x) => x.replace(/[《》【】\[\]()]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((x) => x.length > 1 && !/腾讯视频|优酷|YOUKU|bilibili|哔哩|动漫|Animation|Tencent|WeTV|Get the/i.test(x))
  return (parts[0] ?? '').replace(/^[\s\-–—·:,]+|[\s\-–—·:,]+$/g, '').trim()
}
