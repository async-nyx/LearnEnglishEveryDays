import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  DayActivity,
  DictationEntry,
  HistoryItem,
  Settings,
  StudyMode,
  TranscriptData,
  View,
  VocabItem,
  VocabTab,
} from '../lib/types'
import { newSrs, rateSrs } from '../lib/srs'
import { fetchTranscript } from '../lib/api'
import { langOf, libraryItem, type Lang, type Level } from '../lib/library'
import { uid } from '../lib/text'

export interface Toast {
  id: string
  text: string
  kind: 'ok' | 'bad' | 'info'
}

interface State {
  // dữ liệu video
  transcripts: Record<string, TranscriptData>
  currentVideoId: string | null
  history: HistoryItem[]
  loading: boolean
  error: string | null

  // điều hướng
  view: View
  studyMode: StudyMode
  vocabTab: VocabTab

  // cài đặt
  settings: Settings

  // từ vựng
  vocab: VocabItem[]

  // chép chính tả: videoId -> sentenceId -> bài gõ / số từ đã lộ / đúng chưa
  dictation: Record<string, Record<number, DictationEntry>>
  // ảnh từ vựng có thật trên máy chủ (không lưu)
  imageSlugs: Set<string>
  setImageSlugs: (slugs: string[]) => void
  // tiến độ nói theo: videoId -> sentenceId -> điểm tốt nhất
  shadowing: Record<string, Record<number, number>>

  toasts: Toast[]
  /** nhật ký hoạt động theo ngày (Tiến trình) */
  activity: Record<string, DayActivity>
  bump: (key: keyof DayActivity, n?: number) => void

  // hành động
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  setTranscript: (data: TranscriptData) => void
  openVideo: (videoId: string) => void
  closeVideo: () => void
  removeHistory: (videoId: string) => void
  setView: (v: View) => void
  setStudyMode: (m: StudyMode) => void
  setVocabTab: (t: VocabTab) => void
  updateSettings: (patch: Partial<Settings>) => void
  cycleTheme: () => void
  /** video đang được lấy phụ đề khi bấm từ thư viện/đề xuất (để thẻ hiện hoạt ảnh) */
  loadingVideoId: string | null
  openLibraryVideo: (id: string) => Promise<void>
  libraryLevel: 'all' | Level
  setLibraryLevel: (l: 'all' | Level) => void
  libraryLang: Lang
  setLibraryLang: (l: Lang) => void
  addVocab: (item: Omit<VocabItem, 'id' | 'createdAt' | 'srs'>) => VocabItem
  removeVocab: (id: string) => void
  updateVocab: (id: string, patch: Partial<VocabItem>) => void
  rateVocab: (id: string, remembered: boolean) => void
  setDictation: (videoId: string, sentenceId: number, patch: Partial<DictationEntry>) => void
  resetDictation: (videoId: string) => void
  setShadowScore: (videoId: string, sentenceId: number, score: number) => void
  toast: (text: string, kind?: Toast['kind']) => void
  dismissToast: (id: string) => void
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  sidebarCollapsed: false,
  aiProvider: 'gemini',
  aiKey: '',
  embedHost: 'youtube',
  fontSize: 17,
  autoScroll: true,
  playbackRate: 1,
  showTranslation: false,
  sentenceMode: true,
}

