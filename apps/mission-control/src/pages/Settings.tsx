import { useState } from 'react';
import { Badge, Button, cx, Empty, ErrorNote, Load, PageHeader, Panel } from '../components/ui';
import { api, useApi } from '../lib/api';
import { eurCents, fmtDateTime } from '../lib/format';
import { auditAction, auditReason } from '../lib/nl';
import { useShell } from '../lib/shell';

export function Settings() {
  const sys = useApi<any>('/api/system');
  const logs = useApi<any>('/api/logs');
  const { bump } = useShell();
  const [error, setError] = useState<unknown>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function toggle(on: boolean) {
    setBusy(true); setError(null);
    try {
      await api('/api/system/emergency-stop', { body: { on, reason: reason.trim() || (on ? 'Noodstop via Mission Control' : 'Noodstop opgeheven door eigenaar'), actorId: 'owner' } });
      setReason(''); bump();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Instellingen" subtitle="Alleen status. Sleutels staan in .env of de omgeving en worden hier nooit getoond." />
      <Load state={sys} rows={5}>
        {(s) => (
          <div className="space-y-5">
            <Panel title="Noodstop" id="se-stop">
              <div className="flex flex-wrap items-center gap-4">
                <button type="button" role="switch" aria-checked={s.emergencyStop.active} aria-label="Noodstop" disabled={busy || (s.emergencyStop.active && s.emergencyStop.env)} onClick={() => toggle(!s.emergencyStop.db)}
                  className={cx('relative h-8 w-14 shrink-0 rounded-full border transition-colors disabled:opacity-50', s.emergencyStop.active ? 'border-neg bg-neg/40' : 'border-line bg-white/10')}>
                  <span className={cx('absolute top-0.5 size-6 rounded-full bg-ink transition-all', s.emergencyStop.active ? 'left-[26px]' : 'left-0.5')} />
                </button>
                <div>
                  <p className="font-medium">{s.emergencyStop.active ? 'Noodstop ACTIEF' : 'Noodstop uit'}</p>
                  <p className="text-sm text-dim">Aan: de worker claimt niets en alleen Mislukt/Gearchiveerd zijn nog toegestaan. Uitzetten kan alleen als eigenaar.</p>
                  {s.emergencyStop.env && <p className="text-sm text-[#FF9A9A]">Staat aan via RJ_EMERGENCY_STOP in de omgeving: haal die weg om te kunnen opheffen.</p>}
                </div>
              </div>
              <label htmlFor="se-reason" className="mt-3 block text-xs text-dim">Reden (optioneel, komt in het auditlog)</label>
              <input id="se-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full max-w-md rounded-lg border border-line bg-white/[.04] px-3 py-2 text-sm" />
              <ErrorNote error={error} className="mt-3" />
            </Panel>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Providers" id="se-prov">
                <ul className="divide-y divide-line">{s.providers.map((p: any) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm"><span className="w-28 font-medium">{p.id}</span><Badge tone={p.mode === 'live' ? 'good' : 'neutral'}>{p.mode}</Badge><Badge tone={p.configured ? 'good' : 'neutral'}>{p.configured ? 'geconfigureerd' : 'niet geconfigureerd'}</Badge><span className="w-full text-xs text-dim">{p.note}</span></li>
                ))}</ul>
              </Panel>
              <Panel title="Kostenlimieten" id="se-caps">
                <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
                  <dt className="text-dim">Per dag</dt><dd className="tabular font-bold">{eurCents(s.costCaps.dailyCents)}</dd>
                  <dt className="text-dim">Per maand</dt><dd className="tabular font-bold">{eurCents(s.costCaps.monthlyCents)}</dd>
                  <dt className="text-dim">Per job</dt><dd className="tabular font-bold">{eurCents(s.costCaps.perJobCents)}</dd>
                  <dt className="text-dim">Gelijktijdige jobs</dt><dd className="tabular font-bold">{s.costCaps.maxConcurrentJobs}</dd>
                  <dt className="text-dim">Max. herpogingen</dt><dd className="tabular font-bold">{s.costCaps.maxRetries}</dd>
                </dl>
                <p className="mt-3 text-xs text-dim">Instellen via RJ_DAILY_COST_CAP_EUR, RJ_MONTHLY_COST_CAP_EUR en RJ_PER_JOB_COST_CAP_EUR in .env. Database: {s.database.path} ({s.database.dialect}).</p>
              </Panel>
            </div>
          </div>
        )}
      </Load>
      <div className="mt-5">
        <Panel title="Auditlog (laatste 100)" id="se-audit">
          <Load state={logs}>
            {({ audit }) => audit.length === 0 ? <Empty title="Nog geen auditregels" /> : (
              <div className="scroll-thin max-h-96 overflow-auto">
                <table className="w-full min-w-[600px] text-left text-xs">
                  <caption className="sr-only">Auditlog</caption>
                  <thead className="sticky top-0 bg-raised text-dim"><tr><th className="py-1.5 pr-3">Tijd</th><th className="pr-3">Actie</th><th className="pr-3">Actor</th><th>Reden</th></tr></thead>
                  <tbody className="divide-y divide-line">{audit.map((a: any) => <tr key={a.id}><td className="whitespace-nowrap py-1.5 pr-3">{fmtDateTime(a.createdAt)}</td><td className="pr-3"><Badge tone={a.action.endsWith('denied') ? 'bad' : 'neutral'}>{auditAction(a.action)}</Badge></td><td className="pr-3">{a.actorId}</td><td className="text-dim">{auditReason(a.reason)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </Load>
        </Panel>
      </div>
    </>
  );
}
