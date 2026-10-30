import { useState } from 'react';
import { Badge, Button, Empty, ErrorNote, Icon, Load, PageHeader, Panel } from '../components/ui';
import { api, useApi } from '../lib/api';
import { fmtDateTime, shortHash } from '../lib/format';
import { useShell } from '../lib/shell';

const STATE: Record<string, { label: string; tone: 'neutral' | 'lime' | 'good' | 'warn' | 'bad' }> = {
  approved: { label: 'Goedgekeurd, nog niet ingepland', tone: 'lime' },
  scheduled: { label: 'Ingepland', tone: 'neutral' },
  staged: { label: 'Klaargezet, handmatig plaatsen', tone: 'warn' },
  published: { label: 'Gepubliceerd', tone: 'good' },
};
const FILE_LABEL: Record<string, string> = { 'video.mp4': 'Video (MP4)', 'cover.png': 'Cover', 'caption.txt': 'Caption', 'hashtags.txt': 'Hashtags', 'schedule.txt': 'Tijd', 'manifest.json': 'Manifest' };
const EVENT: Record<string, string> = { package_exported: 'Pakket gemaakt', staged: 'Klaargezet voor handmatig plaatsen', manual_published: 'Handmatig gepubliceerd', published: 'Gepubliceerd via API', refused: 'Geweigerd', live_consent: 'Live-toestemming gewijzigd' };
const toInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const defaultTime = () => { const d = new Date(Date.now() + 24 * 3600_000); d.setHours(18, 0, 0, 0); return toInput(d); };

