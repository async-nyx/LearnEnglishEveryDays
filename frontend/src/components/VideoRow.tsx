import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LibraryItem } from '../lib/library'
import { useStore } from '../store/useStore'
import { VideoCard } from './VideoCard'
import { cx } from './ui'

/**
 * Hàng video cuộn ngang, mọi chuyển động đi qua MỘT vòng lặp khung hình:
 *  - `target` là chỗ muốn tới (tự trượt cộng đều, lăn chuột cộng một nấc, mũi tên cộng một quãng)
 *  - `pos` đuổi theo `target` bằng nội suy mũ nên không giật, và gán vào scrollLeft mỗi khung hình
 *
 *  Chuột ngoài hàng: tự trượt. Chuột vào: dừng, lăn con lăn để trượt ngang. Rời chuột: chạy tiếp.
 *
 *  BẪY: `el.scrollLeft += 0.6` bị làm tròn nên cộng dồn dưới 1px mất sạch, hàng đứng im.
 *  Phải giữ vị trí ở biến số thực rồi GÁN vào scrollLeft.
 */
export function VideoRow({
  title,
  subtitle,
  badge,
  items,
  cards,
  action,
  auto = true,
  reverse = false,
}: {
  title: ReactNode
  subtitle?: ReactNode
  badge?: ReactNode
  items?: LibraryItem[]
  /** thẻ tuỳ ý (ví dụ video YouTube đề xuất) thay cho items */
  cards?: ReactNode[]
  action?: { label: string; onClick: () => void }
  auto?: boolean
  reverse?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const hover = useRef(false)
  const dragging = useRef(false)
  const hoverSince = useRef(0)
  const lastPageScroll = useRef(0)
  const lastHijack = useRef(0)
  const target = useRef(0)
  const pos = useRef(0)
  const lastSet = useRef(-1)
  const loadingId = useStore((s) => s.loadingVideoId)
  const [edge, setEdge] = useState({ left: true, right: false })

  const count = cards?.length ?? items?.length ?? 0
  const loop = auto && count >= 5
  const SPEED = 34 // px mỗi giây
  const EASE = 13 // càng lớn càng bám sát, càng nhỏ càng trôi

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    let last = performance.now()
    let init = false
    const tick = (now: number) => {
      const half = el.scrollWidth / 2
      const max = Math.max(0, el.scrollWidth - el.clientWidth)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      // người dùng vuốt/kéo thanh cuộn -> bám theo vị trí thật
      if (Math.abs(el.scrollLeft - lastSet.current) > 1.5) {
        pos.current = el.scrollLeft
        target.current = el.scrollLeft
      }
      if (loop && !init && half > 0) {
        if (reverse) {
          pos.current = half
          target.current = half
        }
        init = true
      }

      const idle = !hover.current && !dragging.current && loadingId === null && document.visibilityState === 'visible'
      if (loop && half > 0 && idle) target.current += (reverse ? -1 : 1) * SPEED * dt
      if (!loop) target.current = Math.max(0, Math.min(max, target.current))

      // nội suy mũ: mỗi khung hình đi một phần quãng còn lại -> mượt, không phụ thuộc nhịp màn hình
      pos.current += (target.current - pos.current) * (1 - Math.exp(-dt * EASE))

      if (loop && half > 0) {
        if (pos.current >= half) {
          pos.current -= half
          target.current -= half
        } else if (pos.current < 0) {
          pos.current += half
          target.current += half
        }
      }

      // chỉ ghi khi thật sự đang chuyển động, để không phá cú vuốt trên điện thoại
      const moving = loop || Math.abs(target.current - pos.current) > 0.3
      if (moving && !dragging.current && Math.abs(el.scrollLeft - pos.current) > 0.05) {
        el.scrollLeft = pos.current
        lastSet.current = el.scrollLeft
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [loop, reverse, loadingId, count])

  // nhớ lúc trang vừa cuộn dọc, để không cướp con lăn giữa chừng
  useEffect(() => {
    const onScroll = () => {
      lastPageScroll.current = performance.now()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /*
    CON LĂN -> TRƯỢT NGANG, NHƯNG KHÔNG CƯỚP CUỘN TRANG.
    Người dùng đang cuộn trang mà con trỏ lướt ngang qua hàng thì trang phải cuộn tiếp. Chỉ nhận
    con lăn khi con trỏ đã DỪNG trong hàng một nhịp và trang cũng vừa đứng yên; hoặc khi đang trong
    một chuỗi trượt ngang; hoặc khi con lăn vốn đã là ngang (bàn di).
  */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY)
      const delta = horizontal ? e.deltaX : e.deltaY
      if (!delta) return
      const now = performance.now()
      if (!horizontal) {
        const chaining = now - lastHijack.current < 350
        const settled = now - hoverSince.current > 260 && now - lastPageScroll.current > 260
        if (!chaining && !settled) return
        if (!loop && !chaining) {
          // đã chạm mép hàng thì nhả cho trang cuộn tiếp
          const max = Math.max(0, el.scrollWidth - el.clientWidth)
          if (delta > 0 ? target.current >= max - 1 : target.current <= 1) return
        }
      }
      e.preventDefault()
      target.current += delta
      lastHijack.current = now
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [loop])

  const update = () => {
    const el = ref.current
    if (!el || loop) return
    setEdge({ left: el.scrollLeft <= 4, right: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
  }
  const by = (dir: 1 | -1) => {
    target.current += dir * 300
  }

  if (count === 0) return null
  const doubled = loop && items ? [...items, ...items] : items ?? []
  const doubledCards = loop && cards ? [...cards, ...cards] : cards

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
          hoverSince.current = performance.now()
        }}
        onMouseLeave={() => {
          hover.current = false
        }}
        onPointerDown={() => {
          dragging.current = true
        }}
        onPointerUp={() => {
          dragging.current = false
        }}
        onPointerCancel={() => {
          dragging.current = false
        }}
      >
        <div ref={ref} onScroll={update} className="flex gap-3 overflow-x-auto pb-2 pl-1 pr-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {doubledCards
            ? doubledCards.map((c, i) => (
                <div key={i} className="contents">
                  {c}
                </div>
              ))
            : doubled.map((v, i) => <VideoCard key={`${v.id}-${i}`} item={v} size="row" />)}
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
