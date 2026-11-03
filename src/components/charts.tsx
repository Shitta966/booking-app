import Link from 'next/link'
import { ArrowDown, ArrowUp, BarChart3 } from 'lucide-react'

/** Line chart with soft gridlines in the style of the Tixia revenue card. Values are plotted in order. */
export function LineChart({ points, format, height = 250 }: { points: Array<{ label: string; value: number }>; format: (value: number) => string; height?: number }) {
  const width = 360
  const pad = { top: 44, right: 10, bottom: 26, left: 44 }
  const max = Math.max(1, ...points.map((point) => point.value))
  const niceMax = Math.ceil(max / 4) * 4 || 4
  const x = (index: number) => pad.left + (index / Math.max(1, points.length - 1)) * (width - pad.left - pad.right)
  const y = (value: number) => pad.top + (1 - value / niceMax) * (height - pad.top - pad.bottom)
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')
  const area = `${path} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`
  const peak = points.reduce((best, point, index) => (point.value > points[best].value ? index : best), 0)
  const ticks = [0, 1, 2, 3, 4].map((step) => (niceMax / 4) * step)
  const labelEvery = Math.ceil(points.length / 4)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Line chart">
      <defs>
        <linearGradient id="line-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2b3fd9" stopOpacity="0.14" />
          <stop offset="1" stopColor="#2b3fd9" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="#eef0f6" />
          <text x={pad.left - 10} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#9aa0b4">{format(tick)}</text>
        </g>
      ))}
      <path d={area} fill="url(#line-fill)" />
      <path d={path} fill="none" stroke="#2b3fd9" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {points[peak]?.value > 0 && (
        <g>
          <line x1={x(peak)} x2={x(peak)} y1={pad.top} y2={y(0)} stroke="#2b3fd9" strokeWidth="1.5" />
          <circle cx={x(peak)} cy={y(points[peak].value)} r="4.5" fill="#fff" stroke="#2b3fd9" strokeWidth="2.5" />
          <g transform={`translate(${Math.min(Math.max(x(peak), pad.left + 44), width - pad.right - 44)}, ${Math.max(y(points[peak].value) - 38, 4)})`}>
            <rect x="-44" y="0" width="88" height="28" rx="8" fill="#fff" stroke="#e4e7f2" />
            <text x="0" y="13" textAnchor="middle" fontSize="11" fontWeight="600" fill="#1b1d2e">{format(points[peak].value)}</text>
            <text x="0" y="23" textAnchor="middle" fontSize="8" fill="#9aa0b4">{points[peak].label}</text>
          </g>
        </g>
      )}
      {points.map((point, index) => index % labelEvery === 0 && (
        <text key={point.label} x={x(index)} y={height - 8} textAnchor="middle" fontSize="11" fill="#9aa0b4">{point.label}</text>
      ))}
    </svg>
  )
}

/** Ring gauge like Tixia's "Last than year" card. */
export function Ring({ percent, size = 52 }: { percent: number; size?: number }) {
  const radius = 20
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className="shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="24" cy="24" r={radius} fill="none" stroke="#dfe4fd" strokeWidth="6" />
      <circle cx="24" cy="24" r={radius} fill="none" stroke="#2b3fd9" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`} />
    </svg>
  )
}

/** The orange highlight card with yellow bars. `bars` are relative values; the card scales them. */
export function HighlightCard({ value, title, subtitle, bars }: { value: string; title: string; subtitle: string; bars: number[] }) {
  const max = Math.max(1, ...bars)
  return (
    <div className="relative overflow-hidden rounded-2xl bg-tangerine p-6 text-white shadow-[0_10px_30px_rgba(255,138,31,0.35)]">
      <div className="flex items-start justify-between gap-4">
        <p className="flex items-center gap-1.5 text-3xl font-semibold">{value} <ArrowUp size={20} strokeWidth={3} /></p>
        <div className="text-right"><p className="text-sm font-semibold">{title}</p><p className="text-xs text-white/80">{subtitle}</p></div>
      </div>
      <div className="mt-6 flex h-28 items-end gap-2.5">
        {bars.map((bar, index) => (
          <div key={index} className="mx-auto flex h-full w-2 flex-col justify-end rounded-full bg-white/25">
            <div className="w-2 rounded-full bg-gold-400" style={{ height: `${Math.max(6, (bar / max) * 100)}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Ranked list in the style of Tixia's "Trending items". */
export function TrendingList({ items }: { items: Array<{ href: string; title: string; value: number; unit: string; up: boolean }> }) {
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item, index) => (
        <li key={item.href} className="flex items-center gap-4 py-3.5">
          <span className="w-6 text-xs font-medium text-slate-400">#{index + 1}</span>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600"><BarChart3 size={17} /></span>
          <Link href={item.href} className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800 hover:text-brand-700">{item.title}</Link>
          <span className="text-right"><span className="block text-sm font-semibold text-slate-900">{item.value.toLocaleString()}</span><span className="text-[10px] text-slate-400">{item.unit}</span></span>
          {item.up ? <ArrowUp size={14} className="text-emerald-500" strokeWidth={3} /> : <ArrowDown size={14} className="text-rose-500" strokeWidth={3} />}
        </li>
      ))}
      {items.length === 0 && <li className="py-8 text-center text-sm text-slate-400">Nothing to rank yet.</li>}
    </ul>
  )
}

export function CardTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-[15px] font-semibold text-slate-900">{children}</h3>{action}</div>
}
