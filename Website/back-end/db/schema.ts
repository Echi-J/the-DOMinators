import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const observations = sqliteTable('observations', {
  id: text('id').primaryKey(), placeId: text('place_id').notNull(),
  boroughCode: text('borough_code').notNull(), placeName: text('place_name').notNull(),
  attribute: text('attribute').notNull(), value: text('value').notNull(), scope: text('scope').notNull(),
  observedAt: text('observed_at').notNull(), evidenceUrl: text('evidence_url').notNull(),
  notes: text('notes').notNull(), contributorId: text('contributor_id').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [index('observations_place_idx').on(t.placeId), index('observations_user_idx').on(t.contributorId, t.createdAt)]);
export const observationReviews = sqliteTable('observation_reviews', {
  id: integer('id').primaryKey({autoIncrement:true}),
  observationId: text('observation_id').notNull().references(()=>observations.id),
  reviewerId: text('reviewer_id').notNull(), decision: text('decision').notNull(),
  reason: text('reason').notNull(), createdAt: text('created_at').notNull(),
},t=>[index('reviews_observation_idx').on(t.observationId,t.id)]);
export const feedCache = sqliteTable('feed_cache', {
  key: text('key').primaryKey(), payload: text('payload').notNull(), fetchedAt: text('fetched_at').notNull(),
});
