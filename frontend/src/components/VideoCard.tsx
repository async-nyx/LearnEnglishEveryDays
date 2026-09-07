import { motion } from 'framer-motion'
import { formatDuration, thumbnailOf, type LibraryItem } from '../lib/library'
import { useStore } from '../store/useStore'
import { cx } from './ui'

/**
 * Thẻ video dùng chung cho Thư viện, Đề xuất và lớp gợi ý cuối video.
 * Khi đang lấy phụ đề của đúng video này: ảnh mờ + vòng quay + chấm nhấp nháy, thẻ khác bị khoá.
 */
export function VideoCard({ item, size = 'md', className }: { item: LibraryItem; size?: 'md' | 'row'; className?: string }) {
  const loadingId = useStore((s) => s.loadingVideoId)
  const open = useStore((s) => s.openLibraryVideo)
  const watched = useStore((s) => s.history.some((h) => h.videoId === item.id))
  const busy = loadingId === item.id
  const locked = loadingId !== null && !busy

  return (
    <button
      onClick={() => void open(item.id)}
      disabled={loadingId !== null}
      className={cx(
        'press group grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl bg-mat text-left hairline shadow-soft transition-colors hover:border-chu-mo-hon',
        size === 'row' && 'w-[248px] shrink-0 snap-start sm:w-[264px]',
        locked && 'opacity-60',
        className,
      )}
    >
      <span className="relative block aspect-video w-full overflow-hidden bg-mat-noi">
        <img
          src={thumbnailOf(item.id)}
          alt=""
          className={cx('h-full w-full object-cover transition-all duration-300', busy ? 'scale-105 blur-[2px] brightness-75' : 'group-hover:scale-[1.03]')}
          loading="lazy"
        />
        <span className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/70 to-transparent" />
        <span className="absolute left-2 top-2 rounded-md bg-nen/90 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-chu">{item.level}</span>
        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">{formatDuration(item.duration)}</span>
        <span className="absolute bottom-2 left-2 max-w-[70%] truncate text-[11px] font-medium text-white/90">{item.channel}</span>
        {watched && !busy && (
          <span className="absolute right-2 top-2 rounded-md bg-dung px-1.5 py-0.5 text-[10px] font-semibold text-white">Đã mở</span>
        )}
        {!busy && (
          <span className="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition-opacity group-hover:bg-black/25 group-hover:opacity-100">
            <span className="rounded-full bg-nhan px-4 py-2 text-[13px] font-semibold text-nhan-chu shadow-soft">Mở video</span>
          </span>
        )}
        {busy && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 grid place-items-center">
            <span className="flex flex-col items-center gap-2 rounded-xl bg-black/55 px-4 py-3 text-white backdrop-blur-sm">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span className="text-[12px] font-medium">
                Đang lấy phụ đề
                <Dots />
              </span>
            </span>
          </motion.span>
        )}
      </span>
      <span className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 p-3">
        <span className="line-clamp-2 text-[14px] font-semibold leading-snug text-chu">{item.title}</span>
        <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs text-chu-mo">
          <span className="truncate">Nguồn: {item.source}</span>
          <span className="shrink-0 rounded bg-mat-noi px-1.5 py-0.5 text-[11px]">{item.topic}</span>
        </span>
      </span>
    </button>
  )
}

function Dots() {
  return (
    <span className="inline-flex w-4 justify-start">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}>
          .
        </motion.span>
      ))}
    </span>
  )
}
