import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Empty, ErrorNote, Hash, Icon, Load, PageHeader, Panel, cx } from '../components/ui';
import { api, useApi } from '../lib/api';
import { shortHash } from '../lib/format';
import { useShell } from '../lib/shell';

const OWNER_CONFIRMATION = 'Ik keur deze exacte versie goed';
const OWNER_HEADERS = { 'x-rj-owner-action': 'g5-approve-exact-version' };
const GATE_OF: Record<string, 'G2' | 'G3' | 'G4' | 'G5' | null> = { prep: null, G2: 'G2', G3: 'G3', render: null, G4: 'G4', G5: 'G5', schedule: null };
const HINT: Record<string, string> = {
  prep: 'Wacht op G1: een research brief met bronnen uit het register. Daarna gaat het script naar G2.',
  G2: 'Beoordeel hook, structuur, toon en dat er precies één CTA is. Keur goed of af.',
  G3: 'Controleer elk getal in de tabel en de compliance. Eigenaar telt voor beide rollen.',
  render: 'Gate G2 en G3 zijn gehaald. De worker rendert in een batch (concurrency en limieten uit de instellingen).',
  G4: 'Bekijk de render en de technische controles. Goedkeuring hoort bij precies deze sha256.',
  G5: 'Eigenaarsgoedkeuring: per item, op precies deze video-sha256 en caption-hash. Nooit in één klap.',
  schedule: 'G5 is gegeven. Inplannen gaat via de kalender (hash wordt opnieuw gecontroleerd).',
};

const eur = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);
function claimValue(c: { value: number | null; unit: string | null }) {
  if (c.value === null) return 'geen data';
  if (c.unit === 'EUR') return eur(c.value);
  if (c.unit === 'percent') return `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 }).format(c.value)}%`;
  if (c.unit === 'years') return `${c.value} jaar`;
  return String(c.value);
}
const PATTERN_NL: Record<string, string> = { question: 'vraag', statement: 'bewering', contrast: 'contrast' };
const KIND_NL: Record<string, string> = { compounding: 'rente op rente', cost: 'kosten', inflation: 'inflatie' };

