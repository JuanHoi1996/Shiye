import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const dataDir = path.join(DATA_DIR, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const sqlite = new Database(path.join(dataDir, 'db.sqlite'));
const db = drizzle(sqlite, {
  schema: schema,
});

export default db;
