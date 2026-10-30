import { useState, type FormEvent } from 'react';
import { StageBadge } from '../components/ItemDrawer';
import { Badge, Button, Dialog, Empty, ErrorNote, Icon, Load, PageHeader } from '../components/ui';
import { api, useApi } from '../lib/api';
import { fmtDate } from '../lib/format';
import { useShell } from '../lib/shell';
import { STAGES } from '../lib/stages';

export function Pipeline() {
  const list = useApi<any>('/api/content');
  const { openItem, bump } = useShell();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader title="Pipeline" subtitle="Alle 18 fases. Open een kaart voor script, poorten, auditlog en de toegestane vervolgstappen." action={<Button variant="primary" onClick={() => setCreating(true)}><Icon name="plus" /> Nieuw idee</Button>} />
      <Load state={list} rows={5}>
        {({ items }) => (
          <div className="scroll-thin -mx-4 overflow-x-auto px-4 pb-4 lg:-mx-8 lg:px-8" tabIndex={0} role="region" aria-label="Kanban-bord, horizontaal scrollbaar">
            {items.length === 0 && <Empty title="Nog geen content-items">Voeg een idee toe of draai <code>npm run db:seed</code>.</Empty>}
            <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
              {STAGES.map(([id, label]) => {
                const col = items.filter((i: any) => i.stage === id);
                return (
                  <section key={id} aria-label={`${label}, ${col.length} items`} className="w-64 shrink-0 rounded-xl border border-line bg-raised/60">
                    <header className="flex items-center justify-between border-b border-line px-3 py-2">
                      <h2 className="text-xs font-bold uppercase tracking-[.06em] text-dim">{label}</h2>
                      <span className={`tabular rounded-full px-2 text-xs ${col.length ? 'bg-white/10 text-ink' : 'text-faint'}`}>{col.length}</span>
                    </header>
                    <ul className="min-h-16 space-y-2 p-2">
                      {col.length === 0 && <li className="px-2 py-3 text-center text-xs text-faint">Leeg</li>}
                      {col.map((i: any) => (
                        <li key={i.id}>
                          <button type="button" onClick={() => openItem(i.id)} className="w-full rounded-lg border border-line bg-canvas p-3 text-left transition-colors hover:border-lime/50">
                            <span className="block text-sm font-medium leading-snug">{i.title}</span>
                            <span className="mt-2 flex flex-wrap items-center gap-1.5">
                              {i.template && <Badge>Template {i.template}</Badge>}
                              {i.awaitingGate && <Badge tone={i.awaitingGate === 'G5' ? 'lime' : 'warn'}>{i.awaitingGate}</Badge>}
                              {i.hasVideo && <Badge tone="good">video</Badge>}
                            </span>
                            <span className="mt-1.5 block text-xs text-dim">{i.pillar} · {fmtDate(i.updatedAt)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </Load>
      {creating && <NewIdea onClose={() => setCreating(false)} onDone={() => { setCreating(false); bump(); }} />}
    </>
  );
}

function NewIdea({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [pillar, setPillar] = useState('beleggen-basis');
  const [template, setTemplate] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/content', { body: { title, pillar, template: template || null, actorId: 'owner' } });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog label="Nieuw idee" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="flex items-center justify-between"><h2 className="text-lg font-extrabold">Nieuw idee</h2><Button variant="ghost" aria-label="Sluiten" onClick={onClose}><Icon name="x" /></Button></div>
        <div>
          <label htmlFor="ni-title" className="text-sm font-medium">Onderwerp</label>
          <input id="ni-title" required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Wat is een indexfonds?" className="mt-1 w-full rounded-lg border border-line bg-white/[.04] px-3 py-2" />
          <p className="mt-1 text-xs text-dim">Dubbele onderwerpen worden geweigerd.</p>
        </div>
        <div>
          <label htmlFor="ni-pillar" className="text-sm font-medium">Pijler</label>
          <input id="ni-pillar" required value={pillar} onChange={(e) => setPillar(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-white/[.04] px-3 py-2" />
        </div>
        <div>
          <label htmlFor="ni-tpl" className="text-sm font-medium">Template (optioneel)</label>
          <select id="ni-tpl" value={template} onChange={(e) => setTemplate(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2">
            <option value="">Nog niet gekozen</option><option value="A">A · Rendement in 30 seconden</option><option value="B">B · De markt uitgelegd</option><option value="C">C · Geld in cijfers</option>
          </select>
        </div>
        <ErrorNote error={error} />
        <Button type="submit" variant="primary" disabled={busy} className="w-full">{busy ? 'Bezig…' : 'Idee toevoegen'}</Button>
      </form>
    </Dialog>
  );
}

export { StageBadge };
