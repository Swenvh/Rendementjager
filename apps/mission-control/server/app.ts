import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { AppDeps } from './context.js';
import { errorBody, handleError } from './errors.js';
import { calendarRoutes, contentRoutes } from './routes/content.js';
import { analyticsRoutes, brandRoutes, mediaRoutes, researchRoutes } from './routes/library.js';
import { agentRoutes, jobRoutes, systemRoutes } from './routes/ops.js';

/**
 * Mission Control HTTP app. No authentication: bind to localhost only (see docs/ARCHITECTURE.md §6).
 * Cross-origin requests get no CORS headers, so a foreign web page cannot call the JSON API with
 * custom headers (the owner-approval header in particular).
 */
export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.onError(handleError);

  // DNS-rebinding guard: the API has no authentication, so only answer requests addressed to a
  // loopback host name (extend with RJ_ALLOWED_HOSTS=host1,host2 if you deliberately expose it).
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', ...(deps.env.RJ_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)]);
  app.use('*', async (c, next) => {
    const host = (c.req.header('host') ?? new URL(c.req.url).host).toLowerCase().replace(/:\d+$/, '');
    if (!allowedHosts.has(host)) return c.json(errorBody('NOT_AUTHORIZED', 'Host not allowed'), 403);
    await next();
  });

  // CSRF guard: state-changing API calls must be JSON. A cross-site page cannot send
  // application/json without a CORS preflight (which this server never approves), so it cannot
  // use "simple" text/plain or form posts to reach the unauthenticated endpoints.
  app.use('/api/*', async (c, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && !/^application\/json\b/i.test(c.req.header('content-type') ?? ''))
      return c.json(errorBody('VALIDATION_ERROR', 'Content-Type must be application/json'), 415);
    await next();
  });

  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
  });

  app.get('/api/health', async (c) => {
    let db: 'ok' | 'error' = 'ok';
    try {
      await deps.repo.contentItems.count();
    } catch {
      db = 'error';
    }
    return c.json({ ok: db === 'ok', service: 'mission-control', db, time: deps.now().toISOString() }, db === 'ok' ? 200 : 503);
  });

  app.route('/api/content', contentRoutes(deps));
  app.route('/api/calendar', calendarRoutes(deps));
  app.route('/api/jobs', jobRoutes(deps));
  app.route('/api/agents', agentRoutes(deps));
  app.route('/api/research', researchRoutes(deps));
  app.route('/api/analytics', analyticsRoutes(deps));
  app.route('/api/brand', brandRoutes(deps));
  app.route('/api', systemRoutes(deps));
  app.route('/media', mediaRoutes(deps));

  app.all('/api/*', (c) => c.json(errorBody('NOT_FOUND', `No route ${c.req.method} ${c.req.path}`), 404));

  const dist = deps.uiDist;
  if (dist && existsSync(join(dist, 'index.html'))) {
    app.use('/*', serveStatic({ root: dist }));
    const index = readFileSync(join(dist, 'index.html'), 'utf8');
    app.get('*', (c) => c.html(index));
  }
  return app;
}
