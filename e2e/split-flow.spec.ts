import { expect, type Page, test } from '@playwright/test';

/**
 * The main user flow, end to end (PRD F20): create a bill, add participants,
 * add items with per-item ownership, calculate, mint a short link, then open
 * that link as a different person on a different device and pay.
 *
 * This runs against the real production server (see playwright.config.ts) —
 * a fake API would not prove the two things this suite exists to prove:
 * that money is computed on the server, and that payment status crosses
 * devices (F15, the reason the backend exists at all).
 */

const EVENT_NAME = 'Makan Malam Tim';

/** Opens the add-item modal, fills it, and saves.
 *
 * Everything is scoped to the modal on purpose: the page underneath shows
 * participant chips with the same names, and they sit under the overlay where
 * they would swallow the click. */
async function addItem(
  page: Page,
  { name, price, exclude = [] }: { name: string; price: number; exclude?: string[] },
): Promise<void> {
  await page.getByRole('button', { name: 'Tambah Item' }).click();

  const modal = page.locator('div.fixed.inset-0.z-50');
  await expect(modal).toBeVisible();

  // Modal inputs in order: item name (no placeholder), price ("0"), qty ("1").
  await modal.locator('input:not([placeholder])').first().fill(name);
  await modal.locator('input[placeholder="0"]').first().fill(String(price));

  for (const who of exclude) {
    await modal.getByRole('button', { name: new RegExp(`^✓?\\s*${who}$`) }).click();
  }

  await modal.getByRole('button', { name: 'Simpan' }).click();
  await expect(modal).toBeHidden();
}

/** Reads the share link off the results page, asserting the shape PRD F11 requires. */
async function readShortCode(page: Page): Promise<string> {
  const link = page.getByText(/\/s\/[A-Za-z0-9]+/).first();
  await expect(link).toBeVisible();
  const text = (await link.textContent()) ?? '';

  // F11: the link must be short because the bill lives on the server. The old
  // prototype packed the whole bill into a `?d=` payload, which is exactly the
  // privacy leak the backend was built to remove — so it must never come back.
  expect(text, 'share link must not carry bill data').not.toContain('?d=');

  const match = text.match(/\/s\/([A-Za-z0-9]+)/);
  expect(match, `no short link found in ${text}`).not.toBeNull();
  return (match as RegExpMatchArray)[1];
}

test('splits a bill and settles it across two devices', async ({ page, browser, request }) => {
  // A silent exception mid-flow can still leave the happy path looking green,
  // so failures are collected here and asserted at the end.
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(`pageerror: ${err.message}`));

  // --- the bill creator ---
  await page.goto('/');
  await page.getByRole('button', { name: 'Buat Bill Baru' }).click();
  await page.getByPlaceholder('Contoh: Makan malam restoran').fill(EVENT_NAME);

  const nameInput = page.getByPlaceholder('Nama peserta');
  await nameInput.fill('Andi');
  await page.getByRole('button', { name: 'Tambah Peserta' }).click();
  // The remaining two go in via the Enter key — a real keypress, which is the
  // only way to cover the @keydown.enter binding.
  for (const who of ['Budi', 'Citra']) {
    await nameInput.fill(who);
    await nameInput.press('Enter');
  }
  for (const who of ['Andi', 'Budi', 'Citra']) {
    await expect(page.getByText(who, { exact: false }).first()).toBeVisible();
  }

  await page.getByRole('button', { name: 'Item', exact: true }).click();
  await addItem(page, { name: 'Nasi Goreng', price: 60_000 });
  await addItem(page, { name: 'Es Teh', price: 30_000, exclude: ['Citra'] });

  await page.getByRole('button', { name: 'Hitung Split' }).click();
  await expect(page).toHaveURL(/\/results/);

  // Rp60.000 split three ways, Rp30.000 split between Andi and Budi only.
  await expect(page.getByText('Rp90.000').first()).toBeVisible();

  await page.getByRole('button', { name: /Generate Link/ }).click();
  const code = await readShortCode(page);
  expect(code, 'short code should be 8 alphanumeric chars').toMatch(/^[A-Za-z0-9]{8}$/);

  // --- the server is the authority on money, not the browser ---
  const res = await request.get(`/api/bills/${code}`);
  expect(res.status()).toBe(200);
  const { calc } = await res.json();
  const totals = Object.fromEntries(
    calc.perPerson.map((p: { name: string; total: number }) => [p.name, p.total]),
  );
  expect(totals).toEqual({ Andi: 35_000, Budi: 35_000, Citra: 20_000 });
  expect(calc.grandTotal).toBe(90_000);
  // PRD F8: no rupiah may be lost or created by the split.
  const summed = Object.values(totals).reduce((a, b) => (a as number) + (b as number), 0);
  expect(summed).toBe(calc.grandTotal);

  // --- a friend, on their own phone, with none of the creator's local state ---
  const friendContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const friend = await friendContext.newPage();
  await friend.goto(`/s/${code}`);

  await expect(friend.getByText(EVENT_NAME)).toBeVisible();
  await friend.getByRole('button', { name: /Citra/ }).first().click();

  // Citra had none of the Es Teh, so she owes 20.000, not 30.000.
  await expect(friend.getByText('Rp20.000').first()).toBeVisible();
  await expect(friend.getByText('Nasi Goreng')).toBeVisible();
  await expect(friend.getByText('Es Teh')).toHaveCount(0);

  await friend
    .getByRole('button', { name: /Sudah Bayar|Tandai/ })
    .first()
    .click();

  // F15: the payment has to reach the server, not just this phone's screen.
  await expect
    .poll(async () => {
      const after = await request.get(`/api/bills/${code}`);
      const body = await after.json();
      return body.bill.participants.find(
        (p: { name: string; paymentStatus?: string }) => p.name === 'Citra',
      )?.paymentStatus;
    })
    .toBe('paid');

  await friendContext.close();

  expect(pageErrors, 'the flow should complete without console or page errors').toEqual([]);
});

