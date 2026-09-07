import { useMemo } from 'react'
import { Sparkle } from '@phosphor-icons/react'
import { LEVELS, LEVEL_LABEL, LIBRARY, libraryItem, mostWatchedLevel, type Level } from '../lib/library'
import { shuffle } from '../lib/text'
import { useStore } from '../store/useStore'
import { VideoRow } from './VideoRow'
import { EmptyState } from './ui'

/**
 * Đề xuất: nhiều hàng cuộn ngang nối tiếp nhau. Hàng đầu theo BẬC người dùng nghe nhiều nhất
 * (đếm video đã mở thuộc thư viện), hàng kế là bậc nhích lên một nấc, rồi "Tiếp tục học",
 * rồi từng bậc còn lại.
 */
export function DiscoverView() {
  const history = useStore((s) => s.history)
  const setView = useStore((s) => s.setView)
  const setLibraryLevel = useStore((s) => s.setLibraryLevel)

  const seen = useMemo(() => new Set(history.map((h) => h.videoId)), [history])
  const fav = useMemo(() => mostWatchedLevel(history.map((h) => h.videoId)), [history])
  const favCount = useMemo(() => history.filter((h) => libraryItem(h.videoId)?.level === fav.level).length, [history, fav.level])
  const up: Level | null = LEVELS[LEVELS.indexOf(fav.level) + 1] ?? null
  const down: Level | null = LEVELS[LEVELS.indexOf(fav.level) - 1] ?? null

  const pick = (level: Level, n = 12) => {
    const pool = LIBRARY.filter((v) => v.level === level)
    const fresh = shuffle(pool.filter((v) => !seen.has(v.id)))
    const old = shuffle(pool.filter((v) => seen.has(v.id)))
    return [...fresh, ...old].slice(0, n)
  }
  const resume = history.map((h) => libraryItem(h.videoId)).filter((v): v is NonNullable<typeof v> => !!v).slice(0, 12)
  const goLevel = (level: Level) => ({
    label: 'Xem tất cả',
    onClick: () => {
      setLibraryLevel(level)
      setView('library')
    },
  })

  if (LIBRARY.length === 0) {
    return (
      <div className="px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState icon={<Sparkle size={22} />} title="Thư viện chưa có video" body="Chạy scripts/build_library.py để dựng danh sách." />
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Đề xuất cho bạn</h2>
        <p className="mt-1 text-sm text-chu-mo">
          {fav.fromHistory
            ? `Bạn mở nhiều video bậc ${fav.level} nhất (${favCount} video), nên hàng đầu là ${fav.level}. Muốn thử nặng hơn thì cuộn xuống.`
            : 'Bạn chưa mở video nào trong thư viện, tạm gợi ý từ bậc B1. Mở vài video, đề xuất sẽ theo bậc bạn nghe.'}
        </p>
      </header>

      <VideoRow
        title={`Dành cho bạn · ${fav.level}`}
        badge={<span className="rounded-md bg-nhan-nhat px-1.5 py-0.5 font-mono text-[11px] font-semibold text-nhan-van">{LEVEL_LABEL[fav.level]}</span>}
        subtitle={fav.fromHistory ? 'Cùng bậc với những video bạn hay mở, ưu tiên chưa xem' : 'Bậc mặc định khi chưa có lịch sử'}
        items={pick(fav.level)}
        action={goLevel(fav.level)}
      />
      {up && (
        <VideoRow
          title={`Nhích lên một bậc · ${up}`}
          subtitle="Hơi nặng hơn để tai quen dần; bật Nghĩa nếu rớt nhịp"
          items={pick(up, 10)}
          action={goLevel(up)}
          reverse
        />
      )}
      {resume.length > 0 && <VideoRow title="Tiếp tục học" subtitle="Video trong thư viện bạn đã mở, mới nhất trước" items={resume} auto={false} />}
      {down && <VideoRow title={`Ôn nhẹ · ${down}`} subtitle="Dễ hơn một nấc, hợp để luyện nói theo" items={pick(down, 10)} action={goLevel(down)} reverse />}
      {LEVELS.filter((l) => l !== fav.level && l !== up && l !== down).map((l, i) => (
        <VideoRow key={l} reverse={i % 2 === 1} title={`Bậc ${l}`} subtitle={LEVEL_LABEL[l]} items={pick(l, 10)} action={goLevel(l)} />
      ))}
    </div>
  )
}
