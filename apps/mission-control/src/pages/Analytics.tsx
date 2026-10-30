import { Empty, Load, PageHeader, Panel } from '../components/ui';
import { useApi } from '../lib/api';
import { fmtDateTime, num, pct } from '../lib/format';

export function Analytics() {
  const a = useApi<any>('/api/analytics');
  return (
    <>
      <PageHeader title="Analyse" subtitle="Alleen echte snapshots. Onbekende metrics blijven “geen data”, nooit 0." />
      <Load state={a}>
        {(d) => d.empty ? (
          <Panel><Empty title="Nog geen analytics">{d.reason} Zodra er iets is gepubliceerd kun je hier handmatig of via een gekoppelde bron snapshots vastleggen.</Empty></Panel>
        ) : (
          <Panel title="Snapshots" id="an-snap">
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <caption className="sr-only">Analytics-snapshots</caption>
                <thead className="text-xs uppercase tracking-[.06em] text-dim"><tr><th className="py-2 pr-3">Item</th><th className="pr-3">Moment</th><th className="pr-3 text-right">Bereik</th><th className="pr-3 text-right">Likes</th><th className="pr-3 text-right">Shares</th><th className="pr-3 text-right">Saves</th><th className="pr-3 text-right">Engagement</th><th>Bron</th></tr></thead>
                <tbody className="divide-y divide-line">{d.snapshots.map((s: any) => (
                  <tr key={s.id}><td className="py-2 pr-3 font-medium">{s.title}</td><td className="pr-3 text-xs">{fmtDateTime(s.capturedAt)}</td><td className="tabular pr-3 text-right">{num(s.reach)}</td><td className="tabular pr-3 text-right">{num(s.likes)}</td><td className="tabular pr-3 text-right">{num(s.shares)}</td><td className="tabular pr-3 text-right">{num(s.saves)}</td><td className="tabular pr-3 text-right">{pct(s.derived.engagementPerReached)}</td><td className="text-xs text-dim">{s.source}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </Panel>
        )}
      </Load>
    </>
  );
}
