import {
	sqliteTable,
	text,
	integer,
	primaryKey,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
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
