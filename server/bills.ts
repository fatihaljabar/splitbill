import { getConnInfo } from '@hono/node-server/conninfo';
import { eq, lt } from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { calculateBill } from '../shared/calculate.ts';
import { shortCode } from '../shared/format.ts';
import type { Bill } from '../shared/types.ts';
import { db } from './db.ts';
import { bills, payments } from './schema.ts';

async function purgeExpired(): Promise<void> {
  await db.delete(bills).where(lt(bills.expiresAt, Date.now()));
}

type ActiveBillResult = { ok: true; bill: Bill } | { ok: false; error: 'not_found' | 'expired' };

/** Timpa participants[].paymentStatus dengan status sungguhan dari tabel payments —
 * bills.data adalah snapshot saat dibuat, tabel payments adalah sumber kebenaran status
 * bayar (PRD F15: pembuat bill melihat status dari perangkat mana pun). */
async function mergePayments(bill: Bill, code: string): Promise<Bill> {
  const rows = await db.select().from(payments).where(eq(payments.shortCode, code));
  if (rows.length === 0) return bill;
  const statusById = new Map(rows.map((r) => [r.participantId, r.status]));
  return {
    ...bill,
    participants: bill.participants.map((p) =>
      p.isPayer ? p : { ...p, paymentStatus: statusById.get(p.id) ?? p.paymentStatus },
    ),
  };
}

/** Cari bill aktif per kode. Baris yang sudah lewat masa berlaku dihapus di sini juga —
 * dipakai bersama GET /:code, POST /:code/pay, dan suntikan meta OG di index.ts, ketiganya
 * butuh perilaku yang sama. */
export async function findActiveBill(code: string): Promise<ActiveBillResult> {
  const [row] = await db.select().from(bills).where(eq(bills.shortCode, code));
  if (!row) return { ok: false, error: 'not_found' };

  if (row.expiresAt < Date.now()) {
    await db.delete(bills).where(eq(bills.shortCode, code));
    return { ok: false, error: 'expired' };
  }

  return { ok: true, bill: await mergePayments(row.data, code) };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PARTICIPANTS = 50;
const MAX_ITEMS = 200;

// ponytail: peta di memori, reset saat restart. Pindah ke tabel kalau
// penyalahgunaan jadi nyata.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const requestLog = new Map<string, number[]>();

function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return getConnInfo(c).remote.address ?? 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (requestLog.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_LIMIT) {
    requestLog.set(ip, hits);
    return true;
  }
  hits.push(now);
  requestLog.set(ip, hits);
  return false;
}

function isFiniteArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Bentuk Bill dari klien — nol kepercayaan. Nominal dihitung ulang oleh calculateBill di
 * endpoint lain; ini cuma memastikan bentuknya waras sebelum disimpan. */
function validateBill(body: unknown): Bill | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  if (typeof b.eventName !== 'string') return null;
  if (!isFiniteArray(b.participants) || b.participants.length > MAX_PARTICIPANTS) return null;
  if (!isFiniteArray(b.items) || b.items.length > MAX_ITEMS) return null;

  for (const p of b.participants) {
    if (!p || typeof p !== 'object') return null;
    const participant = p as Record<string, unknown>;
    if (typeof participant.id !== 'string' || typeof participant.name !== 'string') return null;
  }

  for (const it of b.items) {
    if (!it || typeof it !== 'object') return null;
    const item = it as Record<string, unknown>;
    if (typeof item.name !== 'string') return null;
    if (!Number.isFinite(item.price) || !Number.isFinite(item.qty)) return null;
  }

  const moneyFields = ['tax', 'serviceCharge', 'discount', 'extraFees'] as const;
  for (const field of moneyFields) {
    if (!Number.isFinite(b[field])) return null;
  }

  return {
    ...(b as unknown as Bill),
    eventName: b.eventName.slice(0, 200),
    receiptImage: undefined, // dibuang paksa — foto struk tidak pernah disimpan di server
  };
}

export const billsRoute = new Hono();

billsRoute.post(
  '/',
  bodyLimit({
    maxSize: 256 * 1024,
    onError: (c) => c.json({ error: 'too_large' }, 413),
  }),
  async (c) => {
    const ip = clientIp(c);
    if (isRateLimited(ip)) {
      return c.json({ error: 'rate_limited' }, 429);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_bill' }, 400);
    }

    const bill = validateBill(body);
    if (!bill) {
      return c.json({ error: 'invalid_bill' }, 400);
    }

    await purgeExpired();

    const createdAt = Date.now();
    const expiresAt = createdAt + DAY_MS;

    for (let attempt = 0; attempt < 3; attempt++) {
      const code = shortCode(8);
      try {
        await db.insert(bills).values({
          shortCode: code,
          data: { ...bill, shortCode: code, createdAt, expiresAt },
          createdAt,
          expiresAt,
        });
        return c.json({ shortCode: code, expiresAt }, 201);
      } catch (err) {
        const isDuplicate = err instanceof Error && 'code' in err && err.code === 'ER_DUP_ENTRY';
        if (!isDuplicate) throw err;
      }
    }

    return c.json({ error: 'invalid_bill' }, 400);
  },
);

billsRoute.get('/:code', async (c) => {
  const code = c.req.param('code');
  const result = await findActiveBill(code);
  if (!result.ok) {
    return c.json({ error: result.error }, result.error === 'expired' ? 410 : 404);
  }
  const { bill } = result;

  if (bill.privacyMode === 'public') {
    return c.json({ mode: 'public', bill, calc: calculateBill(bill) });
  }

  const base = {
    mode: 'private' as const,
    eventName: bill.eventName,
    storeName: bill.storeName,
    date: bill.date,
    expiresAt: bill.expiresAt,
    bankAccount: bill.bankAccount,
  };

  const participantId = c.req.query('p');
  const me = participantId
    ? calculateBill(bill).perPerson.find((p) => p.participantId === participantId)
    : undefined;

  // Link personal (?p= valid) tidak pernah kirim daftar nama peserta lain — penerima
  // sudah tahu siapa dirinya dari link-nya sendiri. Link dasar /s/:code (tanpa id, jalur
  // lama) tetap kirim daftar nama supaya pemilihan manual masih berfungsi. Lihat TSD §7.
  if (me) return c.json({ ...base, me });
  return c.json({
    ...base,
    participants: bill.participants.map((p) => ({ id: p.id, name: p.name })),
  });
});

billsRoute.post('/:code/pay', async (c) => {
  const code = c.req.param('code');
  const result = await findActiveBill(code);
  if (!result.ok) {
    return c.json({ error: result.error }, result.error === 'expired' ? 410 : 404);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_participant' }, 400);
  }

  const b = body as Record<string, unknown>;
  if (typeof b.participantId !== 'string' || (b.status !== 'paid' && b.status !== 'unpaid')) {
    return c.json({ error: 'invalid_participant' }, 400);
  }

  const isRealParticipant = result.bill.participants.some((p) => p.id === b.participantId);
  if (!isRealParticipant) {
    return c.json({ error: 'invalid_participant' }, 400);
  }

  const now = Date.now();
  await db
    .insert(payments)
    .values({
      shortCode: code,
      participantId: b.participantId,
      status: b.status,
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({ set: { status: b.status, updatedAt: now } });

  return c.body(null, 204);
});
