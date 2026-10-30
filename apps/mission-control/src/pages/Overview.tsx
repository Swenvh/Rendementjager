import { StageBadge } from '../components/ItemDrawer';
import { Badge, Button, Empty, Load, PageHeader, Panel, Stat } from '../components/ui';
import { useApi } from '../lib/api';
import { eurCents, fmtDateTime } from '../lib/format';
import { useShell } from '../lib/shell';
import { GATE_LABELS, STAGES } from '../lib/stages';

export function Overview() {
  const brief = useApi<any>('/api/brief');
  const system = useApi<any>('/api/system');
  const { openItem } = useShell();
  return (
    <>
      <PageHeader title="Overzicht" subtitle="Live uit de database. Ontbrekende gegevens staan als “geen data”, nooit als 0." action={<Button onClick={brief.reload}>Vernieuwen</Button>} />
      <Load state={brief} rows={6}>
        {({ brief: b }) => {
          const caps = system.data?.costCaps;
          return (
            <div className="space-y-5">
              {b.emergencyStop && <div role="alert" className="rounded-xl border border-neg/60 bg-neg/10 px-4 py-3 text-sm font-medium text-[#FFB0B0]">Noodstop actief: de worker verwerkt niets en overgangen zijn geblokkeerd (behalve Mislukt en Gearchiveerd).</div>}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Content-items" value={b.totalItems} note={b.totalItems === 0 ? 'Nog niets in de database' : undefined} />
                <Stat label="Wacht op goedkeuring" value={b.awaitingApproval.length} tone={b.awaitingApproval.some((a: any) => a.gate === 'G5') ? 'lime' : undefined} />
                <Stat label="Mislukte jobs (7 dgn)" value={b.failedJobs.length} tone={b.failedJobs.length ? 'bad' : undefined} note={`${b.queuedJobs} in wachtrij · ${b.runningJobs} bezig`} />
                <Stat label="Kosten deze maand" value={eurCents(b.costs.monthCents)} note={`Vandaag: ${eurCents(b.costs.todayCents)}${b.costs.estimatedShareToday ? ' (deels schatting)' : ''}${caps ? ` · cap ${eurCents(caps.dailyCents)}/dag` : ''}`} />
              </div>

              <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
                <Panel title="Wacht op goedkeuring" id="ov-await">
                  {b.awaitingApproval.length === 0 ? <Empty title="Niets dat wacht">Zodra een item een poort bereikt (G1 t/m G5) verschijnt het hier.</Empty> : (
                    <ul className="divide-y divide-line">
                      {b.awaitingApproval.map((a: any) => (
                        <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                          <Badge tone={a.gate === 'G5' ? 'lime' : 'neutral'}>{a.gate}</Badge>
                          <div className="min-w-0 flex-1">
                            <button type="button" className="text-left font-medium hover:text-lime" onClick={() => openItem(a.id)}>{a.title}</button>
                            <p className="text-xs text-dim">{GATE_LABELS[a.gate]} · <StageBadge stage={a.stage} /></p>
                          </div>
                          {a.gate === 'G5' && <a className="text-sm text-lime underline" href="#/studio">Naar Video Studio</a>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel title="Mislukte jobs" id="ov-fail">
                  {b.failedJobs.length === 0 ? <Empty title="Geen mislukte jobs in de laatste 7 dagen" /> : (
                    <ul className="space-y-2">
                      {b.failedJobs.map((j: any) => (
                        <li key={j.id} className="rounded-lg border border-neg/40 bg-neg/5 px-3 py-2 text-sm">
                          <p className="font-medium">{j.type} <span className="font-mono text-xs text-dim">{j.id}</span></p>
                          <p className="text-xs text-[#FFB0B0]">{j.lastError ?? 'onbekende fout'}</p>
                          <p className="text-xs text-dim">{fmtDateTime(j.finishedAt)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <a href="#/agents" className="mt-3 inline-block text-sm text-lime underline">Naar Agents &amp; jobs</a>
                </Panel>
              </div>

              <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
                <Panel title="Pipeline in cijfers" id="ov-pipe">
                  <ul className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                    {STAGES.map(([id, label]) => (
                      <li key={id} className="flex items-center justify-between border-b border-line py-1.5 text-sm">
                        <span className={b.pipeline[id] ? '' : 'text-dim'}>{label}</span>
                        <span className={`tabular font-bold ${b.pipeline[id] ? 'text-ink' : 'text-faint'}`}>{b.pipeline[id]}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
                <div className="space-y-5">
                  <Panel title="Gepland" id="ov-sched">
                    {b.upcomingScheduled.length === 0 ? <Empty title="Niets gepland">Plannen kan pas na G5 van de eigenaar.</Empty> : (
                      <ul className="space-y-2">{b.upcomingScheduled.map((s: any) => <li key={s.id} className="text-sm"><button type="button" className="font-medium hover:text-lime" onClick={() => openItem(s.id)}>{s.title}</button><p className="text-xs text-dim">{fmtDateTime(s.scheduledAt)} · {s.platform ?? 'platform onbekend'}</p></li>)}</ul>
                    )}
                  </Panel>
                  <Panel title="Integraties" id="ov-int">
                    <ul className="space-y-1.5">
                      {b.integrations.map((i: any) => (
                        <li key={i.id} className="flex items-center justify-between text-sm"><span>{i.id}</span><span className="flex gap-1.5"><Badge tone={i.mode === 'live' ? 'good' : 'neutral'}>{i.mode}</Badge><Badge tone={i.configured ? 'good' : 'neutral'}>{i.configured ? 'geconfigureerd' : 'niet geconfigureerd'}</Badge></span></li>
                      ))}
                    </ul>
                  </Panel>
                </div>
              </div>
              <p className="text-xs text-dim">Gegenereerd {fmtDateTime(b.generatedAt)}.</p>
            </div>
          );
        }}
      </Load>
    </>
  );
}
