import { eq } from 'drizzle-orm';
import { db } from '../src/lib/server/db';
import { user } from '../src/lib/server/db/schema';
import { mintAuthorSetupLink, createReviewer, inviteUrl } from '../src/lib/server/reviewers';
import { authorEmail } from '../src/lib/server/env';

const [cmd, ...args] = process.argv.slice(2);

function author() {
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
	return row;
}

switch (cmd) {
	case 'author-setup-link': {
		const url = mintAuthorSetupLink(author().id);
		console.log(url);
		break;
	}
	case 'create-reviewer': {
		const [name, email, color] = args;
		if (!name || !email) {
			console.error('Usage: npm run cli create-reviewer "Name" email@example.com [#hex]');
			process.exit(1);
		}
		const created = createReviewer({
			name,
			email,
			highlightColor: color || null
		});
		console.log(inviteUrl(created.token));
		break;
	}
	default:
		console.log(`Glassine CLI
  npm run cli author-setup-link
  npm run cli create-reviewer "Name" email@example.com [#hex]
`);
}
