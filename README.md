# SplitBill

Split shared bills without the awkward math. Photograph a receipt, OCR reads the items and
prices, decide who ate what, and share the result through one short link.

**Live at [splitbills.site](https://splitbills.site)** · Bahasa Indonesia + English · No login,
no install.

## Features

- **Receipt scanning** — camera or gallery, OCR tuned for Indonesian receipts (`ind+eng`),
  running entirely in the browser. Photos never leave the device.
- **Review before it counts** — scan results always pass through an editable review screen;
  nothing lands in a bill unchecked.
- **Flexible splitting** — evenly, by item, by percentage, or custom amounts. One item can be
  shared by any subset of people.
- **Fees handled** — tax, service charge, discounts, and extra fees as percentage or fixed
  amount, with optional rounding.
- **Exact rupiah** — the sum of everyone's share always equals the grand total, including when
  the division leaves a remainder.
- **Short share links** — `splitbills.site/s/AB12CD34`, valid for 24 hours, with QR code and
  WhatsApp sharing. Link previews show the event name (and total, on public bills).
- **Privacy modes** — public shows everyone the full breakdown; private sends each participant
  only their own amount, enforced server-side. Private bills can generate a personal link per
  participant.
- **Payment tracking** — participants mark themselves paid from their own device, and the bill
  creator sees it update.
- **Auto-expiry** — bills are deleted 24 hours after creation. Not configurable, by design.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vue 3.5 + TypeScript, Vite 7, Tailwind 4, vue-router 4 |
| State | Composable with `reactive()` — no Pinia |
| Backend | Hono + `@hono/node-server` |
| Database | MySQL 8 via Drizzle ORM |
| OCR | tesseract.js (`ind+eng`), assets self-hosted |
| Lint + format | Biome |
| Runtime | Node 24, one process serving static files and the API |

## Getting started

Requires Node 24+ and a MySQL 8 database.

```bash
git clone https://github.com/fatihaljabar/splitbill.git
cd splitbill
npm install
cp .env.example .env    # then fill in DATABASE_URL
npm run dev             # frontend at localhost:5173
npm run dev:server      # backend at localhost:3000
```

Tables are created automatically by Drizzle migrations on first server start.

Note that `npm run dev` does not proxy `/api/*`. To exercise API-backed flows locally, build
first and run the server, which serves both the API and the built frontend:

```bash
npm run build && npm start
```

## Environment

```
DATABASE_URL=mysql://user:password@127.0.0.1:3306/splitbill
PORT=3000
```

Use `127.0.0.1` rather than `localhost` — the `mysql2` driver resolves `localhost` to an IPv6
address, which MySQL treats as a different host than the one your user was likely granted.

Never prefix database credentials with `VITE_`; anything with that prefix is bundled into the
browser build.

## Scripts

```bash
npm run dev          # Vite dev server (frontend only)
npm run dev:server   # backend with --watch
npm run build        # type-check frontend + server, then build
npm start            # run the production build
npm test             # unit tests for the shared calculation layer
npm run test:e2e     # Playwright end-to-end tests
npm run lint         # biome check
npm run format       # biome check --write
```

## Testing

Two layers, each covering what the other cannot.

`npm test` runs the money logic in `shared/calculate.ts` under `node --test` — no dependencies,
no browser. It covers the cases where rounding could lose or invent a rupiah.

`npm run test:e2e` drives a real browser through the whole flow with Playwright: create a bill,
add participants, assign items per person, calculate, mint a short link, then open that link in
a separate browser context — a different device with none of the creator's local state — and
mark it paid. It also asserts on raw API payloads that private bills never send other
participants' amounts, that a payment for someone who is not on the bill is rejected, and that
short codes are unique and unpredictable.

The suite runs against the production server, not the Vite dev server, because `npm run dev`
does not proxy `/api/*` — and because the two properties worth proving (money is computed
server-side, payment status crosses devices) do not exist without a real backend. Playwright
builds and starts that server itself, so a reachable MySQL from `DATABASE_URL` is the only
prerequisite:

```bash
npx playwright install chromium   # once
npm run test:e2e
```

## Deployment

The build produces `dist/` (frontend) and `dist-server/` (server). Point your host's Node
entry to `dist-server/server/index.js`, set the environment variables above, and make sure
HTTPS is on — `getUserMedia` refuses to run without it, which disables receipt scanning
entirely.

## Privacy

- Receipt photos are processed in the browser and never uploaded.
- OCR assets are served from the app's own domain — no third-party CDN requests.
- No analytics, no tracking cookies, no third-party scripts.
- Bill data (participant names, amounts, bank account) lives on the server for 24 hours, then
  is deleted.

Full policy: [splitbills.site/privacy](https://splitbills.site/privacy) ·
Terms: [splitbills.site/terms](https://splitbills.site/terms)

## License

[MIT](LICENSE) — free to use, modify, and distribute, including commercially. Just keep the
copyright notice.
