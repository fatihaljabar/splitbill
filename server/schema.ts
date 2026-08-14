import { relations } from 'drizzle-orm';
import {
  bigint,
  foreignKey,
  index,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  varchar,
} from 'drizzle-orm/mysql-core';

export const bills = mysqlTable(
  'bills',
  {
    shortCode: varchar('short_code', { length: 12 }).primaryKey(),
    data: json('data').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  },
  (table) => [index('idx_expires').on(table.expiresAt)],
);

export const payments = mysqlTable(
  'payments',
  {
    shortCode: varchar('short_code', { length: 12 }).notNull(),
    participantId: varchar('participant_id', { length: 64 }).notNull(),
    status: mysqlEnum('status', ['unpaid', 'paid']).notNull().default('unpaid'),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.shortCode, table.participantId] }),
    foreignKey({
      columns: [table.shortCode],
      foreignColumns: [bills.shortCode],
      name: 'payments_bill_fk',
    }).onDelete('cascade'),
  ],
);

export const billsRelations = relations(bills, ({ many }) => ({
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  bill: one(bills, {
    fields: [payments.shortCode],
    references: [bills.shortCode],
  }),
}));
