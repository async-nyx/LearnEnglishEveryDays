import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { searchVideos, type SearchVideo } from '../lib/api'
import { useStore } from '../store/useStore'
import { Button, cx } from './ui'

const SUGGEST_EN = ['TED-Ed animation', 'BBC 6 Minute English', 'easy English conversation', 'Kurzgesagt', 'slow news English']
const SUGGEST_ZH = ['HSK 1 听力', '小猪佩奇 中文', '慢速中文 对话', '中文 动画 字幕', 'TeaTime Chinese']

/**
 * Tìm video trên YouTube ngay trong app: gõ từ khoá, hiện kết quả thật kèm liên kết YouTube,
 * bấm một thẻ là app kéo phụ đề về và nhúng video đó vào trình phát.
 */
export function YoutubeSearch() {
  const lang = useStore((s) => s.libraryLang)
  const openLibraryVideo = useStore((s) => s.openLibraryVideo)
  const loadingId = useStore((s) => s.loadingVideoId)
  const toast = useStore((s) => s.toast)

  const [q, setQ] = useState('')
  const [ccOnly, setCcOnly] = useState(true)
  const [items, setItems] = useState<SearchVideo[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const run = async (query: string) => {
    const text = query.trim()
    if (!text || busy) return
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setBusy(true)
    setErr(null)
    try {
      setItems(await searchVideos(text, ccOnly, ctrl.signal))
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setErr((e as Error).message)
        setItems([])
      }
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => () => abort.current?.abort(), [])

  const suggests = lang === 'zh' ? SUGGEST_ZH : SUGGEST_EN

  return (
    <section className="rounded-2xl bg-mat p-4 hairline">
      <h3 className="text-[17px] font-semibold tracking-tight">Tìm trên YouTube</h3>
      <p className="mt-0.5 text-[13px] text-chu-mo">Gõ từ khoá bất kỳ. Bấm một kết quả là app lấy phụ đề và mở video ngay tại đây.</p>

      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void run(q)
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={lang === 'zh' ? 'Ví dụ: HSK 2 听力, 小猪佩奇 中文…' : 'Ví dụ: TED-Ed, easy English conversation…'}
          spellCheck={false}
          className="h-10 min-w-[220px] flex-1 rounded-xl border border-vien bg-nen px-3 text-sm text-chu placeholder:text-chu-mo-hon focus:border-chu-mo-hon focus:outline-none"
        />
        <Button type="submit" variant="primary" disabled={!q.trim() || busy}>
          {busy ? 'Đang tìm…' : 'Tìm'}
        </Button>
        <button
          type="button"
          onClick={() => setCcOnly((v) => !v)}
          aria-pressed={ccOnly}
          title="Chỉ hiện video YouTube đánh dấu là có phụ đề"
          className={cx('press h-10 rounded-xl px-3 text-[13px] font-medium hairline', ccOnly ? 'border-nhan/40 bg-nhan-nhat text-nhan-van' : 'bg-nen text-chu-nhat hover:text-chu')}
        >
          Chỉ video có phụ đề
        </button>
      </form>

      {items === null && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-chu-mo-hon">Gợi ý:</span>
          {suggests.map((s) => (
            <button
              key={s}
              onClick={() => {
                setQ(s)
                void run(s)
              }}
              className="press rounded-lg bg-nen px-2.5 py-1 text-[12.5px] text-chu-nhat hairline hover:text-chu"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {busy && (
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="skeleton h-[168px] rounded-2xl" />
          ))}
        </div>
      )}

      {err && <p className="mt-3 text-sm text-sai">Không tìm được: {err}</p>}
      {items && items.length === 0 && !err && <p className="mt-3 text-sm text-chu-mo-hon">Không có kết quả nào.</p>}

      <AnimatePresence>
        {items && items.length > 0 && !busy && (
          <motion.ul
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {items.map((v) => {
              const busyThis = loadingId === v.id
              return (
                <li key={v.id} className="min-w-0">
                  <div
                    className={cx(
                      'group grid min-w-0 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl bg-nen hairline transition-colors hover:border-chu-mo-hon',
                      loadingId !== null && !busyThis && 'opacity-60',
                    )}
                  >
                    <button
                      onClick={() => {
                        if (loadingId) return
                        toast(`Đang mở “${v.title.slice(0, 30)}…”`)
                        void openLibraryVideo(v.id)
                      }}
                      disabled={loadingId !== null}
                      className="press relative block aspect-video w-full overflow-hidden bg-mat-noi text-left"
                    >
                      <img src={v.thumbnail} alt="" className={cx('h-full w-full object-cover transition-all duration-300', busyThis ? 'scale-105 blur-[2px] brightness-75' : 'group-hover:scale-[1.03]')} loading="lazy" />
                      <span className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/70 to-transparent" />
                      {v.duration && <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">{v.duration}</span>}
                      <span className="absolute bottom-2 left-2 max-w-[70%] truncate text-[11px] font-medium text-white/90">{v.channel}</span>
                      {busyThis ? (
                        <span className="absolute inset-0 grid place-items-center">
                          <span className="flex flex-col items-center gap-2 rounded-xl bg-black/55 px-4 py-3 text-white backdrop-blur-sm">
                            <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            <span className="text-[12px] font-medium">Đang lấy phụ đề…</span>
                          </span>
                        </span>
                      ) : (
                        <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/25 group-hover:opacity-100">
                          <span className="rounded-full bg-nhan px-4 py-2 text-[13px] font-semibold text-nhan-chu shadow-soft">Mở trong app</span>
                        </span>
                      )}
                    </button>
                    <div className="grid min-w-0 gap-1 p-3">
                      <span className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-chu">{v.title}</span>
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="truncate font-mono text-[11px] text-nhan-van underline-offset-2 hover:underline"
                        title={v.url}
                      >
                        {v.url}
                      </a>
                    </div>
                  </div>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  )
}
