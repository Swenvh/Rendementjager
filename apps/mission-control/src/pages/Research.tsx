import { Badge, Empty, Load, PageHeader, Panel } from '../components/ui';
import { useApi } from '../lib/api';
import { fmtDate } from '../lib/format';

export function Research() {
  const sources = useApi<any>('/api/research/sources');
  const briefs = useApi<any>('/api/research/briefs');
  return (
    <>
      <PageHeader title="Onderzoek" subtitle="Alleen bronnen uit het goedgekeurde register tellen als bewijs. Tier 1 is een primaire bron (toezichthouder, overheid, centrale bank)." />
      <div className="space-y-5">
        <Panel title="Onderzoeksbriefs" id="rs-briefs">
          <Load state={briefs}>
            {({ briefs: list, currentNewsMaxAgeDays }) => list.length === 0 ? <Empty title="Nog geen research briefs">Een brief ontstaat in de stap Onderzoek (G1). Actueel nieuws mag maximaal {currentNewsMaxAgeDays} dagen oud zijn.</Empty> : (
              <ul className="space-y-3">{list.map((b: any) => (
                <li key={b.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-extrabold">{b.topic}</h3><Badge>{b.kind === 'current_news' ? 'actueel nieuws' : 'evergreen'}</Badge><Badge tone={b.status === 'approved' ? 'good' : b.status === 'rejected' ? 'bad' : 'neutral'}>{b.status}</Badge>{b.stale && <Badge tone="warn">verouderd</Badge>}</div>
                  <p className="mt-1 text-sm text-dim">{b.summary}</p>
                  <p className="mt-1 text-xs text-dim">Aangemaakt {fmtDate(b.createdAt)} ({b.ageDays} dagen geleden) · nieuwste bron: {b.newestSourceAt ? fmtDate(b.newestSourceAt) : 'datum onbekend'}</p>
                  <ul className="mt-2 space-y-0.5 text-xs">{b.sources.map((s: any) => <li key={s.id}><Badge>T{s.trustTier}</Badge> <a className="text-lime underline" href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a> <span className="text-dim">· {s.publisher}, geraadpleegd {fmtDate(s.accessedAt)}</span></li>)}</ul>
                </li>
              ))}</ul>
            )}
          </Load>
        </Panel>
        <Panel title="Register van goedgekeurde bronnen" id="rs-reg">
          <Load state={sources}>
            {({ registry }) => (
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <caption className="sr-only">Goedgekeurde bronnen</caption>
                  <thead className="text-xs uppercase tracking-[.06em] text-dim"><tr><th className="py-2 pr-3">Bron</th><th className="pr-3">Tier</th><th className="pr-3">Domeinen</th><th className="pr-3">Onderwerpen</th><th className="text-right">Geciteerd</th></tr></thead>
                  <tbody className="divide-y divide-line">{registry.map((s: any) => (
                    <tr key={s.id}><td className="py-2 pr-3 font-medium">{s.name}</td><td className="pr-3"><Badge tone={s.tier === 1 ? 'good' : 'neutral'}>Tier {s.tier}</Badge></td><td className="pr-3 text-xs text-dim">{s.domains.join(', ')}</td><td className="pr-3 text-xs text-dim">{s.topics.join(', ')}</td><td className="tabular text-right">{s.citedCount}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Load>
        </Panel>
      </div>
    </>
  );
}
