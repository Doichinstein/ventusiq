import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
export const datasets = sqliteTable('datasets', {
  name: text('name').primaryKey(), revision: text('revision'),
  lastSuccess: integer('last_success'), nextFetch: integer('next_fetch').notNull().default(0),
  leaseUntil: integer('lease_until').notNull().default(0), leaseToken: text('lease_token'), error: text('error'),
});
export const revisions = sqliteTable('revisions', {
  dataset: text('dataset').notNull(), revision: text('revision').notNull(),
  firstSeen: integer('first_seen').notNull(), issuedAt: text('issued_at'), payload: text('payload').notNull(),
}, t => [primaryKey({columns:[t.dataset,t.revision]}),index('revision_time').on(t.dataset,t.firstSeen)]);
export const checks = sqliteTable('checks', {
  dataset: text('dataset').notNull(), at: integer('at').notNull(), revision: text('revision').notNull(),
}, t => [primaryKey({columns:[t.dataset,t.at]})]);
export const changeBatches = sqliteTable('change_batches', {at: integer('at').primaryKey(), payload: text('payload').notNull()});
