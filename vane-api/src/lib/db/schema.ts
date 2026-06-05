import { sql } from 'drizzle-orm';
import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';
import { Block } from '../types';
import { SearchSources } from '../agents/search/types';

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey(),
  messageId: text('messageId').notNull(),
  chatId: text('chatId').notNull(),
  backendId: text('backendId').notNull(),
  query: text('query').notNull(),
  createdAt: text('createdAt').notNull(),
  responseBlocks: text('responseBlocks', { mode: 'json' })
    .$type<Block[]>()
    .default(sql`'[]'`),
  status: text({ enum: ['answering', 'completed', 'error'] }).default(
    'answering',
  ),
  providerId: text('providerId'),
  modelKey: text('modelKey'),
  reasoningPreset: text('reasoningPreset'),
  optimizationMode: text('optimizationMode'),
});

export const folders = sqliteTable('folders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('createdAt').notNull(),
});

interface DBFile {
  name: string;
  fileId: string;
}

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: text('createdAt').notNull(),
  /** ISO time of last user send / message completion / error (Library sort). */
  lastMessageAt: text('lastMessageAt').notNull(),
  sources: text('sources', {
    mode: 'json',
  })
    .$type<SearchSources[]>()
    .default(sql`'[]'`),
  files: text('files', { mode: 'json' })
    .$type<DBFile[]>()
    .default(sql`'[]'`),
  folderId: text('folderId').references(() => folders.id),
  kind: text({ enum: ['normal', 'advisor', 'studio'] })
    .notNull()
    .default('normal'),
});

export const userMemory = sqliteTable('user_memory', {
  id: text('id').primaryKey().notNull().default('default'),
  body: text('body').notNull().default(''),
  updatedAt: text('updated_at').notNull(),
  updatedBy: text('updated_by').notNull().default('system'),
});

export const advisorRuns = sqliteTable('advisor_runs', {
  id: text('id').primaryKey(),
  chatId: text('chatId').notNull(),
  runAt: text('runAt').notNull(),
  coveredUntilTimestamp: text('coveredUntilTimestamp').notNull(),
  coveredChatCount: integer('coveredChatCount').notNull(),
  coveredUserMessageCount: integer('coveredUserMessageCount').notNull(),
  status: text({ enum: ['running', 'completed', 'error'] })
    .notNull()
    .default('completed'),
});

/** Records a fork edge: branching from assistant turn `fromMessageId` in `fromChatId` to new `toChatId`. */
export const chatBranches = sqliteTable('chat_branches', {
  id: text('id').primaryKey(),
  fromChatId: text('fromChatId').notNull(),
  fromMessageId: text('fromMessageId').notNull(),
  toChatId: text('toChatId').notNull(),
  createdAt: text('createdAt').notNull(),
});
