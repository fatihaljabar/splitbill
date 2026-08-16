# SplitBill

Bill-splitting web app: photograph a receipt, OCR reads the items and prices, decide who ate
what, calculate, share via one link. Indonesian + English. No login, no install required.

Live at [splitbills.site](https://splitbills.site).

## Tech stack

- Frontend: Vue 3.5 + TypeScript, Vite 7, Tailwind 4, vue-router 4
- Backend: Hono + `@hono/node-server`, MySQL 8 via Drizzle ORM
- OCR: tesseract.js (`ind+eng`), self-hosted assets
- Lint/format: Biome
- Runtime: Node 24, single process serves static assets + API

## Scripts

```bash
npm run dev          # Vite frontend dev server
npm run dev:server   # backend, node --watch + .env
npm run build         # type-check + build frontend and server
npm start             # run production build
npm test              # shared/ unit tests
npm run lint           # biome check
npm run format          # biome check --write
```
