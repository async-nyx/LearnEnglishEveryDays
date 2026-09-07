import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LibraryItem } from '../lib/library'
import { VideoCard } from './VideoCard'
import { useStore } from '../store/useStore'
import { cx } from './ui'

/** Một hàng video cuộn ngang, có mũi tên hai đầu và bám mép (scroll-snap). */
export function VideoRow({
  title,
  subtitle,
  badge,
  items,
  action,
  auto = true,
  reverse = false,
}: {
  title: ReactNode
  subtitle?: ReactNode
  badge?: ReactNode
  items: LibraryItem[]
  action?: { label: string; onClick: () => void }
  /** tự trượt liên tục (băng chuyền); bấm mũi tên thì chuyển sang cuộn tay */
  auto?: boolean
  /** chạy ngược chiều (các hàng liền nhau nên đảo chiều cho sinh động) */
  reverse?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState<{ left: boolean; right: boolean }>({ left: true, right: false })
  const [manual, setManual] = useState(false)
  const loadingId = useStore((s) => s.loadingVideoId)
  // băng chuyền chỉ có nghĩa khi đủ thẻ để tràn khung
  const marquee = auto && !manual && items.length >= 5
  const wrap = useRef<HTMLDivElement>(null)
  const pending = useRef(0)

  /*
    LĂN CON LĂN TRÊN HÀNG = TRƯỢT NGANG BẰNG TAY.
    React gắn `wheel` ở chế độ passive nên không chặn được cuộn trang -> gắn listener gốc với
    passive:false. Đang băng chuyền thì chuyển sang tay rồi áp dụng phần lăn dồn lại sau khi render.
  */
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (delta === 0) return
      e.preventDefault()
      if (ref.current) ref.current.scrollLeft += delta
      else {
        pending.current += delta
        setManual(true)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    if (manual && ref.current && pending.current) {
      // băng chuyền đang ở giữa dải nhân đôi -> bắt đầu cuộn tay từ khoảng 1/4 để không nhảy về đầu
      ref.current.scrollLeft = Math.max(0, pending.current)
      pending.current = 0
    }
  }, [manual])

  const update = () => {
    const el = ref.current
    if (!el) return
    setEdge({ left: el.scrollLeft <= 4, right: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
  }
  const by = (dir: 1 | -1) => {
    if (marquee) {
      setManual(true)
      requestAnimationFrame(() => ref.current?.scrollBy({ left: dir * 280, behavior: 'smooth' }))
      return
    }
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.85), behavior: 'smooth' })
  }

  if (items.length === 0) return null

  return (
    <section className="group/row relative">
      <div className="mb-2.5 flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-chu">
            {title}
            {badge}
          </h3>
          {subtitle && <p className="mt-0.5 truncate text-[13px] text-chu-mo">{subtitle}</p>}
        </div>
        {action && (
          <button onClick={action.onClick} className="press shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-nhan-van hover:bg-nhan-nhat">
            {action.label}
          </button>
        )}
      </div>
      <div className="relative" ref={wrap}>
        {marquee ? (
          <div className="overflow-hidden pb-2 pl-1">
            <div
              className={cx('marquee flex w-max gap-3', reverse && 'marquee-reverse')}
              style={{ '--marquee-duration': `${items.length * 7}s` } as React.CSSProperties}
              data-paused={loadingId !== null}
            >
              {[...items, ...items].map((v, i) => (
                <VideoCard key={`${v.id}-${i}`} item={v} size="row" />
              ))}
            </div>
          </div>
        ) : (
          <div
            ref={ref}
            onScroll={update}
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pl-1 pr-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {items.map((v) => (
              <VideoCard key={v.id} item={v} size="row" />
            ))}
          </div>
        )}
        <Arrow side="left" hidden={!marquee && edge.left} onClick={() => by(-1)} />
        <Arrow side="right" hidden={!marquee && edge.right} onClick={() => by(1)} />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-nen to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-nen to-transparent" />
      </div>
    </section>
  )
}

function Arrow({ side, hidden, onClick }: { side: 'left' | 'right'; hidden: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={side === 'left' ? 'Cuộn trái' : 'Cuộn phải'}
      className={cx(
        'press absolute top-[38%] z-[1] hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-mat text-chu shadow-soft hairline transition-opacity lg:grid',
        side === 'left' ? 'left-1' : 'right-1',
        hidden ? 'pointer-events-none opacity-0' : 'opacity-0 group-hover/row:opacity-100',
      )}
    >
      <span className="text-xl font-semibold leading-none">{side === 'left' ? '‹' : '›'}</span>
    </button>
  )
}
