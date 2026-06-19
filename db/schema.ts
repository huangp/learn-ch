import { sqliteTable, integer, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

// Phase 0 seeds the static reference tables below. Learner / story / interaction
// tables (§5.3) are added in Phase 1 alongside drizzle-kit migrations + learner CRUD.

// characters: the master glyph table (Simplified set only)
export const characters = sqliteTable('characters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  char: text('char').notNull().unique(), // 妈
  pinyin: text('pinyin'), // JSON string[] (heteronyms): ["mā"]
  gloss: text('gloss'), // short L2 definition
  radical: text('radical'), // 女
  strokeCount: integer('stroke_count'),
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
