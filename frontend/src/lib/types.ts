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
  text: string
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

export type View = 'study' | 'discover' | 'library' | 'vocab' | 'progress'
export type StudyMode = 'read' | 'dictation' | 'shadow'
export type VocabTab = 'list' | 'flashcards' | 'spelling' | 'quiz'

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
  embedHost: EmbedHost
  fontSize: number
  autoScroll: boolean
  playbackRate: number
  showTranslation: boolean
  sentenceMode: boolean
}
