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
export const watches = sqliteTable('watches',{
  id:text('id').primaryKey(),owner:text('owner').notNull(),label:text('label').notNull(),point:text('point').notNull(),settings:text('settings').notNull(),
  createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),enabled:integer('enabled').notNull().default(1),
  nextCheck:integer('next_check').notNull().default(0),leaseUntil:integer('lease_until').notNull().default(0),leaseToken:text('lease_token'),
  checkedAt:integer('checked_at'),error:text('error'),baseline:text('baseline'),sequence:integer('sequence').notNull().default(0),feedHash:text('feed_hash'),
},t=>[index('watch_owner').on(t.owner),index('watch_due').on(t.enabled,t.nextCheck)]);
export const watchEvents = sqliteTable('watch_events',{
  id:text('id').primaryKey(),watchId:text('watch_id').notNull(),at:integer('at').notNull(),kind:text('kind').notNull(),title:text('title').notNull(),payload:text('payload').notNull(),
},t=>[index('watch_event_time').on(t.watchId,t.at)]);
export const pushSubscriptions = sqliteTable('push_subscriptions',{
  id:text('id').primaryKey(),owner:text('owner').notNull(),label:text('label').notNull(),endpoint:text('endpoint').notNull(),keys:text('keys').notNull(),
  createdAt:integer('created_at').notNull(),enabled:integer('enabled').notNull().default(1),error:text('error'),lastTest:integer('last_test').notNull().default(0),quietHours:text('quiet_hours'),
},t=>[index('push_owner').on(t.owner)]);
export const pushDeliveries = sqliteTable('push_deliveries',{
  id:text('id').primaryKey(),subscriptionId:text('subscription_id').notNull(),watchId:text('watch_id'),eventId:text('event_id'),
  createdAt:integer('created_at').notNull(),payload:text('payload').notNull(),status:text('status').notNull().default('pending'),
  attempts:integer('attempts').notNull().default(0),nextAttempt:integer('next_attempt').notNull().default(0),leaseUntil:integer('lease_until').notNull().default(0),leaseToken:text('lease_token'),
  quietSnapshot:text('quiet_snapshot'),acceptedAt:integer('accepted_at'),httpStatus:integer('http_status'),error:text('error'),
},t=>[index('push_due').on(t.status,t.nextAttempt),index('push_delivery_subscription').on(t.subscriptionId,t.createdAt)]);
