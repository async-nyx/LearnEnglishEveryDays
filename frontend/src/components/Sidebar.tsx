import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BookBookmark, Books, ChartLineUp, PlayCircle, Sparkle, Waveform } from '@phosphor-icons/react'
import { fetchTranscript } from '../lib/api'
import type { View } from '../lib/types'
import { useStore } from '../store/useStore'
import { cx } from './ui'

export const SIDEBAR_W = 264
export const SIDEBAR_W_COLLAPSED = 76

/** Thanh bên trái (máy tính). Có nút thu gọn về dải icon. Điện thoại vẫn dùng TopBar. */
export function Sidebar() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const vocabCount = useStore((s) => s.vocab.length)
  const dueCount = useStore((s) => s.vocab.filter((v) => v.srs.due <= Date.now()).length)
  const history = useStore((s) => s.history)
  const openVideo = useStore((s) => s.openVideo)
  const removeHistory = useStore((s) => s.removeHistory)
  const currentVideoId = useStore((s) => s.currentVideoId)
  const loading = useStore((s) => s.loading)
  const setLoading = useStore((s) => s.setLoading)
  const setError = useStore((s) => s.setError)
  const setTranscript = useStore((s) => s.setTranscript)
  const transcripts = useStore((s) => s.transcripts)
  const toast = useStore((s) => s.toast)
  const theme = useStore((s) => s.settings.theme)
  const collapsed = useStore((s) => s.settings.sidebarCollapsed)
  const updateSettings = useStore((s) => s.updateSettings)
  const [url, setUrl] = useState('')
  const [askUrl, setAskUrl] = useState(false)

  const load = async (u: string) => {
    if (!u || loading) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchTranscript(u)
      setTranscript(data)
      setUrl('')
      setAskUrl(false)
      toast(`Đã lấy ${data.segment_count} dòng phụ đề`, 'ok')
    } catch (e) {
      setError((e as Error).message)
      toast((e as Error).message, 'bad')
    } finally {
      setLoading(false)
    }
  }
  const pick = (videoId: string) => (transcripts[videoId] ? openVideo(videoId) : void load(videoId))
  const toggle = () => updateSettings({ sidebarCollapsed: !collapsed })

  const nav: { view: View; label: string; hint: string; icon: (active: boolean) => React.ReactNode; badge?: number }[] = [
    { view: 'study', label: 'Học', hint: 'Đọc · Chính tả · Nói theo', icon: (a) => <PlayCircle size={18} weight={a ? 'fill' : 'regular'} /> },
    { view: 'discover', label: 'Đề xuất', hint: 'Theo bậc bạn nghe nhiều', icon: (a) => <Sparkle size={18} weight={a ? 'fill' : 'regular'} /> },
    { view: 'library', label: 'Thư viện', hint: '100 video A1–C1', icon: (a) => <Books size={18} weight={a ? 'fill' : 'regular'} /> },
    {
      view: 'vocab',
      label: 'Từ vựng',
      hint: vocabCount ? `${vocabCount} từ${dueCount ? ` · ${dueCount} cần ôn` : ''}` : 'Sổ từ, thẻ lật, trắc nghiệm',
      icon: (a) => <BookBookmark size={18} weight={a ? 'fill' : 'regular'} />,
      badge: dueCount > 0 ? dueCount : undefined,
    },
    { view: 'progress', label: 'Tiến trình', hint: 'Chuỗi ngày, từng video, sổ từ', icon: (a) => <ChartLineUp size={18} weight={a ? 'fill' : 'regular'} /> },
  ]

  return (
    <motion.aside
      className="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-vien bg-mat lg:flex"
      animate={{ width: collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W }}
      initial={false}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
    >
      {/* thương hiệu + thu gọn */}
      <div className={cx('flex items-center pt-4', collapsed ? 'flex-col gap-2 px-3' : 'justify-between px-4')}>
        <button onClick={() => setView('study')} className="flex items-center gap-2.5 text-left" title="Subloop">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-nhan text-nhan-chu">
            <Waveform size={18} weight="bold" />
          </span>
          {!collapsed && (
            <span>
              <span className="block text-[15px] font-semibold tracking-tight text-chu">Subloop</span>
              <span className="block text-[11px] text-chu-mo-hon">Học tiếng Anh qua YouTube</span>
            </span>
          )}
        </button>
        <button
          onClick={toggle}
          aria-label={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
          title={collapsed ? 'Mở rộng' : 'Thu gọn'}
          className="press grid h-8 w-8 place-items-center rounded-lg text-chu-mo hover:bg-mat-chim hover:text-chu"
        >
          <span className="text-base leading-none">{collapsed ? '»' : '«'}</span>
        </button>
      </div>

      {/* dán liên kết */}
      <div className={cx('mt-4', collapsed ? 'px-3' : 'px-4')}>
        {collapsed ? (
          <button
            onClick={() => {
              updateSettings({ sidebarCollapsed: false })
              setAskUrl(true)
            }}
            title="Dán liên kết YouTube"
            aria-label="Dán liên kết YouTube"
            className="press grid h-10 w-full place-items-center rounded-xl border border-vien bg-nen text-chu-mo hover:text-chu"
          >
            <span className="text-[12px] font-semibold">Dán</span>
          </button>
        ) : (
          <form
            className="relative flex items-center"
            onSubmit={(e) => {
              e.preventDefault()
              void load(url.trim())
            }}
          >
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus={askUrl}
              placeholder="Dán liên kết YouTube…"
              spellCheck={false}
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-vien bg-nen pl-3 pr-10 text-sm text-chu placeholder:text-chu-mo-hon focus:border-chu-mo-hon focus:outline-none"
            />
            <button
              type="submit"
              disabled={!url.trim() || loading}
              aria-label="Lấy phụ đề"
              className="press absolute right-1.5 grid h-7 w-7 place-items-center rounded-lg bg-nhan text-nhan-chu disabled:bg-mat-noi disabled:text-chu-mo-hon"
            >
              <span className="text-sm font-bold leading-none">→</span>
            </button>
          </form>
        )}
      </div>

      {/* điều hướng */}
      <nav className={cx('mt-4 flex flex-col gap-0.5', collapsed ? 'px-3' : 'px-3')}>
        {nav.map((n) => {
          const active = view === n.view
          return (
            <button
              key={n.view}
              onClick={() => setView(n.view)}
              title={collapsed ? n.label : undefined}
              className={cx(
                'press relative flex items-center gap-3 rounded-xl text-left transition-colors',
                collapsed ? 'justify-center px-0 py-2' : 'px-3 py-2.5',
                active ? 'bg-nhan-nhat text-chu' : 'text-chu-nhat hover:bg-mat-chim hover:text-chu',
              )}
            >
              {collapsed && <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-lg', active ? 'bg-nhan text-nhan-chu' : 'bg-mat-noi text-chu-nhat')}>{n.icon(active)}</span>}
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{n.label}</span>
                  <span className="block truncate text-[11px] text-chu-mo-hon">{n.hint}</span>
                </span>
              )}
              {n.badge !== undefined && (
                <span
                  className={cx(
                    'rounded-md bg-nhan px-1.5 py-0.5 font-mono text-[11px] font-semibold text-nhan-chu',
                    collapsed && 'absolute -right-0.5 -top-0.5 px-1 py-0 text-[10px]',
                  )}
                >
                  {n.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* gần đây */}
      <div className="mt-5 flex min-h-0 flex-1 flex-col">
        {!collapsed && (
          <div className="flex items-center justify-between px-5 pb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-chu-mo-hon">Gần đây</span>
            {history.length > 0 && <span className="font-mono text-[11px] text-chu-mo-hon">{history.length}</span>}
          </div>
        )}
        <ul className={cx('min-h-0 flex-1 overflow-y-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', collapsed ? 'px-3' : 'px-3')}>
          {!collapsed && history.length === 0 && <li className="px-2 text-xs leading-relaxed text-chu-mo-hon">Video bạn đã mở sẽ nằm ở đây.</li>}
          {history.slice(0, collapsed ? 8 : 30).map((h) => {
            const active = h.videoId === currentVideoId && view === 'study'
            return (
              <li key={h.videoId} className="group relative">
                <button
                  onClick={() => pick(h.videoId)}
                  title={collapsed ? h.title : undefined}
                  className={cx('press flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left', active ? 'bg-mat-chim' : 'hover:bg-mat-chim')}
                >
                  <img
                    src={h.thumbnail}
                    alt=""
                    className={cx('shrink-0 rounded-md object-cover', collapsed ? 'h-8 w-full' : 'h-9 w-16', active && collapsed && 'ring-2 ring-nhan')}
                    loading="lazy"
                  />
                  {!collapsed && (
                    <span className="min-w-0">
                      <span className={cx('block truncate text-[13px] leading-snug', active ? 'font-semibold text-chu' : 'text-chu')}>{h.title}</span>
                      <span className="block truncate text-[11px] text-chu-mo-hon">{h.author || 'YouTube'}</span>
                    </span>
                  )}
                </button>
                {!collapsed && (
                  <button
                    onClick={() => removeHistory(h.videoId)}
                    aria-label="Xoá khỏi lịch sử"
                    className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md bg-mat text-chu-mo-hon opacity-0 transition-opacity hover:text-sai group-hover:opacity-100"
                  >
                    <span className="text-base leading-none">×</span>
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {/* sáng / tối */}
      <div className={cx('border-t border-vien p-3')}>
        <AnimatePresence mode="wait" initial={false}>
          {collapsed ? (
            <motion.button
              key="one"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}
              title={theme === 'dark' ? 'Chuyển sang sáng' : 'Chuyển sang tối'}
              aria-label="Đổi sáng/tối"
              className="press grid h-10 w-full place-items-center rounded-xl bg-nen text-chu hairline"
            >
              <span className="text-[12px] font-semibold">{theme === 'dark' ? 'Tối' : 'Sáng'}</span>
            </motion.button>
          ) : (
            <motion.div key="two" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-2 gap-1 rounded-xl bg-nen p-1 hairline">
              {([['light', 'Sáng'], ['dark', 'Tối']] as ['light' | 'dark', string][]).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => updateSettings({ theme: t })}
                  className={cx(
                    'press inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium',
                    theme === t ? 'bg-mat text-chu shadow-soft' : 'text-chu-mo hover:text-chu',
                  )}
                >
                  {label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  )
}
