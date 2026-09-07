import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LEVELS, LEVEL_LABEL, LIBRARY, LIBRARY_DATE, LIBRARY_NOTE, type Level } from '../lib/library'
import { useStore } from '../store/useStore'
import { VideoCard } from './VideoCard'
import { VideoRow } from './VideoRow'
import { cx } from './ui'

const LEVEL_BLURB: Record<Level, string> = {
  A1: 'Câu ngắn, nói chậm, chủ đề đời sống. Hợp để chép chính tả từ đầu.',
  A2: 'Hội thoại thường ngày, phỏng vấn đường phố, 6 Minute English.',
  B1: 'TED-Ed, tin tức chậm, lịch sử kể chuyện. Từ vựng rộng hơn.',
  B2: 'TED, Kurzgesagt, Vox. Tốc độ tự nhiên, lập luận dài.',
  C1: 'Diễn thuyết dài, kinh tế, triết học. Nhiều thành ngữ và ẩn dụ.',
}

export function LibraryView() {
  const level = useStore((s) => s.libraryLevel)
  const setLevel = useStore((s) => s.setLibraryLevel)
  const history = useStore((s) => s.history)
  const [q, setQ] = useState('')

  const seen = useMemo(() => new Set(history.map((h) => h.videoId)), [history])
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: LIBRARY.length }
    for (const l of LEVELS) c[l] = LIBRARY.filter((v) => v.level === l).length
    return c
  }, [])
  const watchedByLevel = useMemo(() => {
    const c: Record<string, number> = {}
    for (const l of LEVELS) c[l] = LIBRARY.filter((v) => v.level === l && seen.has(v.id)).length
    return c
  }, [seen])

  const needle = q.trim().toLowerCase()
  const matches = (v: (typeof LIBRARY)[number]) =>
    !needle || v.title.toLowerCase().includes(needle) || v.channel.toLowerCase().includes(needle) || v.topic.toLowerCase().includes(needle)

  const list = useMemo(() => LIBRARY.filter((v) => (level === 'all' || v.level === level) && matches(v)), [level, needle]) // eslint-disable-line react-hooks/exhaustive-deps

  const channels = useMemo(() => {
    const m = new Map<string, string>()
    for (const v of LIBRARY) if (!m.has(v.channel)) m.set(v.channel, v.channelUrl)
    return Array.from(m.entries())
  }, [])

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-6">
        {/* đầu trang */}
        <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-end">
          <div>
            <h2 className="text-[26px] font-semibold tracking-tight">Thư viện</h2>
            <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-chu-mo">
              {LIBRARY.length} video từ TED, TED-Ed, BBC Learning English, Kurzgesagt, Vox, Easy English và các kênh dạy tiếng Anh, xếp theo bậc A1–C1. Mỗi video đã kiểm tra có phụ đề tiếng Anh do người làm.
            </p>
          </div>
          <div className="relative flex items-center">
            
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm tiêu đề, kênh, chủ đề…"
              className="h-10 w-full rounded-xl border border-vien bg-mat pl-3 pr-9 text-sm placeholder:text-chu-mo-hon focus:border-chu-mo-hon focus:outline-none"
            />
            {q && (
              <button onClick={() => setQ('')} className="absolute right-2 grid h-6 w-6 place-items-center rounded-md text-chu-mo-hon hover:text-chu" aria-label="Xoá tìm">
                <span className="text-base leading-none">×</span>
              </button>
            )}
          </div>
        </header>

        {/* bậc: dải thẻ có tiến độ */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <LevelTile active={level === 'all'} onClick={() => setLevel('all')} code="Tất cả" name={`${counts.all} video`} progress={null} />
          {LEVELS.map((l) => (
            <LevelTile
              key={l}
              active={level === l}
              onClick={() => setLevel(l)}
              code={l}
              name={LEVEL_LABEL[l]}
              progress={counts[l] ? watchedByLevel[l] / counts[l] : 0}
              hint={`${watchedByLevel[l]}/${counts[l]} đã mở`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {level === 'all' && !needle ? (
            <motion.div key="rows" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-8">
              {LEVELS.map((l, i) => (
                <VideoRow
                  key={l}
                  reverse={i % 2 === 1}
                  title={`${l} · ${LEVEL_LABEL[l]}`}
                  badge={<span className="rounded-md bg-mat-noi px-1.5 py-0.5 font-mono text-[11px] text-chu-mo">{counts[l]}</span>}
                  subtitle={LEVEL_BLURB[l]}
                  items={LIBRARY.filter((v) => v.level === l)}
                  action={{ label: 'Xem dạng lưới', onClick: () => setLevel(l) }}
                />
              ))}
            </motion.div>
          ) : (
            <motion.div key={`grid-${level}-${needle}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {level !== 'all' && !needle && (
                <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight">
                      {level} · {LEVEL_LABEL[level]}
                    </h3>
                    <p className="text-sm text-chu-mo">{LEVEL_BLURB[level]}</p>
                  </div>
                  <span className="text-xs text-chu-mo-hon">
                    {list.length} video · đã mở {watchedByLevel[level]}
                  </span>
                </div>
              )}
              {needle && (
                <p className="mb-4 text-sm text-chu-mo">
                  {list.length} kết quả cho “{q}”{level !== 'all' ? ` trong bậc ${level}` : ''}
                </p>
              )}
              {list.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-vien p-8 text-sm text-chu-mo-hon">Không có video nào khớp.</div>
              ) : (
                <motion.ul
                  className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                  initial="hidden"
                  animate="show"
                  variants={{ show: { transition: { staggerChildren: 0.02 } } }}
                >
                  {list.map((v) => (
                    <motion.li key={v.id} variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }} className="min-w-0">
                      <VideoCard item={v} />
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="border-t border-vien pt-4 text-xs leading-relaxed text-chu-mo">
          <p className="max-w-[90ch]">
            {LIBRARY_NOTE} Danh sách dựng ngày {LIBRARY_DATE}.
          </p>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <span className="font-medium text-chu-nhat">Các kênh:</span>
            {channels.map(([name, url]) => (
              <a
                key={name}
                href={url || `https://www.youtube.com/results?search_query=${encodeURIComponent(name)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline-offset-2 hover:text-chu hover:underline"
              >
                {name}
                
              </a>
            ))}
          </p>
        </footer>
      </div>
    </div>
  )
}

function LevelTile({
  active,
  onClick,
  code,
  name,
  progress,
  hint,
}: {
  active: boolean
  onClick: () => void
  code: string
  name: string
  progress: number | null
  hint?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'press flex flex-col gap-1.5 rounded-2xl px-3.5 py-3 text-left hairline transition-colors',
        active ? 'border-nhan/50 bg-nhan-nhat' : 'bg-mat hover:border-chu-mo-hon',
      )}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className={cx('font-mono text-[17px] font-semibold', active ? 'text-nhan-van' : 'text-chu')}>{code}</span>
        {hint && <span className="text-[11px] text-chu-mo-hon">{hint}</span>}
      </span>
      <span className="truncate text-[12px] text-chu-mo">{name}</span>
      {progress !== null && (
        <span className="h-1 w-full overflow-hidden rounded-full bg-mat-noi">
          <span className="block h-full rounded-full bg-nhan transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      )}
    </button>
  )
}