function ItemCard({ it, onDone, setError }: { it: any; onDone: (msg: string) => void; setError: (e: unknown) => void }) {
  const [when, setWhen] = useState(defaultTime);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState<any>(null);
  const st = STATE[it.state] ?? STATE.approved!;
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true); setError(null);
    try { const m = await fn(); if (m) onDone(m); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <article className="rounded-xl border border-line bg-raised p-4" aria-label={it.title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading font-bold">{it.title}</h3>
          <p className="mt-0.5 text-xs text-dim">Video <code>{shortHash(it.videoSha256)}</code> · caption <code>{shortHash(it.captionHash)}</code></p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={st.tone}>{st.label}</Badge>
          <Badge tone={it.g5.valid ? 'good' : 'bad'}>{it.g5.valid ? 'G5 geldig' : 'G5 ongeldig'}</Badge>
        </div>
      </div>
      {it.publication?.scheduledAt && <p className="mt-2 text-sm">Gepland: <strong>{fmtDateTime(it.publication.scheduledAt)}</strong>{it.publication.url && <> · <a className="text-lime underline" href={it.publication.url} target="_blank" rel="noreferrer noopener">bekijk post</a></>}</p>}
      {it.staged && <p className="mt-1 text-sm text-[#F5B94A]">Klaargezet {fmtDateTime(it.staged.stagedAt)} ({it.staged.reason}). Plaats de reel zelf op Instagram en registreer hieronder de link.</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button disabled={busy || !it.g5.valid} onClick={() => run(async () => { await api(`/api/publish/${it.id}/package`, { method: 'POST', body: {} }); return 'Publicatiepakket gemaakt.'; })}><Icon name="plus" /> {it.package ? 'Pakket opnieuw maken' : 'Pakket maken'}</Button>
        {it.package && <Button disabled={busy} onClick={() => run(async () => { const v = await api(`/api/publish/${it.id}/verify`, { method: 'POST', body: {} }); setVerify(v); })}><Icon name="check" /> Controleer pakket</Button>}
        {it.package?.files.map((f: string) => (
          <a key={f} href={`/api/publish/${it.id}/package/${f}`} download className="inline-flex min-h-9 items-center rounded-lg border border-line bg-white/[.04] px-3 text-sm hover:bg-white/[.09]">{FILE_LABEL[f] ?? f}</a>
        ))}
      </div>
      {!it.package && <p className="mt-2 text-xs text-dim">Nog geen pakket. Maak het pakket om de exacte MP4, cover, caption en hashtags te downloaden.</p>}
      {verify && (
        <div role="status" className={`mt-3 rounded-lg border px-3 py-2 text-sm ${verify.ok ? 'border-pos/40 bg-pos/10 text-pos' : 'border-neg/50 bg-neg/10 text-[#FFB0B0]'}`}>
          {verify.ok ? 'Pakket klopt met de goedgekeurde video en caption.' : `Niet plaatsen: ${verify.reasons.join('; ')}`}
        </div>
      )}

      {(it.state === 'approved' || it.state === 'scheduled') && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <label className="text-xs text-dim">{it.state === 'scheduled' ? 'Nieuwe tijd' : 'Inplannen op'}
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-1 block rounded-lg border border-line bg-white/[.04] px-3 py-1.5 text-sm text-ink" />
          </label>
          <Button variant="primary" disabled={busy || !it.g5.valid} onClick={() => run(async () => { await api(`/api/content/${it.id}/schedule`, { body: { scheduledAt: new Date(when).toISOString(), platform: 'instagram', actorId: 'owner' } }); return 'Ingepland: de server heeft G5, bestand en caption opnieuw gecontroleerd.'; })}>{it.state === 'scheduled' ? 'Opnieuw inplannen' : 'Inplannen'}</Button>
        </div>
      )}

      {it.state === 'scheduled' || it.state === 'staged' ? (
        <div className="mt-3 border-t border-line pt-3">
          <label htmlFor={`url-${it.id}`} className="text-xs text-dim">Link naar de gepubliceerde reel (instagram.com/reel/...)</label>
          <div className="mt-1 flex flex-wrap gap-2">
            <input id={`url-${it.id}`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/reel/…" className="min-w-0 flex-1 rounded-lg border border-line bg-white/[.04] px-3 py-1.5 text-sm" />
            <Button disabled={busy || !url.trim()} onClick={() => run(async () => { await api(`/api/publish/${it.id}/manual-published`, { body: { url, actorId: 'owner' } }); setUrl(''); return 'Gemarkeerd als handmatig gepubliceerd.'; })}>Markeer als handmatig gepubliceerd</Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function Publicatie() {
  const { bump } = useShell();
  const data = useApi<any>('/api/publish');
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState<string | null>(null);
  const done = (m: string) => { setOk(m); bump(); };

  return (
    <>
      <PageHeader title="Publicatie" subtitle="Alleen goedgekeurde reels (G5 van de eigenaar, gebonden aan video en caption). Standaard plaats je zelf: download het pakket, post, en registreer de link. Live posten via Instagram is uit en onbeproefd." />
      <ErrorNote error={error} className="mb-3" />
      {ok && <div role="status" className="mb-3 rounded-lg border border-pos/40 bg-pos/10 px-3 py-2 text-sm text-pos">{ok}</div>}
      <Load state={data} rows={4}>
        {(d) => (
          <div className="space-y-5">
            {d.emergencyStop && <div role="alert" className="rounded-lg border border-neg/50 bg-neg/10 px-3 py-2 text-sm text-[#FFB0B0]">Noodstop actief: er wordt niets klaargezet of gepubliceerd.</div>}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Panel title="Modus"><p className="font-medium">{d.config.mode === 'instagram' ? 'Instagram-API (live gevraagd)' : 'Handmatig plaatsen'}</p><p className="mt-1 text-xs text-dim">Adapter: {d.live.adapterMode}, {d.live.adapterConfigured ? 'geconfigureerd' : 'niet geconfigureerd'}. Live-verbinding is nooit getest.</p></Panel>
              <Panel title="Dagelijks maximum"><p className="font-medium">{d.capacity.usedLast24h} van {d.capacity.dailyCap} in 24 uur</p><p className="mt-1 text-xs text-dim">Minimale tussenruimte {d.config.minSpacingMin} min{d.capacity.nextAllowedAt && <> · volgende vanaf {fmtDateTime(d.capacity.nextAllowedAt)}</>}</p></Panel>
              <Panel title="Live-toestemming"><div className="flex items-center gap-2"><Badge tone={d.live.consent ? 'warn' : 'neutral'}>{d.live.consent ? 'Aan' : 'Uit'}</Badge><Button disabled={!d.live.consent && d.live.adapterMode !== 'live'} onClick={() => api('/api/publish/live-consent', { body: { on: !d.live.consent, actorId: 'owner' } }).then(() => done('Live-toestemming bijgewerkt.')).catch(setError)}>{d.live.consent ? 'Intrekken' : 'Toestaan'}</Button></div><p className="mt-1 text-xs text-dim">Alleen de eigenaar. Zonder toestemming, sleutels en RJ_INTEGRATIONS_LIVE=1 blijft alles handmatig.</p></Panel>
              <Panel title="Plaatsen"><Button onClick={() => api('/api/publish/due', { method: 'POST', body: {} }).then((r: any) => done(`${r.created + r.requeued} publicatietaak/taken in de wachtrij (verwerk met npm run worker).`)).catch(setError)}>Verwerk te laat geplande items</Button><p className="mt-1 text-xs text-dim">Zet de job publish_due in de wachtrij.</p></Panel>
            </div>

            <div className="space-y-3">
              {d.items.length === 0 ? <Empty title="Niets om te publiceren">Een reel verschijnt hier nadat jij G5 hebt gegeven op de Review-pagina.</Empty> : d.items.map((it: any) => <ItemCard key={it.id} it={it} onDone={done} setError={setError} />)}
            </div>

            <Panel title="Publicatielog" id="pb-log">
              {d.log.length === 0 && d.errors.length === 0 ? <Empty title="Nog geen publicatie-activiteit" /> : (
                <ul className="divide-y divide-line text-sm">
                  {d.errors.map((e: any) => <li key={e.id} className="py-2"><Badge tone="bad">Fout</Badge> <span className="ml-2">{e.message}</span> <span className="text-xs text-dim">{fmtDateTime(e.at)}</span></li>)}
                  {d.log.map((l: any) => <li key={l.id} className="py-2"><Badge>{EVENT[l.event] ?? 'Publicatie'}</Badge> <span className="ml-2">{l.reason}</span> <span className="text-xs text-dim">{l.actorId} · {fmtDateTime(l.at)}</span></li>)}
                </ul>
              )}
            </Panel>
          </div>
        )}
      </Load>
    </>
  );
}
