import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../store/useStore'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'ghost' | 'outline' | 'subtle' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-nhan text-nhan-chu hover:bg-nhan-dam disabled:bg-vien disabled:text-chu-mo',
  ghost: 'bg-transparent text-chu-nhat hover:bg-mat-noi hover:text-chu',
  outline: 'bg-transparent hairline text-chu hover:bg-mat-noi hover:border-vien-manh',
  subtle: 'bg-mat-noi text-chu hover:bg-vien',
  danger: 'bg-transparent text-sai hover:bg-sai/10',
}
const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
}

export function Button({
  variant = 'subtle',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cx(
        'press inline-flex items-center justify-center font-medium select-none whitespace-nowrap disabled:opacity-60',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; icon?: ReactNode }[]
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div
      className={cx(
        'relative inline-flex items-center rounded-xl bg-mat-chim p-1 hairline',
        size === 'sm' ? 'h-9' : 'h-11',
        className,
      )}
      role="tablist"
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative z-[1] inline-flex h-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 font-medium transition-colors',
              size === 'sm' ? 'text-[13px]' : 'text-sm',
              active ? 'text-chu' : 'text-chu-mo hover:text-chu',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${options.map((x) => x.value).join('-')}`}
                className="absolute inset-0 -z-[1] rounded-lg bg-vien shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  icon?: ReactNode
  title: string
  body?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-vien p-6 sm:p-8">
      <div>
        <div className="text-[15px] font-semibold text-chu">{title}</div>
        {body && <div className="mt-1 max-w-[52ch] text-sm leading-relaxed text-chu-mo">{body}</div>}
      </div>
      {action}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-vien-manh bg-mat-noi px-1.5 font-mono text-[11px] text-chu-nhat">
      {children}
    </kbd>
  )
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-mat-noi', className)}>
      <motion.div
        className="h-full rounded-full bg-nhan"
        initial={false}
        animate={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 22 }}
      />
    </div>
  )
}

export function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const tone = pct >= 90 ? 'text-dung bg-dung/10' : pct >= 60 ? 'text-luu-y bg-luu-y/10' : 'text-sai bg-sai/10'
  return <span className={cx('rounded-md px-2 py-0.5 font-mono text-xs font-semibold', tone)}>{pct}%</span>
}

export function Toaster() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="pointer-events-auto glass flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm text-chu shadow-soft"
          >
            <span>{t.text}</span>
            <button onClick={() => dismiss(t.id)} className="ml-1 text-chu-mo hover:text-chu" aria-label="Đóng">
              
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export function SkeletonLines({ n = 6 }: { n?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton h-5 w-12" />
          <div className="skeleton h-5" style={{ width: `${55 + ((i * 17) % 40)}%` }} />
        </div>
      ))}
    </div>
  )
}
