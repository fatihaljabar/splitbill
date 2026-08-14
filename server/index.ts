import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { billsRoute } from './bills.ts';
import { runMigrations } from './db.ts';

const app = new Hono();

app.route('/api/bills', billsRoute);

// Urutan wajib: /api/* dulu, baru statis, baru catch-all. Tanpa catch-all,
// membuka /s/AB12CD34 langsung (bukan lewat navigasi client-side) akan 404 —
// ini yang membuat mode history router bekerja.
app.use('/*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));

// Tanpa top-level await: Hostinger memuat entry point ini lewat require()
// (lsnode.js, launcher Node LiteSpeed), dan require() tidak bisa menunggu
// await di level atas modul — proses gagal start sama sekali kalau ada.
async function main(): Promise<void> {
  await runMigrations();
  const port = Number(process.env.PORT) || 3000;
  serve({ fetch: app.fetch, port });
  console.log(`splitbill server listening on :${port}`);
}

main().catch((err) => {
  console.error('Gagal start server:', err);
  process.exit(1);
});
