import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowSquareOut,
  ArrowsIn,
  ArrowsOut,
  Pause,
  Play,
  Repeat,
  SpeakerHigh,
  SpeakerLow,
  SpeakerSlash,
  WarningCircle,
} from '@phosphor-icons/react'
import { mountPlayer, switchVideo, usePlayer } from '../store/usePlayer'
import { useStore } from '../store/useStore'
import { formatTime } from '../lib/text'
import type { TranscriptData } from '../lib/types'
import { cx } from './ui'
import { Suggestions } from './Suggestions'

const RATES = [0.5, 0.65, 0.75, 0.85, 1, 1.25, 1.5]

/*
  TRÌNH PHÁT KIỂU APP — user không muốn thấy nút của YouTube.
  · playerVars controls=0/fs=0/disablekb=1 tắt thanh của YouTube
  · một lớp chắn chuột nằm trên iframe: iframe không nhận hover nên không hiện tiêu đề / "Xem trên YouTube";
    bấm lớp chắn = phát/dừng, bấm đôi = toàn màn hình
  · thanh điều khiển riêng nằm dưới đáy video, hiện khi rê chuột hoặc đang dừng, tự ẩn sau 2,2 s khi đang phát
*/
export function VideoPane({ data }: { data: TranscriptData }) {
  const holder = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)
  const hideTimer = useRef<number | null>(null)

  const ready = usePlayer((s) => s.ready)
  const playing = usePlayer((s) => s.playing)
  const ended = usePlayer((s) => s.ended)
  const currentTime = usePlayer((s) => s.currentTime)
  const duration = usePlayer((s) => s.duration)
  const rate = usePlayer((s) => s.rate)
  const loop = usePlayer((s) => s.loop)
  const error = usePlayer((s) => s.error)
  const volume = usePlayer((s) => s.volume)
  const muted = usePlayer((s) => s.muted)
  const toggle = usePlayer((s) => s.toggle)
  const seekTo = usePlayer((s) => s.seekTo)
  const setRate = usePlayer((s) => s.setRate)
  const setLoop = usePlayer((s) => s.setLoop)
  const setVolume = usePlayer((s) => s.setVolume)
  const toggleMute = usePlayer((s) => s.toggleMute)
  const updateSettings = useStore((s) => s.updateSettings)
  const savedRate = useStore((s) => s.settings.playbackRate)
  const embedHost = useStore((s) => s.settings.embedHost)

  const [tip, setTip] = useState(false)
  const [stuck, setStuck] = useState(false)
  const [waited, setWaited] = useState(false)
  const [hover, setHover] = useState(false)
  const [drag, setDrag] = useState<number | null>(null)
  const [full, setFull] = useState(false)
  const [rateOpen, setRateOpen] = useState(false)

  // trình phát không lên sau 8 s -> gần chắc iframe bị trình duyệt/tiện ích chặn
  useEffect(() => {
    if (ready) {
      setStuck(false)
      return
    }
    const id = window.setTimeout(() => setStuck(true), 8000)
    return () => window.clearTimeout(id)
  }, [ready, data.video_id, embedHost])

  useEffect(() => {
    const id = window.setTimeout(() => setWaited(true), 2500)
    return () => window.clearTimeout(id)
  }, [data.video_id])

  // gắn trình phát một lần; đổi video thì cue lại
  useEffect(() => {
    if (!holder.current) return
    if (!mounted.current) {
      mounted.current = true
      usePlayer.setState({ rate: savedRate })
      const inner = document.createElement('div')
      holder.current.appendChild(inner)
      const dispose = mountPlayer(inner, data.video_id, embedHost)
      return () => {
        dispose()
        mounted.current = false
        holder.current?.replaceChildren()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    switchVideo(data.video_id)
  }, [data.video_id])

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === frame.current)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const wake = useCallback(() => {
    setHover(true)
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setHover(false), 2200)
  }, [])

  const pickRate = (r: number) => {
    setRate(r)
    updateSettings({ playbackRate: r })
    setRateOpen(false)
  }

  const toggleFull = () => {
    if (!frame.current) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void frame.current.requestFullscreen().catch(() => undefined)
  }

  const shown = drag ?? currentTime
  const pct = duration > 0 ? (shown / duration) * 100 : 0
  const controlsVisible = hover || !playing || !!drag

  return (
    <div className="flex flex-col gap-3">
      <header className="px-1 text-center">
        <h1 className="text-balance text-xl font-bold leading-snug tracking-tight text-chu sm:text-2xl">{data.title || `Video ${data.video_id}`}</h1>
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 text-[13px] text-chu-mo">
          {data.author && <span className="font-medium text-chu-nhat">{data.author}</span>}
          {data.author && <span className="text-vien-manh">·</span>}
          <span>
            Phụ đề {data.language || data.language_code || '—'}
            {data.is_generated ? ' (tự động)' : ''}
          </span>
          <span className="text-vien-manh">·</span>
          <span className="font-mono">{data.segment_count} dòng</span>
        </div>
      </header>

      <div
        ref={frame}
        className={cx('group relative w-full overflow-hidden bg-black', full ? 'h-full' : 'aspect-video rounded-2xl shadow-soft')}
        onMouseMove={wake}
        onMouseLeave={() => setHover(false)}
      >
        <div ref={holder} className="absolute inset-0 [&>div]:h-full [&>div]:w-full [&_iframe]:h-full [&_iframe]:w-full" />

        {/* lớp chắn: iframe không nhận chuột -> không hiện UI của YouTube */}
        <div
          className="absolute inset-0 cursor-pointer"
          onClick={toggle}
          onDoubleClick={toggleFull}
          onTouchStart={wake}
          aria-label={playing ? 'Tạm dừng' : 'Phát'}
          role="button"
        />

        {/* hết video: đề xuất của app (từ thư viện, cùng bậc), không dùng màn của YouTube */}
        <AnimatePresence>
          {ended && !playing && error === null && (
            <Suggestions
              key="suggest"
              currentId={data.video_id}
              onReplay={() => {
                usePlayer.setState({ ended: false })
                seekTo(0)
              }}
            />
          )}
        </AnimatePresence>

        {/* nút phát lớn khi đang dừng */}
        <AnimatePresence>
          {ready && !playing && !ended && error === null && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={toggle}
              aria-label="Phát"
              className="press absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-nhan text-nhan-chu shadow-soft"
            >
              <Play size={28} weight="fill" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* dải che phần tiêu đề YouTube hiện lúc dừng */}
        {ready && !playing && error === null && <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/80 to-transparent" />}

        {/* thanh điều khiển của app */}
        <div
          className={cx(
            'absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-3 pb-2.5 pt-8 text-white transition-opacity duration-200',
            controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          onMouseMove={wake}
        >
          {/* thanh tiến trình */}
          <div className="relative flex h-4 items-center">
            <div className="absolute inset-x-0 h-1 rounded-full bg-white/25">
              <div className="h-full rounded-full bg-nhan" style={{ width: `${pct}%` }} />
              {loop && duration > 0 && (
                <div
                  className="absolute top-0 h-full rounded-full bg-white/70"
                  style={{ left: `${(loop.start / duration) * 100}%`, width: `${Math.max(0.5, ((loop.end - loop.start) / duration) * 100)}%` }}
                />
              )}
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(1, duration)}
              step={0.1}
              value={shown}
              aria-label="Tua"
              onInput={(e) => setDrag(Number((e.target as HTMLInputElement).value))}
              onChange={(e) => setDrag(Number(e.target.value))}
              onPointerUp={() => {
                if (drag !== null) {
                  seekTo(drag, playing)
                  setDrag(null)
                }
              }}
              onKeyUp={() => {
                if (drag !== null) {
                  seekTo(drag, playing)
                  setDrag(null)
                }
              }}
              className="absolute inset-x-0 h-4 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
            />
          </div>

          <div className="flex items-center gap-1">
            <Ctl onClick={toggle} label={playing ? 'Tạm dừng' : 'Phát'}>
              {playing ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
            </Ctl>
            <Ctl onClick={() => seekTo(Math.max(0, currentTime - 5), playing)} label="Lùi 5 giây">
              <ArrowCounterClockwise size={18} />
            </Ctl>
            <Ctl onClick={() => seekTo(currentTime + 5, playing)} label="Tới 5 giây">
              <ArrowClockwise size={18} />
            </Ctl>

            <div className="group/vol flex items-center">
              <Ctl onClick={toggleMute} label={muted ? 'Bật tiếng' : 'Tắt tiếng'}>
                {muted || volume === 0 ? <SpeakerSlash size={18} /> : volume < 50 ? <SpeakerLow size={18} /> : <SpeakerHigh size={18} />}
              </Ctl>
              <input
                type="range"
                min={0}
                max={100}
                value={muted ? 0 : volume}
                aria-label="Âm lượng"
                onChange={(e) => setVolume(Number(e.target.value))}
                className="h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/40 accent-white transition-[width] duration-200 group-hover/vol:w-20 group-hover/vol:ml-1 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              />
            </div>

            <span className="ml-1 font-mono text-[12px] tabular-nums text-white/90">
              {formatTime(shown)} <span className="text-white/50">/</span> {formatTime(duration)}
            </span>

            <div className="ml-auto flex items-center gap-1">
              {loop && (
                <button
                  onClick={() => setLoop(null)}
                  className="press inline-flex h-8 items-center gap-1.5 rounded-lg bg-nhan/80 px-2.5 text-xs font-medium text-nhan-chu hover:bg-nhan"
                  title="Bỏ lặp đoạn"
                >
                  <Repeat size={14} weight="bold" />
                  {formatTime(loop.start)}–{formatTime(loop.end)}
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => setRateOpen((v) => !v)}
                  className="press h-8 rounded-lg px-2.5 font-mono text-[12.5px] font-medium tabular-nums hover:bg-white/15"
                  aria-label="Tốc độ phát"
                >
                  {rate}×
                </button>
                <AnimatePresence>
                  {rateOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className="absolute bottom-10 right-0 flex flex-col rounded-xl bg-black/90 p-1 shadow-soft backdrop-blur"
                      onMouseLeave={() => setRateOpen(false)}
                    >
                      {RATES.map((r) => (
                        <button
                          key={r}
                          onClick={() => pickRate(r)}
                          className={cx('press rounded-lg px-3 py-1.5 text-left font-mono text-[12.5px] tabular-nums hover:bg-white/15', Math.abs(rate - r) < 0.01 && 'bg-nhan text-nhan-chu')}
                        >
                          {r}×
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <Ctl onClick={toggleFull} label={full ? 'Thoát toàn màn hình' : 'Toàn màn hình'}>
                {full ? <ArrowsIn size={18} /> : <ArrowsOut size={18} />}
              </Ctl>
            </div>
          </div>
        </div>

        {!ready && !error && !waited && <div className="skeleton pointer-events-none absolute inset-0 rounded-none" />}

        {error === null && !ready && stuck && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-nen/95 p-5 text-center">
            <WarningCircle size={26} className="text-luu-y" />
            <div className="max-w-[46ch] text-sm leading-relaxed text-chu">
              Trình phát YouTube không tải được. Thường là một tiện ích trong trình duyệt (chặn quảng cáo, chặn xao nhãng) đang chặn <span className="font-mono text-xs">www.youtube.com/embed</span>.
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={() => updateSettings({ embedHost: embedHost === 'youtube' ? 'nocookie' : 'youtube' })}
                className="press inline-flex h-9 items-center gap-2 rounded-lg bg-nhan px-3 text-sm font-medium text-nhan-chu"
              >
                <ArrowClockwise size={16} />
                {embedHost === 'youtube' ? 'Thử máy chủ youtube-nocookie.com' : 'Quay về youtube.com'}
              </button>
              <a
                href={`https://www.youtube.com/watch?v=${data.video_id}`}
                target="_blank"
                rel="noreferrer"
                className="press inline-flex h-9 items-center gap-2 rounded-lg bg-mat-noi px-3 text-sm font-medium text-chu"
              >
                <ArrowSquareOut size={16} />
                Mở trên YouTube
              </a>
            </div>
            <div className="text-xs text-chu-mo">Cách kiểm tra nhanh: mở trang này ở cửa sổ ẩn danh (tiện ích bị tắt). Hiện hình là do tiện ích.</div>
          </div>
        )}

        {error !== null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-nen/95 p-6 text-center">
            <WarningCircle size={28} className="text-luu-y" />
            <div className="text-sm text-chu">
              {error === 101 || error === 150
                ? 'Chủ video không cho nhúng ở trang khác. Vẫn đọc và chép được phụ đề, nhưng phải xem trên YouTube.'
                : error === 100
                  ? 'Video không tồn tại hoặc ở chế độ riêng tư.'
                  : `Trình phát YouTube báo lỗi (mã ${error}).`}
            </div>
            <a
              href={`https://www.youtube.com/watch?v=${data.video_id}`}
              target="_blank"
              rel="noreferrer"
              className="press inline-flex h-9 items-center gap-2 rounded-lg bg-nhan px-3 text-sm font-medium text-nhan-chu"
            >
              <ArrowSquareOut size={16} />
              Mở trên YouTube
            </a>
          </div>
        )}
      </div>

      <div className="text-center">
        <button onClick={() => setTip((v) => !v)} className="text-xs text-chu-mo-hon underline-offset-2 hover:text-chu hover:underline">
          Chỉ nghe tiếng, không thấy hình?
        </button>
        {tip && (
          <div className="mt-2 rounded-xl bg-mat p-3 text-left text-xs leading-relaxed text-chu-nhat hairline">
            Trình chặn quảng cáo (uBlock, AdBlock, Brave Shields) hay làm video nhúng của YouTube đen màn nhưng vẫn có tiếng. Tắt nó cho trang này rồi tải lại. Nếu vẫn đen, thử mở bằng Chrome hoặc Edge, hoặc bấm{' '}
            <a className="text-nhan-van underline" href={`https://www.youtube.com/watch?v=${data.video_id}`} target="_blank" rel="noreferrer">
              mở trên YouTube
            </a>{' '}
            để xem hình, còn phụ đề vẫn dùng ở đây.
          </div>
        )}
      </div>
    </div>
  )
}

function Ctl({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="press grid h-8 w-8 place-items-center rounded-lg text-white hover:bg-white/15">
      {children}
    </button>
  )
}
