import { useEffect, useState } from 'react';
import { StageBadge } from '../components/ItemDrawer';
import { Badge, Button, Empty, ErrorNote, Hash, Icon, Load, PageHeader, Panel } from '../components/ui';
import { api, useApi } from '../lib/api';
import { dur, fmtDateTime } from '../lib/format';
import { useShell } from '../lib/shell';
import { GATE_LABELS } from '../lib/stages';

const OWNER_CONFIRMATION = 'Ik keur deze exacte versie goed';
const JOBS: [string, string][] = [['generate_audio', 'Voice-over'], ['render_video', 'Video renderen'], ['render_cover', 'Cover'], ['media_qa', 'Media-QA']];

export function Studio() {
  const list = useApi<any>('/api/content');
  const [sel, setSel] = useState<string | null>(null);
  const items: any[] = list.data?.items ?? [];
  useEffect(() => {
    if (!sel && items.length) setSel((items.find((i) => i.hasVideo) ?? items[0]).id);
  }, [items, sel]);
  return (
    <>
      <PageHeader title="Video Studio" subtitle="Bekijk de gerenderde MP4 en de caption. G5 geef je hier, op precies deze versie." />
      <Load state={list}>
        {() => items.length === 0 ? <Empty title="Geen content-items" /> : (
          <>
            <div className="mb-4 max-w-xl">
              <label htmlFor="st-item" className="text-sm font-medium">Content-item</label>
              <select id="st-item" value={sel ?? ''} onChange={(e) => setSel(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2">
                {items.map((i) => <option key={i.id} value={i.id}>{i.title}{i.hasVideo ? ' · video' : ''}</option>)}
              </select>
            </div>
            {sel && <StudioItem key={sel} id={sel} />}
          </>
        )}
      </Load>
    </>
  );
}

function StudioItem({ id }: { id: string }) {
  const detail = useApi<any>(`/api/content/${id}`);
  return (
    <Load state={detail} rows={6}>
      {(d) => {
        const { item, video, cover } = d;
        return (
          <div className="grid gap-5 xl:grid-cols-[minmax(320px,420px)_1fr]">
            <div className="space-y-5">
              <Panel title="Video" id="st-video" action={<StageBadge stage={item.stage} />}>
                {video?.url && video.fileExists ? (
                  <video key={video.sha256} controls preload="metadata" playsInline poster={cover?.url ?? undefined} className="mx-auto aspect-[9/16] h-[70vh] max-h-[760px] w-auto max-w-full rounded-lg bg-black" aria-label={`Video van ${item.title}`}>
                    <source src={video.url} type="video/mp4" />
                    Je browser kan deze video niet afspelen.
                  </video>
                ) : <Empty title={video ? 'Videobestand niet gevonden' : 'Nog geen video geregistreerd'}>{video ? video.path : 'Render de video of koppel een bestaand bestand (npm run link-first-reel -w @rj/mission-control).'}</Empty>}
                {video && <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"><dt className="text-dim">Formaat</dt><dd>{video.width && video.height ? `${video.width}×${video.height}` : '—'} · {dur(video.durationMs)}</dd><dt className="text-dim">Bestand</dt><dd className="break-all">{video.path}</dd><dt className="text-dim">sha256</dt><dd><Hash value={video.sha256} /></dd></dl>}
              </Panel>
              <Panel title="Cover" id="st-cover">
                {cover?.url ? <img src={cover.url} alt={`Cover van ${item.title}`} className="mx-auto max-h-96 rounded-lg border border-line" loading="lazy" /> : <Empty title="Nog geen cover" />}
              </Panel>
            </div>

            <div className="space-y-5">
              <OwnerApproval d={d} />
              <CaptionPanel d={d} />
              <Panel title="Script" id="st-script">
                {d.currentRevision ? (
                  <div className="space-y-2 text-sm"><Badge>v{d.currentRevision.version}</Badge><p className="font-bold">{d.currentRevision.hook}</p><p className="whitespace-pre-wrap text-dim">{d.currentRevision.body}</p></div>
                ) : d.scriptFile ? (
                  <><Badge tone="warn">Concept uit bestand, geen goedgekeurde revisie</Badge><pre className="scroll-thin mt-2 max-h-80 overflow-auto whitespace-pre-wrap font-sans text-sm text-dim">{d.scriptFile}</pre></>
                ) : <p className="text-sm text-dim">Nog geen script.</p>}
              </Panel>
              <RenderPanel d={d} />
            </div>
          </div>
        );
      }}
    </Load>
  );
}

function OwnerApproval({ d }: { d: any }) {
  const { bump } = useShell();
  const { item, gates } = d;
  const [seen, setSeen] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const ready = item.stage === 'READY_FOR_EDITOR';
  const hasBinding = !!item.currentAssetSha256 && !!item.captionHash && !!d.video?.fileExists;
  const g5 = gates.G5;

  async function decide(decision: 'approved' | 'rejected') {
    setBusy(true); setError(null); setDone(null);
    try {
      await api(`/api/content/${item.id}/owner-approval`, {
        headers: { 'x-rj-owner-action': 'g5-approve-exact-version' },
        body: { actorId: 'owner', confirmation: OWNER_CONFIRMATION, assetSha256: item.currentAssetSha256, captionHash: item.captionHash, decision, notes: notes.trim() || undefined },
      });
      setDone(decision === 'approved' ? 'G5 vastgelegd voor deze exacte video en caption.' : 'Afkeuring vastgelegd.');
      setSeen(false); setNotes(''); bump();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <Panel title="Goedkeuring eigenaar (G5)" id="st-owner" action={g5.satisfied ? <Badge tone="good"><Icon name="check" className="size-3" /> Goedgekeurd</Badge> : <Badge>Open</Badge>}>
      <div className="space-y-4">
        <ul className="grid gap-1.5 sm:grid-cols-3">
          {(['G2', 'G3', 'G4'] as const).map((g) => <li key={g} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs"><Badge tone={gates[g].satisfied ? 'good' : 'neutral'}>{g}</Badge><span>{GATE_LABELS[g]}</span><span className="ml-auto text-dim">{gates[g].satisfied ? 'ja' : 'open'}</span></li>)}
        </ul>
        <div className="rounded-lg border border-line bg-canvas p-3 text-sm">
          <p className="text-xs uppercase tracking-[.08em] text-dim">Je keurt precies dit goed</p>
          <p className="mt-2 text-xs text-dim">Video sha256</p><Hash value={item.currentAssetSha256} />
          <p className="mt-2 text-xs text-dim">Caption (hash <Hash value={item.captionHash} />)</p>
          {item.captionText ? <pre className="scroll-thin mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-sm">{item.captionText}</pre> : <p className="mt-1 text-dim">Geen caption.</p>}
          <p className="mt-2 text-xs text-dim">De server berekent de hash van het bestand opnieuw. Is de video of caption intussen gewijzigd, dan wordt je goedkeuring geweigerd.</p>
        </div>

        {!ready && !g5.satisfied && <div role="status" className="rounded-lg border border-[#F5B94A]/40 bg-[#F5B94A]/10 px-3 py-2 text-sm text-[#F5B94A]">Goedkeuren kan alleen in de fase “Wacht op eigenaar”. Nu: <strong>{stageText(item.stage)}</strong>. Eerst moeten onderzoek, redactie, feiten/compliance en media-QA zijn afgerond.</div>}
        {ready && !hasBinding && <div role="status" className="rounded-lg border border-[#F5B94A]/40 bg-[#F5B94A]/10 px-3 py-2 text-sm text-[#F5B94A]">Video of caption ontbreekt: niets om goed te keuren.</div>}
        {g5.satisfied && <p className="text-sm text-pos">G5 is geldig voor deze versie. Een nieuwe video of caption maakt hem ongeldig.</p>}

        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={seen} disabled={!ready || !hasBinding} onChange={(e) => setSeen(e.target.checked)} className="mt-1 size-4 accent-[#A7F36A]" /> Ik heb de video volledig bekeken en de caption gelezen.</label>
        <Button variant="primary" disabled={!ready || !hasBinding || !seen || busy} onClick={() => decide('approved')} className="w-full sm:w-auto"><Icon name="check" /> {OWNER_CONFIRMATION}</Button>
        <details className="text-sm"><summary className="cursor-pointer text-dim">Afkeuren met reden</summary>
          <label htmlFor="st-rej" className="mt-2 block text-xs text-dim">Reden (verplicht bij afkeuren)</label>
          <textarea id="st-rej" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-line bg-white/[.04] px-3 py-2" />
          <Button variant="danger" className="mt-2" disabled={!ready || notes.trim().length < 3 || busy} onClick={() => decide('rejected')}>Afkeuren</Button>
        </details>
        <ErrorNote error={error} />
        {done && <div role="status" className="rounded-lg border border-pos/40 bg-pos/10 px-3 py-2 text-sm text-pos">{done}</div>}
      </div>
    </Panel>
  );
}
const stageText = (s: string) => ({ IDEA: 'Idee' } as Record<string, string>)[s] ?? s.replaceAll('_', ' ').toLowerCase();

function CaptionPanel({ d }: { d: any }) {
  const { bump } = useShell();
  const [text, setText] = useState<string>(d.item.captionText ?? d.captionFile ?? '');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const changed = text.trim() !== (d.item.captionText ?? '').trim();
  async function save() {
    setBusy(true); setError(null);
    try { await api(`/api/content/${d.item.id}/caption`, { body: { captionText: text, actorId: 'owner' } }); bump(); } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return (
    <Panel title="Caption" id="st-caption">
      <label htmlFor="st-cap" className="sr-only">Caption</label>
      <textarea id="st-cap" value={text} onChange={(e) => setText(e.target.value)} rows={8} className="scroll-thin w-full rounded-lg border border-line bg-white/[.04] px-3 py-2 text-sm" />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button disabled={!changed || busy || text.trim().length === 0} onClick={save}>Caption opslaan</Button>
        <p className="text-xs text-dim">Een gewijzigde caption maakt een bestaande G5 ongeldig.</p>
      </div>
      <ErrorNote error={error} className="mt-2" />
    </Panel>
  );
}

function RenderPanel({ d }: { d: any }) {
  const { bump } = useShell();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  async function enqueue(type: string) {
    setBusy(type); setError(null); setMsg(null);
    try {
      const r = await api('/api/jobs', { body: { type, contentId: d.item.id, idempotencyKey: `${type}:${d.item.id}:${Date.now()}` } });
      setMsg(`${type} in de wachtrij (${r.job.id}). Start de worker met: npm run worker -- --once`);
      bump();
    } catch (e) { setError(e); } finally { setBusy(null); }
  }
  return (
    <Panel title="Render-instellingen" id="st-render">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-dim">Slug</dt><dd>{d.item.slug ?? <span className="text-dim">niet gevonden</span>}</dd>
        <dt className="text-dim">Formaat</dt><dd>1080×1920 · 30 fps · H.264 · Template {d.item.template ?? '—'}</dd>
        <dt className="text-dim">Voice</dt><dd>Zonder stem: alleen ondertitels (leestempo), tenzij <code>RJ_TTS_PROVIDER=elevenlabs</code> met sleutel (betaald, alleen met opdracht van de eigenaar)</dd>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">{JOBS.map(([t, l]) => <Button key={t} disabled={busy !== null} onClick={() => enqueue(t)}>{busy === t ? 'Bezig…' : l}</Button>)}</div>
      <p className="mt-2 text-xs text-dim">Productie-jobs kunnen pas na G2 en G3 (de server weigert eerder).</p>
      <ErrorNote error={error} className="mt-2" />
      {msg && <div role="status" className="mt-2 rounded-lg border border-pos/40 bg-pos/10 px-3 py-2 text-sm text-pos">{msg}</div>}
      {d.jobs.length > 0 && (
        <ul className="mt-3 divide-y divide-line text-sm">{d.jobs.slice(0, 6).map((j: any) => <li key={j.id} className="flex flex-wrap items-center gap-2 py-1.5"><Badge tone={j.status === 'failed' ? 'bad' : j.status === 'succeeded' ? 'good' : 'neutral'}>{j.status}</Badge><span>{j.type}</span><span className="ml-auto text-xs text-dim">{fmtDateTime(j.createdAt)}</span>{j.lastError && <span className="w-full text-xs text-[#FFB0B0]">{j.lastError}</span>}</li>)}</ul>
      )}
    </Panel>
  );
}
