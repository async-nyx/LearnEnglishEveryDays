import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { fetchRelated, type RelatedVideo } from '../lib/api'
import { LIBRARY, libraryItem, suggestFor, type LibraryItem } from '../lib/library'
import { shuffle } from '../lib/text'
import { useStore } from '../store/useStore'
import { VideoRow } from './VideoRow'
import { Button, cx } from './ui'

/**
 * Bảng "Video khác" dưới trình phát, MỞ SẴN. Nội dung là chính các video YouTube đề xuất cho video
 * đang xem (/api/related); bấm thẻ là app lấy phụ đề và chuyển sang video đó.
 * Thư viện chỉ hiện khi YouTube không trả về được (dự phòng).
 */
export function MoreVideos({ currentId }: { currentId: string }) {
  const [open, setOpen] = useState(true)
  const [related, setRelated] = useState<RelatedVideo[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const history = useStore((s) => s.history)
  const setView = useStore((s) => s.setView)
  const seen = useMemo(() => new Set(history.map((h) => h.videoId)), [history])
  const cur = libraryItem(currentId)

  useEffect(() => {
    setRelated(null)
    setErr(null)
    if (!open) return
    let alive = true
    fetchRelated(currentId)
      .then((items) => alive && setRelated(items))
      .catch((e: Error) => alive && setErr(e.message))
    return () => {
      alive = false
    }
  }, [open, currentId])

  const failed = !!err || related?.length === 0
  // dự phòng khi YouTube không trả về đề xuất
  const fallback = useMemo(() => {
    if (!failed) return [] as { key: string; title: string; subtitle: string; items: LibraryItem[] }[]
    const out: { key: string; title: string; subtitle: string; items: LibraryItem[] }[] = []
    const used = new Set<string>([currentId])
    const take = (list: LibraryItem[], n: number) => {
      const picked = list.filter((v) => !used.has(v.id)).slice(0, n)
      picked.forEach((v) => used.add(v.id))
      return picked
    }
    if (cur) {
      const sameChannel = take(shuffle(LIBRARY.filter((v) => v.channel === cur.channel)), 10)
      if (sameChannel.length) out.push({ key: 'channel', title: `Cùng kênh · ${cur.channel}`, subtitle: 'Trong thư viện', items: sameChannel })
    }
    const more = take(suggestFor(currentId, seen, 30), 12)
    if (more.length) out.push({ key: 'more', title: 'Gợi ý từ thư viện', subtitle: 'Ưu tiên video chưa xem', items: more })
    return out
  }, [failed, currentId, cur, seen])

  const skeletons = useMemo(() => Array.from({ length: 6 }).map((_, i) => <span key={i} className="skeleton h-[188px] w-[248px] shrink-0 rounded-2xl sm:w-[264px]" />), [])
  const cards = related?.map((v) => <RelatedCard key={v.id} item={v} />)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button variant={open ? 'outline' : 'subtle'} onClick={() => setOpen((v) => !v)} className={cx('flex-1', open && 'border-nhan/40 text-nhan-van')}>
          {open ? 'Ẩn video khác' : 'Video khác'}
        </Button>
        <Button variant="ghost" onClick={() => setView('library')}>
          Thư viện
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="panel" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="flex flex-col gap-5 rounded-2xl bg-mat p-3 hairline">
              {!failed && (
                <VideoRow
                  title="YouTube đề xuất"
                  subtitle="Cạnh video này trên YouTube. Bấm là mở ngay trong app, kèm phụ đề."
                  cards={cards ?? skeletons}
                  auto={!!cards}
                />
              )}
              {failed && (
                <p className="px-1 text-sm text-chu-mo">
                  YouTube không trả về đề xuất cho video này{err ? ` (${err})` : ''}. Tạm lấy từ thư viện.
                </p>
              )}
              {fallback.map((r) => (
                <VideoRow key={r.key} title={r.title} subtitle={r.subtitle} items={r.items} />
              ))}
              <p className="text-[11px] text-chu-mo-hon">Video đề xuất là của YouTube và thuộc kênh tương ứng; app chỉ nhúng qua trình phát chính thức. Video không có phụ đề sẽ báo lỗi khi mở.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Thẻ video YouTube đề xuất (không thuộc thư viện nên không có bậc). */
function RelatedCard({ item }: { item: RelatedVideo }) {
  const loadingId = useStore((s) => s.loadingVideoId)
  const open = useStore((s) => s.openLibraryVideo)
  const busy = loadingId === item.id
  return (
    <button
      onClick={() => void open(item.id)}
      disabled={loadingId !== null}
      className={cx(
        'press group grid w-[248px] shrink-0 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl bg-nen text-left hairline transition-colors hover:border-chu-mo-hon sm:w-[264px]',
        loadingId !== null && !busy && 'opacity-60',
      )}
    >
      <span className="relative block aspect-video w-full overflow-hidden bg-mat-noi">
        <img src={item.thumbnail} alt="" className={cx('h-full w-full object-cover transition-all duration-300', busy ? 'scale-105 blur-[2px] brightness-75' : 'group-hover:scale-[1.03]')} loading="lazy" />
        <span className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/70 to-transparent" />
        {item.duration && <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">{item.duration}</span>}
        <span className="absolute bottom-2 left-2 max-w-[70%] truncate text-[11px] font-medium text-white/90">{item.channel}</span>
        {busy && (
          <span className="absolute inset-0 grid place-items-center">
            <span className="flex flex-col items-center gap-2 rounded-xl bg-black/55 px-4 py-3 text-white backdrop-blur-sm">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span className="text-[12px] font-medium">Đang lấy phụ đề…</span>
            </span>
          </span>
        )}
        {!busy && (
          <span className="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition-opacity group-hover:bg-black/25 group-hover:opacity-100">
            <span className="rounded-full bg-nhan px-4 py-2 text-[13px] font-semibold text-nhan-chu shadow-soft">Mở trong app</span>
          </span>
        )}
      </span>
      <span className="grid min-w-0 gap-1 p-3">
        <span className="line-clamp-2 text-[14px] font-semibold leading-snug text-chu">{item.title}</span>
        <span className="truncate text-xs text-chu-mo">Nguồn: {item.channel || 'YouTube'} trên YouTube</span>
      </span>
    </button>
  )
}
