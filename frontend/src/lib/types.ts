import type { TransStyle } from './novel-style'
export interface Segment {
  start: number
  duration: number
  text: string
  timestamp: string
}

export interface AvailableTrack {
  code: string
  name: string
  generated: boolean
}

export interface TranscriptData {
  video_id: string
  title: string | null
  author: string | null
  thumbnail: string | null
  language: string | null
  language_code: string | null
  is_generated: boolean | null
  available: AvailableTrack[]
  segments: Segment[]
  segment_count: number
}

/** Một "câu" đã gộp từ nhiều dòng phụ đề, dùng cho chính tả / nói theo. */
export interface Sentence {
  id: number
  start: number
  end: number
  /** chỉ phần chữ Hán / tiếng gốc — pinyin và tiếng Anh in kèm đã được tách ra */
  text: string
  /** phiên âm có sẵn trong phụ đề (kênh in chung một dòng), nếu có */
  pinyin?: string
  /** bản tiếng Anh có sẵn trong phụ đề, nếu có */
  en?: string
  segIndexes: number[]
}

export interface DefinitionEntry {
  definition: string
  example?: string | null
}

export interface MeaningEntry {
  pos: string
  definitions: DefinitionEntry[]
  synonyms: string[]
}

export interface DefineResult {
  success: boolean
  word: string
  lemma: string
  found: boolean
  phonetic: string
  audio: string
  meanings: MeaningEntry[]
  source?: 'dictionaryapi' | 'wiktionary' | 'datamuse'
}

export interface TranslateResult {
  success: boolean
  text: string
  alternatives: { pos: string; terms: string[] }[]
  detected?: string
  error?: string
}

export interface SrsState {
  /** 0..5, hộp càng cao thì cách ôn càng xa */
  box: number
  /** mốc thời gian (ms) tới hạn ôn */
  due: number
  reps: number
  lapses: number
}

export interface VocabItem {
  id: string
  word: string
  lemma: string
  phonetic: string
  audio: string
  meaningVi: string
  definitionEn: string
  pos: string
  example: string
  videoId: string
  videoTitle: string
  start: number
  createdAt: number
  srs: SrsState
}

export interface HistoryItem {
  videoId: string
  title: string
  author: string
  thumbnail: string
  segmentCount: number
  lastOpened: number
}

/** Trạng thái một câu chép chính tả: bài gõ, số từ đã lộ, đã đúng chưa. */
export interface DictationEntry {
  typed: string
  shown: number
  ok: boolean
}

export type View = 'study' | 'discover' | 'library' | 'series' | 'vocab' | 'progress'
export type StudyMode = 'read' | 'dictation' | 'shadow' | 'translate'
export type VocabTab = 'list' | 'flashcards' | 'spelling' | 'quiz' | 'decks'

/** Hoạt động một ngày (khoá YYYY-MM-DD) để vẽ lịch và tính chuỗi ngày. */
export interface DayActivity {
  opened: number
  dictOk: number
  shadow: number
  words: number
}

export type Theme = 'light' | 'dark'

/** Máy chủ nhúng: youtube-nocookie.com là đường vòng khi tiện ích trình duyệt chặn www.youtube.com/embed */
export type EmbedHost = 'youtube' | 'nocookie'

export interface Settings {
  theme: Theme
  sidebarCollapsed: boolean
  /** AI dùng khoá của người dùng: chỉ lưu trên máy này */
  aiProvider: 'gemini' | 'grok'
  aiKey: string
  /** model AI người dùng chọn; rỗng = để app tự thử từ mới tới cũ */
  aiModel: string
  embedHost: EmbedHost
  fontSize: number
  autoScroll: boolean
  playbackRate: number
  /** chất lượng video mong muốn: "auto" hoặc mã của YouTube (hd1080, large…) */
  videoQuality: string
  showTranslation: boolean
  /** Lớp phụ đề ở CỘT ĐỌC bên phải. Người mới (HSK1) thường bật pinyin + tiếng Việt. */
  subLayers: { zh: boolean; pinyin: boolean; vi: boolean; en: boolean }
  /** Lớp phụ đề CHẠY TRÊN VIDEO — hoàn toàn tách khỏi cột đọc (USER yêu cầu nút riêng) */
  videoSubLayers: { zh: boolean; pinyin: boolean; vi: boolean; en: boolean }
  /** Phụ đề chạy ĐÈ TRÊN video, theo thời gian thật */
  videoSubs: boolean
  /** Cỡ chữ dòng chính của phụ đề trên video (px) */
  subFontSize: number
  /** Vị trí phụ đề trên video, theo % khung; null = mặc định dưới giữa */
  subPos: { x: number; y: number } | null
  /** Văn phong bản dịch: tự nhiên / truyện / cổ phong */
  transStyle: TransStyle
  /** Tiếng phụ đề ưu tiên khi video có nhiều track: tự đoán / luôn tiếng Trung / luôn tiếng Anh */
  preferSubLang: 'auto' | 'zh' | 'en'
  sentenceMode: boolean
}
