import type Database from 'better-sqlite3';

const statements = [
	`CREATE TABLE IF NOT EXISTS user (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		email TEXT UNIQUE,
		emailVerified INTEGER NOT NULL DEFAULT 1,
		image TEXT,
		createdAt INTEGER NOT NULL,
		updatedAt INTEGER NOT NULL,
		role TEXT NOT NULL DEFAULT 'reviewer',
		highlightColor TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS session (
		id TEXT PRIMARY KEY,
		expiresAt INTEGER NOT NULL,
		token TEXT NOT NULL UNIQUE,
		createdAt INTEGER NOT NULL,
		updatedAt INTEGER NOT NULL,
		ipAddress TEXT,
		userAgent TEXT,
		userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
	)`,
	`CREATE TABLE IF NOT EXISTS account (
		id TEXT PRIMARY KEY,
		accountId TEXT NOT NULL,
		providerId TEXT NOT NULL,
		userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		accessToken TEXT,
		refreshToken TEXT,
		idToken TEXT,
		accessTokenExpiresAt INTEGER,
		refreshTokenExpiresAt INTEGER,
		scope TEXT,
		password TEXT,
		createdAt INTEGER NOT NULL,
		updatedAt INTEGER NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS verification (
		id TEXT PRIMARY KEY,
		identifier TEXT NOT NULL,
		value TEXT NOT NULL,
		expiresAt INTEGER NOT NULL,
		createdAt INTEGER,
		updatedAt INTEGER
	)`,
	`CREATE TABLE IF NOT EXISTS passkey (
		id TEXT PRIMARY KEY,
		name TEXT,
		publicKey TEXT NOT NULL,
		userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		credentialID TEXT NOT NULL,
		counter INTEGER NOT NULL,
		deviceType TEXT NOT NULL,
		backedUp INTEGER NOT NULL,
		transports TEXT,
		createdAt INTEGER,
		aaguid TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS document (
		id TEXT PRIMARY KEY,
		slug TEXT NOT NULL UNIQUE,
		title TEXT NOT NULL,
		relativePath TEXT NOT NULL,
		baseVersion INTEGER NOT NULL DEFAULT 1,
		updatedAt INTEGER NOT NULL,
		createdAt INTEGER NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS document_version (
		id TEXT PRIMARY KEY,
		documentId TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
		version INTEGER NOT NULL,
		content TEXT NOT NULL,
		source TEXT NOT NULL,
		actorId TEXT REFERENCES user(id),
		createdAt INTEGER NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS annotation (
		id TEXT PRIMARY KEY,
		documentId TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
		authorId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		type TEXT NOT NULL,
		parentId TEXT,
		body TEXT,
		replacement TEXT,
		exact TEXT NOT NULL,
		prefix TEXT NOT NULL,
		suffix TEXT NOT NULL,
		offsetHint INTEGER NOT NULL,
		headingPath TEXT NOT NULL DEFAULT '',
		paraOrdinal INTEGER NOT NULL DEFAULT 0,
		visibility TEXT NOT NULL DEFAULT 'own',
		status TEXT NOT NULL DEFAULT 'open',
		detached INTEGER NOT NULL DEFAULT 0,
		baseVersionSeen INTEGER NOT NULL DEFAULT 1,
		createdAt INTEGER NOT NULL,
		updatedAt INTEGER NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS grant (
		reviewerId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		documentId TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
		visibilityScope TEXT NOT NULL DEFAULT 'own',
		customScope TEXT,
		createdAt INTEGER NOT NULL,
		PRIMARY KEY (reviewerId, documentId)
	)`,
	`CREATE TABLE IF NOT EXISTS instance_setting (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS invite_token (
		id TEXT PRIMARY KEY,
		reviewerId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		tokenHash TEXT NOT NULL UNIQUE,
		kind TEXT NOT NULL DEFAULT 'reviewer',
		rotatedAt INTEGER,
		revokedAt INTEGER,
		usedAt INTEGER,
		expiresAt INTEGER,
		createdAt INTEGER NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS notification (
		id TEXT PRIMARY KEY,
		userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		actorId TEXT REFERENCES user(id) ON DELETE CASCADE,
		kind TEXT NOT NULL,
		documentId TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
		annotationId TEXT,
		threadId TEXT,
		createdAt INTEGER NOT NULL,
		readAt INTEGER,
		emailStatus TEXT,
		emailedAt INTEGER
	)`,
	`CREATE INDEX IF NOT EXISTS notification_user_read ON notification (userId, readAt)`,
	`CREATE INDEX IF NOT EXISTS notification_user_email ON notification (userId, emailStatus)`,
	`CREATE INDEX IF NOT EXISTS notification_document ON notification (documentId)`,
	`CREATE TABLE IF NOT EXISTS notification_state (
		userId TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
		lastEmailAt INTEGER,
		attempts INTEGER NOT NULL DEFAULT 0,
		nextAttemptAt INTEGER,
		lastError TEXT
	)`
];

