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
export const eventHeads = sqliteTable('event_heads', {
  id:text('id').primaryKey(), capId:text('cap_id').notNull(), revision:text('revision').notNull(),
  firstSeen:integer('first_seen').notNull(), lastSeen:integer('last_seen').notNull(), present:integer('present'),
  name:text('name').notNull(), area:text('area').notNull(), messageType:text('message_type').notNull(),
},t=>[index('event_first_seen').on(t.firstSeen,t.id)]);
export const eventRevisions = sqliteTable('event_revisions',{
  id:text('id').notNull(),revision:text('revision').notNull(),collectedAt:integer('collected_at').notNull(),issuedAt:text('issued_at'),payload:text('payload').notNull(),
},t=>[primaryKey({columns:[t.id,t.revision]})]);
export const eventTransitions = sqliteTable('event_transitions',{
  id:text('id').notNull(),at:integer('at').notNull(),revision:text('revision').notNull(),present:integer('present'),origin:text('origin').notNull(),
},t=>[primaryKey({columns:[t.id,t.at]})]);
export const eventLinks = sqliteTable('event_links',{
  source:text('source').notNull(),target:text('target').notNull(),targetCap:text('target_cap').notNull(),firstSeen:integer('first_seen').notNull(),
},t=>[primaryKey({columns:[t.source,t.target]}),index('event_link_target').on(t.target)]);
export const eventCollections = sqliteTable('event_collections',{at:integer('at').primaryKey()});
