import { getConnInfo } from '@hono/node-server/conninfo';
import { lt } from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { shortCode } from '../shared/format.ts';
import type { Bill } from '../shared/types.ts';
import { db } from './db.ts';
import { bills } from './schema.ts';

async function purgeExpired(): Promise<void> {
  await db.delete(bills).where(lt(bills.expiresAt, Date.now()));
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
