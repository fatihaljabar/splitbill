import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { billsRoute } from './bills.ts';
import { runMigrations } from './db.ts';

const app = new Hono();

// Tugas 3: bukti proses ini benar-benar hidup terus di Hostinger, bukan
// sekadar menyajikan berkas statis. Penyajian statis + catch-all menyusul
// di tugas 8.
app.get('/', (c) => c.json({ ok: true, startedAt: new Date().toISOString() }));

app.route('/api/bills', billsRoute);

await runMigrations();

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });
console.log(`splitbill server listening on :${port}`);
