import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { authorEmail } from '../env';
import * as schema from './schema';

export function seedAuthor(database: BetterSQLite3Database<typeof schema>) {
	const email = authorEmail();
	if (!email) return;
	const existing = database.select().from(schema.user).where(eq(schema.user.email, email)).get();
	if (existing) return;
	const now = new Date();
	database
		.insert(schema.user)
		.values({
			id: crypto.randomUUID(),
			name: 'Author',
			email,
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
			role: 'author',
			highlightColor: '#c4b5fd'
		})
		.run();
}
