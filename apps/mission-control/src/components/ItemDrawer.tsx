import { useState } from 'react';
import { api, ApiFail, useApi } from '../lib/api';
import { auditAction, auditReason, nl } from '../lib/nl';
import { fmtDateTime } from '../lib/format';
import { useShell } from '../lib/shell';
import { GATE_LABELS, stageLabel } from '../lib/stages';
import { Badge, Button, Dialog, ErrorNote, Hash, Icon, Skeleton } from './ui';

export function StageBadge({ stage }: { stage: string }) {
  const tone = stage === 'FAILED' ? 'bad' : stage === 'PUBLISHED' || stage === 'SCHEDULED' ? 'good' : stage === 'READY_FOR_EDITOR' ? 'lime' : stage === 'REVISION_REQUIRED' ? 'warn' : 'neutral';
  return <Badge tone={tone}>{stageLabel(stage)}</Badge>;
}

export function ItemDrawer() {
  const { openId, openItem, bump } = useShell();
  if (!openId) return null;
  return <DrawerBody id={openId} onClose={() => openItem(null)} onChanged={bump} />;
}

function DrawerBody({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const detail = useApi<any>(`/api/content/${id}`);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const d = detail.data;

  async function go(to: string) {
    setBusy(to);
    setError(null);
    try {
      await api(`/api/content/${id}/transition`, { body: { to, reason: reason.trim() || `Handmatig naar ${stageLabel(to)} via Mission Control`, actorId: 'owner' } });
      setReason('');
      onChanged();
    } catch (e) {
      setError(e);
      detail.reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog label="Details content-item" onClose={onClose} wide>
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-canvas/95 px-5 py-4 backdrop-blur">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[.08em] text-dim">{d?.item.series ?? d?.item.pillar ?? 'Content'}</p>
          <h2 className="text-lg font-extrabold leading-snug">{d?.item.title ?? 'Laden…'}</h2>
          {d && <div className="mt-2 flex flex-wrap items-center gap-2"><StageBadge stage={d.item.stage} />{d.item.template && <Badge>Template {d.item.template}</Badge>}{d.item.slug && <Badge>{d.item.slug}</Badge>}</div>}
        </div>
        <Button variant="ghost" aria-label="Sluiten" onClick={onClose}><Icon name="x" /></Button>
      </div>

      <div className="space-y-6 px-5 py-5">
        {detail.error && !d && <ErrorNote error={detail.error} />}
        {!d && !detail.error && <Skeleton rows={5} />}
        {d && (
          <>
            <section aria-labelledby="dr-trans">
              <h3 id="dr-trans" className="mb-2 text-sm font-bold">Volgende stap</h3>
              <label className="block text-xs text-dim" htmlFor="dr-reason">Reden (komt in het auditlog)</label>
              <input id="dr-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Bijv. onderzoek compleet" className="mt-1 w-full rounded-lg border border-line bg-white/[.04] px-3 py-2 text-sm placeholder:text-faint" />
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {d.transitions.map((t: any) => (
                  <li key={t.to} className="rounded-lg border border-line p-2">
                    <Button className="w-full" variant={t.allowed ? 'outline' : 'ghost'} disabled={!t.allowed || busy !== null} onClick={() => go(t.to)} aria-describedby={`why-${t.to}`}>
                      {!t.allowed && <Icon name="lock" className="size-3.5" />}
                      {busy === t.to ? 'Bezig…' : stageLabel(t.to)}
                    </Button>
                    {!t.allowed && <p id={`why-${t.to}`} className="mt-1 text-xs text-dim">{t.reasons?.map((r: string) => nl(r)).join('; ') || 'Niet toegestaan'}</p>}
                  </li>
                ))}
              </ul>
              <ErrorNote error={error} className="mt-3" />
            </section>

            <section aria-labelledby="dr-gates">
              <h3 id="dr-gates" className="mb-2 text-sm font-bold">Poorten</h3>
              <ul className="space-y-1.5">
                {Object.entries<any>(d.gates).map(([g, s]) => (
                  <li key={g} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                    <span className="w-8 font-mono text-xs text-dim">{g}</span>
                    <span className="min-w-0 flex-1">{GATE_LABELS[g]}</span>
                    {s.satisfied ? <Badge tone="good"><Icon name="check" className="size-3" /> Voldaan</Badge> : <Badge tone="neutral">Open</Badge>}
                    {!s.satisfied && <span className="w-full text-xs text-dim">{nl(s.reason)}</span>}
                  </li>
                ))}
              </ul>
              {d.item.stage === 'READY_FOR_EDITOR' && <p className="mt-2 text-xs text-dim">G5 geef je alleen in de <a className="text-lime underline" href="#/studio" onClick={onClose}>Video Studio</a> op de exacte versie.</p>}
            </section>

            <section aria-labelledby="dr-script">
              <h3 id="dr-script" className="mb-2 text-sm font-bold">Script {d.currentRevision && <span className="font-normal text-dim">v{d.currentRevision.version}</span>}</h3>
              {d.currentRevision ? (
                <div className="space-y-2 rounded-lg border border-line p-3 text-sm">
                  <p className="font-bold">{d.currentRevision.hook}</p>
                  <p className="whitespace-pre-wrap text-dim">{d.currentRevision.body}</p>
                  {d.currentRevision.cta && <p className="text-lime">{d.currentRevision.cta}</p>}
                </div>
              ) : d.scriptFile ? (
                <div>
                  <Badge tone="warn">Concept uit bestand, nog geen revisie in de database</Badge>
                  <pre className="scroll-thin mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line p-3 font-sans text-sm text-dim">{d.scriptFile}</pre>
                </div>
              ) : <p className="text-sm text-dim">Nog geen script.</p>}
            </section>

            <section aria-labelledby="dr-cap">
              <h3 id="dr-cap" className="mb-2 text-sm font-bold">Caption</h3>
              {d.item.captionText ? <pre className="whitespace-pre-wrap rounded-lg border border-line p-3 font-sans text-sm text-dim">{d.item.captionText}</pre> : <p className="text-sm text-dim">Nog geen caption.</p>}
              <p className="mt-1 text-xs text-dim">Caption-hash: <Hash value={d.item.captionHash} /></p>
              <p className="mt-1 text-xs text-dim">Video sha256: <Hash value={d.item.currentAssetSha256} /></p>
            </section>

            <section aria-labelledby="dr-audit">
              <h3 id="dr-audit" className="mb-2 text-sm font-bold">Auditlog</h3>
              <ol className="space-y-1.5">
                {d.auditLog.map((a: any) => (
                  <li key={a.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={a.action.endsWith('denied') ? 'bad' : 'neutral'}>{auditAction(a.action)}</Badge>
                      {a.fromStage || a.toStage ? <span>{a.fromStage ? stageLabel(a.fromStage) : '∅'} → {a.toStage ? stageLabel(a.toStage) : '—'}</span> : null}
                      <span className="text-dim">door {a.actorId}</span>
                      <time className="ml-auto text-dim" dateTime={a.createdAt}>{fmtDateTime(a.createdAt)}</time>
                    </div>
                    <p className="mt-1 text-dim">{auditReason(a.reason)}</p>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </div>
    </Dialog>
  );
}

export { ApiFail };
