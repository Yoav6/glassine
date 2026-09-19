import { initEnv } from './init-env';

const [cmd, ...args] = process.argv.slice(2);

async function withDb() {
	const { eq } = await import('drizzle-orm');
	const { db } = await import('../src/lib/server/db');
	const { user } = await import('../src/lib/server/db/schema');
	const { mintAuthorSetupLink, createReviewer, inviteUrl } = await import(
		'../src/lib/server/reviewers'
	);
	const { authorEmail } = await import('../src/lib/server/env');
	return { eq, db, user, mintAuthorSetupLink, createReviewer, inviteUrl, authorEmail };
}

switch (cmd) {
	case 'author-setup-link': {
		const { eq, db, user, mintAuthorSetupLink, authorEmail } = await withDb();
		const email = authorEmail();
		if (!email) {
			console.error('Set AUTHOR_EMAIL');
			process.exit(1);
		}
		const row = db.select().from(user).where(eq(user.email, email)).get();
		if (!row) {
			console.error('Author not seeded. Is AUTHOR_EMAIL set, and did the app boot once?');
			process.exit(1);
		}
		console.log(mintAuthorSetupLink(row.id));
		break;
	}
	case 'create-reviewer': {
		const [name, email, color] = args;
		if (!name || !email) {
			console.error('Usage: npm run cli create-reviewer "Name" email@example.com [#hex]');
			process.exit(1);
		}
		const { createReviewer, inviteUrl } = await withDb();
		const created = createReviewer({
			name,
			email,
			highlightColor: color || null
		});
		console.log(inviteUrl(created.token));
		break;
	}
	case 'init-env': {
		initEnv({
			git: args.includes('--git'),
			loopback: args.includes('--loopback')
		});
		break;
	}
	default:
		console.log(`Glassine CLI
  npm run cli init-env [--git] [--loopback]
  npm run cli author-setup-link
  npm run cli create-reviewer "Name" email@example.com [#hex]
`);
}
