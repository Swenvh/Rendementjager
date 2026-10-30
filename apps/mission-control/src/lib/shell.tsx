import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface Shell {
  /** Bumped after every mutation so all views refetch. */
  tick: number;
  bump: () => void;
  openItem: (id: string | null) => void;
  openId: string | null;
}

const Ctx = createContext<Shell>({ tick: 0, bump: () => {}, openItem: () => {}, openId: null });
export const useShell = () => useContext(Ctx);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const bump = useCallback(() => setTick((n) => n + 1), []);
  const value = useMemo(() => ({ tick, bump, openItem: setOpenId, openId }), [tick, bump, openId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
