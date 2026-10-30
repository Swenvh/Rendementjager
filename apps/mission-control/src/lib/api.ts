import { useCallback, useEffect, useState } from 'react';
import { useShell } from './shell';

export class ApiFail extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: { ...(init.body !== undefined || (init.method && init.method !== 'GET') ? { 'content-type': 'application/json' } : {}), ...init.headers },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiFail('NETWORK', 'De API is niet bereikbaar. Draait de server (npm run dev)?', 0);
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const e = json?.error;
    throw new ApiFail(e?.code ?? 'HTTP_' + res.status, e?.message ?? `Fout ${res.status}`, res.status, e?.details ?? {});
  }
  return json as T;
}

export interface ApiState<T> {
  data: T | null;
  error: ApiFail | null;
  loading: boolean;
  reload: () => void;
}

/** GET with reload on path change and whenever any view bumps the shared refresh counter. */
export function useApi<T = any>(path: string | null): ApiState<T> {
  const { tick } = useShell();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiFail | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [local, setLocal] = useState(0);
  const reload = useCallback(() => setLocal((n) => n + 1), []);
  useEffect(() => {
    if (path === null) return;
    let live = true;
    setLoading(true);
    api<T>(path)
      .then((d) => {
        if (live) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => live && setError(e as ApiFail))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [path, tick, local]);
  return { data, error, loading, reload };
}
