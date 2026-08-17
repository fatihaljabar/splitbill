import { readFile } from 'node:fs/promises';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { calculateBill } from '../shared/calculate.ts';
import { formatCurrency } from '../shared/format.ts';
import { billsRoute, findActiveBill } from './bills.ts';
import { runMigrations } from './db.ts';

const app = new Hono();

app.route('/api/bills', billsRoute);

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

// dist/index.html dibaca sekali saat start, bukan tiap request — isinya statis
// hasil build, cuma <title>/<meta> yang disuntik per request di bawah.
let indexHtml: string;

/** WhatsApp (dan pratinjau link lain) tidak menjalankan JS — mereka baca <meta> dari HTML
 * mentah sebelum SPA Vue sempat mengambil alih DOM. Rute ini menyuntik og:title/
 * og:description per bill, jadi kartu pratinjau di WhatsApp menampilkan nama acara
 * sungguhan, bukan judul generik. Privasi dijaga: bill privat cuma tampilkan nama acara,
 * TANPA nominal atau nama peserta — konsisten dengan TSD §7. */
app.get('/s/:code/:pid?', async (c) => {
  const code = c.req.param('code');
  let title = 'SplitBills — Bagi Tagihan Mudah';
  let description =
    'Bagi tagihan dengan mudah, cepat, dan adil. Scan struk, hitung split, bagikan link.';

  const result = await findActiveBill(code);
  if (result.ok) {
    const eventName = result.bill.eventName || 'Split Bill';
    title = `${eventName} — SplitBills`;
    if (result.bill.privacyMode === 'public') {
      const calc = calculateBill(result.bill);
      description = `Total ${formatCurrency(calc.grandTotal)} · ${result.bill.participants.length} orang. Buka untuk lihat rincian dan bayar.`;
    } else {
      description = 'Buka link ini untuk lihat tagihanmu dan bayar.';
    }
  }

  const html = indexHtml
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(
      /<meta property="og:title" content=".*?" \/>/,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
    )
    .replace(
      /<meta (name="description"|property="og:description") content=".*?" \/>/g,
      (_m, attr) => `<meta ${attr} content="${escapeHtml(description)}" />`,
    )
    // Halaman tagihan berisi nama peserta, nominal, dan nomor rekening orang sungguhan —
    // tidak boleh masuk indeks mesin pencari. robots.txt sudah melarang crawl-nya; ini
    // lapis kedua untuk kasus link terlanjur ditemukan crawler dari sumber lain.
    .replace(
      /<meta name="robots" content=".*?" \/>/,
      '<meta name="robots" content="noindex, nofollow" />',
    )
    // Canonical bawaan menunjuk ke beranda; untuk halaman tagihan justru menyesatkan.
    .replace(/<link rel="canonical" href=".*?" \/>\n?\s*/, '');

  c.header('X-Robots-Tag', 'noindex, nofollow');
  return c.html(html);
});

// Urutan wajib: /api/* dan /s/:code dulu, baru statis, baru catch-all. Tanpa catch-all,
// membuka rute lain langsung (bukan lewat navigasi client-side) akan 404 —
// ini yang membuat mode history router bekerja.
app.use('/*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));

// Tanpa top-level await: Hostinger memuat entry point ini lewat require()
// (lsnode.js, launcher Node LiteSpeed), dan require() tidak bisa menunggu
// await di level atas modul — proses gagal start sama sekali kalau ada.
async function main(): Promise<void> {
  await runMigrations();
  indexHtml = await readFile('./dist/index.html', 'utf-8');
  const port = Number(process.env.PORT) || 3000;
  serve({ fetch: app.fetch, port });
  console.log(`splitbill server listening on :${port}`);
}

main().catch((err) => {
  console.error('Gagal start server:', err);
  // Drizzle membungkus error driver mysql2 asli di err.cause — err sendiri
  // cuma bilang "Failed query", pesan MySQL yang sesungguhnya ada di sini.
  if (err instanceof Error && err.cause) {
    console.error('Penyebab asli:', err.cause);
  }
  process.exit(1);
});