export function Review() {
  const { bump } = useShell();
  const [bucket, setBucket] = useState<string>('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const path = `/api/review/queue?limit=200${bucket ? `&bucket=${bucket}` : ''}${kind ? `&kind=${kind}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  const queue = useApi<any>(path);
  const items: any[] = queue.data?.items ?? [];
  const buckets: any[] = queue.data?.buckets ?? [];
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [help, setHelp] = useState(false);
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rejectRef = useRef<HTMLTextAreaElement | null>(null);
  const approveRef = useRef<HTMLButtonElement | null>(null);

  // First visit: start in the bucket with the most work that is not G1 prep.
  useEffect(() => {
    if (bucket === '' && buckets.length) {
      const order = ['G5', 'G4', 'G3', 'G2', 'render', 'prep', 'schedule'];
      const pick = order.map((id) => buckets.find((b) => b.id === id)).find((b) => b && b.count > 0) ?? buckets[0];
      setBucket(pick.id);
    }
  }, [buckets, bucket]);
  useEffect(() => {
    setIdx(0);
    setSel(new Set());
  }, [bucket, kind, q]);
  useEffect(() => {
    if (idx >= items.length && items.length > 0) setIdx(items.length - 1);
  }, [items.length, idx]);

  const current = items[idx];
  const gate = GATE_OF[bucket] ?? null;

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, []);
  const toggleSel = useCallback((id: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  }), []);

  // Keyboard-driven review. Ignored while typing in a field.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k === 'j' || k === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
      else if (k === 'k' || k === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
      else if (k === ' ') { e.preventDefault(); togglePlay(); }
      else if (k === 's' && current) toggleSel(current.id);
      else if (k === 'r') { e.preventDefault(); rejectRef.current?.focus(); }
      else if (k === 'a') { e.preventDefault(); approveRef.current?.focus(); approveRef.current?.click(); }
      else if (k === '?') setHelp((h) => !h);
      else if (/^[1-7]$/.test(k) && buckets[Number(k) - 1]) setBucket(buckets[Number(k) - 1].id);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [items.length, current, buckets, togglePlay, toggleSel]);

  const after = useCallback(() => { bump(); queue.reload(); }, [bump, queue]);

  return (
    <>
      <PageHeader
        title="Review"
        subtitle="Snel door de wachtrij met het toetsenbord. Goedkeuring van G5 blijft per item, op precies de gereviewde video en caption."
        action={<Button onClick={() => setHelp((h) => !h)} aria-expanded={help}>Sneltoetsen (?)</Button>}
      />
      {help && (
        <div role="note" className="mb-4 grid gap-x-8 gap-y-1 rounded-xl border border-line bg-raised p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[['j / ↓', 'volgend item'], ['k / ↑', 'vorig item'], ['spatie', 'preview afspelen / pauzeren'], ['s', 'item selecteren'], ['a', 'goedkeuren (G2, G3, G4) of naar het G5-knopje'], ['r', 'afkeuren: naar het redenveld'], ['1–7', 'wachtrij kiezen'], ['?', 'dit overzicht']].map(([k, d]) => (
            <p key={k}><kbd className="rounded border border-line bg-white/[.06] px-1.5 py-0.5 font-mono text-xs">{k}</kbd> <span className="text-dim">{d}</span></p>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Wachtrijen op gereedheid">
        {buckets.map((b, n) => (
          <button key={b.id} role="tab" aria-selected={b.id === bucket} type="button" onClick={() => setBucket(b.id)}
            className={cx('inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm', b.id === bucket ? 'border-lime/50 bg-lime/10 text-ink' : 'border-line bg-white/[.03] text-dim hover:text-ink')}>
            <span className="text-xs text-faint">{n + 1}</span>{b.label}<span className="tabular rounded-full bg-white/10 px-2 text-xs font-bold text-ink">{b.count}</span>
          </button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="rv-kind">Reeks</label>
          <select id="rv-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="min-h-9 rounded-lg border border-line bg-raised px-2 text-sm">
            <option value="">Alle reeksen</option>
            <option value="compounding">Rente op rente</option>
            <option value="cost">Kosten</option>
            <option value="inflation">Inflatie</option>
          </select>
          <label className="sr-only" htmlFor="rv-q">Zoeken</label>
          <input id="rv-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek op titel" className="min-h-9 w-44 rounded-lg border border-line bg-raised px-3 text-sm" />
        </div>
      </div>
      <p className="mb-3 text-sm text-dim">{HINT[bucket] ?? ''}</p>

      <Load state={queue} rows={6}>
        {() => items.length === 0 ? (
          <Empty title="Niets in deze wachtrij">Kies een andere wachtrij of genereer drafts met <code>npm run series -- generate</code>.</Empty>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(300px,380px)_1fr]">
            <div className="space-y-3">
              <BulkBar bucket={bucket} items={items} sel={sel} setSel={setSel} onDone={after} />
              {bucket === 'render' && <RenderBatchBar onDone={after} />}
              {gate === 'G5' && <G5Batch items={items} sel={sel} seen={seen} setSeen={setSeen} onDone={after} />}
              <ul className="scroll-thin max-h-[70vh] divide-y divide-line overflow-y-auto rounded-xl border border-line bg-raised" aria-label="Wachtrij">
                {items.map((it, n) => (
                  <li key={it.id} className={cx('flex items-start gap-2 px-3 py-2', n === idx && 'bg-lime/[.07] outline outline-1 -outline-offset-1 outline-lime/40')}>
                    <input type="checkbox" aria-label={`Selecteer ${it.title}`} checked={sel.has(it.id)} onChange={() => toggleSel(it.id)} className="mt-1 size-4 accent-[#A7F36A]" />
                    <button type="button" onClick={() => setIdx(n)} aria-current={n === idx ? 'true' : undefined} className="min-w-0 flex-1 text-left">
                      <span className="line-clamp-2 text-sm font-medium">{it.title}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {it.tags && <><Badge>{KIND_NL[it.tags.kind]}</Badge><Badge>{PATTERN_NL[it.tags.hookPattern]}</Badge></>}
                        {it.autoPass ? <Badge tone="good">checks OK</Badge> : <Badge tone="warn">handmatig</Badge>}
                        {it.bulkNext && it.autoPass && <Badge tone="lime">bulk</Badge>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-dim">{queue.data.total} items in deze wachtrij{queue.data.total > items.length ? ` (eerste ${items.length} getoond)` : ''}.</p>
            </div>
            {current && <ReviewCard key={current.id} id={current.id} bucket={bucket} gate={gate} videoRef={videoRef} rejectRef={rejectRef} approveRef={approveRef} seen={!!seen[current.id]} setSeen={(v) => setSeen((s) => ({ ...s, [current.id]: v }))} onDone={() => { after(); setIdx((i) => Math.min(i, items.length - 2)); }} />}
          </div>
        )}
      </Load>
    </>
  );
}

function BulkBar({ bucket, items, sel, setSel, onDone }: { bucket: string; items: any[]; sel: Set<string>; setSel: (s: Set<string>) => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (GATE_OF[bucket] === 'G5' || bucket === 'schedule') return null;
  const eligible = items.filter((i) => i.autoPass && i.bulkNext);
  const chosen = items.filter((i) => sel.has(i.id));
  const ready = chosen.filter((i) => i.autoPass && i.bulkNext);
  async function run() {
    setBusy(true); setError(null); setMsg(null);
    try {
      const r = await api('/api/review/advance', { body: { ids: ready.map((i) => i.id), actorId: 'chief-of-staff' } });
      setMsg(`${r.advanced} naar de volgende fase, ${r.refused} geweigerd door de poortcontrole.${r.refused ? ' ' + r.results.filter((x: any) => !x.ok).slice(0, 2).map((x: any) => x.error).join(' · ') : ''}`);
      setSel(new Set());
      onDone();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return (
    <div className="rounded-xl border border-line bg-raised p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setSel(new Set(eligible.map((i) => i.id)))} disabled={eligible.length === 0}>Selecteer geschikte ({eligible.length})</Button>
        <Button variant="primary" disabled={ready.length === 0 || busy} onClick={run}>Naar volgende fase ({ready.length})</Button>
      </div>
      <p className="mt-2 text-xs text-dim">Alleen items waarvan de automatische controles slagen en waarvan de poort al door een reviewer is gehaald. Dit keurt niets goed en overslaan van G1 t/m G5 kan niet.</p>
      <ErrorNote error={error} className="mt-2" />
      {msg && <p role="status" className="mt-2 text-xs text-pos">{msg}</p>}
    </div>
  );
}

function RenderBatchBar({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setBusy(true); setError(null); setMsg(null);
    try {
      const r = await api('/api/review/render-batch', { body: {} });
      setMsg(r.queued ? `Render-batch ${r.created ? 'ingepland' : 'stond al in de wachtrij'}: ${r.items} Reels, ongeveer ${r.estimate.sequentialHours} uur achter elkaar (${r.estimate.minutesPerReel} min per Reel). Start de worker: npm run worker -- --once` : 'Geen items met G2 en G3 die op renderen wachten.');
      onDone();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return (
    <div className="rounded-xl border border-line bg-raised p-3 text-sm">
      <Button variant="primary" disabled={busy} onClick={run}>Zet alle klare items in de render-wachtrij</Button>
      <ErrorNote error={error} className="mt-2" />
      {msg && <p role="status" className="mt-2 text-xs text-pos">{msg}</p>}
    </div>
  );
}

/** "Keur deze N goed": one owner-approval call per item, each with that item's own exact hashes. */
function G5Batch({ items, sel, seen, setSeen, onDone }: { items: any[]; sel: Set<string>; seen: Record<string, boolean>; setSeen: (f: (s: Record<string, boolean>) => Record<string, boolean>) => void; onDone: () => void }) {
  const chosen = items.filter((i) => sel.has(i.id));
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, string>>({});
  if (chosen.length === 0) return <p className="rounded-xl border border-dashed border-line p-3 text-xs text-dim">Selecteer met <kbd className="font-mono">s</kbd> of het vinkje maximaal een paar items om ze achter elkaar per item goed te keuren. Elk item blijft een eigen goedkeuring met eigen hash.</p>;
  const allSeen = chosen.every((i) => seen[i.id]);
  const approvable = chosen.every((i) => i.assetSha256 && i.captionHash);
  async function run() {
    setBusy(true);
    const out: Record<string, string> = {};
    for (const i of chosen) {
      try {
        await api(`/api/content/${i.id}/owner-approval`, { headers: OWNER_HEADERS, body: { actorId: 'owner', confirmation: OWNER_CONFIRMATION, assetSha256: i.assetSha256, captionHash: i.captionHash, decision: 'approved' } });
        out[i.id] = 'goedgekeurd';
      } catch (e: any) { out[i.id] = `geweigerd: ${e?.message ?? e}`; }
      setResults({ ...out });
    }
    setBusy(false);
    onDone();
  }
  return (
    <div className="rounded-xl border border-lime/40 bg-lime/[.05] p-3 text-sm">
      <p className="font-bold">Keur deze {chosen.length} goed</p>
      <p className="mt-1 text-xs text-dim">Elke regel is een aparte goedkeuring op precies deze hashes. De server rekent het bestand en de caption per item opnieuw na.</p>
      <ul className="mt-2 space-y-2">
        {chosen.map((i) => (
          <li key={i.id} className="rounded-lg border border-line bg-canvas p-2">
            <p className="line-clamp-1 font-medium">{i.title}</p>
            <p className="mt-1 font-mono text-[11px] text-dim">video {shortHash(i.assetSha256)} · caption {shortHash(i.captionHash)}</p>
            <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" checked={!!seen[i.id]} onChange={(e) => setSeen((s) => ({ ...s, [i.id]: e.target.checked }))} className="size-4 accent-[#A7F36A]" /> Ik heb deze video bekeken en de caption gelezen</label>
            {results[i.id] && <p className={cx('mt-1 text-xs', results[i.id]!.startsWith('goed') ? 'text-pos' : 'text-[#FFB0B0]')}>{results[i.id]}</p>}
          </li>
        ))}
      </ul>
      <Button variant="primary" className="mt-3" disabled={!allSeen || !approvable || busy} onClick={run}><Icon name="check" /> {busy ? 'Bezig…' : `${OWNER_CONFIRMATION} (${chosen.length}x, per item)`}</Button>
    </div>
  );
}

function ReviewCard({ id, bucket, gate, videoRef, rejectRef, approveRef, seen, setSeen, onDone }: { id: string; bucket: string; gate: 'G2' | 'G3' | 'G4' | 'G5' | null; videoRef: React.MutableRefObject<HTMLVideoElement | null>; rejectRef: React.MutableRefObject<HTMLTextAreaElement | null>; approveRef: React.MutableRefObject<HTMLButtonElement | null>; seen: boolean; setSeen: (v: boolean) => void; onDone: () => void }) {
  const detail = useApi<any>(`/api/review/item/${id}`);
  return (
    <Load state={detail} rows={6}>
      {(d) => (
        <div className="space-y-4">
          <Panel title={d.item.title} id={`rv-${id}`} action={d.tags ? <div className="flex gap-1.5"><Badge tone="lime">trial</Badge><Badge>{KIND_NL[d.tags.kind]}</Badge><Badge>{PATTERN_NL[d.tags.hookPattern]}</Badge></div> : undefined}>
            <div className="grid gap-4 lg:grid-cols-[minmax(220px,300px)_1fr]">
              <div>
                {d.video?.fileExists ? (
                  <video ref={videoRef} key={d.video.sha256} controls preload="metadata" playsInline poster={d.cover?.url ?? undefined}
                    onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration && v.currentTime / v.duration >= 0.9) setSeen(true); }}
                    className="mx-auto aspect-[9/16] max-h-[60vh] w-auto max-w-full rounded-lg bg-black" aria-label={`Preview van ${d.item.title}`}>
                    <source src={d.video.url} type="video/mp4" />
                  </video>
                ) : <Empty title={d.video ? 'Videobestand niet gevonden' : 'Nog geen video'}>{bucket === 'G5' || bucket === 'G4' ? 'Er is niets om te bekijken of goed te keuren.' : 'De video komt na het renderen.'}</Empty>}
              </div>
              <div className="min-w-0 space-y-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-[.08em] text-dim">Hook</p>
                  <p className="text-base font-bold">{d.script?.hook ?? '—'}</p>
                </div>
                {d.script && <pre className="scroll-thin max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-canvas p-3 font-sans text-sm text-dim">{d.script.body}{d.script.cta ? `\n\n${d.script.cta}` : ''}</pre>}
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-dim">Scriptrevisie</dt><dd>{d.script ? `v${d.script.version} · ` : '—'}<Hash value={d.script?.sha256} /></dd>
                  <dt className="text-dim">Content-hash</dt><dd><Hash value={d.contentHash} /></dd>
                  <dt className="text-dim">Video sha256</dt><dd><Hash value={d.item.assetSha256} /></dd>
                  <dt className="text-dim">Caption-hash</dt><dd><Hash value={d.item.captionHash} /></dd>
                  {d.tags && <><dt className="text-dim">Experiment</dt><dd>{d.tags.variantGroup} · variant {d.tags.variantIndex + 1} · €{d.tags.amount}/mnd · {d.tags.horizon} jaar · ca. {d.tags.durationS} s</dd></>}
                </dl>
              </div>
            </div>
          </Panel>

          <div className="grid gap-4 2xl:grid-cols-2">
            <Panel title="Cijfers en berekening" id={`rv-num-${id}`}>
              {d.claims.length === 0 ? <Empty title="Geen financiële claims geregistreerd" /> : (
                <div className="scroll-thin max-h-72 overflow-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Getallen in dit script met hun berekening</caption>
                    <thead className="text-xs uppercase tracking-[.06em] text-dim"><tr><th scope="col" className="py-1 pr-3">Claim</th><th scope="col" className="py-1 pr-3 text-right">Waarde</th><th scope="col" className="py-1">Berekening</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {d.claims.map((c: any) => (
                        <tr key={c.id}>
                          <td className="py-1.5 pr-3">{c.claimText}</td>
                          <td className="tabular py-1.5 pr-3 text-right font-medium">{claimValue(c)}</td>
                          <td className="py-1.5"><details><summary className="cursor-pointer text-lime underline">finance-engine</summary><code className="mt-1 block max-w-xs break-all text-[11px] text-dim">{c.calculationRef}</code></details></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            <Panel title="Beeld, stem en bronnen" id={`rv-bg-${id}`}>
              <div className="space-y-2 text-sm">
                <p><span className="text-dim">Stem: </span>{d.voice?.label ?? 'onbekend (nog niet gerenderd)'}</p>
                {d.compliance?.escalateToComplianceReviewer && <p><Badge tone="bad">compliance-escalatie</Badge> <span className="text-dim">{d.compliance.reason}</span></p>}
                {d.background?.mode === 'drone-footage' ? (
                  <>
                    <p><span className="text-dim">Achtergrond: </span>dronebeelden ({d.background.clips.length} clips)</p>
                    <ul className="space-y-1">
                      {d.background.clips.map((c: any) => (
                        <li key={c.clipId} className="text-xs">
                          <span className="font-medium">{c.clipId}</span> · {c.licence} · {c.author}{c.creditRequired ? ' · bronvermelding verplicht' : ''}
                          <span className="block text-dim">{c.credit}{c.rightsNote ? ` (${c.rightsNote})` : ''}</span>
                        </li>
                      ))}
                    </ul>
                    {d.background.captionCreditLines.length > 0 && (
                      <p><Badge tone={d.background.creditInCaption ? 'good' : 'bad'}>{d.background.creditInCaption ? 'credit staat in caption' : 'credit ONTBREEKT in caption'}</Badge>{' '}
                        <span className="text-dim">{d.background.captionCreditLines.join(' · ')}</span></p>
                    )}
                  </>
                ) : <p><span className="text-dim">Achtergrond: </span>{d.background ? 'geanimeerde donkergroene achtergrond (geen gelicenseerde clip beschikbaar)' : 'onbekend (nog niet gerenderd)'}</p>}
              </div>
            </Panel>
            <Panel title="Caption" id={`rv-cap-${id}`}>
              {d.item.captionText ? <pre className="scroll-thin max-h-72 overflow-auto whitespace-pre-wrap font-sans text-sm">{d.item.captionText}</pre> : <Empty title="Geen caption" />}
            </Panel>
          </div>

          <Panel title="Automatische controles en poorten" id={`rv-chk-${id}`}>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {d.checks.map((c: any) => (
                <li key={c.id} className="flex items-start gap-2 text-sm">
                  <Badge tone={c.ok === true ? 'good' : c.ok === false ? 'bad' : 'neutral'}>{c.ok === true ? 'ok' : c.ok === false ? 'fout' : 'n.v.t.'}</Badge>
                  <span>{c.label}{c.detail && <span className="block text-xs text-dim">{c.detail}</span>}</span>
                </li>
              ))}
            </ul>
            <ul className="mt-3 flex flex-wrap gap-2">
              {Object.entries(d.gates).map(([g, s]: [string, any]) => <li key={g}><Badge tone={s.satisfied ? 'good' : 'neutral'}>{g} {s.satisfied ? 'ja' : 'open'}</Badge></li>)}
            </ul>
          </Panel>

          <Decision d={d} gate={gate} bucket={bucket} rejectRef={rejectRef} approveRef={approveRef} seen={seen} setSeen={setSeen} onDone={onDone} />
        </div>
      )}
    </Load>
  );
}

function Decision({ d, gate, bucket, rejectRef, approveRef, seen, setSeen, onDone }: { d: any; gate: 'G2' | 'G3' | 'G4' | 'G5' | null; bucket: string; rejectRef: React.MutableRefObject<HTMLTextAreaElement | null>; approveRef: React.MutableRefObject<HTMLButtonElement | null>; seen: boolean; setSeen: (v: boolean) => void; onDone: () => void }) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);
  const item = d.item;
  const blocked = useMemo(() => d.checks.some((c: any) => c.ok === false), [d.checks]);

  async function decide(decision: 'approved' | 'rejected') {
    if (!gate) return;
    setBusy(true); setError(null); setDone(null);
    try {
      if (gate === 'G5') {
        await api(`/api/content/${item.id}/owner-approval`, { headers: OWNER_HEADERS, body: { actorId: 'owner', confirmation: OWNER_CONFIRMATION, assetSha256: item.assetSha256, captionHash: item.captionHash, decision, notes: notes.trim() || undefined } });
      } else {
        await api(`/api/content/${item.id}/approvals`, { body: { gate, actorId: 'owner', decision, notes: notes.trim() || undefined, ...(gate === 'G4' ? { assetSha256: item.assetSha256 } : { scriptRevisionId: item.scriptRevisionId }) } });
      }
      setDone(decision === 'approved' ? `${gate} vastgelegd voor deze exacte versie.` : 'Afkeuring vastgelegd.');
      setNotes('');
      onDone();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  if (!gate) return <Panel title="Actie"><p className="text-sm text-dim">{HINT[bucket]}</p></Panel>;
  const g5 = gate === 'G5';
  const canApprove = !busy && !blocked && (!g5 || (seen && !!item.assetSha256 && !!item.captionHash && d.video?.fileExists));
  return (
    <Panel title={g5 ? 'Goedkeuring eigenaar (G5)' : `Beslissing ${gate}`} id={`rv-act-${item.id}`}>
      <div className="space-y-3 text-sm">
        {g5 && (
          <label className="flex items-start gap-2"><input type="checkbox" checked={seen} onChange={(e) => setSeen(e.target.checked)} className="mt-1 size-4 accent-[#A7F36A]" /> Ik heb de video volledig bekeken (hash {shortHash(item.assetSha256)}) en de caption gelezen (hash {shortHash(item.captionHash)}).</label>
        )}
        {blocked && <p role="alert" className="text-[#FFB0B0]">Een automatische controle faalt: goedkeuren kan pas na herstel.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={!canApprove} onClick={() => decide('approved')} className="min-w-48" {...({ ref: approveRef } as object)}>
            <Icon name="check" /> {g5 ? OWNER_CONFIRMATION : `Keur ${gate} goed (a)`}
          </Button>
        </div>
        <label htmlFor={`rv-rej-${item.id}`} className="block text-xs text-dim">Afkeuren met reden (r)</label>
        <textarea id={`rv-rej-${item.id}`} ref={rejectRef} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-line bg-white/[.04] px-3 py-2" />
        <Button variant="danger" disabled={busy || notes.trim().length < 3} onClick={() => decide('rejected')}>Afkeuren</Button>
        <ErrorNote error={error} />
        {done && <p role="status" className="rounded-lg border border-pos/40 bg-pos/10 px-3 py-2 text-pos">{done}</p>}
      </div>
    </Panel>
  );
}
