import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = `http://127.0.0.1:${process.env.RJ_API_PORT ?? 8787}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // GitHub Codespaces serves the forwarded port under *.app.github.dev (private to the owner by default).
    allowedHosts: ['.app.github.dev'],
    // changeOrigin rewrites Host to the API's own loopback host so the API host allowlist still applies.
    proxy: { '/api': { target: api, changeOrigin: true }, '/media': { target: api, changeOrigin: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
});
