import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import * as schema from './schema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set — copy .env.example to .env and fill it in.');
}

export const db = drizzle(databaseUrl, { schema, mode: 'default' });

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: './migrations' });
}
