import {
  sqliteTable,
  integer,
  text,
  real,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/sqlite-core';

// Phase 0 seeds the static reference tables below. Phase 1 adds the learner /
// learner_chars / stories / interactions tables (§5.3) + the 0001 migration.

// characters: the master glyph table (Simplified set only)
export const characters = sqliteTable('characters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  char: text('char').notNull().unique(), // 妈
  pinyin: text('pinyin'), // JSON string[] (heteronyms): ["mā"]
  gloss: text('gloss'), // short L2 definition
  radical: text('radical'), // 女
  strokeCount: integer('stroke_count'),
  strokeData: text('stroke_data'), // JSON {strokes:string[], medians:number[][][]} (hanzi-writer shape); null if absent
  decomposition: text('decomposition'), // IDS: "⿰女马"
  hskLevel: integer('hsk_level'), // 1..7 (7 = HSK 7-9 band), nullable
  freqRank: integer('freq_rank'), // 1 = most frequent (Jun Da), nullable
  isComponent: integer('is_component', { mode: 'boolean' }).notNull().default(false),
});

// char_components: prerequisite edges (child requires parent component)
export const charComponents = sqliteTable(
  'char_components',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    charId: integer('char_id')
      .notNull()
      .references(() => characters.id),
    componentId: integer('component_id')
      .notNull()
      .references(() => characters.id),
    role: text('role').notNull(), // 'semantic' | 'phonetic' | 'structural'
  },
  (t) => [
    uniqueIndex('char_comp_uniq').on(t.charId, t.componentId, t.role),
    index('char_comp_child').on(t.charId),
    index('char_comp_parent').on(t.componentId),
  ],
);

// words: lexicon used to build allowlists + glosses
export const words = sqliteTable(
  'words',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    word: text('word').notNull().unique(), // 喜欢
    chars: text('chars'), // JSON string[]: ["喜","欢"]
    pinyin: text('pinyin'),
    gloss: text('gloss'),
    hskLevel: integer('hsk_level'),
    freqRank: integer('freq_rank'),
  },
  (t) => [index('words_freq').on(t.freqRank), index('words_hsk').on(t.hskLevel)],
);

// ---- Auth: adult owner accounts (Auth.js) ----

// users: adult owners only (children are learner rows, not users). Shape matches the
// Auth.js Drizzle adapter (id/name/email/emailVerified/image) + our role/createdAt.
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // Auth.js supplies a uuid
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'timestamp_ms' }),
  image: text('image'),
  role: text('role').notNull().default('adult'), // reserved for future ('admin')
  createdAt: integer('created_at').notNull().default(0), // epoch ms
});

// accounts: OAuth provider linkage (Auth.js adapter standard schema).
export const accounts = sqliteTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

// sessions / verificationTokens: required by the Auth.js Drizzle adapter shape. Unused at
// runtime under the JWT session strategy, but kept so the adapter is complete and a future
// email magic-link provider works without a migration.
export const sessions = sqliteTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
});

export const verificationTokens = sqliteTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---- Phase 1: learner tables ----

// learners: one row per onboarded reader (a child profile owned by an adult user)
export const learners = sqliteTable(
  'learners',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // owner adult; nullable for legacy/dev rows, set on onboarding.
    ownerId: text('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    // child direct-login credentials (set by the owner; both null = no direct login).
    username: text('username').unique(),
    pinHash: text('pin_hash'),
    createdAt: integer('created_at').notNull(), // epoch ms
    settings: text('settings'), // JSON: { placementMethod, frontierCharId, bootstrap, ... }
  },
  (t) => [index('learners_owner').on(t.ownerId)],
);

// learner_chars: per-learner SRS + mastery state (one row per known/seen char)
export const learnerChars = sqliteTable(
  'learner_chars',
  {
    learnerId: integer('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    charId: integer('char_id')
      .notNull()
      .references(() => characters.id),
    status: text('status').notNull(), // 'new' | 'learning' | 'review' | 'mastered'
    // FSRS state (seeded in Phase 1, scheduled in Phase 7)
    stability: real('stability'),
    difficulty: real('difficulty'),
    due: integer('due'), // epoch ms
    lastReview: integer('last_review'), // epoch ms, nullable
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    exposures: integer('exposures').notNull().default(0), // total times seen in stories
    reveals: integer('reveals').notNull().default(0), // times tapped to reveal (weakness signal)
  },
  (t) => [
    primaryKey({ columns: [t.learnerId, t.charId] }),
    index('learner_chars_due').on(t.learnerId, t.due),
  ],
);

// stories: generated story bodies (definitions only in Phase 1; populated in Phase 3+)
export const stories = sqliteTable('stories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  learnerId: integer('learner_id')
    .notNull()
    .references(() => learners.id, { onDelete: 'cascade' }),
  title: text('title'),
  hanzi: text('hanzi'), // raw generated hanzi-only body
  annotated: text('annotated'), // JSON: segmented + pinyin + gloss
  targetChars: text('target_chars'), // JSON string[] new chars introduced
  dueCharsUsed: text('due_chars_used'), // JSON string[] SRS chars woven in
  theme: text('theme'),
  parentStoryId: integer('parent_story_id'), // self-ref for branching choices
  meta: text('meta'), // JSON: model, repairIterations, coverage, knownCoverage%
  createdAt: integer('created_at').notNull(), // epoch ms
  gradedAt: integer('graded_at'), // epoch ms; set once Phase 7 has consumed this story's interactions
});

// interactions: reading events that drive SRS grading (definitions only in Phase 1)
export const interactions = sqliteTable('interactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storyId: integer('story_id')
    .notNull()
    .references(() => stories.id, { onDelete: 'cascade' }),
  learnerId: integer('learner_id')
    .notNull()
    .references(() => learners.id, { onDelete: 'cascade' }),
  charId: integer('char_id').references(() => characters.id), // nullable for word-level events
  type: text('type').notNull(), // 'reveal' | 'question_correct' | 'question_wrong' | 'dwell'
  value: real('value'),
  createdAt: integer('created_at').notNull(), // epoch ms
});
