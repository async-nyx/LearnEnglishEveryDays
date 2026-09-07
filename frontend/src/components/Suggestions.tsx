import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { formatDuration, suggestFor, thumbnailOf } from '../lib/library'
import { useStore } from '../store/useStore'
import { Button } from './ui'

/**
 * Đề xuất do app tự chọn từ thư viện (cùng bậc, ưu tiên chưa xem), thay cho màn "video khác"
 * của YouTube. Hiện đè lên video khi phát hết.
 */
export function Suggestions({ currentId, onReplay }: { currentId: string; onReplay: () => void }) {
  const history = useStore((s) => s.history)
  const openLibraryVideo = useStore((s) => s.openLibraryVideo)
  const loadingId = useStore((s) => s.loadingVideoId)
  const setView = useStore((s) => s.setView)
  const seen = useMemo(() => new Set(history.map((h) => h.videoId)), [history])
  const items = useMemo(() => suggestFor(currentId, seen, 4), [currentId, seen])

  const open = (id: string) => void openLibraryVideo(id)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-10 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/70 to-black/40 p-4 text-white sm:p-5"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">Xem tiếp trong thư viện</div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onReplay} className="text-white hover:bg-white/10">
            
            Xem lại
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setView('library')} className="text-white hover:bg-white/10">
            Cả thư viện
          </Button>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((v) => (
          <li key={v.id} className="min-w-0">
            <button onClick={() => open(v.id)} disabled={loadingId !== null} className="press group flex w-full flex-col text-left disabled:opacity-70">
              <span className="relative block aspect-video w-full overflow-hidden rounded-lg bg-white/10">
                <img src={thumbnailOf(v.id)} alt="" className={loadingId === v.id ? 'h-full w-full object-cover blur-[2px] brightness-75' : 'h-full w-full object-cover'} loading="lazy" />
                {loadingId === v.id && (
                  <span className="absolute inset-0 grid place-items-center">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  </span>
                )}
                <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1 font-mono text-[10px]">{v.level}</span>
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1 font-mono text-[10px]">{formatDuration(v.duration)}</span>
              </span>
              <span className="mt-1.5 line-clamp-2 text-[12px] font-medium leading-snug">{v.title}</span>
              <span className="truncate text-[11px] text-white/60">{v.channel}</span>
            </button>
          </li>
        ))}
      </ul>
    </motion.div>
  )
}
