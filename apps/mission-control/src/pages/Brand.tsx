import { Badge, Load, PageHeader, Panel } from '../components/ui';
import { useApi } from '../lib/api';

export function Brand() {
  const b = useApi<any>('/api/brand');
  return (
    <>
      <PageHeader title="Merk" subtitle="Tokens uit @rj/brand, dezelfde waarden als in de video's." />
      <Load state={b} rows={5}>
        {(d) => (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
              <Panel title="Logo" id="br-logo" action={d.logo.isPlaceholder ? <Badge tone="warn">PLACEHOLDER</Badge> : <Badge tone="good">Officieel</Badge>}>
                <div className="flex aspect-square items-center justify-center rounded-lg border border-line bg-canvas p-6"><img src={d.logo.url} alt={d.logo.alt} className="max-h-full max-w-full" /></div>
                <p className="mt-2 text-xs text-dim">{d.logo.isPlaceholder ? 'Er is nog geen officieel logo. Zet het bestand op assets/brand/logo-official.svg; het wordt dan automatisch gebruikt.' : d.logo.file}</p>
                <p className="mt-3 text-sm font-medium">{d.brand.promise}</p>
                <p className="text-xs text-dim">{d.brand.handle} · CTA: {d.brand.cta}</p>
              </Panel>
              <Panel title="Kleuren" id="br-colors">
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Object.entries<string>(d.tokens.colors).map(([k, v]) => (
                  <li key={k} className="flex items-center gap-3 rounded-lg border border-line p-2"><span className="size-10 shrink-0 rounded-md border border-line" style={{ background: v }} aria-hidden="true" /><span className="min-w-0"><span className="block text-sm font-medium">{k}</span><code className="block truncate text-xs text-dim">{v}</code></span></li>
                ))}</ul>
              </Panel>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Typografie" id="br-type">
                <p className="font-heading text-3xl font-extrabold">Manrope koppen</p>
                <p className="mt-2">Inter voor lopende tekst en interface.</p>
                <p className="mt-3 text-xs text-dim">Lokaal geladen via @fontsource, geen externe verzoeken. Letterschaal: {Object.values<string>(d.tokens.typography.uiSize).join(' · ')}</p>
              </Panel>
              <Panel title="Templates" id="br-tpl">
                <ul className="space-y-2">{d.templates.map((t: any) => <li key={t.id} className="rounded-lg border border-line p-3"><p className="text-sm font-extrabold"><Badge>{t.id}</Badge> {t.name}</p><p className="mt-1 text-sm text-dim">{t.description}</p></li>)}</ul>
              </Panel>
            </div>
            <Panel title="Merkbestanden in de database" id="br-assets">
              {d.assets.length === 0 ? <p className="text-sm text-dim">Geen geregistreerde merkbestanden.</p> : <ul className="text-sm">{d.assets.map((a: any) => <li key={a.id}>{a.name} v{a.version}</li>)}</ul>}
            </Panel>
          </div>
        )}
      </Load>
    </>
  );
}
