const IMAGE = 'https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=1400&q=80'

/** Split layout for log-in and sign-up: landscape photo on the left, form card on the right. */
export function AuthFrame({ eyebrow, title, subtitle, children, footer }: { eyebrow: string; title: string; subtitle: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[1fr_1.05fr]">
      <div className="relative hidden min-h-[560px] overflow-hidden rounded-[2.5rem] lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={IMAGE} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-moss-950/70 via-moss-950/10 to-transparent" />
        <div className="absolute bottom-10 left-10 right-10 text-white">
          <p className="text-3xl font-medium leading-snug tracking-tight">Every event at FUT Minna, one ticket away.</p>
          <p className="mt-3 text-sm text-white/70">Book in a minute. Walk in with a scan.</p>
        </div>
      </div>
      <div className="flex flex-col justify-center py-6 lg:px-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-moss-400">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight text-moss-950">{title}</h1>
        <p className="mt-2 text-sm text-moss-800/70">{subtitle}</p>
        <div className="mt-8 rounded-[2rem] bg-white p-6 shadow-[0_8px_30px_rgba(31,38,18,0.06)] md:p-8">{children}</div>
        {footer && <div className="mt-5 text-center text-sm text-moss-800/70">{footer}</div>}
      </div>
    </main>
  )
}
