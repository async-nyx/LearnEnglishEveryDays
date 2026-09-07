import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LANG_LABEL, LEVELS_OF, LEVEL_LABEL, LIBRARY_DATE, LIBRARY_NOTE, itemsOf, type Lang } from '../lib/library'
import { useStore } from '../store/useStore'
import { VideoCard } from './VideoCard'
import { VideoRow } from './VideoRow'
import { cx } from './ui'

const LEVEL_BLURB: Record<string, string> = {
  A1: 'Câu ngắn, nói chậm, chủ đề đời sống. Hợp để chép chính tả từ đầu.',
  A2: 'Hội thoại thường ngày, phỏng vấn đường phố, 6 Minute English.',
  B1: 'TED-Ed, tin tức chậm, lịch sử kể chuyện. Từ vựng rộng hơn.',
  B2: 'TED, Kurzgesagt, Vox. Tốc độ tự nhiên, lập luận dài.',
  C1: 'Diễn thuyết dài, kinh tế, triết học. Nhiều thành ngữ và ẩn dụ.',
  HSK1: 'Hoạt hình và câu rất ngắn, nói chậm. Bắt đầu từ đây.',
  HSK2: 'Hội thoại hằng ngày, kể chuyện chậm, chủ đề quen thuộc.',
  HSK3: 'Nghe hiểu đời sống, nhật ký, podcast cho người học.',
  HSK4: 'Podcast và phỏng vấn, tốc độ gần tự nhiên.',
  HSK5: 'Diễn thuyết và phóng sự, từ vựng rộng.',
  HSK6: 'Phỏng vấn chuyên sâu, lập luận dài.',
  'HSK7-9': 'Diễn thuyết học thuật, tốc độ và từ vựng như người bản ngữ.',
}

export function LibraryView() {
  const level = useStore((s) => s.libraryLevel)
  const setLevel = useStore((s) => s.setLibraryLevel)
  const lang = useStore((s) => s.libraryLang)
  const setLang = useStore((s) => s.setLibraryLang)
  const history = useStore((s) => s.history)
  const [q, setQ] = useState('')

  const items = useMemo(() => itemsOf(lang), [lang])
  const levels = LEVELS_OF[lang]
  const seen = useMemo(() => new Set(history.map((h) => h.videoId)), [history])
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length }
    for (const l of levels) c[l] = items.filter((v) => v.level === l).length
    return c
  }, [items, levels])
  const watchedByLevel = useMemo(() => {
    const c: Record<string, number> = {}
    for (const l of levels) c[l] = items.filter((v) => v.level === l && seen.has(v.id)).length
    return c
  }, [items, levels, seen])

  const needle = q.trim().toLowerCase()
  const list = useMemo(
    () =>
      items.filter(
        (v) =>
          (level === 'all' || v.level === level) &&
          (!needle || v.title.toLowerCase().includes(needle) || v.channel.toLowerCase().includes(needle) || v.topic.toLowerCase().includes(needle)),
      ),
    [items, level, needle],
  )

  const channels = useMemo(() => {
    const m = new Map<string, string>()
    for (const v of items) if (!m.has(v.channel)) m.set(v.channel, v.channelUrl)
    return Array.from(m.entries())
  }, [items])

  const total = useMemo(() => ({ en: itemsOf('en').length, zh: itemsOf('zh').length }), [])

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-6">
        <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-end">
          <div>
            <h2 className="text-[26px] font-semibold tracking-tight">Thư viện</h2>
            <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-chu-mo">
              {lang === 'en'
                ? `${total.en} video tiếng Anh từ TED, TED-Ed, BBC Learning English, Kurzgesagt, Vox và các kênh dạy tiếng Anh, xếp theo bậc A1–C1.`
                : `${total.zh} video tiếng Trung xếp theo HSK 1–9, ưu tiên hoạt hình và video nói chậm.`}{' '}
              Mỗi video đã kiểm tra là có phụ đề đúng tiếng.
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

        {/* chọn tiếng */}
        <div className="flex items-center gap-1 rounded-xl bg-mat p-1 hairline sm:w-fit">
          {(['en', 'zh'] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={cx('press h-9 flex-1 rounded-lg px-4 text-[13px] font-semibold sm:flex-none', lang === l ? 'bg-nhan text-nhan-chu' : 'text-chu-mo hover:text-chu')}
            >
              {LANG_LABEL[l]}
              <span className={cx('ml-1.5 font-mono text-[11px]', lang === l ? 'text-nhan-chu/70' : 'text-chu-mo-hon')}>{total[l]}</span>
            </button>
          ))}
        </div>

        {/* bậc */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          <LevelTile active={level === 'all'} onClick={() => setLevel('all')} code="Tất cả" name={`${counts.all} video`} progress={null} />
          {levels.map((l) => (
            <LevelTile
              key={l}
              active={level === l}
              onClick={() => setLevel(l)}
              code={l}
              name={LEVEL_LABEL[l]}
              progress={counts[l] ? watchedByLevel[l] / counts[l] : 0}
              hint={`${watchedByLevel[l]}/${counts[l]}`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {level === 'all' && !needle ? (
            <motion.div key={`rows-${lang}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-8">
              {levels.map((l, i) => (
                <VideoRow
                  key={l}
                  reverse={i % 2 === 1}
                  title={`${l} · ${LEVEL_LABEL[l]}`}
                  badge={<span className="rounded-md bg-mat-noi px-1.5 py-0.5 font-mono text-[11px] text-chu-mo">{counts[l]}</span>}
                  subtitle={LEVEL_BLURB[l]}
                  items={items.filter((v) => v.level === l)}
                  action={{ label: 'Xem dạng lưới', onClick: () => setLevel(l) }}
                />
              ))}
            </motion.div>
          ) : (
            <motion.div key={`grid-${lang}-${level}-${needle}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
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
            <span className="font-medium text-chu-nhat">Các kênh {LANG_LABEL[lang].toLowerCase()}:</span>
            {channels.map(([name, url]) => (
              <a
                key={name}
                href={url || `https://www.youtube.com/results?search_query=${encodeURIComponent(name)}`}
                target="_blank"
                rel="noreferrer"
                className="underline-offset-2 hover:text-chu hover:underline"
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
      className={cx('press flex flex-col gap-1.5 rounded-2xl px-3.5 py-3 text-left hairline transition-colors', active ? 'border-nhan/50 bg-nhan-nhat' : 'bg-mat hover:border-chu-mo-hon')}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className={cx('font-mono text-[15px] font-semibold', active ? 'text-nhan-van' : 'text-chu')}>{code}</span>
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