function hasColumn(sqlite: Database.Database, table: string, column: string) {
	const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
	return cols.some((col) => col.name === column);
}

function columnIsNotNull(sqlite: Database.Database, table: string, column: string) {
	const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as {
		name: string;
		notnull: number;
	}[];
	return cols.find((col) => col.name === column)?.notnull === 1;
}

/**
 * Drops the NOT NULL constraint on `user.email` (reviewers may not have one;
 * see reviewers.ts). SQLite's ALTER TABLE cannot change a column's nullability
 * directly, so this rebuilds the table — the standard SQLite pattern: create
 * the new shape, copy rows, drop the old table, rename. A no-op once already
 * migrated, and a no-op on a fresh install (the CREATE TABLE below is already
 * nullable, so `columnIsNotNull` is false immediately).
 *
 * Runs its own transaction, separate from `migrate()`'s: `PRAGMA foreign_keys`
 * cannot be changed inside an active transaction, and this step must disable
 * it while the table other rows reference by FK is briefly dropped.
 */
function makeUserEmailNullable(sqlite: Database.Database) {
	if (!columnIsNotNull(sqlite, 'user', 'email')) return;
	const foreignKeysWereOn = sqlite.pragma('foreign_keys', { simple: true }) === 1;
	if (foreignKeysWereOn) sqlite.pragma('foreign_keys = OFF');
	try {
		sqlite.exec('BEGIN');
		try {
			sqlite.exec(`CREATE TABLE user_new (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				email TEXT UNIQUE,
				emailVerified INTEGER NOT NULL DEFAULT 1,
				image TEXT,
				createdAt INTEGER NOT NULL,
				updatedAt INTEGER NOT NULL,
				role TEXT NOT NULL DEFAULT 'reviewer',
				highlightColor TEXT
			)`);
			sqlite.exec(`INSERT INTO user_new
				SELECT id, name, email, emailVerified, image, createdAt, updatedAt, role, highlightColor
				FROM user`);
			sqlite.exec('DROP TABLE user');
			sqlite.exec('ALTER TABLE user_new RENAME TO user');
			sqlite.exec('COMMIT');
		} catch (err) {
			sqlite.exec('ROLLBACK');
			throw err;
		}
		if (foreignKeysWereOn) {
			const violations = sqlite.pragma('foreign_key_check') as unknown[];
			if (violations.length) {
				throw new Error(
					`foreign_key_check found ${violations.length} violation(s) after making user.email nullable`
				);
			}
		}
	} finally {
		if (foreignKeysWereOn) sqlite.pragma('foreign_keys = ON');
	}
}

export function migrate(sqlite: Database.Database) {
	makeUserEmailNullable(sqlite);
	sqlite.exec('BEGIN');
	try {
		for (const sql of statements) sqlite.exec(sql);
		if (!hasColumn(sqlite, 'annotation', 'detached')) {
			sqlite.exec('ALTER TABLE annotation ADD COLUMN detached INTEGER NOT NULL DEFAULT 0');
		}
		if (!hasColumn(sqlite, 'grant', 'customScope')) {
			sqlite.exec('ALTER TABLE "grant" ADD COLUMN customScope TEXT');
		}
		sqlite.exec(`UPDATE annotation SET detached = 1, status = 'open' WHERE status = 'detached'`);
		sqlite.exec('COMMIT');
	} catch (err) {
		sqlite.exec('ROLLBACK');
		throw err;
	}
}
