import { useMemo, useState } from 'react';
import { Badge, Button, cx, Empty, ErrorNote, Icon, PageHeader, Panel } from '../components/ui';
import { api, useApi } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { useShell } from '../lib/shell';

const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = (d: Date) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));
const inputValue = (d: Date) => `${key(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function Calendar() {
  const { openItem, bump } = useShell();
  const [view, setView] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const cal = useApi<any>('/api/calendar');

  const days = useMemo(() => {
    if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(monday(anchor), i));
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = monday(first);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [view, anchor]);

  const events: any[] = (cal.data?.events ?? []).filter((e: any) => e.status === 'scheduled' || e.status === 'published');
  const byDay = new Map<string, any[]>();
  for (const e of events) { const k = key(new Date(e.scheduledAt)); byDay.set(k, [...(byDay.get(k) ?? []), e]); }

  async function schedule(contentId: string, when: Date, label: string) {
    setError(null); setOk(null);
    try {
      await api(`/api/content/${contentId}/schedule`, { body: { scheduledAt: when.toISOString(), platform: 'instagram', actorId: 'owner' } });
      setOk(`${label} staat nu op ${fmtDateTime(when.toISOString())}.`);
      bump();
    } catch (e) { setError(e); }
  }

  function drop(day: Date) {
    const id = dragId; setDragId(null); setOver(null);
    if (!id) return;
    const ev = events.find((e) => e.contentId === id && e.status === 'scheduled');
    const base = ev ? new Date(ev.scheduledAt) : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 18, 0);
    const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), base.getHours(), base.getMinutes());
    const title = ev?.title ?? cal.data?.schedulable.find((s: any) => s.id === id)?.title ?? 'Item';
    void schedule(id, when, title);
  }

  const step = (n: number) => setAnchor((a) => (view === 'week' ? addDays(a, 7 * n) : new Date(a.getFullYear(), a.getMonth() + n, 1)));
  const title = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }).format(anchor);
  const today = key(new Date());

  return (
    <>
      <PageHeader title="Kalender" subtitle="Sleep een ingepland item naar een andere dag, of gebruik de lijst ernaast. De server controleert G5, het bestand en de caption opnieuw." />
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button aria-label="Vorige" onClick={() => step(-1)}><Icon name="chevL" /></Button>
            <h2 className="min-w-40 text-center font-heading text-lg font-extrabold capitalize" aria-live="polite">{title}</h2>
            <Button aria-label="Volgende" onClick={() => step(1)}><Icon name="chevR" /></Button>
            <Button onClick={() => setAnchor(new Date())}>Vandaag</Button>
            <div role="group" aria-label="Weergave" className="ml-auto flex rounded-lg border border-line p-0.5">
              {(['month', 'week'] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cx('rounded-md px-3 py-1 text-sm', view === v ? 'bg-white/[.12] text-ink' : 'text-dim')}>{v === 'month' ? 'Maand' : 'Week'}</button>)}
            </div>
          </div>
          <ErrorNote error={error} className="mb-3" />
          {ok && <div role="status" className="mb-3 rounded-lg border border-pos/40 bg-pos/10 px-3 py-2 text-sm text-pos">{ok}</div>}
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="grid grid-cols-7 border-b border-line bg-raised text-center text-xs uppercase tracking-[.08em] text-dim">{DAYS.map((d) => <div key={d} className="py-2">{d}</div>)}</div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const k = key(d); const evs = byDay.get(k) ?? [];
                const muted = view === 'month' && d.getMonth() !== anchor.getMonth();
                return (
                  <div key={k} onDragOver={(e) => { if (dragId) { e.preventDefault(); setOver(k); } }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); drop(d); }}
                    className={cx('border-b border-r border-line p-1.5', view === 'week' ? 'min-h-48' : 'min-h-24 sm:min-h-28', muted && 'bg-black/20', over === k && 'bg-lime/10 outline outline-1 -outline-offset-1 outline-lime/60')}>
                    <span className={cx('tabular inline-flex size-6 items-center justify-center rounded-full text-xs', k === today ? 'bg-lime font-bold text-canvas' : muted ? 'text-faint' : 'text-dim')}>{d.getDate()}</span>
                    <ul className="mt-1 space-y-1">
                      {evs.map((e) => (
                        <li key={e.id}>
                          <button type="button" draggable={e.status === 'scheduled'} onDragStart={() => setDragId(e.contentId)} onDragEnd={() => { setDragId(null); setOver(null); }} onClick={() => openItem(e.contentId)}
                            className={cx('w-full truncate rounded border px-1.5 py-1 text-left text-xs', e.status === 'published' ? 'border-pos/40 bg-pos/10 text-pos' : 'cursor-grab border-lime/40 bg-lime/10 text-ink')} title={`${e.title} · ${fmtDateTime(e.scheduledAt)}`}>
                            <span className="tabular text-dim">{new Date(e.scheduledAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span> {e.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
          {!cal.loading && events.length === 0 && <div className="mt-4"><Empty title="Niets ingepland">Een item kan pas ingepland worden na G5 (goedkeuring eigenaar) en de stap “Goedgekeurd voor publicatie”.</Empty></div>}
        </div>

        <aside className="space-y-5">
          <Panel title="Inplanbaar" id="cal-sch">
            {!cal.data || cal.data.schedulable.length === 0 ? <p className="text-sm text-dim">Geen items in “Goedgekeurd voor publicatie”.</p> : (
              <ul className="space-y-3">{cal.data.schedulable.map((s: any) => <Slot key={s.id} id={s.id} title={s.title} label="Inplannen" onGo={schedule} draggable onDragStart={() => setDragId(s.id)} onDragEnd={() => setDragId(null)} />)}</ul>
            )}
          </Panel>
          <Panel title="Ingepland (lijst)" id="cal-list">
            {events.filter((e) => e.status === 'scheduled').length === 0 ? <p className="text-sm text-dim">Niets ingepland.</p> : (
              <ul className="space-y-3">{events.filter((e) => e.status === 'scheduled').map((e) => <Slot key={e.id} id={e.contentId} title={e.title} current={e.scheduledAt} label="Verplaats" onGo={schedule} />)}</ul>
            )}
          </Panel>
          {cal.data?.blocked.length > 0 && (
            <Panel title="Nog niet inplanbaar" id="cal-blk">
              <ul className="space-y-2">{cal.data.blocked.map((b: any) => <li key={b.id} className="text-sm"><button type="button" className="font-medium hover:text-lime" onClick={() => openItem(b.id)}>{b.title}</button><p className="text-xs text-dim"><Badge tone="warn">{b.reason}</Badge></p></li>)}</ul>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}

function Slot({ id, title, current, label, onGo, draggable, onDragStart, onDragEnd }: { id: string; title: string; current?: string; label: string; onGo: (id: string, when: Date, t: string) => void; draggable?: boolean; onDragStart?: () => void; onDragEnd?: () => void }) {
  const def = current ? new Date(current) : (() => { const d = addDays(new Date(), 2); d.setHours(18, 0, 0, 0); return d; })();
  const [v, setV] = useState(inputValue(def));
  return (
    <li draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} className={cx('rounded-lg border border-line p-2.5', draggable && 'cursor-grab')}>
      <p className="text-sm font-medium">{title}</p>
      {current && <p className="text-xs text-dim">Nu: {fmtDateTime(current)}</p>}
      <div className="mt-2 flex gap-2">
        <label className="sr-only" htmlFor={`slot-${id}`}>Datum en tijd voor {title}</label>
        <input id={`slot-${id}`} type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-white/[.04] px-2 py-1 text-sm [color-scheme:dark]" />
        <Button onClick={() => v && onGo(id, new Date(v), title)}>{label}</Button>
      </div>
    </li>
  );
}
