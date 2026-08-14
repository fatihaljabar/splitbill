import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { initSchema } from './db.ts';

const app = new Hono();

// Tugas 3: bukti proses ini benar-benar hidup terus di Hostinger, bukan
// sekadar menyajikan berkas statis. Rute API dan penyajian statis menyusul
// di tugas 4-8.
app.get('/', (c) => c.json({ ok: true, startedAt: new Date().toISOString() }));

await initSchema();

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });
console.log(`splitbill server listening on :${port}`);