test('mints unpredictable short codes', async ({ request }) => {
  // shortCode() is the only thing standing between a stranger and a bill's
  // contents — there are no accounts. Collisions or a visible pattern here
  // would mean bills are enumerable.
  const codes = await Promise.all(
    Array.from({ length: 8 }, async () => {
      const res = await request.post('/api/bills', {
        data: {
          eventName: 'rng',
          participants: [{ id: 'p1', name: 'X' }],
          items: [],
          tax: 0,
          serviceCharge: 0,
          discount: 0,
          extraFees: 0,
          privacyMode: 'public',
        },
      });
      expect(res.status()).toBe(201);
      return (await res.json()).shortCode as string;
    }),
  );

  for (const code of codes) {
    expect(code).toMatch(/^[A-Za-z0-9]{8}$/);
  }
  expect(new Set(codes).size, 'every short code must be distinct').toBe(codes.length);
});

test('rejects a payment for someone who is not on the bill', async ({ request }) => {
  // The server owns identity here: there is no login, so a participantId from
  // the client is only ever as good as the bill it is checked against.
  const created = await request.post('/api/bills', {
    data: {
      eventName: 'auth check',
      participants: [{ id: 'real-participant', name: 'Andi' }],
      items: [],
      tax: 0,
      serviceCharge: 0,
      discount: 0,
      extraFees: 0,
      privacyMode: 'public',
    },
  });
  const { shortCode } = await created.json();

  const forged = await request.post(`/api/bills/${shortCode}/pay`, {
    data: { participantId: 'not-on-this-bill', status: 'paid' },
  });
  expect(forged.status()).toBe(400);
});

test('never returns other participants amounts for a private bill', async ({ request }) => {
  // PRD F13: in private mode the amounts must not be *sent*, not merely hidden
  // in the UI — so this asserts on the raw payload.
  const created = await request.post('/api/bills', {
    data: {
      eventName: 'private bill',
      participants: [
        { id: 'p1', name: 'Andi', isPayer: true },
        { id: 'p2', name: 'Budi' },
      ],
      items: [{ id: 'i1', name: 'Kopi', price: 50_000, qty: 1, participantIds: ['p1', 'p2'] }],
      tax: 0,
      serviceCharge: 0,
      discount: 0,
      extraFees: 0,
      privacyMode: 'private',
    },
  });
  const { shortCode } = await created.json();

  const res = await request.get(`/api/bills/${shortCode}?p=p2`);
  const body = await res.json();

  expect(body.mode).toBe('private');
  expect(body.me.participantId).toBe('p2');
  // The full bill and everyone else's breakdown must be absent entirely.
  expect(body.bill).toBeUndefined();
  expect(body.calc).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain('p1');
});
