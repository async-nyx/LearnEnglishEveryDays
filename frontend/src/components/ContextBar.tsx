import { AnimatePresence, motion } from 'framer-motion'
import { LEVEL_LABEL, libraryItem } from '../lib/library'
import { selectCurrentTranscript, useStore } from '../store/useStore'
import { Button, cx } from './ui'

const MODE_LABEL = { read: 'Đọc', dictation: 'Chép chính tả', shadow: 'Nói theo', translate: 'Dịch' } as const
const TAB_LABEL = { list: 'Danh sách', flashcards: 'Thẻ lật', spelling: 'Chép từ', quiz: 'Trắc nghiệm' } as const

/** Thanh ngữ cảnh: bạn đang ở đâu (đường dẫn) + hành động của màn hiện tại. Kèm thanh tiến trình tải. */
export function ContextBar() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const data = useStore(selectCurrentTranscript)
  const mode = useStore((s) => s.studyMode)
  const setMode = useStore((s) => s.setStudyMode)
  const tab = useStore((s) => s.vocabTab)
  const setTab = useStore((s) => s.setVocabTab)
  const libraryLevel = useStore((s) => s.libraryLevel)
  const setLibraryLevel = useStore((s) => s.setLibraryLevel)
  const closeVideo = useStore((s) => s.closeVideo)
  const loading = useStore((s) => s.loading)

  const crumbs: { label: string; onClick?: () => void }[] = []
  let actions: React.ReactNode = null

  if (view === 'study') {
    crumbs.push({ label: 'Học', onClick: data ? () => closeVideo() : undefined })
    if (data) {
      const lib = libraryItem(data.video_id)
      crumbs.push({ label: data.title || data.video_id, onClick: mode !== 'read' ? () => setMode('read') : undefined })
      crumbs.push({ label: `${MODE_LABEL[mode]}${lib ? ` · ${lib.level}` : ''}` })
      actions = (
        <>
          <a
            href={`https://www.youtube.com/watch?v=${data.video_id}`}
            target="_blank"
            rel="noreferrer"
            className="press hidden h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-chu-mo hover:bg-mat-noi hover:text-chu sm:inline-flex"
          >
            
            Mở trên YouTube
          </a>
          <Button size="sm" variant="ghost" onClick={closeVideo} title="Về trang chủ">
            
            Đóng video
          </Button>
        </>
      )
    } else {
      crumbs.push({ label: 'Trang chủ' })
    }
  } else if (view === 'library') {
    crumbs.push({ label: 'Thư viện', onClick: libraryLevel !== 'all' ? () => setLibraryLevel('all') : undefined })
    crumbs.push({ label: libraryLevel === 'all' ? 'Tất cả bậc' : `${libraryLevel} · ${LEVEL_LABEL[libraryLevel]}` })
  } else if (view === 'discover') {
    crumbs.push({ label: 'Đề xuất' })
    crumbs.push({ label: 'Theo bậc bạn nghe nhiều nhất' })
    actions = (
      <Button size="sm" variant="ghost" onClick={() => setView('library')}>
        Cả thư viện
      </Button>
    )
  } else if (view === 'progress') {
    crumbs.push({ label: 'Tiến trình' })
    crumbs.push({ label: 'Trên máy này' })
  } else if (view === 'vocab') {
    crumbs.push({ label: 'Từ vựng', onClick: tab !== 'list' ? () => setTab('list') : undefined })
    crumbs.push({ label: TAB_LABEL[tab] })
  }

  return (
    <div className="sticky top-[5.5rem] z-20 border-b border-vien bg-nen/85 backdrop-blur-md lg:top-0">
      <div className="flex h-11 items-center gap-2 px-4 sm:px-6 lg:px-8">
        <nav aria-label="Vị trí" className="flex min-w-0 flex-1 items-center gap-1 text-[13px]">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1
            return (
              <span key={i} className={cx('flex min-w-0 items-center gap-1', last && 'min-w-0 flex-1', i > 0 && !last && 'hidden sm:flex')}>
                {i > 0 && <span className="shrink-0 text-chu-mo-hon">›</span>}
                {c.onClick ? (
                  <button onClick={c.onClick} className="press max-w-[28ch] truncate rounded-md px-1.5 py-0.5 text-chu-mo hover:bg-mat-noi hover:text-chu">
                    {c.label}
                  </button>
                ) : (
                  <span className={cx('truncate px-1.5 py-0.5', last ? 'font-semibold text-chu' : 'text-chu-mo')}>{c.label}</span>
                )}
              </span>
            )
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </div>
      {/* thanh tiến trình tải (vô định) */}
      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden">
            <motion.div
              className="h-full w-1/3 rounded-full bg-nhan"
              animate={{ x: ['-100%', '300%'] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
