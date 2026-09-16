import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { dbPath, ensureDataDirs } from '../env';
import * as schema from './schema';
import { migrate } from './migrate';
import { seedAuthor } from './seed';

ensureDataDirs();

const sqlite = new Database(dbPath());
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
export { sqlite };

let ready = false;
export function ensureReady() {
	if (ready) return;
	migrate(sqlite);
	seedAuthor(db);
	ready = true;
}

ensureReady();
