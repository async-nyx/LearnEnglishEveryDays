import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Waveform } from '@phosphor-icons/react'
import { fetchTranscript } from '../lib/api'
import { useStore } from '../store/useStore'
import { Button, cx } from './ui'

export function TopBar() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const vocabCount = useStore((s) => s.vocab.length)
  const dueCount = useStore((s) => s.vocab.filter((v) => v.srs.due <= Date.now()).length)
  const history = useStore((s) => s.history)
  const openVideo = useStore((s) => s.openVideo)
  const removeHistory = useStore((s) => s.removeHistory)
  const currentVideoId = useStore((s) => s.currentVideoId)
  const loading = useStore((s) => s.loading)
  const setLoading = useStore((s) => s.setLoading)
  const setError = useStore((s) => s.setError)
  const setTranscript = useStore((s) => s.setTranscript)
  const transcripts = useStore((s) => s.transcripts)
  const toast = useStore((s) => s.toast)
  const theme = useStore((s) => s.settings.theme)
  const cycleTheme = useStore((s) => s.cycleTheme)

  const [url, setUrl] = useState('')
  const [histOpen, setHistOpen] = useState(false)
  const histRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!histOpen) return
    const onDown = (e: MouseEvent) => {
      if (histRef.current && !histRef.current.contains(e.target as Node)) setHistOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [histOpen])

  const submit = async () => {
    const u = url.trim()
    if (!u || loading) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchTranscript(u)
      setTranscript(data)
      setUrl('')
      toast(`Đã lấy ${data.segment_count} dòng phụ đề`, 'ok')
    } catch (e) {
      setError((e as Error).message)
      toast((e as Error).message, 'bad')
    } finally {
      setLoading(false)
    }
  }

  const onHistoryPick = (videoId: string) => {
    setHistOpen(false)
    if (transcripts[videoId]) {
      openVideo(videoId)
    } else {
      setUrl(videoId)
      setLoading(true)
      fetchTranscript(videoId)
        .then((d) => {
          setTranscript(d)
          setUrl('')
        })
        .catch((e: Error) => toast(e.message, 'bad'))
        .finally(() => setLoading(false))
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-vien bg-nen/85 backdrop-blur-md lg:hidden">
      <div className="flex h-12 items-center gap-2 px-3 sm:px-6">
        <button
          onClick={() => setView('study')}
          className="flex shrink-0 items-center gap-2 text-chu"
          aria-label="Subloop"
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-nhan text-nhan-chu">
            <Waveform size={16} weight="bold" />
          </span>
          <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">Subloop</span>
        </button>

        <form
          className="relative flex min-w-0 flex-1 items-center"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Dán liên kết YouTube hoặc mã video…"
            className="h-9 w-full rounded-xl border border-vien bg-mat pl-3 pr-14 text-sm text-chu placeholder:text-chu-mo-hon focus:border-chu-mo-hon focus:outline-none"
            spellCheck={false}
            autoComplete="off"
          />
          <Button
            type="submit"
            size="sm"
            variant="primary"
            className="absolute right-1.5"
            disabled={!url.trim() || loading}
          >
            {loading ? 'Đang…' : 'Lấy'}
          </Button>
        </form>

        <Button
          size="icon"
          variant="ghost"
          onClick={cycleTheme}
          aria-label="Đổi giao diện sáng/tối"
          title={theme === 'light' ? 'Chuyển sang tối' : 'Chuyển sang sáng'}
          className="shrink-0 sm:w-auto sm:gap-1.5 sm:px-2.5"
        >
          <span className="text-[13px] font-medium">{theme === 'light' ? 'Sáng' : 'Tối'}</span>
        </Button>
      </div>
      <nav className="flex h-10 items-center gap-1 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
        <div className="relative shrink-0" ref={histRef}>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Video gần đây"
            onClick={() => setHistOpen((v) => !v)}
            className={cx("shrink-0 whitespace-nowrap", histOpen && "bg-mat-noi text-chu")}
          >
            Gần đây
          </Button>
          <AnimatePresence>
            {histOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className="glass absolute right-0 top-11 w-[min(380px,calc(100vw-2rem))] rounded-2xl p-2 shadow-soft"
              >
                <div className="px-2 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-chu-mo-hon">Gần đây</div>
                {history.length === 0 && <div className="px-2 pb-2 text-sm text-chu-mo">Chưa có video nào.</div>}
                <ul className="max-h-[60vh] overflow-y-auto">
                  {history.map((h) => (
                    <li key={h.videoId} className="group flex items-center gap-2 rounded-xl p-1.5 hover:bg-mat-noi">
                      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onHistoryPick(h.videoId)}>
                        <img src={h.thumbnail} alt="" className="h-10 w-[68px] shrink-0 rounded-md object-cover" loading="lazy" />
                        <span className="min-w-0">
                          <span className={cx('block truncate text-sm', h.videoId === currentVideoId ? 'text-nhan-van' : 'text-chu')}>
                            {h.title}
                          </span>
                          <span className="block truncate text-xs text-chu-mo-hon">
                            {h.author || 'YouTube'} · {h.segmentCount} dòng
                          </span>
                        </span>
                      </button>
                      <button
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-chu-mo-hon opacity-0 transition-opacity hover:bg-vien hover:text-sai group-hover:opacity-100"
                        onClick={() => removeHistory(h.videoId)}
                        aria-label="Xoá khỏi lịch sử"
                      >
                        <span className="text-base leading-none">×</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>


          <NavBtn label="Học" active={view === 'study'} onClick={() => setView('study')}>
            Học
          </NavBtn>
          <NavBtn label="Đề xuất" active={view === 'discover'} onClick={() => setView('discover')}>
            Đề xuất
          </NavBtn>
          <NavBtn label="Thư viện" active={view === 'library'} onClick={() => setView('library')}>
            Thư viện
          </NavBtn>
          <NavBtn label="Bộ sưu tập" active={view === 'series'} onClick={() => setView('series')}>
            Bộ sưu tập
          </NavBtn>
          <NavBtn label="Tiến trình" active={view === 'progress'} onClick={() => setView('progress')}>
            Tiến trình
          </NavBtn>
          <NavBtn label="Từ vựng" active={view === 'vocab'} onClick={() => setView('vocab')}>
            Từ vựng
            {vocabCount > 0 && (
              <span className={cx('ml-1 rounded-md px-1.5 font-mono text-[11px]', dueCount > 0 ? 'bg-nhan/20 text-nhan-van' : 'bg-vien text-chu-nhat')}>
                {dueCount > 0 ? dueCount : vocabCount}
              </span>
            )}
          </NavBtn>
      </nav>
    </header>
  )
}

function NavBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cx(
        'press inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-medium sm:px-3',
        active ? 'bg-vien text-chu' : 'text-chu-mo hover:text-chu',
      )}
    >
      <span>{children}</span>
    </button>
  )
}
