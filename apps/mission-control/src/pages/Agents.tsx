import { useState } from 'react';
import { Badge, Button, Empty, ErrorNote, Load, PageHeader, Panel } from '../components/ui';
import { api, useApi } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { useShell } from '../lib/shell';

const STATUS: Record<string, [string, 'neutral' | 'good' | 'bad' | 'lime']> = { running: ['Bezig', 'lime'], failed: ['Fout', 'bad'], idle: ['Actief geweest', 'good'], never: ['Nog niet gebruikt', 'neutral'] };

export function Agents() {
  const agents = useApi<any>('/api/agents');
  const jobs = useApi<any>('/api/jobs');
  const logs = useApi<any>('/api/logs');
  const { bump } = useShell();
  const [error, setError] = useState<unknown>(null);
  async function act(id: string, what: 'cancel' | 'retry') {
    setError(null);
    try { await api(`/api/jobs/${id}/${what}`, { body: {} }); bump(); } catch (e) { setError(e); }
  }
  async function enqueueBrief() {
    setError(null);
    try { await api('/api/jobs', { body: { type: 'daily_brief' } }); bump(); } catch (e) { setError(e); }
  }
  return (
    <>
      <PageHeader title="Agents" subtitle="Het register uit .claude/agents, met de laatste activiteit uit de database. Jobs draaien pas als je de worker start." action={<Button onClick={enqueueBrief}>Daily brief inplannen</Button>} />
      <ErrorNote error={error} className="mb-4" />
      <div className="space-y-5">
        <Panel title="Register" id="ag-reg">
          <Load state={agents}>
            {({ agents: list }) => (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((a: any) => {
                  const [label, tone] = STATUS[a.status] ?? STATUS.never!;
                  return (
                    <article key={a.id} className="rounded-lg border border-line p-3">
                      <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-extrabold">{a.id}</h3><Badge tone={tone}>{label}</Badge></div>
                      <p className="mt-1 text-sm text-dim">{a.role ?? '—'}</p>
                      <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
                        {a.gates.map((g: string) => <Badge key={g}>{g}</Badge>)}
                        {a.jobTypes.map((t: string) => <Badge key={t} tone="neutral">{t}</Badge>)}
                        {a.queuedJobs > 0 && <Badge tone="warn">{a.queuedJobs} in wachtrij</Badge>}
                      </p>
                      <p className="mt-2 text-xs text-dim">{a.lastActivity ? `Laatste audit-actie: ${fmtDateTime(a.lastActivity.createdAt)}` : a.lastJob ? `Laatste job: ${a.lastJob.type} (${a.lastJob.status})` : 'Geen activiteit geregistreerd'}</p>
                      {a.file && <p className="mt-1 font-mono text-[11px] text-faint">.claude/agents/{a.file}</p>}
                    </article>
                  );
                })}
              </div>
            )}
          </Load>
        </Panel>

        <Panel title="Jobs" id="ag-jobs">
          <Load state={jobs}>
            {({ jobs: list }) => list.length === 0 ? <Empty title="Geen jobs">Jobs verschijnen hier zodra je er een inplant (bijv. de daily brief of een render).</Empty> : (
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <caption className="sr-only">Jobwachtrij</caption>
                  <thead className="text-xs uppercase tracking-[.06em] text-dim"><tr><th className="py-2 pr-3">Type</th><th className="pr-3">Status</th><th className="pr-3">Pogingen</th><th className="pr-3">Aangemaakt</th><th className="pr-3">Fout</th><th><span className="sr-only">Acties</span></th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {list.map((j: any) => (
                      <tr key={j.id}>
                        <td className="py-2 pr-3 font-medium">{j.type}<span className="block font-mono text-[11px] text-faint">{j.id}</span></td>
                        <td className="pr-3"><Badge tone={j.status === 'failed' ? 'bad' : j.status === 'succeeded' ? 'good' : j.status === 'running' ? 'lime' : 'neutral'}>{j.status}</Badge></td>
                        <td className="tabular pr-3">{j.attempts}/{j.maxAttempts}</td>
                        <td className="pr-3 text-xs">{fmtDateTime(j.createdAt)}</td>
                        <td className="max-w-64 pr-3 text-xs text-[#FFB0B0]">{j.lastError ?? ''}</td>
                        <td className="whitespace-nowrap text-right">
                          {j.status === 'queued' && <Button onClick={() => act(j.id, 'cancel')}>Annuleer</Button>}
                          {(j.status === 'failed' || j.status === 'cancelled') && <Button onClick={() => act(j.id, 'retry')}>Opnieuw</Button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Load>
        </Panel>

        <Panel title="Foutlog" id="ag-log">
          <Load state={logs}>
            {({ errors }) => errors.length === 0 ? <Empty title="Geen fouten gelogd" /> : (
              <ul className="space-y-2">{errors.map((e: any) => <li key={e.id} className="rounded-lg border border-line px-3 py-2 text-sm"><Badge tone="bad">{e.scope}</Badge> <span className="text-xs text-dim">{fmtDateTime(e.createdAt)}</span><p className="mt-1">{e.message}</p></li>)}</ul>
            )}
          </Load>
        </Panel>
      </div>
    </>
  );
}