const MAX_CACHE = 12

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      transcripts: {},
      currentVideoId: null,
      history: [],
      loading: false,
      error: null,
      view: 'study',
      studyMode: 'read',
      vocabTab: 'list',
      settings: DEFAULT_SETTINGS,
      vocab: [],
      dictation: {},
      shadowing: {},
      imageSlugs: new Set<string>(),
      toasts: [],
      activity: {},
      bump: (key, n = 1) => {
        const d = new Date()
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const cur = get().activity[k] ?? { opened: 0, dictOk: 0, shadow: 0, words: 0 }
        set({ activity: { ...get().activity, [k]: { ...cur, [key]: cur[key] + n } } })
      },
      setImageSlugs: (slugs) => set({ imageSlugs: new Set(slugs) }),

      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),

      setTranscript: (data) => {
        const { transcripts, history } = get()
        const next = { ...transcripts, [data.video_id]: data }
        // giới hạn bộ đệm: bỏ video cũ nhất không nằm trong lịch sử gần đây
        const ids = Object.keys(next)
        if (ids.length > MAX_CACHE) {
          const order = history.map((h) => h.videoId)
          const victim = ids
            .filter((id) => id !== data.video_id)
            .sort((a, b) => (order.indexOf(b) === -1 ? -1 : order.indexOf(a) - order.indexOf(b)))
            .at(-1)
          if (victim) delete next[victim]
        }
        const entry: HistoryItem = {
          videoId: data.video_id,
          title: data.title || `Video ${data.video_id}`,
          author: data.author || '',
          thumbnail: data.thumbnail || `https://i.ytimg.com/vi/${data.video_id}/hqdefault.jpg`,
          segmentCount: data.segment_count,
          lastOpened: Date.now(),
        }
        if (!history.some((h) => h.videoId === data.video_id)) get().bump('opened')
        set({
          transcripts: next,
          currentVideoId: data.video_id,
          history: [entry, ...history.filter((h) => h.videoId !== data.video_id)].slice(0, 30),
          error: null,
          view: 'study',
        })
      },

      openVideo: (videoId) => {
        const { history } = get()
        const h = history.find((x) => x.videoId === videoId)
        set({
          currentVideoId: videoId,
          view: 'study',
          history: h
            ? [{ ...h, lastOpened: Date.now() }, ...history.filter((x) => x.videoId !== videoId)]
            : history,
        })
      },

      closeVideo: () => set({ currentVideoId: null }),

      removeHistory: (videoId) => {
        const { history, transcripts, currentVideoId } = get()
        const next = { ...transcripts }
        delete next[videoId]
        set({
          history: history.filter((h) => h.videoId !== videoId),
          transcripts: next,
          currentVideoId: currentVideoId === videoId ? null : currentVideoId,
        })
      },

      setView: (view) => set({ view }),
      setStudyMode: (studyMode) => set({ studyMode }),
      setVocabTab: (vocabTab) => set({ vocabTab }),
      updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
      cycleTheme: () => set({ settings: { ...get().settings, theme: get().settings.theme === 'dark' ? 'light' : 'dark' } }),
      loadingVideoId: null,
      libraryLevel: 'all',
      setLibraryLevel: (libraryLevel) => set({ libraryLevel }),
      libraryLang: 'en',
      setLibraryLang: (libraryLang) => set({ libraryLang, libraryLevel: 'all' }),
      openLibraryVideo: async (id) => {
        const { transcripts, openVideo, setTranscript, toast, loadingVideoId } = get()
        if (loadingVideoId) return
        if (transcripts[id]) {
          openVideo(id)
          return
        }
        set({ loadingVideoId: id, loading: true })
        try {
          // video tiếng Trung: xin đúng phụ đề tiếng Trung, không thì máy chủ trả bản tiếng Anh
          const item = libraryItem(id)
          // video ngoài thư viện (đề xuất YouTube): đoán theo video đang xem, để chuỗi video tiếng
          // Trung không rơi về phụ đề tiếng Anh
          const cur = get().currentVideoId ? libraryItem(get().currentVideoId as string) : undefined
          const zh = item ? langOf(item) === 'zh' : cur ? langOf(cur) === 'zh' : false
          const languages = zh ? ['zh-Hans', 'zh-CN', 'zh', 'zh-Hant', 'zh-TW', 'zh-HK'] : undefined
          setTranscript(await fetchTranscript(id, languages))
        } catch (e) {
          toast(`Không lấy được phụ đề: ${(e as Error).message}`, 'bad')
        } finally {
          set({ loadingVideoId: null, loading: false })
        }
      },

      addVocab: (item) => {
        const existing = get().vocab.find(
          (v) => v.lemma === item.lemma && v.videoId === item.videoId && v.example === item.example,
        )
        if (existing) return existing
        const full: VocabItem = { ...item, id: uid(), createdAt: Date.now(), srs: newSrs() }
        set({ vocab: [full, ...get().vocab] })
        get().bump('words')
        return full
      },
      removeVocab: (id) => set({ vocab: get().vocab.filter((v) => v.id !== id) }),
      updateVocab: (id, patch) =>
        set({ vocab: get().vocab.map((v) => (v.id === id ? { ...v, ...patch } : v)) }),
      rateVocab: (id, remembered) =>
        set({
          vocab: get().vocab.map((v) => (v.id === id ? { ...v, srs: rateSrs(v.srs, remembered) } : v)),
        }),

      setDictation: (videoId, sentenceId, patch) => {
        const d = get().dictation
        const prev = d[videoId]?.[sentenceId] ?? { typed: '', shown: 0, ok: false }
        if (patch.ok && !prev.ok) get().bump('dictOk')
        set({ dictation: { ...d, [videoId]: { ...(d[videoId] ?? {}), [sentenceId]: { ...prev, ...patch } } } })
      },
      resetDictation: (videoId) => {
        const d = { ...get().dictation }
        delete d[videoId]
        set({ dictation: d })
      },
      setShadowScore: (videoId, sentenceId, score) => {
        const d = get().shadowing
        const prev = d[videoId]?.[sentenceId] ?? 0
        if (score >= 0.8 && prev < 0.8) get().bump('shadow')
        set({ shadowing: { ...d, [videoId]: { ...(d[videoId] ?? {}), [sentenceId]: Math.max(prev, score) } } })
      },

      toast: (text, kind = 'info') => {
        const id = uid()
        set({ toasts: [...get().toasts, { id, text, kind }] })
        setTimeout(() => get().dismissToast(id), 2600)
      },
      dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
    }),
    {
      name: 'subloop-v1',
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>
        const dictation: State['dictation'] = {}
        for (const [vid, rows] of Object.entries(p.dictation ?? {})) {
          dictation[vid] = {}
          for (const [id, v] of Object.entries(rows as Record<string, unknown>)) {
            dictation[vid][Number(id)] =
              typeof v === 'number' ? { typed: '', shown: 0, ok: v >= 0.999 } : (v as DictationEntry)
          }
        }
        const settings = { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) } as Settings
        if ((settings.theme as string) === 'system') settings.theme = 'light'
        return { ...current, ...p, dictation, settings }
      },
      partialize: (s) => ({
        transcripts: s.transcripts,
        currentVideoId: s.currentVideoId,
        history: s.history,
        settings: s.settings,
        vocab: s.vocab,
        dictation: s.dictation,
        shadowing: s.shadowing,
        studyMode: s.studyMode,
        vocabTab: s.vocabTab,
        libraryLevel: s.libraryLevel,
        libraryLang: s.libraryLang,
        activity: s.activity,
      }),
    },
  ),
)

export const selectCurrentTranscript = (s: State) =>
  s.currentVideoId ? s.transcripts[s.currentVideoId] ?? null : null
