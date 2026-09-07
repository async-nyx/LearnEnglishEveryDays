import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LibraryItem } from '../lib/library'
import { useStore } from '../store/useStore'
import { VideoCard } from './VideoCard'
import { cx } from './ui'

/**
 * Hàng video cuộn ngang.
 *  - Chuột KHÔNG ở trong hàng: tự trượt đều (băng chuyền), nội dung nhân đôi để lặp liền mạch.
 *  - Chuột vào hàng: dừng tự trượt; lăn con lăn (lên/xuống) là trượt ngang bằng tay.
 *  - Chuột rời: tự trượt tiếp từ đúng chỗ đang đứng.
 *  - Mũi tên hai đầu: nhích một quãng.
 * Tất cả trên MỘT phần tử cuộn thật, nên chuyển đổi không nhảy vị trí.
 */
export function VideoRow({
  title,
  subtitle,
  badge,
  items,
  action,
  auto = true,
  reverse = false,
  children,
  childCount = 0,
}: {
  title: ReactNode
  subtitle?: ReactNode
  badge?: ReactNode
  items?: LibraryItem[]
  action?: { label: string; onClick: () => void }
  auto?: boolean
  reverse?: boolean
  /** thẻ tuỳ ý (ví dụ video YouTube đề xuất) thay cho items; cần truyền childCount để biết có lặp không */
  children?: ReactNode
  childCount?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const hover = useRef(false)
  const loadingId = useStore((s) => s.loadingVideoId)
  const [edge, setEdge] = useState({ left: true, right: false })
  const count = items?.length ?? childCount
  // băng chuyền chỉ khi có đủ thẻ để tràn khung và không có thẻ tuỳ ý (children không nhân đôi được)
  const loop = auto && !children && count >= 5
  const SPEED = 38 // px mỗi giây

  // vòng tự trượt.
  // BẪY: `el.scrollLeft += 0.6` bị trình duyệt LÀM TRÒN nên cộng dồn dưới 1px mất sạch,
  // hàng đứng im. Phải giữ vị trí ở biến số thực rồi GÁN vào scrollLeft mỗi khung hình.
  useEffect(() => {
    if (!loop) return
    const el = ref.current
    if (!el) return
    let raf = 0
    let last = performance.now()
    let pos = -1
    let lastSet = -1
    const tick = (now: number) => {
      const half = el.scrollWidth / 2
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (half > 0) {
        // người dùng vừa cuộn tay (lăn chuột, mũi tên) -> bám theo vị trí thật
        if (pos < 0 || Math.abs(el.scrollLeft - lastSet) > 1.5) pos = reverse && pos < 0 ? half : el.scrollLeft
        if (!hover.current && loadingId === null && document.visibilityState === 'visible') {
          pos += (reverse ? -1 : 1) * SPEED * dt
          if (pos >= half) pos -= half
          else if (pos <= 0) pos += half
          el.scrollLeft = pos
          lastSet = el.scrollLeft
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [loop, reverse, loadingId, count])

  // con lăn -> trượt ngang (listener gốc để chặn cuộn trang)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (!delta) return
      e.preventDefault()
      el.scrollLeft += delta
      if (loop) {
        const half = el.scrollWidth / 2
        if (el.scrollLeft >= half) el.scrollLeft -= half
        else if (el.scrollLeft <= 0) el.scrollLeft += half
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [loop])

  const update = () => {
    const el = ref.current
    if (!el || loop) return
    setEdge({ left: el.scrollLeft <= 4, right: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
  }
  const by = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * 280, behavior: 'smooth' })

  if (!children && count === 0) return null
  const list = loop && items ? [...items, ...items] : items ?? []

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
      <div
        className="relative"
        onMouseEnter={() => {
          hover.current = true
        }}
        onMouseLeave={() => {
          hover.current = false
        }}
      >
        <div
          ref={ref}
          onScroll={update}
          className={cx('flex gap-3 overflow-x-auto pb-2 pl-1 pr-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', !loop && 'snap-x snap-mandatory')}
        >
          {children ?? list.map((v, i) => <VideoCard key={`${v.id}-${i}`} item={v} size="row" />)}
        </div>
        <Arrow side="left" hidden={!loop && edge.left} onClick={() => by(-1)} />
        <Arrow side="right" hidden={!loop && edge.right} onClick={() => by(1)} />
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
