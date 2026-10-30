import { useState } from 'react';
import { Badge, Button, ErrorNote, Hash, Load, PageHeader, Panel } from '../components/ui';
import { api, useApi } from '../lib/api';
import { fmtDate } from '../lib/format';
import { useShell } from '../lib/shell';

const KIND_LABEL: Record<string, string> = { compounding: 'Rente op rente', cost: 'Kosten van beleggen', inflation: 'Inflatie' };
const HEADERS = { 'x-rj-owner-action': 'g1-approve-method-brief' };

function Method({ m, confirmation }: { m: any; confirmation: string }) {
  const { bump } = useShell();
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const b = m.brief;
  const act = async (path: string, body: object, done: (r: any) => string) => {
    setBusy(true);
    setErr(null);
    try {
      setMsg(done(await api(`/api/methods/${m.kind}/${path}`, { body, headers: HEADERS })));
      bump();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title={`${KIND_LABEL[m.kind] ?? m.kind} (${m.kind})`} id={`mb-${m.kind}`}>
      {!b ? <p className="text-sm text-dim">Nog geen methodebrief. Maak de concepten aan met de knop bovenaan.</p> : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={b.status === 'approved' ? 'good' : 'neutral'}>{b.status === 'approved' ? 'goedgekeurd door eigenaar' : 'concept'}</Badge>
            {m.unverifiedCount > 0 && <Badge tone="warn">{m.unverifiedCount} bron(nen) UNVERIFIED</Badge>}
            <span className="text-xs text-dim">Bijgewerkt {fmtDate(b.updatedAt)}</span>
          </div>
          <p className="whitespace-pre-line text-sm text-dim">{b.summary}</p>
          <details><summary className="cursor-pointer text-sm font-bold">Kernfeiten en wat niet te claimen</summary><ul className="mt-1 list-disc pl-5 text-sm">{b.keyFacts.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul></details>
          <ul className="space-y-1 text-xs">{m.sources.map((s: any) => (
            <li key={s.id}><Badge tone={s.unverified ? 'warn' : 'good'}>{s.unverified ? 'UNVERIFIED' : 'geverifieerd'}</Badge> <Badge>T{s.trustTier}</Badge>{' '}
              <a className="text-lime underline" href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a> <span className="text-dim">· {s.publisher}, {fmtDate(s.accessedAt)}</span>
              {s.unverified && <div className="ml-1 text-dim">{s.excerpt}</div>}</li>
          ))}</ul>
          <div className="text-xs text-dim">Brief-hash: <Hash value={m.hash} /></div>
          <div className="text-sm">Items van deze reeks vóór SCRIPTING: <b className="tabular">{m.items.preScript}</b> · G1 geldig: <b className="tabular">{m.items.g1Valid}</b> · G1 ontbreekt: <b className="tabular">{m.items.g1Missing}</b> <span className="text-dim">(totaal in reeks: {m.items.total})</span></div>
          {m.unverifiedCount > 0 && (
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>Ik weet dat {m.unverifiedCount} bron(nen) niet zijn opgehaald en nog gecontroleerd moeten worden; de reeks gebruikt geen cijfers uit die bronnen.</span></label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy || (m.unverifiedCount > 0 && !ack)} onClick={() => act('approve', { briefId: b.id, briefHash: m.hash, acknowledgeUnverified: ack, confirmation }, (r) => `G1 gegeven aan ${r.approvedItemIds.length} item(s); ${r.alreadyValid} had al een geldige G1.`)}>G1 goedkeuren voor serie</Button>
            {b.status === 'approved' && <Button variant="danger" disabled={busy} onClick={() => act('revoke', { briefId: b.id, reason: 'Ingetrokken door eigenaar in Mission Control' }, (r) => `${r.invalidated} goedkeuring(en) ingetrokken.`)}>Goedkeuring intrekken</Button>}
          </div>
          <p className="text-xs text-dim">De goedkeuring is gebonden aan bovenstaande hash. Wijzigt de brief, dan vervalt G1 voor alle items van deze reeks. Alleen G1 wordt gegeven; G2 tot en met G5 blijven nodig.</p>
          {msg && <p role="status" className="text-sm text-pos">{msg}</p>}
          {err ? <ErrorNote error={err} /> : null}
        </div>
      )}
    </Panel>
  );
}

export function Methodebrieven() {
  const state = useApi<any>('/api/methods');
  const { bump } = useShell();
  const [err, setErr] = useState<unknown>(null);
  return (
    <>
      <PageHeader title="Methodebriefs" subtitle="Eén methodebrief per reeks onderbouwt alle rekenitems van die reeks. Jij geeft G1 voor de hele reeks; geen agent kan dat." action={<Button onClick={() => api('/api/methods/ensure', { body: {} }).then(bump, setErr)}>Ontbrekende briefs aanmaken</Button>} />
      {err ? <ErrorNote error={err} /> : null}
      <div className="space-y-5"><Load state={state}>{({ methods, confirmation }) => <>{methods.map((m: any) => <Method key={m.kind} m={m} confirmation={confirmation} />)}</>}</Load></div>
    </>
  );
}
