import { useEffect, useState, type ReactNode } from 'react';
import { ItemDrawer } from './components/ItemDrawer';
import { Badge, cx, Icon } from './components/ui';
import { useApi } from './lib/api';
import { ShellProvider } from './lib/shell';
import { Agents } from './pages/Agents';
import { Analytics } from './pages/Analytics';
import { Brand } from './pages/Brand';
import { Calendar } from './pages/Calendar';
import { Methodebrieven } from './pages/Methodebrieven';
import { Overview } from './pages/Overview';
import { Publicatie } from './pages/Publicatie';
import { Pipeline } from './pages/Pipeline';
import { Review } from './pages/Review';
import { Research } from './pages/Research';
import { Settings } from './pages/Settings';
import { Studio } from './pages/Studio';

const NAV: { id: string; label: string; icon: Parameters<typeof Icon>[0]['name']; page: () => ReactNode }[] = [
  { id: 'overzicht', label: 'Overzicht', icon: 'home', page: () => <Overview /> },
  { id: 'pipeline', label: 'Pipeline', icon: 'board', page: () => <Pipeline /> },
  { id: 'review', label: 'Review', icon: 'check', page: () => <Review /> },
  { id: 'methodebrieven', label: 'Methodebriefs', icon: 'search', page: () => <Methodebrieven /> },
  { id: 'publicatie', label: 'Publicatie', icon: 'play', page: () => <Publicatie /> },
  { id: 'kalender', label: 'Kalender', icon: 'calendar', page: () => <Calendar /> },
  { id: 'studio', label: 'Video Studio', icon: 'film', page: () => <Studio /> },
  { id: 'agents', label: 'Agents', icon: 'bot', page: () => <Agents /> },
  { id: 'research', label: 'Onderzoek', icon: 'search', page: () => <Research /> },
  { id: 'analytics', label: 'Analyse', icon: 'chart', page: () => <Analytics /> },
  { id: 'merk', label: 'Merk', icon: 'palette', page: () => <Brand /> },
  { id: 'instellingen', label: 'Instellingen', icon: 'gear', page: () => <Settings /> },
];

function useHashRoute() {
  const read = () => location.hash.replace(/^#\/?/, '').split('?')[0] || 'overzicht';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

function Shell() {
  const route = useHashRoute();
  const [menu, setMenu] = useState(false);
  const system = useApi<any>('/api/system');
  const current = NAV.find((n) => n.id === route) ?? NAV[0]!;
  useEffect(() => {
    setMenu(false);
    document.title = `${current.label} · Mission Control`;
  }, [current]);
  const stop = system.data?.emergencyStop?.active;

  const nav = (
    <nav aria-label="Hoofdnavigatie" className="flex flex-col gap-0.5">
      {NAV.map((n) => (
        <a key={n.id} href={`#/${n.id}`} aria-current={n.id === current.id ? 'page' : undefined}
          className={cx('flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors', n.id === current.id ? 'bg-white/[.09] font-medium text-ink' : 'text-dim hover:bg-white/[.05] hover:text-ink')}>
          <Icon name={n.icon} className={cx('size-4', n.id === current.id && 'text-lime')} />
          {n.label}
        </a>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-lime focus:px-3 focus:py-2 focus:text-canvas">Naar hoofdinhoud</a>
      <aside className="hidden border-r border-line bg-[#09190F] p-4 lg:sticky lg:top-0 lg:block lg:h-screen">
        <Brandmark />
        <div className="mt-6">{nav}</div>
        <p className="absolute bottom-4 left-4 right-4 text-xs text-dim">Lokaal, zonder inlog. Alleen op localhost draaien.</p>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-canvas/95 px-4 py-2.5 backdrop-blur lg:px-8">
          <button type="button" className="rounded-lg p-2 hover:bg-white/[.08] lg:hidden" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><Icon name="menu" className="size-5" /></button>
          <span className="font-heading text-sm font-extrabold lg:hidden">Rendementjager</span>
          <span className="hidden text-sm text-dim lg:block">{current.label}</span>
          <div className="ml-auto flex items-center gap-2">
            {system.data && (system.data.providers as any[]).every((p) => p.mode !== 'live') && <Badge>Mock-modus</Badge>}
            {stop ? <a href="#/instellingen"><Badge tone="bad"><Icon name="stop" className="size-3" /> NOODSTOP ACTIEF</Badge></a> : system.data && <Badge tone="good">Systeem actief</Badge>}
          </div>
        </header>
        {menu && <div className="border-b border-line bg-[#09190F] p-3 lg:hidden">{nav}</div>}
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1500px] px-4 py-6 lg:px-8">{current.page()}</main>
      </div>
      <ItemDrawer />
    </div>
  );
}

function Brandmark() {
  return (
    <a href="#/overzicht" className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#10291F" /><path d="M7 22l6-7 4 4 8-10" fill="none" stroke="#A7F36A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span><span className="block font-heading text-sm font-extrabold leading-tight">Rendementjager</span><span className="block text-xs text-dim">Mission Control</span></span>
    </a>
  );
}

export function App() {
  return (
    <ShellProvider>
      <Shell />
    </ShellProvider>
  );
}
