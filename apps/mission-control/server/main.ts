/**
 * npm run dev -w @rj/mission-control    API on RJ_API_PORT (8787) + Vite UI on 5173 (proxies /api, /media)
 * npm run start -w @rj/mission-control  built UI (dist/) + API on one port (RJ_API_PORT)
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { defaultDbPath, openRepository } from '@rj/database';
import { createApp } from './app.js';
import { createDeps } from './context.js';

const port = Number(process.env.RJ_API_PORT ?? 8787);
const host = process.env.RJ_API_HOST ?? '127.0.0.1';
const serveUi = process.env.RJ_SERVE_UI === '1';
const uiDist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const repo = openRepository();
const app = createApp(createDeps(repo, { uiDist: serveUi ? uiDist : null }));

const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(`Mission Control API on http://${host}:${info.port} (db ${defaultDbPath()})${serveUi ? ' + UI' : ''}`);
});

const shutdown = () => {
  server.close();
  void repo.close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
