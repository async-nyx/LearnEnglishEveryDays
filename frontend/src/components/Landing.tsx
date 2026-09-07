import { useState } from 'react'
import { motion } from 'framer-motion'
import { fetchTranscript } from '../lib/api'
import { useStore } from '../store/useStore'
import { Button, SkeletonLines, cx } from './ui'

const STEPS = [
  { title: 'Đọc theo video', body: 'Phụ đề cuộn theo tiếng, bấm mốc giờ để nhảy, bấm từ để tra.' },
  { title: 'Chép chính tả', body: 'Nghe từng câu, gõ lại, máy tô đỏ chữ thiếu và chấm điểm.' },
  { title: 'Nói theo', body: 'Lặp câu, giảm tốc, ghi âm rồi so với bản gốc.' },
  { title: 'Ôn từ đã lưu', body: 'Thẻ lật theo lịch, chép từ, trắc nghiệm 4 đáp án.' },
]

export function Landing() {
  const history = useStore((s) => s.history)
  const transcripts = useStore((s) => s.transcripts)
  const openVideo = useStore((s) => s.openVideo)
  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)
  const setLoading = useStore((s) => s.setLoading)
  const setError = useStore((s) => s.setError)
  const setTranscript = useStore((s) => s.setTranscript)
  const vocabCount = useStore((s) => s.vocab.length)
  const setView = useStore((s) => s.setView)
  const [url, setUrl] = useState('')

  const submit = async () => {
    const u = url.trim()
    if (!u || loading) return
    setLoading(true)
    setError(null)
    try {
      setTranscript(await fetchTranscript(u))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const reopen = (videoId: string) => {
    if (transcripts[videoId]) openVideo(videoId)
    else {
      setUrl(videoId)
      setLoading(true)
      fetchTranscript(videoId)
        .then(setTranscript)
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false))
    }
  }

  return (
    <div className="w-full px-4 py-8 sm:px-6 lg:px-10 lg:py-14">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
        {/* trái: lời mở + ô nhập */}
        <div className="lg:pr-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 20 }}>
            <div className="inline-flex items-center gap-2 rounded-full bg-mat px-3 py-1 text-xs text-chu-mo hairline">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-nhan" />
              Không cần đăng nhập, dữ liệu nằm trong trình duyệt của bạn
            </div>
            <h1 className="mt-5 max-w-[20ch] text-3xl font-semibold leading-[1.1] tracking-tight text-chu sm:text-4xl lg:text-5xl">
              Biến bất kỳ video YouTube thành một buổi luyện nghe.
            </h1>
            <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-chu-mo sm:text-base">
              Dán liên kết, Subloop kéo phụ đề về rồi cho bạn đọc theo, chép chính tả, nói theo và lưu từ mới ngay khi gặp.
            </p>
          </motion.div>

          <motion.form
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.06 }}
            className="mt-8 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <label htmlFor="landing-url" className="text-xs font-medium text-chu-mo">
              Liên kết YouTube
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="landing-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                className={cx(
                  'h-12 flex-1 rounded-xl border bg-mat px-4 text-[15px] text-chu placeholder:text-chu-mo-hon focus:outline-none',
                  error ? 'border-sai/60' : 'border-vien focus:border-chu-mo-hon',
                )}
                spellCheck={false}
                autoComplete="off"
                autoFocus
              />
              <Button type="submit" size="lg" variant="primary" disabled={!url.trim() || loading} className="sm:w-44">
                {loading ? 'Đang lấy…' : 'Lấy phụ đề'}
              </Button>
            </div>
            <div className="min-h-5 text-sm">
              {error ? <span className="text-sai">{error}</span> : <span className="text-chu-mo-hon">Video cần có phụ đề (tự động cũng được). Ưu tiên phụ đề tiếng Anh.</span>}
            </div>
          </motion.form>

          {loading && (
            <div className="mt-6 rounded-2xl bg-mat p-5 hairline">
              <SkeletonLines n={5} />
            </div>
          )}

          <motion.ol
            className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2"
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } } }}
          >
            {STEPS.map((s, i) => (
              <motion.li key={s.title} variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }} className="flex gap-3">
                <div>
                  <div className="text-sm font-semibold text-chu">
                    <span className="mr-1.5 font-mono text-xs text-chu-mo-hon">0{i + 1}</span>
                    {s.title}
                  </div>
                  <div className="mt-0.5 text-sm leading-relaxed text-chu-mo">{s.body}</div>
                </div>
              </motion.li>
            ))}
          </motion.ol>
        </div>

        {/* phải: video gần đây + sổ từ */}
        <motion.aside initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.1 }} className="flex flex-col gap-6">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-chu">Video gần đây</h2>
              {history.length > 0 && <span className="font-mono text-xs text-chu-mo-hon">{history.length}</span>}
            </div>
            {history.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-vien p-5 text-sm text-chu-mo-hon">Video bạn đã mở sẽ hiện ở đây để quay lại nhanh.</div>
            ) : (
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {history.slice(0, 6).map((h) => (
                  <li key={h.videoId} className="min-w-0">
                    <button onClick={() => reopen(h.videoId)} className="press group flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-mat">
                      <span className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-mat-noi">
                        <img src={h.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-chu">{h.title}</span>
                        <span className="block truncate text-xs text-chu-mo-hon">
                          {h.author || 'YouTube'} · {h.segmentCount} dòng
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {vocabCount > 0 && (
            <button onClick={() => setView('vocab')} className="press flex items-center gap-3 rounded-2xl bg-mat p-4 text-left hairline hover:border-vien-manh">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-chu">Sổ từ có {vocabCount} từ</span>
                <span className="block text-xs text-chu-mo-hon">Ôn bằng thẻ lật, chép từ hoặc trắc nghiệm</span>
              </span>
              
            </button>
          )}
        </motion.aside>
      </div>
    </div>
  )
}
