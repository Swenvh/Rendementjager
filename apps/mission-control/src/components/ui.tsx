import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ERROR_HINTS } from '../lib/stages';
import { ApiFail } from '../lib/api';
import { nl } from '../lib/nl';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Icon({ name, className = 'size-4' }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
const PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  board: 'M4 4h5v16H4zM10 4h5v10h-5zM16 4h4v7h-4z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
  bot: 'M5 8h14v10H5zM12 4v4M9 13h.01M15 13h.01M3 12v2M21 12v2',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  palette: 'M12 3a9 9 0 100 18c1.5 0 2-1 1.5-2s0-2 1.5-2h2a3 3 0 003-3c0-6-4-11-8-11zM8 11h.01M12 8h.01M16 11h.01',
  gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19 12l2-1-2-4-2 .5-1.5-1L15 4h-4l-.5 2.5-1.5 1L7 7l-2 4 2 1v1l-2 1 2 4 2-.5 1.5 1L11 20h4l.5-2.5 1.5-1 2 .5 2-4-2-1z',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  stop: 'M8 3h8l5 5v8l-5 5H8l-5-5V8z',
  plus: 'M12 5v14M5 12h14',
  play: 'M7 5l12 7-12 7z',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 018 0v3',
  chevL: 'M15 6l-6 6 6 6',
  chevR: 'M9 6l6 6-6 6',
  refresh: 'M4 12a8 8 0 0114-5l2 2M20 4v5h-5M20 12a8 8 0 01-14 5l-2-2M4 20v-5h5',
  menu: 'M4 7h16M4 12h16M4 17h16',
} as const;

type Tone = 'neutral' | 'lime' | 'good' | 'warn' | 'bad';
const TONES: Record<Tone, string> = {
  neutral: 'bg-white/[.06] text-dim border-line',
  lime: 'bg-lime/10 text-lime border-lime/30',
  good: 'bg-pos/10 text-pos border-pos/30',
  warn: 'bg-[#F5B94A]/10 text-[#F5B94A] border-[#F5B94A]/30',
  bad: 'bg-neg/10 text-[#FF8080] border-neg/40',
};
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>{children}</span>;
}

type Variant = 'primary' | 'ghost' | 'danger' | 'outline';
export function Button({ variant = 'outline', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const v: Record<Variant, string> = {
    primary: 'bg-lime text-canvas font-bold hover:brightness-110 disabled:bg-white/10 disabled:text-faint',
    outline: 'border border-line bg-white/[.04] hover:bg-white/[.09] disabled:text-faint disabled:hover:bg-white/[.04]',
    ghost: 'hover:bg-white/[.08] disabled:text-faint',
    danger: 'border border-neg/50 bg-neg/10 text-[#FF9A9A] hover:bg-neg/20 disabled:text-faint disabled:border-line',
  };
  return <button type="button" {...p} className={cx('inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed', v[variant], className)} />;
}

export function Panel({ title, action, children, className, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id} className={cx('rounded-xl border border-line bg-raised', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id={id} className="text-sm font-bold tracking-wide text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-dim">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="status" className="rounded-lg border border-dashed border-line px-4 py-6 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-dim">{children}</p>}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Laden">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton h-10" />)}
    </div>
  );
}

export function ErrorNote({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  const e = error instanceof ApiFail ? error : null;
  const hint = e ? ERROR_HINTS[e.code] : null;
  return (
    <div role="alert" className={cx('rounded-lg border border-neg/50 bg-neg/10 px-3 py-2 text-sm text-[#FFB0B0]', className)}>
      {e && <span className="mr-2 rounded bg-neg/20 px-1.5 py-0.5 font-mono text-xs">{e.code}</span>}
      {e ? nl(e.message) : String(error)}
      {hint && <span className="block text-xs text-dim">{hint}</span>}
    </div>
  );
}

export function Load<T>({ state, children, rows }: { state: { data: T | null; error: unknown; loading: boolean }; children: (d: T) => ReactNode; rows?: number }) {
  if (state.error && !state.data) return <ErrorNote error={state.error} />;
  if (!state.data) return <Skeleton rows={rows} />;
  return <>{children(state.data)}</>;
}

export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'lime' | 'bad' }) {
  return (
    <div className="rounded-xl border border-line bg-raised p-4">
      <p className="text-xs uppercase tracking-[.08em] text-dim">{label}</p>
      <p className={cx('mt-1 font-heading text-2xl font-extrabold tabular', tone === 'lime' && 'text-lime', tone === 'bad' && 'text-[#FF8080]')}>{value}</p>
      {note && <p className="mt-1 text-xs text-dim">{note}</p>}
    </div>
  );
}

/** Modal/side dialog: focus moves in, Escape closes, focus returns to the opener. */
export function Dialog({ label, onClose, children, wide }: { label: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select,textarea,[tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
        if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={cx('scroll-thin h-full w-full overflow-y-auto border-l border-line bg-canvas shadow-2xl outline-none', wide ? 'max-w-3xl' : 'max-w-xl')}>
        {children}
      </div>
    </div>
  );
}

export function Hash({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-dim">—</span>;
  return <code className="break-all rounded bg-white/[.06] px-1.5 py-0.5 font-mono text-xs text-dim" title={value}>{value}</code>;
}
