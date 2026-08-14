import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — copy .env.example to .env and fill it in.');
}

export default defineConfig({
  dialect: 'mysql',
  schema: './server/schema.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
