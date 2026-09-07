import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { DictationView } from './components/DictationView'
import { Landing } from './components/Landing'
import { ShadowingView } from './components/ShadowingView'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { TranscriptView } from './components/TranscriptView'
import { VideoPane } from './components/VideoPane'
import { WordPopover } from './components/WordPopover'
import { Segmented, Toaster } from './components/ui'
import { VocabView } from './components/vocab/VocabView'
import { LibraryView } from './components/LibraryView'
import { DiscoverView } from './components/DiscoverView'
import { ContextBar } from './components/ContextBar'
import { ProgressView } from './components/ProgressView'
import { MoreVideos } from './components/MoreVideos'
import { useCurrentTranscript, useSentences } from './hooks/useTranscript'
import { fetchTranscript } from './lib/api'
import { loadImageSlugs } from './lib/images'
import type { StudyMode } from './lib/types'
import { usePlayer } from './store/usePlayer'
import { useStore } from './store/useStore'

export default function App() {
  const view = useStore((s) => s.view)
  const theme = useStore((s) => s.settings.theme)
  const collapsed = useStore((s) => s.settings.sidebarCollapsed)
  const data = useCurrentTranscript()
  const setImageSlugs = useStore((s) => s.setImageSlugs)

  useEffect(() => {
    loadImageSlugs().then(setImageSlugs)
  }, [setImageSlugs])

  // 'system' thì bỏ thuộc tính để prefers-color-scheme quyết định
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    const meta = document.querySelector('meta[name="theme-color"]')
    const dark = theme === 'dark'
    meta?.setAttribute('content', dark ? '#2b2426' : '#f8f2f4')
  }, [theme])

  return (
    <div className={collapsed ? 'flex min-h-[100dvh] flex-col lg:pl-[76px]' : 'flex min-h-[100dvh] flex-col lg:pl-[264px]'} style={{ transition: 'padding-left 220ms cubic-bezier(0.16,1,0.3,1)' }}>
      <Sidebar />
      <TopBar />
      <ContextBar />
      <main className="flex min-h-0 flex-1 flex-col">
        <AnimatePresence mode="wait">
          {view === 'progress' ? (
            <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
              <ProgressView />
            </motion.div>
          ) : view === 'discover' ? (
            <motion.div key="discover" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
              <DiscoverView />
            </motion.div>
          ) : view === 'library' ? (
            <motion.div key="library" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
              <LibraryView />
            </motion.div>
          ) : view === 'vocab' ? (
            <motion.div key="vocab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
              <VocabView />
            </motion.div>
          ) : data ? (
            <motion.div key="study" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="flex min-h-0 flex-1 flex-col">
              <Study />
            </motion.div>
          ) : (
            <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
              <Landing />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <WordPopover />
      <Toaster />
    </div>
  )
}

function Study() {
  const data = useCurrentTranscript()
  const externalVideoId = usePlayer((s) => s.externalVideoId)
  const setTranscript = useStore((s) => s.setTranscript)
  const setLoading = useStore((s) => s.setLoading)
  const toast = useStore((s) => s.toast)

  // người dùng bấm video đề xuất ngay trong trình phát -> kéo phụ đề video đó về và chuyển app sang nó
  useEffect(() => {
    if (!externalVideoId || externalVideoId === data?.video_id) return
    const id = externalVideoId
    setLoading(true)
    toast('Đang lấy phụ đề video vừa chọn…')
    fetchTranscript(id)
      .then((d) => setTranscript(d))
      .catch((e: Error) => toast(`Video vừa chọn: ${e.message}`, 'bad'))
      .finally(() => {
        setLoading(false)
        usePlayer.setState({ externalVideoId: null })
      })
  }, [externalVideoId, data?.video_id, setTranscript, setLoading, toast])
  const sentences = useSentences(data)
  const mode = useStore((s) => s.studyMode)
  const setMode = useStore((s) => s.setStudyMode)
  const dictation = useStore((s) => (data ? s.dictation[data.video_id] : undefined))
  const shadowing = useStore((s) => (data ? s.shadowing[data.video_id] : undefined))
  const toggle = usePlayer((s) => s.toggle)
  const seekTo = usePlayer((s) => s.seekTo)
  const embedHost = useStore((s) => s.settings.embedHost)

  // phím tắt toàn cục cho trình phát khi không gõ chữ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const { currentTime } = usePlayer.getState()
      if (e.key === ' ') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        seekTo(Math.max(0, currentTime - 5))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        seekTo(currentTime + 5)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, seekTo])

  if (!data) return null

  const dictDone = dictation ? Object.values(dictation).filter((v) => v.ok).length : 0
  const shadDone = shadowing ? Object.values(shadowing).filter((v) => v >= 0.8).length : 0

  return (
    <div className="grid w-full flex-1 grid-cols-[minmax(0,1fr)] gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,calc(60%-30px))_minmax(0,1fr)] lg:gap-8 lg:px-8">
      <div className="flex flex-col gap-4 lg:sticky lg:top-[3.75rem] lg:self-start">
        <VideoPane key={embedHost} data={data} />
        <Segmented<StudyMode>
          value={mode}
          onChange={setMode}
          className="w-full [&>button]:flex-1"
          options={[
            { value: 'read', label: 'Đọc'},
            {
              value: 'dictation',
              label: (
                <>
                  Chính tả
                  {dictDone > 0 && <span className="ml-1 font-mono text-[11px] text-chu-mo">{dictDone}/{sentences.length}</span>}
                </>
              ),
            },
            {
              value: 'shadow',
              label: (
                <>
                  Nói theo
                  {shadDone > 0 && <span className="ml-1 font-mono text-[11px] text-chu-mo">{shadDone}/{sentences.length}</span>}
                </>
              ),
            },
          ]}
        />
        <MoreVideos currentId={data.video_id} />
      </div>

      <section className="h-[70dvh] min-w-0 lg:h-[calc(100dvh-5.25rem)]">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode + data.video_id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="h-full"
          >
            {mode === 'read' && <TranscriptView data={data} sentences={sentences} />}
            {mode === 'dictation' && <DictationView data={data} sentences={sentences} />}
            {mode === 'shadow' && <ShadowingView data={data} sentences={sentences} />}
          </motion.div>
        </AnimatePresence>
      </section>
    </div>
  )
}
