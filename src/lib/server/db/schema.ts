import {
	sqliteTable,
	text,
	integer,
	index,
	primaryKey,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	// Nullable: reviewers may exist without an email (see reviewers.ts). SQLite's
	// UNIQUE allows any number of NULLs, so this never blocks a second
	// email-less reviewer. The author always has one (seeded from AUTHOR_EMAIL).
	email: text('email').unique(),
	emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(true),
	image: text('image'),
	createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
	role: text('role').notNull().default('reviewer'),
	highlightColor: text('highlightColor')
});

export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
	token: text('token').notNull().unique(),
	createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
	ipAddress: text('ipAddress'),
	userAgent: text('userAgent'),
	userId: text('userId')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' })
});

export const account = sqliteTable('account', {
	id: text('id').primaryKey(),
	accountId: text('accountId').notNull(),
	providerId: text('providerId').notNull(),
	userId: text('userId')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('accessToken'),
	refreshToken: text('refreshToken'),
	idToken: text('idToken'),
	accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp_ms' }),
	refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp_ms' }),
	scope: text('scope'),
	password: text('password'),
	createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull()
});

export const verification = sqliteTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
	createdAt: integer('createdAt', { mode: 'timestamp_ms' }),
	updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
});

export const passkey = sqliteTable('passkey', {
	id: text('id').primaryKey(),
	name: text('name'),
	publicKey: text('publicKey').notNull(),
	userId: text('userId')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	credentialID: text('credentialID').notNull(),
	counter: integer('counter').notNull(),
	deviceType: text('deviceType').notNull(),
	backedUp: integer('backedUp', { mode: 'boolean' }).notNull(),
	transports: text('transports'),
	createdAt: integer('createdAt', { mode: 'timestamp_ms' }),
	aaguid: text('aaguid')
});

export const document = sqliteTable('document', {
	id: text('id').primaryKey(),
	slug: text('slug').notNull().unique(),
	title: text('title').notNull(),
	relativePath: text('relativePath').notNull(),
	baseVersion: integer('baseVersion').notNull().default(1),
	updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
	createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull()
});

export const documentVersion = sqliteTable('document_version', {
	id: text('id').primaryKey(),
	documentId: text('documentId')
		.notNull()
		.references(() => document.id, { onDelete: 'cascade' }),
	version: integer('version').notNull(),
	content: text('content').notNull(),
	source: text('source').notNull(),
	actorId: text('actorId').references(() => user.id),
	createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull()
});

export const annotation = sqliteTable(
	'annotation',
	{
		id: text('id').primaryKey(),
		documentId: text('documentId')
			.notNull()
			.references(() => document.id, { onDelete: 'cascade' }),
		authorId: text('authorId')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		type: text('type').notNull(),
		parentId: text('parentId'),
		body: text('body'),
		replacement: text('replacement'),
		exact: text('exact').notNull(),
		prefix: text('prefix').notNull(),
		suffix: text('suffix').notNull(),
		offsetHint: integer('offsetHint').notNull(),
		headingPath: text('headingPath').notNull().default(''),
		paraOrdinal: integer('paraOrdinal').notNull().default(0),
		visibility: text('visibility').notNull().default('own'),
		status: text('status').notNull().default('open'),
		detached: integer('detached', { mode: 'boolean' }).notNull().default(false),
		baseVersionSeen: integer('baseVersionSeen').notNull().default(1),
		createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [uniqueIndex('annotation_doc_id').on(t.documentId, t.id)]
);

export const grant = sqliteTable(
	'grant',
	{
		reviewerId: text('reviewerId')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		documentId: text('documentId')
			.notNull()
			.references(() => document.id, { onDelete: 'cascade' }),
		visibilityScope: text('visibilityScope').notNull().default('own'),
		/** The last Custom selection, kept while the grant is on Default so switching back restores it. */
		customScope: text('customScope'),
		createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [primaryKey({ columns: [t.reviewerId, t.documentId] })]
);

export const instanceSetting = sqliteTable('instance_setting', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

export const inviteToken = sqliteTable('invite_token', {
	id: text('id').primaryKey(),
	reviewerId: text('reviewerId')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	tokenHash: text('tokenHash').notNull().unique(),
	kind: text('kind').notNull().default('reviewer'),
	rotatedAt: integer('rotatedAt', { mode: 'timestamp_ms' }),
	revokedAt: integer('revokedAt', { mode: 'timestamp_ms' }),
	usedAt: integer('usedAt', { mode: 'timestamp_ms' }),
	expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }),
	createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull()
});

/**
 * One row per person per thing that happened to them. This table is both the
 * in-app feed and the email outbox: `emailStatus IS NULL` means still pending a
 * digest. Request handlers only ever insert here; sending is the dispatcher's job.
 */
export const notification = sqliteTable(
	'notification',
	{
		id: text('id').primaryKey(),
		/** Recipient. */
		userId: text('userId')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** Who caused it. Null would mean the system; nothing emits that yet. */
		actorId: text('actorId').references(() => user.id, { onDelete: 'cascade' }),
		/** comment | suggestion | reply | accepted | rejected | resolved */
		kind: text('kind').notNull(),
		documentId: text('documentId')
			.notNull()
			.references(() => document.id, { onDelete: 'cascade' }),
		annotationId: text('annotationId'),
		/** Root annotation of the thread, for replies and resolves. */
		threadId: text('threadId'),
		createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
		readAt: integer('readAt', { mode: 'timestamp_ms' }),
		/** Null while queued; then 'sent' | 'read' | 'stale' | 'failed'. */
		emailStatus: text('emailStatus'),
		emailedAt: integer('emailedAt', { mode: 'timestamp_ms' })
	},
	(t) => [
		index('notification_user_read').on(t.userId, t.readAt),
		index('notification_user_email').on(t.userId, t.emailStatus),
		index('notification_document').on(t.documentId)
	]
);

/**
 * Per-recipient email pacing and retry state. One email covers many notification
 * rows, so backoff belongs here rather than on each row.
 */
export const notificationState = sqliteTable('notification_state', {
	userId: text('userId')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	lastEmailAt: integer('lastEmailAt', { mode: 'timestamp_ms' }),
	attempts: integer('attempts').notNull().default(0),
	nextAttemptAt: integer('nextAttemptAt', { mode: 'timestamp_ms' }),
	lastError: text('lastError')
});
