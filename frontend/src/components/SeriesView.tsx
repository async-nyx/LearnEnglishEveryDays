import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { formatDuration, thumbnailOf } from '../lib/library'
import { cleanEpisodeTitle, loadSeries, seasonLabel, type SeriesEpisode, type SeriesFile, type SeriesInfo } from '../lib/series'
import { translateSentence } from '../lib/api'
import { useStore } from '../store/useStore'
import { Button, EmptyState, cx } from './ui'

/**
 * BỘ SƯU TẬP — mỗi phim là một thẻ, bấm vào ra danh sách TẤT CẢ các tập (tập 1 → tập mới nhất),
 * chia theo phần. Bấm một tập là nạp phụ đề tiếng Trung của tập đó và chuyển sang tab Học.
 */
export function SeriesView() {
  const [file, setFile] = useState<SeriesFile | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [season, setSeason] = useState<number | null>(null)
  const [q, setQ] = useState('')
  // dịch tên tập sang tiếng Việt — chỉ chạy khi người học bật, vì mỗi mùa là vài chục lời gọi
  const [viTitles, setViTitles] = useState<Record<string, string>>({})
  const [translating, setTranslating] = useState(false)
  const history = useStore((s) => s.history)
  const open = useStore((s) => s.openLibraryVideo)
  const loadingId = useStore((s) => s.loadingVideoId)

  useEffect(() => {
    let alive = true
    void loadSeries().then((f) => alive && setFile(f))
    return () => {
      alive = false
    }
  }, [])

  const seen = useMemo(() => new Set(history.map((h) => h.videoId)), [history])
  const current = file?.series.find((s) => s.id === openId) ?? null
  const episodes = current ? (file?.episodes[current.id] ?? []) : []
  const seasons = current?.seasons ?? []
  const activeSeason = season ?? seasons[0]?.season ?? 1

  const shown = useMemo(() => {
    const list = episodes.filter((e) => (seasons.length > 1 ? e.season === activeSeason : true))
    const needle = q.trim()
    if (!needle) return list
    const asNumber = Number(needle)
    if (Number.isFinite(asNumber) && needle !== '') return list.filter((e) => String(e.ep).includes(needle))
    return list.filter((e) => e.title.toLowerCase().includes(needle.toLowerCase()))
  }, [episodes, seasons.length, activeSeason, q])

  if (!file) {
    return (
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <div className="skeleton h-8 w-48" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="skeleton aspect-[3/4] w-full rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  if (file.series.length === 0) {
    return (
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <EmptyState
          title="Chưa dựng bộ sưu tập"
          body="Chạy `py scripts/build_series.py` để lấy danh sách tập của từng phim từ YouTube."
        />
      </div>
    )
  }

  const totalEpisodes = file.series.reduce((n, s) => n + s.count, 0)

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <AnimatePresence mode="wait">
        {!current ? (
          <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <header>
              <h2 className="text-[26px] font-semibold tracking-tight">Bộ sưu tập</h2>
              <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-chu-mo">
                {file.series.length} bộ hoạt hình tiên hiệp · tu tiên, {totalEpisodes} tập từ tập 1 tới tập mới nhất. Bấm một bộ để xem danh sách tập; mỗi tập
                mở kèm phụ đề tiếng Trung để đọc, chép chính tả và tra từ.
              </p>
            </header>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {file.series.map((s) => (
                <SeriesCard
                  key={s.id}
                  info={s}
                  watched={(file.episodes[s.id] ?? []).filter((e) => seen.has(e.id)).length}
                  onOpen={() => {
                    setOpenId(s.id)
                    setSeason(null)
                    setQ('')
                  }}
                />
              ))}
            </div>
            <p className="mt-6 text-[11.5px] leading-relaxed text-chu-mo-hon">{file.note}</p>
          </motion.div>
        ) : (
          <motion.div key="detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <div className="flex flex-wrap items-start gap-4">
              <img src={thumbnailOf(current.poster, 'hq')} alt="" className="h-24 w-40 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <button onClick={() => setOpenId(null)} className="press mb-1 text-[13px] font-medium text-chu-mo hover:text-chu">
                  ‹ Tất cả bộ phim
                </button>
                <h2 className="text-[24px] font-semibold leading-tight tracking-tight">{current.vi}</h2>
                <p className="mt-0.5 text-sm text-chu-mo">
                  {current.cn} · {current.en} · {current.count} tập · bậc {current.level}
                </p>
                <p className="mt-1 max-w-[68ch] text-[13.5px] leading-relaxed text-chu-mo">{current.blurb}</p>
              </div>
              <Button
                variant={translating ? 'outline' : 'subtle'}
                onClick={() => {
                  if (translating) return
                  setTranslating(true)
                  void (async () => {
                    for (const e of shown) {
                      if (viTitles[e.id]) continue
                      const name = cleanEpisodeTitle(e.title, current)
                      if (!name) continue
                      try {
                        const r = await translateSentence(name)
                        setViTitles((m) => ({ ...m, [e.id]: r.text }))
                      } catch {
                        /* bỏ qua tập lỗi */
                      }
                    }
                    setTranslating(false)
                  })()
                }}
              >
                {translating ? 'Đang dịch tên tập…' : 'Dịch tên tập'}
              </Button>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tới tập số…"
                className="h-10 w-40 rounded-xl border border-vien bg-nen px-3 text-sm text-chu placeholder:text-chu-mo-hon focus:border-chu-mo-hon focus:outline-none"
              />
            </div>

            {seasons.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {seasons.map((s) => (
                  <Button
                    key={s.season}
                    variant={s.season === activeSeason ? 'outline' : 'subtle'}
                    onClick={() => setSeason(s.season)}
                    className={cx(s.season === activeSeason && 'border-nhan/40 text-nhan-van')}
                  >
                    {seasonLabel(s.season)} · {s.count} tập
                  </Button>
                ))}
              </div>
            )}

            <ol className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {shown.map((e) => (
                <EpisodeRow key={e.id} ep={e} series={current} vi={viTitles[e.id]} watched={seen.has(e.id)} busy={loadingId === e.id} locked={loadingId !== null} onOpen={() => void open(e.id, 'zh')} />
              ))}
            </ol>
            {shown.length === 0 && <p className="mt-6 text-sm text-chu-mo">Không có tập nào khớp “{q}”.</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SeriesCard({ info, watched, onOpen }: { info: SeriesInfo; watched: number; onOpen: () => void }) {
  const pct = info.count ? Math.round((watched / info.count) * 100) : 0
  return (
    <button
      onClick={onOpen}
      className="press group grid w-full min-w-0 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl bg-mat text-left hairline shadow-soft transition-colors hover:border-chu-mo-hon"
    >
      <span className="relative block aspect-video w-full overflow-hidden bg-mat-noi">
        <img src={thumbnailOf(info.poster, 'hq')} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
        <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/75 to-transparent" />
        <span className="absolute left-2 top-2 rounded-md bg-nen/90 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-chu">{info.level}</span>
        <span className="absolute bottom-2 left-2 right-2 truncate text-[13px] font-semibold text-white">{info.cn}</span>
      </span>
      <span className="grid gap-1 p-3">
        <span className="truncate text-[15px] font-semibold tracking-tight text-chu">{info.vi}</span>
        <span className="text-[12px] text-chu-mo">
          {info.count} tập{info.seasons.length > 1 ? ` · ${info.seasons.length} phần` : ''}
          {watched > 0 && ` · đã xem ${watched}`}
        </span>
        <span className="line-clamp-2 text-[12.5px] leading-relaxed text-chu-mo-hon">{info.blurb}</span>
        {watched > 0 && (
          <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-mat-noi">
            <span className="block h-full rounded-full bg-nhan" style={{ width: `${pct}%` }} />
          </span>
        )}
      </span>
    </button>
  )
}

function EpisodeRow({
  ep,
  series,
  vi,
  watched,
  busy,
  locked,
  onOpen,
}: {
  ep: SeriesEpisode
  series: SeriesInfo
  /** tên tập đã dịch (nếu người học bấm "Dịch tên tập") */
  vi?: string
  watched: boolean
  busy: boolean
  locked: boolean
  onOpen: () => void
}) {
  const sub = cleanEpisodeTitle(ep.title, series)
  return (
    <li>
      <button
        onClick={onOpen}
        disabled={locked}
        className={cx(
          'press group grid w-full grid-cols-[minmax(0,1fr)] overflow-hidden rounded-xl bg-mat text-left hairline transition-colors hover:border-chu-mo-hon',
          locked && !busy && 'opacity-60',
          busy && 'border-nhan/60',
        )}
      >
        <span className="relative block aspect-video w-full overflow-hidden bg-mat-noi">
          <img
            src={thumbnailOf(ep.id)}
            alt=""
            loading="lazy"
            className={cx(
              'h-full w-full object-cover transition-all duration-300',
              busy ? 'scale-105 blur-[2px] brightness-75' : 'group-hover:scale-[1.04]',
              watched && 'opacity-60',
            )}
          />
          <span className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/75 to-transparent" />
          <span className="absolute left-1.5 top-1.5 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">
            Tập {ep.ep}
          </span>
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1 font-mono text-[10.5px] text-white">
            {formatDuration(ep.duration)}
          </span>
          {watched && !busy && (
            <span className="absolute right-1.5 top-1.5 rounded-md bg-dung px-1.5 py-0.5 text-[10px] font-semibold text-white">Đã xem</span>
          )}
          {busy ? (
            <span className="absolute inset-0 grid place-items-center bg-black/45">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </span>
          ) : (
            <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
              <span className="rounded-full bg-nhan px-3 py-1.5 text-[12px] font-semibold text-nhan-chu shadow-soft">Học tập này</span>
            </span>
          )}
        </span>
        <span className="grid gap-0.5 px-2 py-1.5">
          <span className="truncate text-[12.5px] font-medium text-chu">{sub || `Tập ${ep.ep}`}</span>
          {vi && <span className="truncate text-[11.5px] text-chu-mo">{vi}</span>}
        </span>
      </button>
    </li>
  )
}
