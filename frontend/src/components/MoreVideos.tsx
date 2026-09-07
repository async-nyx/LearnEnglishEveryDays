import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LIBRARY, libraryItem, mostWatchedLevel, suggestFor, type LibraryItem } from '../lib/library'
import { shuffle } from '../lib/text'
import { useStore } from '../store/useStore'
import { VideoRow } from './VideoRow'
import { Button, cx } from './ui'

/**
 * Nút "Video khác" dưới trình phát: mở bảng gợi ý từ thư viện (cùng kênh, cùng bậc, theo bạn).
 * Bấm thẻ nào là app tự lấy phụ đề và chuyển sang video đó (qua store.openLibraryVideo trong VideoCard).
 */
export function MoreVideos({ currentId }: { currentId: string }) {
  const [open, setOpen] = useState(false)
  const history = useStore((s) => s.history)
  const setView = useStore((s) => s.setView)
  const seen = useMemo(() => new Set(history.map((h) => h.videoId)), [history])
  const cur = libraryItem(currentId)

  const rows = useMemo(() => {
    const out: { key: string; title: string; subtitle: string; items: LibraryItem[] }[] = []
    const used = new Set<string>([currentId])
    const take = (list: LibraryItem[], n: number) => {
      const picked = list.filter((v) => !used.has(v.id)).slice(0, n)
      picked.forEach((v) => used.add(v.id))
      return picked
    }
    if (cur) {
      const sameChannel = take(shuffle(LIBRARY.filter((v) => v.channel === cur.channel)), 10)
      if (sameChannel.length) out.push({ key: 'channel', title: `Cùng kênh · ${cur.channel}`, subtitle: 'Giọng và tốc độ quen tai', items: sameChannel })
      const sameLevel = take(shuffle(LIBRARY.filter((v) => v.level === cur.level)), 10)
      if (sameLevel.length) out.push({ key: 'level', title: `Cùng bậc · ${cur.level}`, subtitle: 'Độ khó tương đương video này', items: sameLevel })
    } else {
      const fav = mostWatchedLevel(history.map((h) => h.videoId))
      const lvl = take(shuffle(LIBRARY.filter((v) => v.level === fav.level)), 10)
      if (lvl.length) out.push({ key: 'fav', title: `Bậc ${fav.level}`, subtitle: fav.fromHistory ? 'Bậc bạn nghe nhiều nhất' : 'Bậc gợi ý khi chưa có lịch sử', items: lvl })
    }
    const more = take(suggestFor(currentId, seen, 30), 10)
    if (more.length) out.push({ key: 'more', title: 'Gợi ý cho bạn', subtitle: 'Ưu tiên video chưa xem', items: more })
    return out
  }, [currentId, cur, seen, history])

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
          <motion.div
            key="panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-5 rounded-2xl bg-mat p-3 hairline">
              {rows.length === 0 && <p className="text-sm text-chu-mo-hon">Thư viện chưa có video để gợi ý.</p>}
              {rows.map((r) => (
                <VideoRow key={r.key} title={r.title} subtitle={r.subtitle} items={r.items} auto={false} />
              ))}
              <p className="text-[11px] text-chu-mo-hon">Bấm một video là app tự lấy phụ đề và chuyển sang video đó. Nguồn ghi trên từng thẻ.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
